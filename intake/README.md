# Adding New Intake Items

To add items to your Intake feed:

1. **Update intake.json** - Add an entry for your item:

## Books, Music, Movies (with cover images)

```json
{
  "type": "book",
  "title": "Book Title",
  "creator": "Author Name",
  "cover": "cover-image.jpg",
  "comment": "Your thoughts on this book..."
}
```

- `type`: One of `book`, `music`, `movie`
- `title`: The title
- `creator`: Author, artist, or director
- `cover`: Filename of cover image (upload to `/intake/covers/`)
- `comment`: Your notes/review (optional)

## Videos, Speeches (text-only cards)

```json
{
  "type": "video",
  "title": "Video Title",
  "creator": "Creator/Speaker",
  "comment": "Your thoughts..."
}
```

- `type`: One of `video`, `speech`
- `title`: The title
- `creator`: Source or speaker name
- `comment`: Your notes (optional)

## Cover Images

Upload cover images to `/intake/covers/` folder:
- Book covers and movie posters: portrait orientation
- Album covers: square format
