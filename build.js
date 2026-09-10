#!/usr/bin/env node
/**
 * Zero-dependency static site builder.
 * Reads content/posts/*.md -> writes public/{index.html, rss.xml, posts/<slug>/index.html}
 * Exports build() so server.js can trigger a rebuild after admin edits.
 */
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const CONTENT_DIR = path.join(ROOT, "content", "posts");
const PUBLIC_DIR = path.join(ROOT, "public");
const SRC_DIR = path.join(ROOT, "src");
const CONFIG_PATH = path.join(ROOT, "config.json");

// ---------- tiny frontmatter parser ----------
function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { data: {}, content: raw };
  const [, fm, body] = match;
  const data = {};
  for (const line of fm.split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i === -1) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    val = val.replace(/^["']|["']$/g, "");
    data[key] = val;
  }
  return { data, content: body };
}

// ---------- tiny markdown -> html ----------
function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inline(text) {
  let out = escapeHtml(text);
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return out;
}

function markdownToHtml(md) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let i = 0;
  let listType = null;

  function closeList() {
    if (listType) { html.push(listType === "ul" ? "</ul>" : "</ol>"); listType = null; }
  }

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") { closeList(); i++; continue; }

    if (line.trim() === "---") { closeList(); html.push("<hr>"); i++; continue; }

    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      closeList();
      const level = h[1].length + 1; // start headings at h2 inside post body
      html.push(`<h${level}>${inline(h[2])}</h${level}>`);
      i++; continue;
    }

    if (/^```/.test(line)) {
      closeList();
      const code = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) { code.push(lines[i]); i++; }
      i++; // skip closing fence
      html.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }

    if (/^>\s?/.test(line)) {
      closeList();
      const quote = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { quote.push(lines[i].replace(/^>\s?/, "")); i++; }
      html.push(`<blockquote><p>${inline(quote.join(" "))}</p></blockquote>`);
      continue;
    }

    const ul = line.match(/^[-*]\s+(.*)$/);
    if (ul) {
      if (listType !== "ul") { closeList(); html.push("<ul>"); listType = "ul"; }
      html.push(`<li>${inline(ul[1])}</li>`);
      i++; continue;
    }

    const ol = line.match(/^\d+\.\s+(.*)$/);
    if (ol) {
      if (listType !== "ol") { closeList(); html.push("<ol>"); listType = "ol"; }
      html.push(`<li>${inline(ol[1])}</li>`);
      i++; continue;
    }

    closeList();
    const para = [line];
    i++;
    while (i < lines.length && lines[i].trim() !== "" && !/^(#{1,3})\s|^```|^>\s?|^[-*]\s|^\d+\.\s|^---$/.test(lines[i])) {
      para.push(lines[i]); i++;
    }
    html.push(`<p>${inline(para.join(" "))}</p>`);
  }
  closeList();
  return html.join("\n");
}

function slugify(s) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function titleCase(slug) {
  return slug.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
}

function excerptOf(html, len = 200) {
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text.length > len ? text.slice(0, len).trim() + "…" : text;
}

