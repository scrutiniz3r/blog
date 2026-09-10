# Field Notes

A minimal, Substack-esque blog. Zero dependencies, one build script, RSS included.

## Writing a post

Add a Markdown file to `content/posts/`, e.g. `content/posts/2026-09-10-my-post.md`:

```markdown
---
title: My Post
date: 2026-09-10
excerpt: One sentence for the archive list and RSS description.
---

Body text goes here, in Markdown (headings, **bold**, *italic*, links, lists,
blockquotes, and code blocks are supported).
```

## Build and preview

```bash
npm run build   # generates public/ (index.html, rss.xml, posts/<slug>/index.html)
npm run serve   # serves public/ at http://localhost:4000
```

Or both at once: `npm start`.

## Configuring

Edit `config.json` — title, tagline, description, site URL, author, and the
accent color (the fluorescent green on the homepage hero).

## Deploying

`public/` is a plain static site — drop it on Netlify, Vercel, GitHub Pages,
or any static host. Set `url` in `config.json` to your real domain before
building, since it's used in canonical links and the RSS feed.

## Design

Twelve-column grid, deliberately off-center: the homepage headline, the
archive rows, and the post header all sit asymmetrically against the same
grid rather than centered. Structural text (nav, titles, dates) uses Inter,
a neo-grotesque sans in the spirit of Helvetica; body copy uses Newsreader,
a serif built for long-form reading. See the "A Note on This Design" sample
post for the reasoning.
