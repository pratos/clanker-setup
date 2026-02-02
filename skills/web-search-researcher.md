---
name: web-search-researcher
description: Conducts comprehensive web research to find accurate, relevant information. Use when you need modern information only discoverable on the web, documentation, best practices, or technical solutions.
---

# Web Search Researcher

## Activation

**When this skill is triggered, ALWAYS display this banner first:**

```
╭─────────────────────────────────────────────────────────────╮
│  🌐 SKILL ACTIVATED: web-search-researcher                  │
├─────────────────────────────────────────────────────────────┤
│  Topic: [research question/topic]                           │
│  Action: Searching web for authoritative sources...         │
│  Output: Synthesized findings with source links             │
╰─────────────────────────────────────────────────────────────╯
```

## When to Use

This skill activates when:
- "search for information about"
- "find documentation on"
- "what's the best practice for"
- "look up how to"
- Need current/modern information not in training data
- Need official documentation or tutorials

## Method 1: Exa.ai API (Primary - Recommended)

Exa provides semantic/neural search with content retrieval. Use this as the **primary** method.

### Basic Search (get URLs and titles)
```bash
curl -s "https://api.exa.ai/search" \
  -H "x-api-key: ${EXA_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "your search query here",
    "numResults": 5,
    "type": "auto"
  }' | jq '.results[] | {title, url}'
```

### Search with Content (get text from pages)
```bash
curl -s "https://api.exa.ai/search" \
  -H "x-api-key: ${EXA_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "your search query here",
    "numResults": 5,
    "type": "auto",
    "contents": {
      "text": {
        "maxCharacters": 1000
      }
    }
  }' | jq '.results[] | {title, url, text}'
```

### Search with Highlights (best for extracting key info)
```bash
curl -s "https://api.exa.ai/search" \
  -H "x-api-key: ${EXA_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "your search query here",
    "numResults": 5,
    "type": "auto",
    "contents": {
      "highlights": {
        "numSentences": 3,
        "query": "specific aspect to highlight"
      }
    }
  }' | jq '.results[] | {title, url, highlights}'
```

### Filter by Domain or Date
```bash
curl -s "https://api.exa.ai/search" \
  -H "x-api-key: ${EXA_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "kubernetes security best practices",
    "numResults": 5,
    "type": "auto",
    "includeDomains": ["kubernetes.io", "github.com"],
    "startPublishedDate": "2024-01-01T00:00:00.000Z",
    "contents": {
      "text": {"maxCharacters": 800}
    }
  }' | jq '.results[] | {title, url, publishedDate, text}'
```

### Exa API Parameters Reference

| Parameter | Type | Description |
|-----------|------|-------------|
| `query` | string | Search query (required) |
| `numResults` | int | Number of results (default: 10, max: 100) |
| `type` | string | `"auto"`, `"neural"`, or `"keyword"` |
| `includeDomains` | array | Limit to specific domains |
| `excludeDomains` | array | Exclude specific domains |
| `startPublishedDate` | string | ISO date filter (after) |
| `endPublishedDate` | string | ISO date filter (before) |
| `contents.text.maxCharacters` | int | Max chars of text to return |
| `contents.highlights.numSentences` | int | Number of highlight sentences |
| `contents.highlights.query` | string | Query for highlights |

---

## Method 2: Curl Fallback (When Exa fails or for direct fetching)

Use these methods if Exa API is unavailable or when you need to fetch specific URLs directly.

### Fetch a webpage directly
```bash
# Basic fetch
curl -sL "https://docs.python.org/3/library/asyncio.html" | head -500

# Follow redirects and get clean text (strip HTML)
curl -sL "https://example.com" | sed 's/<[^>]*>//g' | tr -s ' \n' | head -200

# With user agent (some sites require it)
curl -sL -A "Mozilla/5.0" "https://example.com"
```

### Search via DuckDuckGo (no API key needed)
```bash
# Get search results as HTML
curl -sL "https://html.duckduckgo.com/html/?q=python+asyncio+best+practices" | \
  grep -oP 'href="https?://[^"]+' | \
  grep -v duckduckgo | \
  head -10
```

