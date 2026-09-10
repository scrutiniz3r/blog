const { putFile } = require("../lib/github");
const { slugify } = require("../lib/markdown");
const { IMAGES_DIR } = require("../lib/posts");

const EXT_BY_MIME = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const match = /^data:([\w/+.-]+);base64,(.+)$/.exec(String(req.body?.dataUrl || ""));
  if (!match) return res.status(400).json({ error: "Expected a base64 data: URL" });
  const [, mime, base64] = match;
  const ext = EXT_BY_MIME[mime];
  if (!ext) return res.status(400).json({ error: `Unsupported image type: ${mime}` });

  const rawName = String(req.body?.filename || "image").replace(/\.[^.]+$/, "");
  const baseName = slugify(rawName) || "image";
  const name = `${baseName}-${Date.now().toString(36)}.${ext}`;

  try {
    await putFile(`${IMAGES_DIR}/${name}`, Buffer.from(base64, "base64"), `Add image: ${name}`);
    res.status(200).json({ url: `/images/${name}` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
