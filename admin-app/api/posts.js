const { putFile } = require("../lib/github");
const { slugify } = require("../lib/markdown");
const { POSTS_DIR, listPostFiles, listPostsSummary, todayIso, serializePost } = require("../lib/posts");

// Create a new post.
module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const title = String(req.body?.title || "").trim();
  if (!title) return res.status(400).json({ error: "Title is required" });

  const date = /^\d{4}-\d{2}-\d{2}$/.test(req.body?.date || "") ? req.body.date : todayIso();
  const slug = slugify(title);
  const category = req.body?.category ? slugify(req.body.category) : null;

  try {
    const existing = new Set(await listPostFiles());
    let filename = `${date}-${slug}.md`;
    let n = 2;
    while (existing.has(filename)) {
      filename = `${date}-${slug}-${n}.md`;
      n++;
    }

    const raw = serializePost({ title, date, slug, category, excerpt: req.body?.excerpt, body: req.body?.body });
    await putFile(`${POSTS_DIR}/${filename}`, raw, `Add post: ${title}`);

    const snapshot = await listPostsSummary();
    res.status(200).json({ ...snapshot, file: filename });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
