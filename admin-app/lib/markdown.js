// Same pure Markdown/frontmatter logic as ../../build.js. Duplicated on
// purpose: this app deploys independently (its own Vercel project root),
// so it can't reach outside admin-app/ at build time. Keep in sync by hand
// if you change build.js's parser.

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

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function withBaseIfRooted(url, basePath) {
  return url.startsWith("/") ? basePath + url : url;
}

function inline(text, basePath = "") {
  let out = escapeHtml(text);
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  out = out.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => `<img src="${withBaseIfRooted(src, basePath)}" alt="${alt}" loading="lazy">`);
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => `<a href="${withBaseIfRooted(href, basePath)}">${label}</a>`);
  return out;
}

function markdownToHtml(md, basePath = "") {
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
      const level = h[1].length + 1;
      html.push(`<h${level}>${inline(h[2], basePath)}</h${level}>`);
      i++; continue;
    }

    if (/^```/.test(line)) {
      closeList();
      const code = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) { code.push(lines[i]); i++; }
      i++;
      html.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }

    if (/^>\s?/.test(line)) {
      closeList();
      const quote = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { quote.push(lines[i].replace(/^>\s?/, "")); i++; }
      html.push(`<blockquote><p>${inline(quote.join(" "), basePath)}</p></blockquote>`);
      continue;
    }

    const ul = line.match(/^[-*]\s+(.*)$/);
    if (ul) {
      if (listType !== "ul") { closeList(); html.push("<ul>"); listType = "ul"; }
      html.push(`<li>${inline(ul[1], basePath)}</li>`);
      i++; continue;
    }

    const ol = line.match(/^\d+\.\s+(.*)$/);
    if (ol) {
      if (listType !== "ol") { closeList(); html.push("<ol>"); listType = "ol"; }
      html.push(`<li>${inline(ol[1], basePath)}</li>`);
      i++; continue;
    }

    closeList();
    const para = [line];
    i++;
    while (i < lines.length && lines[i].trim() !== "" && !/^(#{1,3})\s|^```|^>\s?|^[-*]\s|^\d+\.\s|^---$/.test(lines[i])) {
      para.push(lines[i]); i++;
    }
    html.push(`<p>${inline(para.join(" "), basePath)}</p>`);
  }
  closeList();
  return html.join("\n");
}

function slugify(s) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function titleCase(slug) {
  return slug.split("-").map((w) => w ? w[0].toUpperCase() + w.slice(1) : w).join(" ");
}

module.exports = { parseFrontmatter, setFrontmatterField, markdownToHtml, slugify, titleCase };
