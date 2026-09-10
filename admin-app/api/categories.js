const { getConfig, saveConfig, listPostsSummary } = require("../lib/posts");
const { slugify } = require("../lib/markdown");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const input = Array.isArray(req.body?.categories) ? req.body.categories : null;
  if (!input) return res.status(400).json({ error: "Expected { categories: [...] }" });

  const seen = new Set();
  const clean = [];
  for (const c of input) {
    const label = String(c.label || "").trim();
    if (!label) continue;
    const slug = slugify(c.slug || label);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    clean.push({ slug, label });
  }

  try {
    const { config, sha } = await getConfig();
    config.categories = clean;
    await saveConfig(config, sha, "Update categories via admin");
    res.status(200).json(await listPostsSummary());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
