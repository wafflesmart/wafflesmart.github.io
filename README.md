# terminus.github.io

Personal site. Plain HTML, CSS, and JavaScript. Captures is the photo archive.

## Adding photos

Originals stay on your machine. The site only receives a thumbnail and a web-sized JPEG, both with metadata removed.

1. Drop new photos, metadata included, into `photo-intake/originals/`. That folder is gitignored and is not deployed to GitHub Pages or Vercel.
2. Run `npm --prefix scripts install` once, then `npm --prefix scripts run intake`. The script reads the date, camera, and GPS, suggests a place and a series, and writes a draft sidecar in `photo-intake/drafts/`. Coordinates stay in `photo-intake/private/`, which is gitignored.
3. Edit the sidecar (an assistant can do this). Set the place, series, caption, and tags, then set `"status": "approved"` and run the intake command again. Approved photos are resized, stripped, and added to Captures. Drafts stay off the site.

The viewer shows `Place, Month Year` from the location and date. Leave `caption` blank unless you want a few extra words. More detail is in `photo-intake/README.md`.

```bash
npm --prefix scripts test    # sample images that include GPS
npm --prefix scripts run check
```

## Originals

Camera files used to be served from `/photos/` at full size. They are not served anymore.

- Keep originals in `photo-intake/originals/`. The folder is gitignored. Nothing in the HTML or the catalog points at it.
- GPS, altitude, and the raw EXIF live only in `photo-intake/private/`, also gitignored. Draft sidecars and `captures/photos/photos.json` are checked so a coordinate field or a coordinate pair cannot be written there.
- Published files are in `photos/thumbs/` (600px on the long edge) and `photos/display/` (2000px). They are re-encoded JPEGs. EXIF, GPS, camera, ICC, and XMP are removed. The script refuses to keep a file if any of that metadata is still present.
- The copies that were already in this repository remain in git history from before this change. Check a file out into `photo-intake/originals/` if you want it on disk again, and do not commit that folder. Rewriting history is a separate step; this change stops those files from being deployed going forward.

Payload of the files that were in `/photos/` when this change was made:

| | Files | Bytes |
| --- | ---: | ---: |
| Before, full-size JPEGs in `/photos/` | 46 (37 unique) | 45,478,271 (45.5 MB) |
| After, thumbnails and display copies | 68 | 8,189,749 (8.2 MB) |
| Captures grid before (the 10 catalog photos) | 10 | 10,322,273 (10.3 MB) |
| Captures grid after (those 10 thumbnails) | 10 | 257,453 (257 KB) |
| Captures viewer, all 10 display copies | 10 | 2,263,392 (2.3 MB) |

The grid is about 2.5% of the previous catalog payload. Opening one photo loads a single display JPEG of a few hundred kilobytes instead of a multi-megabyte original. Three files in `/photos/` were not linked from any page and were not in the catalog (`WhatsApp Image 2026-01-25 at 20.51.43`), so they were not republished. They remain in git history.
