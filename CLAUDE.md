# Claude Code

## Adding photos

When Matthew points you at a local folder of photos:

1. Copy the new originals into `photo-intake/originals/`. Do not commit them.
2. Run `npm --prefix scripts install` once if needed, then `npm --prefix scripts run intake`.
3. Fill `location`, `section`, `caption`, and `tags` in each `photo-intake/drafts/<id>.json`. Use the matching file in `photo-intake/private/` to name the place. Never write coordinates into a draft, the catalog, a caption, or a commit.
4. Show Matthew the drafts and wait. Do not set `"status": "approved"` until he says so.
5. After he approves, set that status, run the intake command again, and commit only the stripped files in `photos/thumbs/` and `photos/display/` plus the updated catalog and draft sidecars.

Never commit `photo-intake/originals/` or `photo-intake/private/`. Do not force-add them. Captions must not contain em dashes. Leave `caption` blank when "Place, Month Year" is enough.
