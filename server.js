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
const { build, parseFrontmatter, setFrontmatterField, slugify, CONTENT_DIR, CONFIG_PATH } = require("./build.js");

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

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1e6) req.destroy();
    });
    req.on("end", () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

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

async function handleApi(req, res, url) {
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
    const file = path.basename(String(body.file || ""));
    if (!file.endsWith(".md")) return sendJson(res, 400, { error: "Invalid file" });
    const filePath = path.join(CONTENT_DIR, file);
    if (!fs.existsSync(filePath)) return sendJson(res, 404, { error: "Post not found" });

    const category = body.category ? slugify(body.category) : null;
    const raw = fs.readFileSync(filePath, "utf8");
    const updated = setFrontmatterField(raw, "category", category);
    fs.writeFileSync(filePath, updated);
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
  const reqPath = decodeURIComponent(req.url.split("?")[0]);

  if (reqPath.startsWith("/api/")) {
    handleApi(req, res, reqPath).catch((err) => sendJson(res, 500, { error: err.message }));
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
