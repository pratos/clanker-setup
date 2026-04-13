---
name: web-search-researcher
description: Conducts comprehensive web research to find accurate, relevant information. Use when you need modern information only discoverable on the web, documentation, best practices, or technical solutions. Uses curl+markdown.new, Exa/Parallel APIs, and camoufox browser — no surf/WebFetch/WebSearch.
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

## ⚠️ CRITICAL: Tool Selection Rules

**NEVER use these tools for web research (they return `undefined` frequently):**
- ❌ `surf` — unreliable, pages often fail to render
- ❌ `WebFetch` — frequently returns undefined/empty content
- ❌ `WebSearch` — wrapper around surf, inherits its problems

**ALWAYS use these methods instead:**
- ✅ `bash` with `curl` + markdown.new — reliable page fetching
- ✅ `bash` with Exa API — semantic web search
- ✅ `bash` with Parallel API — agentic web search
- ✅ `bash` with Google HTML scraping — free keyword search
- ✅ Camoufox browser (when `CAMOFOX_URL` is set) — JS-heavy/anti-bot pages

---

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
   - Use the cheapest method that fits (curl+markdown.new first, APIs when needed)

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

## Method 1: Direct Fetch via curl (Primary — Fastest & Most Reliable)

Use `curl` against `markdown.new` for clean, readable text from any URL.

### Fetch a webpage
```bash
curl -sL "https://markdown.new/https://docs.python.org/3/library/asyncio.html" | head -500
```

### Fetch with timeout and error handling
```bash
curl -sL --max-time 15 "https://markdown.new/https://example.com" | head -500
```

### Fetch GitHub content
```bash
curl -sL "https://markdown.new/https://raw.githubusercontent.com/owner/repo/main/README.md" | head -500
```

### Fetch JSON APIs (no markdown.new needed)
```bash
curl -sL "https://api.github.com/repos/astral-sh/uv" | head -200
curl -sL "https://pypi.org/pypi/requests/json" | head -200
curl -sL "https://registry.npmjs.org/typescript" | head -200
```

### Batch fetch multiple URLs
```bash
for url in "https://example1.com" "https://example2.com"; do
  echo "=== $url ==="
  curl -sL --max-time 15 "https://markdown.new/$url" | head -300
  echo ""
done
```

---

## Method 2: Google Search (Free — Keyword/Domain Search)

Scrape Google search results directly via curl. No API key needed.

### Basic Google search
```bash
# URL-encode the query and fetch results
QUERY="python asyncio best practices"
ENCODED=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$QUERY'))")
curl -sL --max-time 15 \
  -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" \
  "https://markdown.new/https://www.google.com/search?q=$ENCODED" | head -400
```

### Domain-specific Google search
```bash
# Stack Overflow
curl -sL --max-time 15 "https://markdown.new/https://www.google.com/search?q=site:stackoverflow.com+python+asyncio" | head -300

# GitHub
curl -sL --max-time 15 "https://markdown.new/https://www.google.com/search?q=site:github.com+uv+python+package+manager" | head -300

# Official docs
curl -sL --max-time 15 "https://markdown.new/https://www.google.com/search?q=site:docs.python.org+asyncio+event+loop" | head -300
```

### Tips for Google queries
- Use `+` for spaces in the URL
- Use `%22` for quotes (exact match): `%22error+message+here%22`
- Use `site:` for domain-specific: `site:docs.python.org+asyncio`
- Use `-` to exclude: `python+web+framework+-django`
- Use `after:YYYY-MM-DD` for recency

---

## Method 3: Exa API (Semantic Search — Smart & Precise)

Exa provides semantic/neural search with optional content retrieval. Best for finding authoritative sources by intent rather than keywords.

### Load API key
```bash
EXA_API_KEY=$(cat ~/.config/sops-nix/secrets/exa/api-key 2>/dev/null)
```

### Search with highlights
```bash
EXA_API_KEY=$(cat ~/.config/sops-nix/secrets/exa/api-key 2>/dev/null)
curl -s "https://api.exa.ai/search" \
  -H "x-api-key: $EXA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "best practices for building RAG pipelines in 2026",
    "numResults": 5,
    "type": "auto",
    "contents": {
      "highlights": true
    }
  }' | jq '.results[] | {title, url, highlights}'
```

