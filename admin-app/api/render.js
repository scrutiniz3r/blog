const { markdownToHtml } = require("../lib/markdown");
const { getConfig } = require("../lib/posts");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  let basePath = "";
  try {
    const { config } = await getConfig();
    basePath = (config.basePath || "").replace(/\/$/, "");
  } catch {
    // preview still works without it; just without base-path-prefixed links
  }
  res.status(200).json({ html: markdownToHtml(String(req.body?.body || ""), basePath) });
};
