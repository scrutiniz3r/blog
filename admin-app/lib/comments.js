const { getFile, listDir, updateFile } = require("./github");

const COMMENTS_DIR = "content/comments";
const SAFE_SLUG = /^[a-z0-9-]+$/;
const MAX_NAME = 80;
const MAX_TEXT = 2000;
const MAX_PER_POST = 500; // a soft ceiling so one post can't grow unbounded

function filePathFor(slug) {
  return `${COMMENTS_DIR}/${slug}.json`;
}

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function listComments(slug) {
  if (!SAFE_SLUG.test(slug)) return [];
  const f = await getFile(filePathFor(slug));
  if (!f) return [];
  try {
    const list = JSON.parse(f.content);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

// Returns the created comment, or null if rejected (validation/honeypot).
async function addComment(slug, { name, text, honeypot }) {
  if (!SAFE_SLUG.test(slug)) return null;
  if (honeypot) return null; // silently drop — bot filled the decoy field

  const cleanName = escapeHtml(String(name || "").trim()).slice(0, MAX_NAME);
  const cleanText = escapeHtml(String(text || "").trim()).slice(0, MAX_TEXT);
  if (!cleanName || !cleanText) return null;

  const comment = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: cleanName,
    text: cleanText,
    date: new Date().toISOString(),
  };

  await updateFile(filePathFor(slug), `Add comment on ${slug}`, (raw) => {
    let list = [];
    if (raw) { try { list = JSON.parse(raw); } catch { list = []; } }
    if (!Array.isArray(list)) list = [];
    list.push(comment);
    if (list.length > MAX_PER_POST) list = list.slice(list.length - MAX_PER_POST);
    return JSON.stringify(list, null, 2) + "\n";
  });

  return comment;
}

async function deleteComment(slug, id) {
  if (!SAFE_SLUG.test(slug)) return false;
  let removed = false;
  await updateFile(filePathFor(slug), `Delete comment on ${slug}`, (raw) => {
    let list = [];
    if (raw) { try { list = JSON.parse(raw); } catch { list = []; } }
    if (!Array.isArray(list)) list = [];
    const next = list.filter((c) => c.id !== id);
    removed = next.length !== list.length;
    return JSON.stringify(next, null, 2) + "\n";
  });
  return removed;
}

// For the admin moderation view: every comment across every post, newest first.
async function listAllComments() {
  const entries = await listDir(COMMENTS_DIR);
  const files = entries.filter((e) => e.type === "file" && e.name.endsWith(".json"));
  const perPost = await Promise.all(files.map(async (e) => {
    const slug = e.name.replace(/\.json$/, "");
    const comments = await listComments(slug);
    return comments.map((c) => ({ ...c, post: slug }));
  }));
  return perPost.flat().sort((a, b) => (a.date < b.date ? 1 : -1));
}

module.exports = { listComments, addComment, deleteComment, listAllComments, SAFE_SLUG };
