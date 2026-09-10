const { putFile } = require("../../lib/github");
const { slugify } = require("../../lib/markdown");
const { POSTS_DIR, loadPost, listPostsSummary, todayIso, serializePost } = require("../../lib/posts");

const SAFE_FILE = /^[A-Za-z0-9._-]+\.md$/;

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const file = String(req.body?.file || "");
  if (!SAFE_FILE.test(file)) return res.status(400).json({ error: "Invalid file" });

  const title = String(req.body?.title || "").trim();
  if (!title) return res.status(400).json({ error: "Title is required" });

  try {
    const existing = await loadPost(file);
    if (!existing) return res.status(404).json({ error: "Post not found" });

    // Freeze the URL: keep whatever slug the post already has, regardless
    // of the new title.
    const slug = existing.data.slug ? slugify(existing.data.slug) : slugify(existing.data.title || title);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(req.body?.date || "") ? req.body.date : (existing.data.date || todayIso());
    const category = req.body?.category ? slugify(req.body.category) : null;

    const raw = serializePost({ title, date, slug, category, excerpt: req.body?.excerpt, body: req.body?.body });
    await putFile(`${POSTS_DIR}/${file}`, raw, `Update post: ${title}`, existing.sha);
    res.status(200).json(await listPostsSummary());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
