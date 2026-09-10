#!/usr/bin/env node
// Static file server for public/, plus a local-only /admin editor for
// categories and per-post tagging, backed by a tiny JSON API.
//
// The admin API has no auth and writes directly to config.json and
// content/posts/*.md on disk — it's meant to run on localhost while you
// edit, not to be exposed on a public server.
const http = require("http");
const fs = require("fs");
const path = require("path");
const { build, parseFrontmatter, setFrontmatterField, markdownToHtml, slugify, CONTENT_DIR, IMAGES_DIR, CONFIG_PATH } = require("./build.js");

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const ADMIN_DIR = path.join(ROOT, "admin");
const PORT = process.env.PORT || 4000;

// The generated pages link to each other with config.basePath baked in
// (e.g. "/blog" for a GitHub Pages project site). Strip it here so the
// same public/ output previews correctly at both http://localhost:PORT/
// and http://localhost:PORT/<basePath>/.
function currentBasePath() {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    return (config.basePath || "").replace(/\/$/, "");
  } catch {
    return "";
  }
}

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".svg": "image/svg+xml",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(body);
}

function readJsonBody(req, maxBytes = 1e6) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > maxBytes) req.destroy();
    });
    req.on("end", () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

const IMAGE_EXT_BY_MIME = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

// Summarize the current site state for the admin UI: categories plus a
// lightweight view of each post (no rendered HTML body needed here).
function siteSnapshot() {
  const { config, categories, posts } = build();
  return {
    categories,
    posts: posts.map((p) => ({
      file: p.file,
      title: p.title,
      date: p.date.toISOString().slice(0, 10),
      category: p.category,
    })),
  };
}

// Resolve a "file" param from the client to a real path inside content/posts,
// rejecting anything that isn't a plain .md filename in that directory.
function resolvePostFile(name) {
  const file = path.basename(String(name || ""));
  if (!file.endsWith(".md")) return null;
  const filePath = path.join(CONTENT_DIR, file);
  return fs.existsSync(filePath) ? { file, filePath } : null;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// Serialize a post's frontmatter + body from plain fields. `slug` is always
// written explicitly so a later title edit never changes the post's URL.
function serializePost({ title, date, slug, category, excerpt, body }) {
  const oneLine = (s) => String(s || "").replace(/\r?\n/g, " ").trim();
  const lines = [
    `title: ${oneLine(title)}`,
    `date: ${date}`,
    `slug: ${slug}`,
  ];
  if (category) lines.push(`category: ${category}`);
  if (excerpt) lines.push(`excerpt: ${oneLine(excerpt)}`);
  return `---\n${lines.join("\n")}\n---\n\n${String(body || "").replace(/\r\n/g, "\n").trim()}\n`;
}

async function handleApi(req, res, url, query) {
  if (req.method === "GET" && url === "/api/data") {
    return sendJson(res, 200, siteSnapshot());
  }

  if (req.method === "POST" && url === "/api/categories") {
    let body;
    try { body = await readJsonBody(req); } catch { return sendJson(res, 400, { error: "Invalid JSON" }); }
    const input = Array.isArray(body.categories) ? body.categories : null;
    if (!input) return sendJson(res, 400, { error: "Expected { categories: [...] }" });

    const seen = new Set();
    const clean = [];
    for (const c of input) {
      const label = String(c.label || "").trim();
      if (!label) continue;
      const slug = slugify(c.slug || label);
      if (!slug || seen.has(slug)) continue;
      seen.add(slug);
      clean.push({ slug, label });
    }

    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    config.categories = clean;
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");
    return sendJson(res, 200, siteSnapshot());
  }

  if (req.method === "POST" && url === "/api/posts/category") {
    let body;
    try { body = await readJsonBody(req); } catch { return sendJson(res, 400, { error: "Invalid JSON" }); }
    const resolved = resolvePostFile(body.file);
    if (!resolved) return sendJson(res, 404, { error: "Post not found" });

    const category = body.category ? slugify(body.category) : null;
    const raw = fs.readFileSync(resolved.filePath, "utf8");
    const updated = setFrontmatterField(raw, "category", category);
    fs.writeFileSync(resolved.filePath, updated);
    return sendJson(res, 200, siteSnapshot());
  }

  // Full post content for the admin edit form (title/date/category/excerpt
  // plus the raw Markdown body, not the rendered HTML).
  if (req.method === "GET" && url === "/api/posts/content") {
    const resolved = resolvePostFile(query.get("file"));
    if (!resolved) return sendJson(res, 404, { error: "Post not found" });
    const { data, content } = parseFrontmatter(fs.readFileSync(resolved.filePath, "utf8"));
    return sendJson(res, 200, {
      file: resolved.file,
      title: data.title || "",
      date: data.date || todayIso(),
      slug: data.slug || slugify(data.title || resolved.file.replace(/\.md$/, "")),
      category: data.category || null,
      excerpt: data.excerpt || "",
      body: content.trim(),
    });
  }

  if (req.method === "POST" && url === "/api/render") {
    let body;
    try { body = await readJsonBody(req); } catch { return sendJson(res, 400, { error: "Invalid JSON" }); }
    return sendJson(res, 200, { html: markdownToHtml(String(body.body || ""), currentBasePath()) });
  }

  // Save an uploaded or scribbled image (sent as a data: URL) to
  // content/images/, and also drop a copy straight into public/images/ so
  // it's visible immediately without waiting for a full rebuild.
  if (req.method === "POST" && url === "/api/images") {
    let body;
    try { body = await readJsonBody(req, 20 * 1024 * 1024); } catch { return sendJson(res, 400, { error: "Invalid JSON" }); }
    const match = /^data:([\w/+.-]+);base64,(.+)$/.exec(String(body.dataUrl || ""));
    if (!match) return sendJson(res, 400, { error: "Expected a base64 data: URL" });
    const [, mime, base64] = match;
    const ext = IMAGE_EXT_BY_MIME[mime];
    if (!ext) return sendJson(res, 400, { error: `Unsupported image type: ${mime}` });

    const baseName = slugify(path.basename(String(body.filename || "image"), path.extname(String(body.filename || "")))) || "image";
    let name = `${baseName}-${Date.now().toString(36)}.${ext}`;

    fs.mkdirSync(IMAGES_DIR, { recursive: true });
    const buffer = Buffer.from(base64, "base64");
    fs.writeFileSync(path.join(IMAGES_DIR, name), buffer);

    fs.mkdirSync(path.join(PUBLIC_DIR, "images"), { recursive: true });
    fs.writeFileSync(path.join(PUBLIC_DIR, "images", name), buffer);

    return sendJson(res, 200, { url: `/images/${name}` });
  }

  if (req.method === "POST" && url === "/api/posts") {
    let body;
    try { body = await readJsonBody(req); } catch { return sendJson(res, 400, { error: "Invalid JSON" }); }
    const title = String(body.title || "").trim();
    if (!title) return sendJson(res, 400, { error: "Title is required" });

    const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date || "") ? body.date : todayIso();
    const slug = slugify(title);
    const category = body.category ? slugify(body.category) : null;

    let filename = `${date}-${slug}.md`;
    let n = 2;
    while (fs.existsSync(path.join(CONTENT_DIR, filename))) {
      filename = `${date}-${slug}-${n}.md`;
      n++;
    }

    const raw = serializePost({ title, date, slug, category, excerpt: body.excerpt, body: body.body });
    fs.writeFileSync(path.join(CONTENT_DIR, filename), raw);
    return sendJson(res, 200, { ...siteSnapshot(), file: filename });
  }

  if (req.method === "POST" && url === "/api/posts/update") {
    let body;
    try { body = await readJsonBody(req); } catch { return sendJson(res, 400, { error: "Invalid JSON" }); }
    const resolved = resolvePostFile(body.file);
    if (!resolved) return sendJson(res, 404, { error: "Post not found" });
    const title = String(body.title || "").trim();
    if (!title) return sendJson(res, 400, { error: "Title is required" });

    // Freeze the URL: keep whatever slug the post already has (explicit or
    // derived from its original title), regardless of the new title.
    const { data: existing } = parseFrontmatter(fs.readFileSync(resolved.filePath, "utf8"));
    const slug = existing.slug ? slugify(existing.slug) : slugify(existing.title || title);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date || "") ? body.date : (existing.date || todayIso());
    const category = body.category ? slugify(body.category) : null;

    const raw = serializePost({ title, date, slug, category, excerpt: body.excerpt, body: body.body });
    fs.writeFileSync(resolved.filePath, raw);
    return sendJson(res, 200, siteSnapshot());
  }

  if (req.method === "POST" && url === "/api/posts/delete") {
    let body;
    try { body = await readJsonBody(req); } catch { return sendJson(res, 400, { error: "Invalid JSON" }); }
    const resolved = resolvePostFile(body.file);
    if (!resolved) return sendJson(res, 404, { error: "Post not found" });
    fs.unlinkSync(resolved.filePath);
    return sendJson(res, 200, siteSnapshot());
  }

  sendJson(res, 404, { error: "Not found" });
}

