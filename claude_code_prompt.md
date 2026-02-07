# Claude Code Prompt — MKE Site Improvements

You are working on a personal website hosted at `wafflesmart.github.io`. It is a static site (raw HTML/CSS/JS, no build tools) deployed via GitHub Pages from the `main` branch.

## Repo Structure

```
/
├── index.html              ← Homepage (loads data from JSON via fetch)
├── css/style.css           ← Single stylesheet for the entire site
├── about/index.html
├── captures/index.html     ← Masonry photo grid, loads from photos.json, has lightbox
├── captures/photos/photos.json  ← Photo metadata array
├── intake/index.html       ← Card grid with filter buttons, loads from intake.json
├── intake/intake.json      ← Intake items array
├── intake/covers/          ← Cover images for intake items
├── output/index.html       ← Simple post list
├── output/thinking-historically-01/index.html  ← Example post
├── output/under-construction/index.html
├── output/under-construction-02/index.html
├── photos/                 ← Photo files referenced by captures
```

## Current Data Schemas

**intake.json** (each item):
```json
{
  "type": "book|music|movie|video|speech",
  "title": "string",
  "creator": "string",
  "cover": "filename.jpg",
  "comment": "string (currently empty on most items)",
  "link": "url (optional, used on speeches)"
}
```

**photos.json** (each item):
```json
{
  "file": "File 00001.jpeg",
  "section": "11.25 | BER-PAR",
  "date": "2025-11-25"
}
```

## Design Constants

The site is inspired by macwright.com. Sidebar is fixed at 180px width. All content lives in `.main` with `margin-left: 180px`. Current colors: text `#1a1a1a`, secondary text `#666` / `#999`, background `#fff`. Font stack is system sans-serif.

---

## Tasks to Execute

Execute the following improvements in order. After each task, verify that the site renders correctly and nothing is broken. Preserve all existing functionality — do not remove features.

---

### Task 1: Typography and Color Refinements (Rec 1.3)

**In `css/style.css`:**

1. Add Google Fonts import at the top of the file for **Source Serif 4** (weights 400 and 600):
   ```css
   @import url('https://fonts.googleapis.com/css2?family=Source+Serif+4:wght@400;600&display=swap');
   ```

2. Change `body` background from `#fff` to `#faf9f7`

3. Keep the existing system sans-serif stack for `body` font-family (used in nav, headers, UI elements), but add a new class `.prose` that uses `Source Serif 4` for reading content:
   ```css
   .prose, .post-content, article, .about-content, .card-comment {
     font-family: 'Source Serif 4', Georgia, serif;
   }
   ```

4. Add a CSS custom property for the accent color at the `:root` level:
   ```css
   :root {
     --accent: #5a7a8a;
     --bg: #faf9f7;
     --text: #1a1a1a;
     --text-secondary: #666;
     --text-muted: #999;
     --border: #eee;
   }
   ```
   Then update `body` background, text colors, and all link `text-decoration-color` values to use these variables. Links should use `var(--accent)` for their text-decoration-color. Active/hover links stay `#1a1a1a`.

5. Set `line-height: 1.7` on `.prose` / `.post-content` and ensure `max-width: 680px` on `.post-content` for comfortable reading.

6. Update all HTML files (index.html, captures/index.html, intake/index.html, output/index.html, about/index.html, and all output post pages) to include the Google Fonts link in the `<head>`:
   ```html
   <link rel="preconnect" href="https://fonts.googleapis.com">
   <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
   <link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:wght@400;600&display=swap" rel="stylesheet">
   ```
   NOTE: If the @import method in CSS works reliably, the HTML link tags are optional — use whichever approach is simpler. Do not duplicate.

---

### Task 2: Add Metadata and Status to Intake Items (Rec 1.2)

**In `intake/intake.json`:**

1. Add a `"status"` field to every item. Valid values: `"reading"`, `"finished"`, `"reference"`, `"queued"`. Set all existing items to `"finished"` as a default (the owner can update these later).

2. Add a `"tags"` field to every item as an empty array `[]` (to be populated later for Task 6).

**In `intake/index.html`:**

3. Update the `renderItems()` function so that each card displays:
   - The **title** (already on flip-card back, keep as-is)
   - The **creator** (already on flip-card back, keep as-is)
   - A **status badge** — a small pill/tag in the top-right corner of the flip-card-back showing the status value. Style it as a small rounded span with semi-transparent white background and small font.

