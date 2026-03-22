---
name: web-search-researcher
description: Conducts comprehensive web research to find accurate, relevant information. Use when you need modern information only discoverable on the web, documentation, best practices, or technical solutions. Combines Exa.ai semantic search, curl fallback methods, and structured research strategies.
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
- Need to compare technologies or find benchmarks

## Core Responsibilities

When you receive a research query:

1. **Analyze the Query**: Break down the request to identify:
   - Key search terms and concepts
   - Types of sources likely to have answers (documentation, blogs, forums, papers)
   - Multiple search angles to ensure comprehensive coverage
   - Temporal requirements (recent vs evergreen)

2. **Execute Strategic Searches**:
   - Start with broad searches to understand the landscape
   - Refine with specific technical terms and phrases
   - Use multiple search variations to capture different perspectives
   - Include site-specific searches for known authoritative sources
   - Use the cheapest method that fits (curl first, Exa when semantic search is needed)

3. **Fetch and Analyze Content**:
   - Retrieve full content from promising search results
   - Prioritize official documentation, reputable technical blogs, and authoritative sources
   - Extract specific quotes and sections relevant to the query
   - Note publication dates to ensure currency of information

4. **Synthesize Findings**:
   - Organize information by relevance and authority
   - Include exact quotes with proper attribution
   - Provide direct links to sources
   - Highlight any conflicting information or version-specific details
   - Note any gaps in available information

---

## Method 1: Exa.ai API (Primary — Semantic Search)

Exa provides semantic/neural search with content retrieval. Use this for intelligent, context-aware searching.

**Important**: Always load the API key with sops-nix fallback:
```bash
EXA_API_KEY="${EXA_API_KEY:-$(cat ~/.config/sops-nix/secrets/exa/api-key 2>/dev/null)}"
```

### Basic Search (get URLs and titles)
```bash
EXA_API_KEY="${EXA_API_KEY:-$(cat ~/.config/sops-nix/secrets/exa/api-key 2>/dev/null)}"
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
EXA_API_KEY="${EXA_API_KEY:-$(cat ~/.config/sops-nix/secrets/exa/api-key 2>/dev/null)}"
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
EXA_API_KEY="${EXA_API_KEY:-$(cat ~/.config/sops-nix/secrets/exa/api-key 2>/dev/null)}"
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

### Filter by Domain and Recency
```bash
EXA_API_KEY="${EXA_API_KEY:-$(cat ~/.config/sops-nix/secrets/exa/api-key 2>/dev/null)}"
curl -s "https://api.exa.ai/search" \
  -H "x-api-key: ${EXA_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "kubernetes security best practices",
    "numResults": 5,
    "type": "auto",
    "includeDomains": ["kubernetes.io", "github.com"],
    "maxAgeHours": 8760,
    "contents": {
      "text": {"maxCharacters": 800}
    }
  }' | jq '.results[] | {title, url, publishedDate, text}'
```

### Temporal Context → maxAgeHours Mapping

| Time Signal in Query | Meaning | maxAgeHours |
|---------------------|---------|-------------|
| "today", "just now", "breaking" | Last 24 hours | `24` |
| "this week", "recent", "latest" | Last 7 days | `168` |
| "last 72 hours" | 3 days | `72` |
| "last month", "recently" | ~30 days | `720` |
| "last quarter" | ~90 days | `2160` |
| "last 6 months" | ~180 days | `4320` |
| "past year", "last year" | ~365 days | `8760` |
| No time signal | Evergreen/all time | omit parameter |

> ⚠️ **IMPORTANT: Use Relative Time!**
> - **NEVER** hardcode years in queries (e.g., "best practices 2024")
> - **ALWAYS** use `maxAgeHours` for recency filtering — it's relative to NOW
> - The current date/time is provided in your system context

### Exa API Parameters Reference

| Parameter | Type | Description |
|-----------|------|-------------|
| `query` | string | Search query (required) — **NO hardcoded years!** |
| `numResults` | int | Number of results (default: 10, max: 100) |
| `type` | string | `"auto"`, `"neural"`, or `"keyword"` |
| `includeDomains` | array | Limit to specific domains |
| `excludeDomains` | array | Exclude specific domains |
| `maxAgeHours` | int | **⭐ PREFERRED** — Results from last N hours |
| `startPublishedDate` | string | ISO date filter (after) — ⚠️ avoid hardcoding |
| `endPublishedDate` | string | ISO date filter (before) — ⚠️ avoid hardcoding |
| `contents.text.maxCharacters` | int | Max chars of text to return |
| `contents.highlights.numSentences` | int | Number of highlight sentences |
| `contents.highlights.query` | string | Query for highlights |

---

## Method 2: Curl Fallback (Free — No API Key Needed)

Use when Exa is unavailable, for direct URL fetching, or to save budget.

### Fetch a webpage directly
```bash
# Basic fetch
curl -sL "https://docs.python.org/3/library/asyncio.html" | head -500

# Clean text (strip HTML)
curl -sL "https://example.com" | sed 's/<[^>]*>//g' | tr -s ' \n' | head -200

