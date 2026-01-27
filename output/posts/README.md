# Adding New Posts

To add a new post:

1. **Create a markdown file** in this folder (e.g., `my-new-post.md`)

2. **Add frontmatter** at the top of the file:
   ```
   ---
   title: My Post Title
   date: 2026-01-25
   ---

   Your content here...
   ```

3. **Update posts.json** - Add an entry for your new post:
   ```json
   {
     "slug": "my-new-post",
     "title": "My Post Title",
     "date": "2026-01-25"
   }
   ```

   The slug must match your filename (without .md).

   Posts are sorted by date (newest first).
