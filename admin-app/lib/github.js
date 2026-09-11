// Thin wrapper around GitHub's Contents API. Every write here becomes a
// real commit on GITHUB_BRANCH, which is exactly what pushing from a local
// clone would do — the existing .github/workflows/deploy.yml then rebuilds
// and republishes the site automatically, same as any other push.
const API = "https://api.github.com";

function env(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function repo() { return env("GITHUB_REPO"); } // "owner/repo"
function branch() { return process.env.GITHUB_BRANCH || "main"; }
function token() { return env("GITHUB_TOKEN"); }

function headers() {
  return {
    Authorization: `Bearer ${token()}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };
}

function encodePath(p) {
  return p.split("/").map(encodeURIComponent).join("/");
}

async function ghFetch(path, opts = {}) {
  const res = await fetch(`${API}${path}`, { ...opts, headers: { ...headers(), ...(opts.headers || {}) } });
  if (res.status === 404) return { notFound: true };
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = new Error(`GitHub API ${res.status} on ${path}: ${body.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return { data: null };
  return { data: await res.json() };
}

// Returns { content, sha } for a file, or null if it doesn't exist.
async function getFile(filePath) {
  const { data, notFound } = await ghFetch(`/repos/${repo()}/contents/${encodePath(filePath)}?ref=${branch()}`);
  if (notFound) return null;
  if (Array.isArray(data)) throw new Error(`${filePath} is a directory, not a file`);
  return { content: Buffer.from(data.content, "base64").toString("utf8"), sha: data.sha };
}

// Returns [] if the directory doesn't exist.
async function listDir(dirPath) {
  const { data, notFound } = await ghFetch(`/repos/${repo()}/contents/${encodePath(dirPath)}?ref=${branch()}`);
  if (notFound) return [];
  return Array.isArray(data) ? data : [];
}

// Creates or updates a file. `content` is a Buffer or a utf8 string. Pass
// `sha` (from getFile) when updating an existing file.
async function putFile(filePath, content, message, sha) {
  const contentB64 = Buffer.isBuffer(content) ? content.toString("base64") : Buffer.from(content, "utf8").toString("base64");
  const { data } = await ghFetch(`/repos/${repo()}/contents/${encodePath(filePath)}`, {
    method: "PUT",
    body: JSON.stringify({ message, content: contentB64, branch: branch(), ...(sha ? { sha } : {}) }),
  });
  return data;
}

async function deleteFile(filePath, message, sha) {
  await ghFetch(`/repos/${repo()}/contents/${encodePath(filePath)}`, {
    method: "DELETE",
    body: JSON.stringify({ message, sha, branch: branch() }),
  });
}

// Read-modify-write with retry: `mutate(currentValueOrNull)` returns the new
// value to save (or null/undefined to skip writing). Retries a few times on
// a 409 (someone else's commit landed between our read and write) — the
// realistic case here being two comments posted within moments of each
// other on the same post's comment file.
async function updateFile(filePath, message, mutate, { attempts = 4 } = {}) {
  for (let i = 0; i < attempts; i++) {
    const existing = await getFile(filePath);
    const next = await mutate(existing ? existing.content : null);
    if (next === null || next === undefined) return null;
    try {
      return await putFile(filePath, next, message, existing ? existing.sha : undefined);
    } catch (e) {
      if (e.status === 409 && i < attempts - 1) continue;
      throw e;
    }
  }
}

module.exports = { getFile, listDir, putFile, deleteFile, updateFile };
