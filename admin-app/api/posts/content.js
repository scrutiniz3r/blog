const { loadPost } = require("../../lib/posts");
const { slugify } = require("../../lib/markdown");

const SAFE_FILE = /^[A-Za-z0-9._-]+\.md$/;

module.exports = async (req, res) => {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const file = String(req.query?.file || "");
  if (!SAFE_FILE.test(file)) return res.status(400).json({ error: "Invalid file" });

  try {
    const p = await loadPost(file);
    if (!p) return res.status(404).json({ error: "Post not found" });
    res.status(200).json({
      file,
      title: p.data.title || "",
      date: p.data.date || "",
      slug: p.data.slug || slugify(p.data.title || file.replace(/\.md$/, "")),
      category: p.data.category || null,
      excerpt: p.data.excerpt || "",
      body: p.content.trim(),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
