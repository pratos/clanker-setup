---
name: obsidian-link-archiver
description: Archives all external links from an Obsidian markdown file by fetching their content and saving locally as markdown. Use when you need to save linked content for offline access or backup.
---

# Obsidian Link Archiver

## Activation

**When this skill is triggered, ALWAYS display this banner first:**

```
╭─────────────────────────────────────────────────────────────╮
│  📥 SKILL ACTIVATED: obsidian-link-archiver                 │
├─────────────────────────────────────────────────────────────┤
│  Action: Extract links → Fetch content → Save locally       │
│  Output: Archived markdown files in same directory          │
╰─────────────────────────────────────────────────────────────╯
```

## When to Use

- "archive all links in this note"
- "save linked content locally"
- "download all URLs from this markdown file"
- "backup external links in my obsidian note"
- "fetch and save all links from [file.md]"

## Process

### Step 1: Extract Links from Markdown File

Read the specified markdown file and extract all external links:

```bash
# Extract markdown links [text](url) and bare URLs
grep -oE '\[([^\]]+)\]\((https?://[^)]+)\)|(https?://[^\s\)]+)' "$FILE" | \
  sed -E 's/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/\2/g' | \
  sort -u
```

**Link types to extract:**
- Markdown links: `[Link Text](https://example.com)`
- Bare URLs: `https://example.com`
- Reference links: `[text][ref]` with `[ref]: https://...`

**Skip these:**
- Internal Obsidian links: `[[Note Name]]`
- Anchor links: `#section`
- Local file links: `file://...`
- Image links (optional, based on user preference)

### Step 2: Fetch Content via markdown.new

For each URL, fetch content as clean markdown:

```bash
# Fetch URL as markdown (free, no API key needed)
curl -sL "https://markdown.new/$URL" > "$OUTPUT_FILE"
```

**Benefits of markdown.new:**
- Converts HTML to clean markdown
- Strips ads, navigation, boilerplate
- Preserves content structure (headers, lists, code blocks)
- 80% fewer tokens than raw HTML

### Step 3: Save Locally

Save each fetched page in the same directory as the source file:

```bash
# Directory of the source file
DIR=$(dirname "$SOURCE_FILE")

# Create archived-links subdirectory
mkdir -p "$DIR/archived-links"

# Save with sanitized title as filename
# Example: "My Article Title.md"
```

**Filename format:**
- Use page title from content (first `# heading` or `<title>`)
- Sanitize: remove special chars, limit length
- Add `.md` extension
- Handle duplicates: `title.md`, `title-2.md`, etc.

### Step 4: Update Source File (Optional)

Optionally update the original file to reference local copies:

```markdown
<!-- Original -->
[Article](https://example.com/article)

<!-- Updated -->
[Article](./archived-links/Article.md) ([original](https://example.com/article))
```

## Example Workflow

Given a file `notes/research.md`:

```markdown
# Research Notes

Found some great resources:
- [Stagehand Docs](https://docs.stagehand.dev/introduction)
- [Cloudflare Browser Rendering](https://developers.cloudflare.com/browser-rendering/)

Also check https://example.com/article
```

**Run the archiver:**

```bash
# 1. Extract links
links=(
  "https://docs.stagehand.dev/introduction"
  "https://developers.cloudflare.com/browser-rendering/"
  "https://example.com/article"
)

# 2. Create output directory
mkdir -p "notes/archived-links"

# 3. Fetch and save each link
for url in "${links[@]}"; do
  # Get page title for filename
  content=$(curl -sL "https://markdown.new/$url")
  title=$(echo "$content" | grep -m1 "^# " | sed 's/^# //' | tr -cd '[:alnum:] -' | cut -c1-50)
  
  # Fallback to URL-based name if no title
  if [ -z "$title" ]; then
    title=$(echo "$url" | sed 's|https://||; s|/|-|g' | cut -c1-50)
  fi
  
  # Save content
  echo "$content" > "notes/archived-links/${title}.md"
  echo "✅ Saved: ${title}.md"
done
```

**Result:**
```
notes/
├── research.md
└── archived-links/
    ├── Introduction - Stagehand Docs.md
    ├── Browser Rendering - Cloudflare Docs.md
    └── example-com-article.md
```