4. Add a status filter row below the existing type filters. Render buttons for: `All Statuses`, `Reading`, `Finished`, `Reference`, `Queued`. These should work in combination with the type filter (AND logic: show items matching BOTH the selected type and the selected status).

**In `css/style.css`:**

5. Add styles for the status badge:
   ```css
   .status-badge {
     position: absolute;
     top: 0.5rem;
     right: 0.5rem;
     font-size: 0.65rem;
     text-transform: uppercase;
     letter-spacing: 0.05em;
     padding: 0.15rem 0.4rem;
     border-radius: 2px;
     background: rgba(255,255,255,0.15);
     color: rgba(255,255,255,0.7);
   }
   ```
   Make `.flip-card-back` position: relative so the badge can be absolutely positioned.

6. Add styles for the status filter row (reuse `.intake-filters` styling or create a second row with similar appearance).

---

### Task 3: Captures Annotation Layer (Rec 2.1)

**In `captures/photos/photos.json`:**

1. Add new fields to each photo object:
   - `"location"`: string (e.g., `"Paris"`, `"Berlin"`) — set based on the section name for existing items
   - `"caption"`: string — leave empty `""` for now (owner will fill in later)

**In `captures/index.html`:**

2. Add a CSS hover effect on `.capture-item img`:
   ```css
   .capture-item img {
     transition: transform 0.2s ease, opacity 0.2s ease;
   }
   .capture-item img:hover {
     transform: scale(1.02);
     opacity: 0.9;
   }
   ```
   (Add this inline in a `<style>` tag or in the main CSS file.)

3. Update the lightbox to show the caption and location below the photo number. Modify the lightbox HTML to include a `lightbox-caption` element:
   ```html
   <div class="lightbox-caption" id="lightbox-caption"></div>
   ```
   Position it below the `lightbox-number`. When showing a photo, populate it with the caption text (if non-empty) and location.

4. Make the section headers more descriptive. Instead of displaying the raw section string like "11.25 | BER-PAR", parse it to display a more readable format. Add a mapping object at the top of the script:
   ```javascript
   var sectionLabels = {
     "11.25 | BER-PAR": "November 2025 — Berlin & Paris"
   };
   ```
   Use `sectionLabels[sectionName] || sectionName` when rendering the section title.

5. Add a location filter. Derive unique locations from the photo data and render filter buttons above the grid (similar to Intake filters). Filtering by location shows only photos from that location.

**In `css/style.css`:**

6. Add styles for the lightbox caption:
   ```css
   .lightbox-caption {
     position: absolute;
     bottom: -50px;
     left: 50%;
     transform: translateX(-50%);
     color: #fff;
     font-size: 0.8rem;
     opacity: 0.6;
     text-align: center;
     max-width: 400px;
     font-family: 'Source Serif 4', Georgia, serif;
   }
   ```

---

### Task 4: Build Out the Output Section (Rec 2.2)

**Convert Output to JSON-driven rendering (like Intake and Captures):**

1. Create `output/posts.json`:
   ```json
   [
     {
       "slug": "under-construction-02",
       "title": "Under Construction 02",
       "date": "Jan 2026",
       "status": "draft",
       "description": "",
       "tags": [],
       "related_intake": [],
       "related_captures": []
     },
     {
       "slug": "under-construction",
       "title": "Under Construction",
       "date": "Jan 2026",
       "status": "draft",
       "description": "",
       "tags": [],
       "related_intake": [],
       "related_captures": []
     },
     {
       "slug": "thinking-historically-01",
       "title": "Thinking Historically 01.",
       "date": "Sep 2025",
       "status": "in progress",
       "description": "Notes on American domestic unrest, geopolitical tensions, and cultural soul-searching from the Cold War era through the 1980s.",
       "tags": ["history", "cold-war", "culture"],
       "related_intake": ["Thinking Historically"],
       "related_captures": []
     }
   ]
   ```

2. Update `output/index.html` to fetch from `posts.json` and render the list dynamically. Each list item should display:
   - Title (linked to the post)
   - Date (right-aligned, as now)
   - A small **status indicator** next to the title: a colored dot or text label. Use: `draft` (gray), `in progress` (amber/yellow), `complete` (green).
   - The **description** text below the title in smaller, muted text (if non-empty)

3. Update `index.html` homepage Output section to also fetch from `posts.json` instead of being hardcoded.

