const { getFile, listDir, putFile } = require("./github");
const { parseFrontmatter, slugify, titleCase } = require("./markdown");

const POSTS_DIR = "content/posts";
const IMAGES_DIR = "content/images";
const CONFIG_PATH = "config.json";

async function getConfig() {
  const f = await getFile(CONFIG_PATH);
  if (!f) throw new Error(`${CONFIG_PATH} not found in the repo`);
  return { config: JSON.parse(f.content), sha: f.sha };
}

async function saveConfig(config, sha, message) {
  return putFile(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", message, sha);
}

async function listPostFiles() {
  const entries = await listDir(POSTS_DIR);
  return entries.filter((e) => e.type === "file" && e.name.endsWith(".md")).map((e) => e.name);
}

// Returns { file, sha, raw, data, content } or null if the file doesn't exist.
async function loadPost(file) {
  const f = await getFile(`${POSTS_DIR}/${file}`);
  if (!f) return null;
  const { data, content } = parseFrontmatter(f.content);
  return { file, sha: f.sha, raw: f.content, data, content };
}

function categoryLabelFor(categories, slug) {
  const found = categories.find((c) => c.slug === slug);
  return found ? found.label : titleCase(slug);
}

// Lightweight summary for the admin UI: categories + each post's
// title/date/category (no rendered body needed there).
async function listPostsSummary() {
  const { config } = await getConfig();
  const categories = config.categories || [];
  const files = await listPostFiles();
  const posts = await Promise.all(files.map(async (file) => {
    const p = await loadPost(file);
    const category = p.data.category ? slugify(p.data.category) : null;
    return {
      file,
      title: p.data.title || file.replace(/\.md$/, ""),
      date: p.data.date || "",
      category,
    };
  }));
  posts.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return { categories, posts };
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// Same shape build.js's local admin writes: slug is always explicit so a
// later title edit never changes the post's URL.
function serializePost({ title, date, slug, category, excerpt, body }) {
  const oneLine = (s) => String(s || "").replace(/\r?\n/g, " ").trim();
  const lines = [`title: ${oneLine(title)}`, `date: ${date}`, `slug: ${slug}`];
  if (category) lines.push(`category: ${category}`);
  if (excerpt) lines.push(`excerpt: ${oneLine(excerpt)}`);
  return `---\n${lines.join("\n")}\n---\n\n${String(body || "").replace(/\r\n/g, "\n").trim()}\n`;
}

module.exports = {
  POSTS_DIR, IMAGES_DIR, CONFIG_PATH,
  getConfig, saveConfig,
  listPostFiles, loadPost, listPostsSummary,
  categoryLabelFor, todayIso, serializePost,
};
