# Terminus / MKE personal site

Personal website for Matthew Eitel. Static HTML/CSS/JS, no build step, no framework, no package.json.

## Hosting and deploy

- GitHub repo: `wafflesmart/wafflesmart.github.io` (the repo name is a GitHub Pages leftover)
- Hosted on Vercel: project `v0_terminus`, team `terminus4`, live at `v0terminus.vercel.app`
- Pushing to `main` redeploys production. Every other branch or PR gets a Vercel preview URL.
- Work on a branch and open a PR rather than pushing to `main`, unless Matthew says otherwise. Merging to `main` publishes.
- Old remote branches (`add-mindmap-svg`, `claude/build-personal-website-WSJoE`) can be ignored.

## Structure

- `index.html`: homepage. Fetches `captures/photos/photos.json` and `output/posts.json`.
- `css/style.css`: the single stylesheet for the whole site (CSS variables at `:root`).
- `captures/index.html`: masonry photo grid, lightbox, location filter. Data in `captures/photos/photos.json`.
- `photos/`: the photo files themselves (about 43 MB), named like `File 00001.jpeg`.
- `intake/index.html`: card grid of books, music, movies, videos, speeches with type and status filters. Data in `intake/intake.json`. Cover images in `intake/covers/`.
- `output/index.html`: post list. Data in `output/posts.json`. Each post is `output/<slug>/index.html`. Markdown drafts live in `output/posts/`.
- `essays/`, `writing/`, `work/`, `photography/`, `contact/`, `about/`, `tags/`: other sections and pages.
- `tags.json`: tag labels and colors, shared across Captures, Intake, and Output.
- `claude_code_prompt.md`: the historical brief for the earlier improvement tasks (1 to 8, all merged in PR #26). Reference only, not a to-do list.

## Data schemas (copy the shape of existing entries)

- **photos.json**: `file`, `section`, `date` (YYYY-MM-DD), `location`, `caption`, `tags[]`. Photos are numbered globally by date, oldest first.
- **intake.json**: `type` (book | music | movie | video | speech), `title`, `creator`, `cover`, `comment`, `status` (reading | finished | reference | queued), `tags[]`, and optional `link`.
- **posts.json**: `slug`, `title`, `date`, `status` (draft | in progress | complete), `description`, `tags[]`, `related_intake[]`, `related_captures[]`.
- Tags must exist in `tags.json`. Add the tag there first.

## Adding content

- **Photo:** add the file to `photos/`, add an entry to `photos.json`. Prefer resizing and compressing first (target long edge around 2000px, under 500 KB). Section names appear as headers, and `sectionLabels` in `captures/index.html` maps raw section strings to readable titles.
- **Intake item:** add a cover to `intake/covers/` (portrait for books and movies, square for albums) and an entry to `intake.json`.
- **Essay:** add `output/<slug>/index.html` (copy an existing post page) and an entry to `posts.json`.
- `captures/photos/README.md` is out of date. It lists sections like travel and street, but real sections are date-and-place labels such as `11.25 | BER-PAR`. Trust `photos.json` over that README.

## Design constants

- Inspired by macwright.com: fixed 180px sidebar, content in `.main` with `margin-left: 180px`.
- Dark mode and responsive layouts are already implemented. Keep both working when changing CSS.
- Sans-serif system stack for UI. Source Serif 4 for reading content (`.prose`, `.post-content`, `.card-comment`).
- Site title in the sidebar is "MKE".

## Working rules

- Keep it dependency-free unless Matthew asks for a framework or build step.
- Fetches use root-absolute paths (`/captures/photos/photos.json`, `/photos/...`), so the site must be served from the root. Preview with `python3 -m http.server` from the repo root.
- Filenames with spaces are URL-encoded in the JS. Keep that when touching image code.
- Verify in a browser or local server after changes, and check both light and dark mode.
- Do not delete photos or JSON entries without asking.

## Ideas queued (not started)

- Script to ingest photos: resize, rename, read EXIF date and location, append to `photos.json`.
- Password-protected `/admin` upload page (Vercel Blob or GitHub write-back).
- Custom domain.