function serveStaticFile(filePath, res) {
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end("Not found"); return; }
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": TYPES[ext] || "application/octet-stream" });
    res.end(data);
  });
}

http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, "http://localhost");
  const reqPath = decodeURIComponent(parsedUrl.pathname);

  if (reqPath.startsWith("/api/")) {
    handleApi(req, res, reqPath, parsedUrl.searchParams).catch((err) => sendJson(res, 500, { error: err.message }));
    return;
  }

  if (reqPath === "/admin" || reqPath === "/admin/") {
    return serveStaticFile(path.join(ADMIN_DIR, "index.html"), res);
  }

  const basePath = currentBasePath();
  const sitePath = basePath && (reqPath === basePath || reqPath.startsWith(basePath + "/"))
    ? reqPath.slice(basePath.length) || "/"
    : reqPath;

  let urlPath = sitePath.endsWith("/") ? sitePath + "index.html" : sitePath;
  let filePath = path.join(PUBLIC_DIR, urlPath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403); res.end("Forbidden"); return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (!path.extname(filePath)) {
        // pretty URL without trailing slash, e.g. /posts/foo
        return fs.readFile(path.join(filePath, "index.html"), (err2, data2) => {
          if (err2) { res.writeHead(404); res.end("Not found"); return; }
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(data2);
        });
      }
      res.writeHead(404); res.end("Not found"); return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": TYPES[ext] || "application/octet-stream" });
    res.end(data);
  });
}).listen(PORT, () => console.log(`Serving public/ at http://localhost:${PORT} (admin at /admin)`));
