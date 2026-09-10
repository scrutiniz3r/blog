const { deleteFile } = require("../../lib/github");
const { POSTS_DIR, loadPost, listPostsSummary } = require("../../lib/posts");

const SAFE_FILE = /^[A-Za-z0-9._-]+\.md$/;

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const file = String(req.body?.file || "");
  if (!SAFE_FILE.test(file)) return res.status(400).json({ error: "Invalid file" });

  try {
    const existing = await loadPost(file);
    if (!existing) return res.status(404).json({ error: "Post not found" });
    await deleteFile(`${POSTS_DIR}/${file}`, `Delete post: ${file}`, existing.sha);
    res.status(200).json(await listPostsSummary());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