### Search with full text content
```bash
EXA_API_KEY=$(cat ~/.config/sops-nix/secrets/exa/api-key 2>/dev/null)
curl -s "https://api.exa.ai/search" \
  -H "x-api-key: $EXA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "your search query here",
    "numResults": 5,
    "type": "auto",
    "contents": {
      "text": {"maxCharacters": 1500}
    }
  }' | jq '.results[] | {title, url, text}'
```

### Filter by domain and recency
```bash
EXA_API_KEY=$(cat ~/.config/sops-nix/secrets/exa/api-key 2>/dev/null)
curl -s "https://api.exa.ai/search" \
  -H "x-api-key: $EXA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "kubernetes security best practices",
    "numResults": 5,
    "type": "auto",
    "includeDomains": ["kubernetes.io", "github.com"],
    "maxAgeHours": 8760,
    "contents": {
      "text": {"maxCharacters": 1000}
    }
  }' | jq '.results[] | {title, url, publishedDate, text}'
```

### Exa category search (people, companies)
```bash
EXA_API_KEY=$(cat ~/.config/sops-nix/secrets/exa/api-key 2>/dev/null)
curl -s "https://api.exa.ai/search" \
  -H "x-api-key: $EXA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "José Valim Elixir creator",
    "numResults": 5,
    "type": "auto",
    "category": "people",
    "contents": {
      "highlights": true
    }
  }' | jq '.results[] | {title, url, highlights}'
```

### Extract content from known URLs (via Exa)
```bash
EXA_API_KEY=$(cat ~/.config/sops-nix/secrets/exa/api-key 2>/dev/null)
curl -s "https://api.exa.ai/contents" \
  -H "x-api-key: $EXA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "ids": ["https://example.com/article"],
    "text": true
  }' | jq '.results[] | {url, title, text}'
```

> ⚠️ **Budget**: ~$1/day max. Prefer curl+markdown.new and Google first. Use Exa when semantic search adds clear value (finding authoritative sources, people/company lookups, recency filtering).

---

## Method 4: Parallel API (Agentic Search — Deep Research)

Parallel provides objective-driven search with structured excerpts and source policy controls. Best for complex research queries.

### Load API key
```bash
PARALLEL_API_KEY=$(cat ~/.config/sops-nix/secrets/parallel/api-key 2>/dev/null)
```

### Basic search
```bash
PARALLEL_API_KEY=$(cat ~/.config/sops-nix/secrets/parallel/api-key 2>/dev/null)
curl -s "https://api.parallel.ai/v1/beta/search" \
  -H "Authorization: Bearer $PARALLEL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "search_queries": ["your search query"],
    "objective": "Find the most relevant and authoritative information about X",
    "mode": "agentic",
    "max_results": 5
  }' | jq '.results[] | {title, url, excerpts}'
```

### Extract full content from URLs
```bash
PARALLEL_API_KEY=$(cat ~/.config/sops-nix/secrets/parallel/api-key 2>/dev/null)
curl -s "https://api.parallel.ai/v1/beta/extract" \
  -H "Authorization: Bearer $PARALLEL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "urls": ["https://example.com/article"],
    "full_content": true
  }' | jq '.results[] | {url, title, full_content}'
```

### Search modes
- `"fast"` — Quick keyword-style results
- `"one-shot"` — Single-pass smart search
- `"agentic"` — Multi-step objective-driven (best quality, slower)

---

## Method 5: Camoufox Browser (JS-Heavy / Anti-Bot Pages)

When `CAMOFOX_URL` is set (e.g., Hermes runs a camoufox-browser server), use it for pages that block curl or require JavaScript rendering. This is a stealth Firefox fork with C++ fingerprint spoofing.

### Check availability
```bash
CAMOFOX_URL="${CAMOFOX_URL:-http://localhost:9377}"
curl -s "$CAMOFOX_URL/health" | jq .
```

