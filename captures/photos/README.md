# Adding New Photos

To add photos to Captures:

1. **Upload your photo** to the `/photos/` folder (the main photos folder, not this one)

2. **Update photos.json** - Add an entry for your photo:
   ```json
   {
     "file": "my-photo.jpeg",
     "section": "travel",
     "date": "2026-01-25"
   }
   ```

   - `file`: The exact filename of your photo
   - `section`: One of: `travel`, `street`, `portraits`, or `unsorted`
   - `date`: When the photo was taken (YYYY-MM-DD format)

   Photos are numbered globally by date (oldest = 001).

## Sections

Available sections:
- `travel` - Travel photography
- `street` - Street photography
- `portraits` - Portrait photography
- `unsorted` - Uncategorized photos

To create a new section, just use a new section name in the JSON.