## Complete Script

```bash
#!/usr/bin/env bash
set -euo pipefail

SOURCE_FILE="${1:?Usage: $0 <markdown-file>}"

if [ ! -f "$SOURCE_FILE" ]; then
  echo "❌ File not found: $SOURCE_FILE"
  exit 1
fi

DIR=$(dirname "$SOURCE_FILE")
ARCHIVE_DIR="$DIR/archived-links"
mkdir -p "$ARCHIVE_DIR"

echo "╭─────────────────────────────────────────────────────────────╮"
echo "│  📥 Archiving links from: $(basename "$SOURCE_FILE")"
echo "╰─────────────────────────────────────────────────────────────╯"

# Extract all URLs
urls=$(grep -oE 'https?://[^\s\)\]\"]+' "$SOURCE_FILE" | sort -u)

if [ -z "$urls" ]; then
  echo "No external links found."
  exit 0
fi

count=0
total=$(echo "$urls" | wc -l | tr -d ' ')

while IFS= read -r url; do
  ((count++))
  echo ""
  echo "[$count/$total] Fetching: $url"
  
  # Fetch as markdown
  content=$(curl -sL --max-time 30 "https://markdown.new/$url" 2>/dev/null || echo "")
  
  if [ -z "$content" ] || echo "$content" | grep -q '"success":false'; then
    echo "  ⚠️  Failed to fetch, trying direct curl..."
    content=$(curl -sL --max-time 30 "$url" 2>/dev/null | head -c 100000 || echo "")
    if [ -z "$content" ]; then
      echo "  ❌ Skipped (fetch failed)"
      continue
    fi
  fi
  
  # Extract title from content
  title=$(echo "$content" | grep -m1 "^# " | sed 's/^# //' | head -c 60 || echo "")
  
  # Fallback to URL-based name
  if [ -z "$title" ]; then
    title=$(echo "$url" | sed 's|https\?://||; s|[/?#]|-|g; s|-\+|-|g; s|-$||' | head -c 50)
  fi
  
  # Sanitize filename
  filename=$(echo "$title" | tr -cd '[:alnum:] ._-' | sed 's/  */ /g; s/^ //; s/ $//')
  
  # Handle duplicates
  output_file="$ARCHIVE_DIR/${filename}.md"
  if [ -f "$output_file" ]; then
    i=2
    while [ -f "$ARCHIVE_DIR/${filename}-${i}.md" ]; do
      ((i++))
    done
    output_file="$ARCHIVE_DIR/${filename}-${i}.md"
  fi
  
  # Add source URL header and save
  {
    echo "---"
    echo "source: $url"
    echo "archived: $(date -Iseconds)"
    echo "---"
    echo ""
    echo "$content"
  } > "$output_file"
  
  echo "  ✅ Saved: $(basename "$output_file")"
  
  # Rate limit
  sleep 0.5
  
done <<< "$urls"

echo ""
echo "╭─────────────────────────────────────────────────────────────╮"
echo "│  ✅ Done! Archived $count links to: archived-links/          "
echo "╰─────────────────────────────────────────────────────────────╯"
```

## Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| Source file | Path to the Obsidian markdown file | Required |
| Output directory | Where to save archived content | `./archived-links/` |
| Include images | Also download linked images | `false` |
| Update source | Update original file with local links | `false` |
| Max depth | Recursive link following depth | `1` (no recursion) |

## Error Handling

- **Timeout**: Skip URLs that take >30s to fetch
- **Failed fetch**: Log warning, continue with next URL
- **Duplicate title**: Append number suffix (`-2`, `-3`, etc.)
- **Invalid URL**: Skip non-http(s) URLs
- **Empty content**: Skip and log warning

## Limitations

- Only fetches first level of links (no recursion)
- Some sites may block `markdown.new` - falls back to direct curl
- Very large pages truncated to 100KB
- Rate limited to ~2 requests/second to be respectful

## Integration with Obsidian

The archived files include YAML frontmatter compatible with Obsidian:

```yaml
---
source: https://original-url.com
archived: 2026-03-04T17:00:00+05:30
---
```

This allows you to:
- Track where content came from
- Know when it was archived
- Use Obsidian's backlinks to find references
