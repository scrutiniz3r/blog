// Only the public, unauthenticated routes (currently just /api/comments)
// need this — they're called cross-origin from the GitHub Pages blog.
// Everything else on this app is same-origin (the admin page calling its
// own API) and doesn't need it.
const ALLOWED_ORIGIN = process.env.BLOG_ORIGIN || "https://scrutiniz3r.github.io";

function applyCors(req, res) {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true; // caller should stop here
  }
  return false;
}

module.exports = { applyCors };