### Fetch GitHub content
```bash
# Raw file from GitHub
curl -sL "https://raw.githubusercontent.com/owner/repo/main/README.md"

# GitHub API (for repo info, issues, etc.)
curl -sL "https://api.github.com/repos/astral-sh/uv" | head -50
```

### Fetch PyPI package info
```bash
curl -sL "https://pypi.org/pypi/requests/json" | jq '.info.version, .info.summary'
```

### Fetch npm package info
```bash
curl -sL "https://registry.npmjs.org/typescript" | jq '.["dist-tags"].latest, .description'
```

---

## Search Strategies

### For API/Library Documentation:
1. Use Exa with domain filter: `"includeDomains": ["docs.python.org", "developer.mozilla.org"]`
2. Fallback: Fetch official docs directly: `curl -sL "https://docs.python.org/3/..."`
3. Check GitHub READMEs: `curl -sL "https://raw.githubusercontent.com/..."`

### For Best Practices:
1. Use Exa neural search for semantic matching
2. Search for style guides and include domain filters for authoritative sources
3. Check awesome-* lists on GitHub

### For Technical Solutions:
1. Use Exa with content retrieval to get actual answers
2. Filter to Stack Overflow: `"includeDomains": ["stackoverflow.com"]`
3. Check GitHub issues via API

### For Comparisons:
1. Search "X vs Y" with Exa and get highlights
2. Fetch benchmark repositories on GitHub

---

## Output Format

Structure your findings as:

```
## Summary
[Brief overview of key findings]

## Detailed Findings

### [Topic/Source 1]
**Source**: [URL]
**Key Information**:
- Direct quote or finding
- Another relevant point

### [Topic/Source 2]
[Continue pattern...]

## Additional Resources
- [URL 1] - Brief description
- [URL 2] - Brief description

## Gaps or Limitations
[Note any information that couldn't be found]
```

---

## Quality Guidelines

- **Accuracy**: Always quote sources accurately and provide direct links
- **Relevance**: Focus on information that directly addresses the query
- **Currency**: Note publication dates from Exa results when available
- **Authority**: Prioritize official sources (docs, GitHub, official blogs)
- **Transparency**: Clearly indicate when information might be outdated

---

## Useful URLs for Direct Research

| Topic | URL Pattern |
|-------|-------------|
| Python docs | `https://docs.python.org/3/library/{module}.html` |
| PyPI | `https://pypi.org/pypi/{package}/json` |
| npm | `https://registry.npmjs.org/{package}` |
| GitHub API | `https://api.github.com/repos/{owner}/{repo}` |
| MDN Web Docs | `https://developer.mozilla.org/en-US/docs/Web/{topic}` |
| Can I Use | `https://caniuse.com/?search={feature}` |
| Rust docs | `https://docs.rs/{crate}/latest/` |
| Go docs | `https://pkg.go.dev/{module}` |

---

## ⚠️ Budget Limits (IMPORTANT)

**Daily budget: $1.00 maximum**

### Cost Reference (approximate)
| Operation | Cost |
|-----------|------|
| Basic search (5 results, no content) | ~$0.005 |
| Search with text content | ~$0.007 |
| Search with highlights | ~$0.008 |

### Budget Guidelines
- **Max ~100-140 Exa searches per day** with content
- **Prefer fewer, targeted searches** over many broad ones
- **Use curl fallback for simple lookups** (free) - e.g., fetching a known URL
- **Check if direct URL fetch works first** before using Exa search
- **Batch related questions** into single searches when possible

### When to Use Exa vs Curl
| Scenario | Use |
|----------|-----|
| Need semantic/intelligent search | Exa |
| Know the exact URL already | Curl (free) |
| Fetching GitHub/PyPI/npm info | Curl (free) |
| Simple keyword search | DuckDuckGo via curl (free) |
| Need page content from unknown sources | Exa with contents |

---

## Troubleshooting

### Exa API Errors
- **401 Unauthorized**: Check API key is correct
- **429 Rate Limited**: Wait and retry, or fall back to curl method
- **Timeout**: Reduce `numResults` or `maxCharacters`

### Fallback Order
1. **First**: Check if you can fetch a known URL directly with curl (FREE)
2. **Second**: Try DuckDuckGo for simple keyword searches (FREE)
3. **Third**: Use Exa for semantic search when curl methods aren't sufficient
