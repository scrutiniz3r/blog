// Public, unauthenticated on purpose (see middleware.js's PUBLIC_PATHS) —
// this is what the blog's own post pages call to show and submit comments.
const { applyCors } = require("../lib/cors");
const { listComments, addComment } = require("../lib/comments");

module.exports = async (req, res) => {
  if (applyCors(req, res)) return;

  if (req.method === "GET") {
    const slug = String(req.query?.post || "");
    try {
      res.status(200).json({ comments: await listComments(slug) });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
    return;
  }

  if (req.method === "POST") {
    const { post, name, text, website } = req.body || {};
    try {
      // `website` is the honeypot field — a real visitor never fills it in.
      const comment = await addComment(String(post || ""), { name, text, honeypot: website });
      if (!comment) return res.status(400).json({ error: "Name and comment text are required." });
      res.status(200).json({ comment });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
};