4. On each individual output post page (e.g., `output/thinking-historically-01/index.html`), add a "Related" section at the bottom that links to related Intake items. For now this can be a simple manually-maintained list — the cross-linking system in Task 6 will formalize this.

**In `css/style.css`:**

5. Add styles for the post status indicator:
   ```css
   .post-status {
     display: inline-block;
     font-size: 0.7rem;
     text-transform: uppercase;
     letter-spacing: 0.05em;
     padding: 0.1rem 0.4rem;
     border-radius: 2px;
     margin-left: 0.5rem;
     vertical-align: middle;
   }
   .post-status.draft { background: #e8e8e8; color: #888; }
   .post-status.in-progress { background: #fff3cd; color: #856404; }
   .post-status.complete { background: #d4edda; color: #155724; }
   ```

6. Add style for the post description:
   ```css
   .post-description {
     font-size: 0.85rem;
     color: var(--text-muted);
     margin-top: 0.15rem;
     font-family: 'Source Serif 4', Georgia, serif;
   }
   ```

---

### Task 5: Sticky Sidebar + Last Updated Signal (Rec 2.3)

**In `css/style.css`:**

1. The sidebar already has `position: fixed`, so it is sticky. Verify this is working correctly. If it is, no change needed.

2. Add a "last updated" footer element to the sidebar. In every HTML file, add the following inside `.sidebar`, after the `<ul class="sidebar-nav">`:
   ```html
   <div class="sidebar-footer">
     <span class="last-updated">Updated Feb 2026</span>
   </div>
   ```

3. Style the sidebar footer:
   ```css
   .sidebar-footer {
     position: absolute;
     bottom: 2rem;
     left: 1.5rem;
   }
   .last-updated {
     font-size: 0.7rem;
     color: var(--text-muted);
     letter-spacing: 0.02em;
   }
   ```

4. On mobile (the existing `@media (max-width: 768px)` block), hide `.sidebar-footer` or reposition it:
   ```css
   .sidebar-footer {
     display: none;
   }
   ```

---

### Task 6: Tagging and Cross-Linking System (Rec 3.2)

This is the connective tissue between Output, Intake, and Captures.

1. **Define a shared tag vocabulary.** Create a file `tags.json` at the repo root:
   ```json
   {
     "history": { "label": "History", "color": "#8B7355" },
     "cold-war": { "label": "Cold War", "color": "#5a7a8a" },
     "culture": { "label": "Culture", "color": "#7a5a8a" },
     "berlin": { "label": "Berlin", "color": "#5a8a6a" },
     "paris": { "label": "Paris", "color": "#8a5a6a" },
     "religion": { "label": "Religion", "color": "#6a7a5a" },
     "politics": { "label": "Politics", "color": "#8a6a5a" },
     "music": { "label": "Music", "color": "#5a6a8a" }
   }
   ```

2. **Add tags to existing data.** Update `intake.json`, `posts.json`, and `photos.json` with relevant tags from the vocabulary above. Use your best judgment based on the content:
   - "Thinking Historically" book → `["history"]`
   - "The Lost Peace" → `["history", "cold-war"]`
   - "Mere Christianity" → `["religion"]`
   - "Age of Revolutions" → `["history", "politics"]`
   - "Southernplayalisticadillacmuzik" → `["music", "culture"]`
   - "Abraham Lincoln's Lyceum Address" → `["history", "politics"]`
   - "2001: A Space Odyssey" → `["culture"]`
   - Berlin/Paris photos → `["berlin"]` or `["paris"]` based on location
   - "Thinking Historically 01." post → `["history", "cold-war", "culture"]`

3. **Render tags on cards/items.** On Intake cards (flip-card-back), render tags as small colored pills below the comment. On Output post list items, render tags inline after the status indicator. On Captures items, show tags in the lightbox caption area.

4. **Build a tag detail page.** Create `tags/index.html` that:
   - Fetches `tags.json`, `intake.json`, `output/posts.json`, and `captures/photos/photos.json`
   - Groups all items by tag
   - For each tag, displays a section with items from all three content types
   - This becomes the primary cross-linking view

5. **Add "Tags" to the sidebar navigation** in all HTML files, between "Intake" and "About":
   ```html
   <li><a href="/tags/">Tags</a></li>
   ```

