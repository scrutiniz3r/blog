#!/usr/bin/env node
// Minimal static file server for previewing public/ locally.
const http = require("http");
const fs = require("fs");
const path = require("path");

const PUBLIC_DIR = path.join(__dirname, "public");
const PORT = process.env.PORT || 4000;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".svg": "image/svg+xml",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

http.createServer((req, res) => {
  let reqPath = decodeURIComponent(req.url.split("?")[0]);
  if (reqPath.endsWith("/")) reqPath += "index.html";
  let filePath = path.join(PUBLIC_DIR, reqPath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403); res.end("Forbidden"); return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (!path.extname(filePath)) {
        // pretty URL without trailing slash, e.g. /posts/foo
        return fs.readFile(path.join(filePath, "index.html"), (err2, data2) => {
          if (err2) { res.writeHead(404); res.end("Not found"); return; }
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(data2);
        });
      }
      res.writeHead(404); res.end("Not found"); return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": TYPES[ext] || "application/octet-stream" });
    res.end(data);
  });
}).listen(PORT, () => console.log(`Serving public/ at http://localhost:${PORT}`));
