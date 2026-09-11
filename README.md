# Field Notes

A minimal, Substack-esque blog. Zero dependencies, one build script, RSS included.

## Writing a post

The easy way: run `npm run serve` and open `/admin` — it has a "Write" form
(title, date, category, excerpt, a Markdown body with a live preview tab,
plus buttons to drop in an uploaded image or a quick scribble drawn right in
the browser). Every save writes the post file and rebuilds. Click a post's
title in the table below the form to edit it, or use its "Delete" link. The
post's URL is frozen to its original slug, so renaming a title later doesn't
break links to it.

The manual way: add a Markdown file to `content/posts/`, e.g.
`content/posts/2026-09-10-my-post.md`:

```markdown
---
title: My Post
date: 2026-09-10
excerpt: One sentence for the archive list and RSS description.
---

Body text goes here, in Markdown (headings, **bold**, *italic*, links, lists,
blockquotes, images with `![alt](/images/photo.png)`, and code blocks are
all supported). Drop image files straight into `content/images/`.
```

## Build and preview

```bash
npm run build   # generates public/ (index.html, rss.xml, posts/<slug>/index.html)
npm run serve   # serves public/ at http://localhost:4000
```

Or both at once: `npm start`.

Want to write from your phone, not just `localhost`? See
[`admin-app/`](admin-app/) — the same editor, rebuilt to run on Vercel and
write straight to this repo via GitHub's API instead of local files.

## Categories

Categories are defined in `config.json`'s `categories` array and assigned to
a post via `category: <slug>` in its frontmatter. Either edit those by hand,
or run `npm run serve` and use the `/admin` page — it lists every category
and post and saves straight back to `config.json` / the post files, then
rebuilds. `/admin` has no login; it's a local-only tool, not something to
expose on a public deployment (see Deploying below).

## Comments

Off by default. Every post page can show a comment box (name + text, no
account needed) backed by a small public API — see "Turn on comments" in
[`admin-app/README.md`](admin-app/README.md). Once that's deployed, set
`commentsApi` in `config.json` to its URL; leave it `""` to keep comments
off. Moderation (deleting) happens from the admin app's "Comments" section.

## Email sign-up

Off by default. Set `buttondownUsername` in `config.json` to your
[Buttondown](https://buttondown.com) username and every page gets a
"Get new posts by email" form in the footer, using Buttondown's own
embeddable-form endpoint — no backend of ours involved. Buttondown can also
auto-email subscribers straight from `rss.xml` (configure that in
Buttondown's own dashboard under Settings → Import). Leave the field `""`
to keep the form off.

## Configuring

Edit `config.json` — title, tagline, description, site URL, author, and the
accent color (the fluorescent green on the homepage hero).

## Deploying

`public/` is a plain static site — drop it on Netlify, Vercel, GitHub Pages,
or any static host. Set `url` in `config.json` to your real domain before
building, since it's used in canonical links and the RSS feed.

This repo deploys to **GitHub Pages** automatically via
`.github/workflows/deploy.yml`: every push to `main` runs `node build.js`
and publishes `public/` — nothing else, so `/admin` and the write API in
`server.js` never leave your machine. One manual step is required once, in
the GitHub web UI: **Settings → Pages → Build and deployment → Source →
GitHub Actions**.

## Design

Twelve-column grid, deliberately off-center: the homepage headline, the
archive rows, and the post header all sit asymmetrically against the same
grid rather than centered. Structural text (nav, titles, dates) uses Inter,
a neo-grotesque sans in the spirit of Helvetica; body copy uses Newsreader,
a serif built for long-form reading. See the "A Note on This Design" sample
post for the reasoning.