6. Add CSS for tag pills:
   ```css
   .tag-pill {
     display: inline-block;
     font-size: 0.6rem;
     text-transform: uppercase;
     letter-spacing: 0.03em;
     padding: 0.1rem 0.35rem;
     border-radius: 2px;
     margin-right: 0.25rem;
     margin-top: 0.25rem;
     text-decoration: none;
     color: #fff;
   }
   .tag-pill a {
     color: inherit;
     text-decoration: none;
   }
   ```

---

### Task 7: Responsive Design Audit (Rec 3.3)

There is already a `@media (max-width: 768px)` block. Review and improve it:

1. **Verify the sidebar** collapses to a horizontal top bar on mobile. The existing CSS does this — confirm it works.

2. **Captures grid**: Change from 2 columns to 1 column below 480px:
   ```css
   @media (max-width: 480px) {
     .captures-grid {
       column-count: 1;
     }
   }
   ```

3. **Intake grid**: Ensure it goes to 2 columns on tablet and stays readable on phone:
   ```css
   @media (max-width: 480px) {
     .intake-grid {
       grid-template-columns: repeat(2, 1fr);
     }
   }
   ```

4. **Post list items**: On mobile, stack the title and date vertically instead of side-by-side:
   ```css
   @media (max-width: 480px) {
     .post-list li {
       flex-direction: column;
       gap: 0.15rem;
     }
   }
   ```

5. **Lightbox**: Ensure lightbox nav arrows don't overlap with the image on small screens. Reduce arrow font-size and padding on mobile.

6. **Filter buttons**: Ensure `.intake-filters` wraps properly on small screens (it already uses `flex-wrap: wrap`, so verify this).

7. **Test at these breakpoints**: 375px (iPhone SE), 390px (iPhone 14), 768px (iPad portrait). Verify nothing overflows horizontally.

---

### Task 8: Dark Mode Support (Rec 4.2)

1. **Add CSS custom properties for dark mode.** At the top of `style.css`, after the `:root` block, add:
   ```css
   @media (prefers-color-scheme: dark) {
     :root {
       --bg: #1a1a1a;
       --text: #e0e0e0;
       --text-secondary: #aaa;
       --text-muted: #777;
       --border: #333;
     }
   }
   ```

2. **Update all color references in the CSS** to use the custom properties defined in Task 1. Every hardcoded color should reference a variable:
   - `background: var(--bg)` on `body`
   - `color: var(--text)` on `body`, headings, links, `.post-list a`
   - `color: var(--text-secondary)` on `.sidebar-nav a`, `.section-header h2`
   - `color: var(--text-muted)` on `.date`, `.capture-number`, `.card-creator`
   - `border-color: var(--border)` on `.contact-section`, `.filter-btn`

3. **Handle component-specific dark mode overrides:**
   ```css
   @media (prefers-color-scheme: dark) {
     .filter-btn {
       background: #2a2a2a;
       border-color: #444;
       color: var(--text-secondary);
     }
     .filter-btn.active {
       background: #e0e0e0;
       color: #1a1a1a;
     }
     .flip-card-front {
       background: #2a2a2a;
     }
     .intake-card.text-card {
       background: #2a2a2a;
     }
     .post-content code, .post-content pre {
       background: #2a2a2a;
     }
     .post-status.draft { background: #333; color: #999; }
     .post-status.in-progress { background: #3d3520; color: #ffc107; }
     .post-status.complete { background: #1a3d2a; color: #4caf50; }
   }
   ```

4. **Add a dark mode toggle** in the sidebar (optional but recommended). Place a small button/icon in the sidebar footer area that toggles a `data-theme="dark"` attribute on `<html>`. If the toggle is set, override `prefers-color-scheme` with the manual choice. Store the preference in `localStorage`.
   - If you implement this, duplicate the dark-mode variable overrides under `html[data-theme="dark"]` as well as under the `prefers-color-scheme` media query.

---

## General Rules

- Do NOT remove or break any existing functionality.
- Do NOT change the repo structure (no build tools, no frameworks, no npm).
- All JavaScript should be vanilla JS (no libraries, no modules).
- Keep the minimalist aesthetic — do not add unnecessary visual complexity.
- Test each task by opening the affected HTML files in a browser before moving on.
- When updating JSON schemas, ensure all existing items get the new fields (with sensible defaults).
- When adding navigation items or sidebar content, update ALL HTML files that contain the sidebar.
- Commit after each task with a clear message like: "Task 1: Typography and color refinements"
