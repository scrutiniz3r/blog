const { listPostsSummary } = require("../lib/posts");

module.exports = async (req, res) => {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    res.status(200).json(await listPostsSummary());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
