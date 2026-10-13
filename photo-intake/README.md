# Photo intake

Originals never go on the site. Captures only publishes a thumbnail and a web-sized JPEG, both with metadata removed.

## Three steps

1. **Drop the files.** Put new photos in `photo-intake/originals/`, with the date, camera, and GPS still attached. This folder is gitignored. GitHub Pages and Vercel only deploy tracked files, so these originals are not uploaded.

2. **Read the metadata.** From the repo root:

   ```bash
   npm --prefix scripts install   # once
   npm --prefix scripts run intake
   ```

   The script reads each new file and writes two things:

   - `photo-intake/private/<id>.json` — date, camera, and GPS. Gitignored. Never commit this folder.
   - `photo-intake/drafts/<id>.json` — a label sidecar with no coordinates. This one is safe to commit. `photo-intake/drafts/REVIEW.md` is a generated summary of the same drafts.

   Photos taken near each other, within about 30 km and a few days, are grouped into one series such as `11.25 | BER-PAR`. A place name comes from an offline city list. Add `--geocode` (`npm --prefix scripts run intake -- --geocode`) to ask OpenStreetMap's Nominatim for places that list does not know. Only the city name is kept. The coordinate stays in the private file.

   Each new photo is also appended to `captures/photos/photos.json` with `"status": "draft"`. Drafts are not shown.

3. **Approve, then publish.** Edit the sidecar. An assistant can fill `location`, `section`, `caption`, and `tags` from the private file (on your machine) and from the pictures. Set `"status": "approved"` and run the intake command again.

   Approved photos are written to `photos/thumbs/` (longest edge 600px) and `photos/display/` (longest edge 2000px). EXIF, GPS, camera, ICC, and XMP are removed. The catalog entry becomes `"status": "published"`. Leave a caption blank to show `Place, Month Year` in the viewer. A caption you write is added after that line.

   The script will not publish a photo whose place is still `Unknown place`. It also refuses to write a public file that contains a coordinate field or a coordinate pair.

## What an assistant edits

`photo-intake/drafts/<id>.json`:

```json
{
  "id": "0123456789ab",
  "sourceFile": "IMG_2044.jpg",
  "status": "draft",
  "date": "2025-11-25",
  "camera": "Apple iPhone 15 Pro",
  "suggested": {
    "location": "Berlin",
    "section": "11.25 | BER",
    "caption": "",
    "tags": ["berlin"]
  },
  "location": "Berlin",
  "section": "11.25 | BER",
  "caption": "",
  "tags": ["berlin"]
}
```

Change `location`, `section`, `caption`, and `tags` if the suggestion is wrong. Do not put coordinates in any of those fields. `REVIEW.md` is regenerated on every run; edit the JSON, not the markdown.

The private sidecar next to it (gitignored) is the only place with latitude and longitude. Use it to name the place. Do not copy those numbers into the draft, the catalog, or a commit.

## Where the files go

| Path | On the site? | In git? |
| --- | --- | --- |
| `photo-intake/originals/` | No | No |
| `photo-intake/private/` | No | No |
| `photo-intake/drafts/` | Yes, as static files, so they must stay free of GPS | Yes |
| `photos/thumbs/`, `photos/display/` | Yes | Yes |
| `captures/photos/photos.json` | Yes | Yes |

`photos/` is only for those published copies. Do not drop camera files there. The old `photography/` page and the About portrait use the same stripped copies.

## Checks

```bash
npm --prefix scripts test    # sample images with GPS
npm --prefix scripts run check
```

`check` fails if a published JPEG still has metadata, if the catalog or a draft contains coordinates, or if an original or private sidecar is tracked by git.