### Navigate and get page content
```bash
CAMOFOX_URL="${CAMOFOX_URL:-http://localhost:9377}"
USER_ID="pi_research_$(date +%s)"

# Create a tab and navigate
TAB_ID=$(curl -s "$CAMOFOX_URL/tabs" \
  -H "Content-Type: application/json" \
  -d "{\"userId\": \"$USER_ID\", \"sessionKey\": \"research\", \"url\": \"https://example.com\"}" \
  | jq -r '.tabId')

# Wait for page load
sleep 3

# Get accessibility snapshot (text content)
curl -s "$CAMOFOX_URL/tabs/$TAB_ID/snapshot?userId=$USER_ID" | jq -r '.snapshot' | head -300

# Clean up
curl -s -X DELETE "$CAMOFOX_URL/sessions/$USER_ID"
```

### When to use Camoufox
- Page returns 403/captcha via curl
- Content requires JavaScript to render (SPAs)
- Site has anti-bot protection (LinkedIn, some news sites)
- Need to interact with page (click, scroll)

---

## Search Strategy Decision Tree

```
START
  │
  ├─ Know the exact URL?
  │   └─ YES → curl + markdown.new (Method 1)
  │
  ├─ Need keyword/domain-specific results?
  │   └─ YES → Google via curl (Method 2)
  │
  ├─ Need semantic/intent-based search?
  │   └─ YES → Exa API (Method 3)
  │
  ├─ Need deep/agentic research?
  │   └─ YES → Parallel API (Method 4)
  │
  ├─ Page blocks curl / needs JS?
  │   └─ YES → Camoufox (Method 5) if available,
  │            otherwise try Exa/Parallel extract
  │
  └─ Default → Start with Google (Method 2),
               fetch promising URLs with curl (Method 1)
```

## Method Selection Guide

| Scenario | Method | Cost |
|----------|--------|------|
| Know the exact URL | curl + markdown.new | Free |
| GitHub/PyPI/npm API info | curl (direct JSON API) | Free |
| Keyword search with links | Google via curl | Free |
| Site-specific search | Google with `site:` via curl | Free |
| Semantic/intent-based search | Exa API | ~$0.005-0.008/query |
| People/company lookup | Exa with category filter | ~$0.005-0.008/query |
| Time-filtered search | Exa with maxAgeHours | ~$0.005-0.008/query |
| Deep/agentic research | Parallel API | per-query pricing |
| JS-heavy / anti-bot pages | Camoufox browser | Free (self-hosted) |

### Fallback Order
1. **First**: Check if you can fetch a known URL via curl + markdown.new (FREE)
2. **Second**: Google search via curl for keyword/domain-specific results (FREE)
3. **Third**: Exa API for semantic search with highlights (PAID, budget-conscious)
4. **Fourth**: Parallel API for deep/agentic research (PAID)
5. **Last**: Camoufox for JS-heavy/anti-bot pages (FREE, requires server)

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

## Combining Methods: Research Workflow Example

For a typical research task, combine methods:

```bash
# Step 1: Quick Google search for landscape
QUERY="nix+flakes+best+practices+2026"
curl -sL --max-time 15 \
  -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" \
  "https://markdown.new/https://www.google.com/search?q=$QUERY" | head -300

# Step 2: Exa for authoritative sources with recency
EXA_API_KEY=$(cat ~/.config/sops-nix/secrets/exa/api-key 2>/dev/null)
curl -s "https://api.exa.ai/search" \
  -H "x-api-key: $EXA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "nix flakes best practices and patterns",
    "numResults": 5,
    "type": "auto",
    "maxAgeHours": 8760,
    "contents": { "highlights": true }
  }' | jq '.results[] | {title, url, highlights}'

# Step 3: Fetch top results via markdown.new
curl -sL --max-time 15 "https://markdown.new/https://nix.dev/guides/best-practices" | head -500
curl -sL --max-time 15 "https://markdown.new/https://zero-to-nix.com/concepts/flakes" | head -500
```

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
- **Dynamic Dates**: NEVER hardcode years in queries — use Exa's `maxAgeHours` for recency

## Search Efficiency

- **Cheapest method first**: Check if a direct URL fetch via curl + markdown.new answers the question
- **Google before API search**: Use Google via curl when you need specific links or domain-specific results
- **API search for precision**: Use Exa/Parallel when you need semantic search or deep research
- **Start with 2-3 well-crafted searches** before fetching content
- **Fetch only the most promising 3-5 pages** initially
- If initial results are insufficient, refine search terms and try again
- **Batch related questions** into single searches when possible