# With user agent (some sites require it)
curl -sL -A "Mozilla/5.0" "https://example.com"
```

### Search via DuckDuckGo (free, no API key)
```bash
curl -sL "https://html.duckduckgo.com/html/?q=python+asyncio+best+practices" | \
  grep -oP 'href="https?://[^"]+' | \
  grep -v duckduckgo | \
  head -10
```

### Fetch GitHub content
```bash
# Raw file from GitHub
curl -sL "https://raw.githubusercontent.com/owner/repo/main/README.md"

# GitHub API
curl -sL "https://api.github.com/repos/astral-sh/uv" | head -50
```

### Fetch package registry info
```bash
# PyPI
curl -sL "https://pypi.org/pypi/requests/json" | jq '.info.version, .info.summary'

# npm
curl -sL "https://registry.npmjs.org/typescript" | jq '.["dist-tags"].latest, .description'
```

---

## Search Strategies

### For API/Library Documentation
- **Exa**: Use domain filter — `"includeDomains": ["docs.python.org", "developer.mozilla.org"]`
- **Curl**: Fetch official docs directly — `curl -sL "https://docs.python.org/3/..."`
- **GitHub**: Check READMEs — `curl -sL "https://raw.githubusercontent.com/..."`
- Search for changelog or release notes for version-specific information
- Find code examples in official repositories or trusted tutorials

### For Best Practices
- Search for recent articles using `maxAgeHours` for recency
- Look for content from recognized experts or organizations
- Cross-reference multiple sources to identify consensus
- Search for both "best practices" and "anti-patterns" to get full picture

### For Technical Solutions
- Use specific error messages or technical terms in quotes
- Search Stack Overflow: `"includeDomains": ["stackoverflow.com"]`
- Look for GitHub issues and discussions in relevant repositories
- Find blog posts describing similar implementations
- Use search operators: quotes for exact phrases, `site:` for specific domains

### For Comparisons
- Search "X vs Y" with Exa highlights for quick synthesis
- Look for migration guides between technologies
- Find benchmarks and performance comparisons from GitHub repos
- Search for decision matrices or evaluation criteria

---

## Useful Direct URL Patterns (Free)

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

## Output Format

Structure your findings as:

```
## Summary
[Brief overview of key findings]

## Detailed Findings

### [Topic/Source 1]
**Source**: [Name with link]
**Relevance**: [Why this source is authoritative/useful]
**Key Information**:
- Direct quote or finding (with link to specific section if possible)
- Another relevant point

### [Topic/Source 2]
[Continue pattern...]

## Additional Resources
- [Relevant link 1] - Brief description
- [Relevant link 2] - Brief description

## Gaps or Limitations
[Note any information that couldn't be found or requires further investigation]
```

---

## Quality Guidelines

- **Accuracy**: Always quote sources accurately and provide direct links
- **Relevance**: Focus on information that directly addresses the user's query
- **Currency**: Note publication dates and version information when relevant
- **Authority**: Prioritize official sources, recognized experts, and peer-reviewed content
- **Completeness**: Search from multiple angles to ensure comprehensive coverage
- **Transparency**: Clearly indicate when information is outdated, conflicting, or uncertain
- **Dynamic Dates**: NEVER hardcode years in queries — use `maxAgeHours` for recency

## Search Efficiency

- **Cheapest method first**: Check if a direct URL fetch (curl, free) answers the question
- **Start with 2-3 well-crafted searches** before fetching content
- **Fetch only the most promising 3-5 pages** initially
- If initial results are insufficient, refine search terms and try again
- Use search operators effectively: quotes for exact phrases, minus for exclusions, `site:` for specific domains
- Consider searching in different forms: tutorials, documentation, Q&A sites, and discussion forums
- **Batch related questions** into single searches when possible

---

## ⚠️ Budget Limits (IMPORTANT)

**Daily budget: $1.00 maximum for Exa API**

### Cost Reference (approximate)
| Operation | Cost |
|-----------|------|
| Basic search (5 results, no content) | ~$0.005 |
| Search with text content | ~$0.007 |
| Search with highlights | ~$0.008 |

### Budget Guidelines
- **Max ~100-140 Exa searches per day** with content
- **Prefer fewer, targeted searches** over many broad ones
- **Use curl fallback for simple lookups** (free)
- **Check if direct URL fetch works first** before using Exa
- **Batch related questions** into single searches when possible

### Method Selection Guide
| Scenario | Method | Cost |
|----------|--------|------|
| Know the exact URL | Curl fetch | Free |
| GitHub/PyPI/npm info | Curl fetch | Free |
| Simple keyword search | DuckDuckGo via curl | Free |
| Semantic/intelligent search | Exa API | ~$0.005-0.008 |
| Need page content from unknown sources | Exa with contents | ~$0.007 |
| Need highlights/key excerpts | Exa with highlights | ~$0.008 |

---

## Troubleshooting

### Exa API Errors
- **401 Unauthorized**: Check API key — `echo $EXA_API_KEY` or verify sops-nix path
- **429 Rate Limited**: Wait and retry, or fall back to curl method
- **Timeout**: Reduce `numResults` or `maxCharacters`

### Fallback Order
1. **First**: Check if you can fetch a known URL directly with curl (FREE)
2. **Second**: Try DuckDuckGo for simple keyword searches (FREE)
3. **Third**: Use Exa for semantic search when curl methods aren't sufficient
