// Moderation endpoint — protected by middleware.js's Basic Auth like the
// rest of the admin (not in PUBLIC_PATHS, deliberately a different path
// from /api/comments so it can't be excluded by a path-prefix accident).
const { listAllComments, deleteComment } = require("../lib/comments");

module.exports = async (req, res) => {
  if (req.method === "GET") {
    try {
      res.status(200).json({ comments: await listAllComments() });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
    return;
  }

  if (req.method === "POST") {
    const { post, id } = req.body || {};
    try {
      const removed = await deleteComment(String(post || ""), String(id || ""));
      if (!removed) return res.status(404).json({ error: "Comment not found" });
      res.status(200).json({ comments: await listAllComments() });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
};
