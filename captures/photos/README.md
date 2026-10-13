# Captures data

`photos.json` is the catalog the site renders. Each published entry points at a thumbnail and a display JPEG under `/photos/`.

To add a photo, use the intake script instead of editing this file by hand. See "Adding photos" in the repository README. Draft entries (`"status": "draft"`) stay out of the grid until you approve them.

Do not store GPS, camera EXIF, or a path to an original in this file. The viewer builds the line "Place, Month Year" from `location` and `date`. A `caption` is optional and is shown after that line.