function fmtDate(d) {
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

function rfc822(d) { return d.toUTCString(); }

// Set/remove a single frontmatter field in a post's raw file text, preserving
// everything else (field order, body, line endings) as-is.
function setFrontmatterField(raw, key, value) {
  const match = raw.match(/^(---\r?\n)([\s\S]*?)(\r?\n---\r?\n?)([\s\S]*)$/);
  if (!match) throw new Error("File has no frontmatter block");
  const [, open, fm, close, body] = match;
  const lines = fm.split(/\r?\n/);
  const idx = lines.findIndex((l) => {
    const i = l.indexOf(":");
    return i !== -1 && l.slice(0, i).trim() === key;
  });
  if (value === null || value === "") {
    if (idx !== -1) lines.splice(idx, 1);
  } else if (idx !== -1) {
    lines[idx] = `${key}: ${value}`;
  } else {
    lines.push(`${key}: ${value}`);
  }
  return open + lines.join("\n") + close + body;
}

function xmlEscape(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function build() {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  const categories = config.categories || [];
  const categoryLabel = (slug) => {
    const found = categories.find((c) => c.slug === slug);
    return found ? found.label : titleCase(slug);
  };

  // Sub-path the site is served under (e.g. "/blog" for a GitHub Pages
  // project site at username.github.io/blog); "" for a root/custom domain.
  // Separate from config.url on purpose: config.url is the full canonical
  // origin+path, but local preview always serves at "/" regardless of it.
  const basePath = (config.basePath || "").replace(/\/$/, "");
  const withBase = (p) => basePath + p;

  const files = fs.readdirSync(CONTENT_DIR).filter((f) => f.endsWith(".md"));
  const posts = files.map((file) => {
    const raw = fs.readFileSync(path.join(CONTENT_DIR, file), "utf8");
    const { data, content } = parseFrontmatter(raw);
    const bodyHtml = markdownToHtml(content);
    const title = data.title || file.replace(/\.md$/, "");
    const date = data.date ? new Date(data.date + "T12:00:00Z") : new Date();
    const category = data.category ? slugify(data.category) : null;
    return {
      file,
      title,
      date,
      slug: slugify(data.slug || title),
      excerpt: data.excerpt || excerptOf(bodyHtml),
      category,
      categoryLabel: category ? categoryLabel(category) : null,
      bodyHtml,
    };
  }).sort((a, b) => b.date - a.date);

  // category pages: every configured category, plus any category still
  // referenced by a post even if it's since been removed from config
  // (avoids dead links from old posts/tags after an edit in /admin).
  const categoryPages = new Map(categories.map((c) => [c.slug, c]));
  for (const p of posts) {
    if (p.category && !categoryPages.has(p.category)) {
      categoryPages.set(p.category, { slug: p.category, label: p.categoryLabel });
    }
  }

  function layout({ title, description, activePath, bodyHtml, canonicalPath }) {
    const fullTitle = title === config.title ? config.title : `${title} — ${config.title}`;
    return `<!doctype html>
<html lang="${config.language}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(fullTitle)}</title>
<meta name="description" content="${escapeHtml(description || config.description)}">
<link rel="canonical" href="${config.url}${canonicalPath}">
<link rel="alternate" type="application/rss+xml" title="${escapeHtml(config.title)}" href="${config.url}/rss.xml">
<link rel="icon" href="data:,">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@500;600;700;800&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${withBase("/styles.css")}">
<style>:root{--accent:${config.accent};}</style>
</head>
<body>
<header class="site-header">
<a class="mark" href="${withBase("/")}">${escapeHtml(config.title)}</a>
<nav>
<a href="${withBase("/")}"${activePath === "/" ? ' aria-current="page"' : ""}>Archive</a>
<a href="${withBase("/rss.xml")}">RSS</a>
</nav>
</header>
${bodyHtml}
<footer class="site-footer">
<span>&copy; ${new Date().getFullYear()} ${escapeHtml(config.author)}</span>
<span class="site-footer-links">
${config.linkedin ? `<a href="${config.linkedin}">LinkedIn</a>` : ""}
<a href="${withBase("/rss.xml")}">Subscribe via RSS</a>
</span>
</footer>
</body>
</html>
`;
  }

  function heroSvg() {
    return fs.readFileSync(path.join(SRC_DIR, "hero.svg"), "utf8");
  }

  function categoryNav(activeSlug) {
    const items = [{ slug: null, label: "All", href: withBase("/") }, ...categories.map((c) => ({ slug: c.slug, label: c.label, href: withBase(`/categories/${c.slug}/`) }))];
    const links = items.map((c) => `<a href="${c.href}"${c.slug === activeSlug ? ' aria-current="page"' : ""}>${escapeHtml(c.label)}</a>`).join("\n");
    return `<nav class="category-nav">${links}</nav>`;
  }

  function archiveListHtml(list) {
    return list.map((p) => `
<li>
<a class="post-row" href="${withBase(`/posts/${p.slug}/`)}">
<span class="post-row-date">${fmtDate(p.date)}${p.categoryLabel ? ` <span class="post-row-cat">${escapeHtml(p.categoryLabel)}</span>` : ""}</span>
<span>
<h2 class="post-row-title">${escapeHtml(p.title)}</h2>
<p class="post-row-excerpt">${escapeHtml(p.excerpt)}</p>
</span>
</a>
</li>`).join("");
  }

  function renderIndex() {
    const body = `
<section class="hero">
<div class="hero-grid">
<p class="hero-eyebrow">${escapeHtml(config.tagline)}</p>
<h1 class="hero-title">${escapeHtml(config.title)}</h1>
<p class="hero-tagline">${escapeHtml(config.description)}</p>
<div class="hero-graphic">${heroSvg()}</div>
</div>
</section>
${categoryNav(null)}
<main class="wrap archive">
<ul class="archive-list">${archiveListHtml(posts)}
</ul>
</main>`;

    return layout({ title: config.title, description: config.description, activePath: "/", bodyHtml: body, canonicalPath: "/" });
  }

  function renderCategory(cat) {
    const list = posts.filter((p) => p.category === cat.slug);
    const body = `
${categoryNav(cat.slug)}
<main class="wrap archive">
<header class="archive-header"><h1>${escapeHtml(cat.label)}</h1></header>
<ul class="archive-list">${archiveListHtml(list)}
</ul>
</main>`;

    return layout({
      title: cat.label,
      description: `${cat.label} — ${config.description}`,
      activePath: `/categories/${cat.slug}/`,
      bodyHtml: body,
      canonicalPath: `/categories/${cat.slug}/`,
    });
  }

  function renderPost(p) {
    const body = `
<article class="post">
<div class="wrap">
<header class="post-header">
<p class="kicker">${fmtDate(p.date)}${p.categoryLabel ? ` &middot; <a href="${withBase(`/categories/${p.category}/`)}">${escapeHtml(p.categoryLabel)}</a>` : ""}</p>
<h1>${escapeHtml(p.title)}</h1>
</header>
<div class="post-body">
${p.bodyHtml}
<div class="post-footer"><a href="${withBase("/")}">&larr; Back to archive</a></div>
</div>
</div>
</article>`;

    return layout({ title: p.title, description: p.excerpt, activePath: `/posts/${p.slug}/`, bodyHtml: body, canonicalPath: `/posts/${p.slug}/` });
  }

  function renderRss() {
    const items = posts.map((p) => `
<item>
<title>${xmlEscape(p.title)}</title>
<link>${config.url}/posts/${p.slug}/</link>
<guid>${config.url}/posts/${p.slug}/</guid>
<pubDate>${rfc822(p.date)}</pubDate>
<description><![CDATA[${p.excerpt}]]></description>
<content:encoded><![CDATA[${p.bodyHtml}]]></content:encoded>
</item>`).join("");

    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>${xmlEscape(config.title)}</title>
<link>${config.url}</link>
<atom:link href="${config.url}/rss.xml" rel="self" type="application/rss+xml"/>
<description>${xmlEscape(config.description)}</description>
<language>${config.language}</language>
<lastBuildDate>${rfc822(new Date())}</lastBuildDate>
${items}
</channel>
</rss>
`;
  }

  // ---------- write output ----------
  fs.rmSync(PUBLIC_DIR, { recursive: true, force: true });
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });

  fs.writeFileSync(path.join(PUBLIC_DIR, "index.html"), renderIndex());
  fs.writeFileSync(path.join(PUBLIC_DIR, "rss.xml"), renderRss());
  fs.copyFileSync(path.join(SRC_DIR, "styles.css"), path.join(PUBLIC_DIR, "styles.css"));

  for (const p of posts) {
    const dir = path.join(PUBLIC_DIR, "posts", p.slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "index.html"), renderPost(p));
  }

  for (const cat of categoryPages.values()) {
    const dir = path.join(PUBLIC_DIR, "categories", cat.slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "index.html"), renderCategory(cat));
  }

  console.log(`Built ${posts.length} posts across ${categoryPages.size} categories -> public/`);
  return { config, categories, posts };
}

module.exports = {
  build,
  parseFrontmatter,
  setFrontmatterField,
  slugify,
  CONTENT_DIR,
  CONFIG_PATH,
};

if (require.main === module) {
  build();
}
