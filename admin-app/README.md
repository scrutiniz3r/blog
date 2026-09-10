# Field Notes — remote admin

The local `/admin` (in `../admin/`) only works on your own machine. This is
the same editor, rebuilt to run as a hosted app: instead of writing to local
files, it writes straight to the `scrutiniz3r/blog` repo through GitHub's
API. Every save is a real commit, which the existing
`.github/workflows/deploy.yml` picks up and republishes automatically —
same as pushing from your laptop.

No persistent server or disk: it's a static page (`public/index.html`) plus
a handful of Vercel serverless functions (`api/*.js`), gated behind a
username/password (`middleware.js`) since it's reachable from the internet.

## One-time setup (do this yourself — these are account-level steps)

**1. Create a GitHub token.**
GitHub → Settings → Developer settings → **Personal access tokens → Fine-grained tokens** → Generate new token.
- Repository access: **Only select repositories** → `blog`
- Permissions: **Contents → Read and write**
- Copy the token (starts with `github_pat_...`) — you'll paste it into Vercel in step 3, not here.

**2. Create a Vercel project.**
At [vercel.com](https://vercel.com), sign in with GitHub, **Add New → Project**, import `scrutiniz3r/blog`.
When configuring the project, set **Root Directory** to `admin-app`.
Framework preset: **Other**. Leave build/output settings blank (there's nothing to build).

**3. Set environment variables.**
In the new project's Settings → Environment Variables, add:

| Name | Value |
|---|---|
| `GITHUB_TOKEN` | the token from step 1 |
| `GITHUB_REPO` | `scrutiniz3r/blog` |
| `GITHUB_BRANCH` | `main` |
| `ADMIN_USER` | any username you'll type on your phone |
| `ADMIN_PASSWORD` | a real password — this is the only thing standing between the internet and write access to your repo |

**4. Deploy.**
Vercel deploys automatically once the project is created. Open the URL it gives you (e.g. `field-notes-admin.vercel.app`) — your browser will prompt for the username/password from step 3, then you're in the same Write/Preview/Image/Scribble editor as local `/admin`.

Bookmark that URL (or add it to your phone's home screen) — that's what you'll open from your phone going forward.

## Notes

- Every save is a commit + a live GitHub Actions run (usually live in under a minute). The posts table doesn't show a "still building" state — if you publish and don't see it live yet, that's normal, give it a minute.
- Photos taken on a phone camera are downscaled and re-encoded as JPEG in the browser before upload (max 1600px, so it stays fast and small) — the original file on your phone is untouched.
- Rotating `ADMIN_PASSWORD` or `GITHUB_TOKEN` later: update it in Vercel's Environment Variables and redeploy (Vercel's dashboard has a "Redeploy" button, or it picks it up on the next deploy).
- If you ever want to shut this down, delete the Vercel project and revoke the GitHub token — nothing else depends on it.
