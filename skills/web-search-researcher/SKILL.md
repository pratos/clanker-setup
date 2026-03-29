---
name: web-search-researcher
description: Conducts comprehensive web research to find accurate, relevant information. Use when you need modern information only discoverable on the web, documentation, best practices, or technical solutions. Uses Google, ChatGPT, and Claude for search — no Perplexity.
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
   - Use the cheapest method that fits (markdown.new/Google first, AI search when synthesis is needed)

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

## Method 1: Google Search (Primary — Free)

Use Google for broad, keyword-based, and domain-specific web searches.

### Via `surf` browser automation
```
surf go https://www.google.com/search?q=your+search+query+here
surf read --compact
```

### Via `WebFetch` tool
```
WebFetch url="https://www.google.com/search?q=your+search+query+here"
```

### Tips for Google queries
- Use quotes for exact phrases: `"error message here"`
- Use `site:` for domain-specific: `site:docs.python.org asyncio`
- Use `-` to exclude: `python web framework -django`
- Use `after:YYYY-MM-DD` for recency: `kubernetes security after:2025-01-01`
- Use `filetype:` for specific formats: `filetype:pdf machine learning survey`

### Domain-specific searches
```
# Stack Overflow
surf go https://www.google.com/search?q=site:stackoverflow.com+your+query

# GitHub
surf go https://www.google.com/search?q=site:github.com+your+query

# Official docs
surf go https://www.google.com/search?q=site:docs.python.org+asyncio+best+practices
```

### Read search results, then fetch promising pages
```
# After reading Google results, fetch individual pages:
WebFetch url="https://promising-result-url.com"

# Or use surf for JS-heavy pages:
surf go https://promising-result-url.com
surf read --compact
```

---

## Method 2: ChatGPT Search (AI-Synthesized Answers)

Use ChatGPT's web search for synthesized, up-to-date answers with citations. Best when you need a quick, comprehensive summary with sources.

### Via `surf` browser automation
```
surf go https://chatgpt.com
surf type "your research question here" --submit
surf wait 10
surf read --compact
```

### When to use ChatGPT search
- Need a synthesized overview of a topic with citations
- Want multiple perspectives compared and summarized
- Looking for recent news or developments
- Need a starting point before deep-diving into specific sources

### Tips
- Be specific in your query for better results
- Ask follow-up questions in the same tab for deeper research
- ChatGPT provides source links — follow up on the most relevant ones with `WebFetch`

---

## Method 3: Claude Web Search (AI-Synthesized Answers)

Use Claude's web search for another AI-synthesized perspective. Good for cross-referencing ChatGPT results.

### Via `surf` browser automation
```
surf go https://claude.ai
surf type "search the web for: your research question here" --submit
surf wait 15
surf read --compact
```

### When to use Claude search
- Cross-reference findings from Google and ChatGPT
- Need a different analytical perspective
- Complex technical questions requiring deep reasoning
- When ChatGPT results seem incomplete or uncertain

---

## Method 4: Markdown.new Direct Fetch (Free — Clean Text)

Use markdown.new for direct URL fetching and clean text rendering.

### Fetch a webpage directly
```
WebFetch url="https://markdown.new/https://docs.python.org/3/library/asyncio.html"
WebFetch url="https://markdown.new/https://example.com"
```

### Fetch GitHub content
```
WebFetch url="https://markdown.new/https://raw.githubusercontent.com/owner/repo/main/README.md"
```

### Fetch JSON APIs (no markdown.new)
```
WebFetch url="https://api.github.com/repos/astral-sh/uv"
WebFetch url="https://pypi.org/pypi/requests/json"
WebFetch url="https://registry.npmjs.org/typescript"
```

---

## Method 5: Exa.ai API (Semantic Search — Budget-Conscious)

Exa provides semantic/neural search with content retrieval. Use when you need intelligent, context-aware searching beyond what keyword search offers.

**Important**: Always load the API key with sops-nix fallback:
```bash
EXA_API_KEY="${EXA_API_KEY:-$(cat ~/.config/sops-nix/secrets/exa/api-key 2>/dev/null)}"
```

### Search with Content
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
      "text": {"maxCharacters": 1000}
    }
  }' | jq '.results[] | {title, url, text}'
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

> ⚠️ **Budget**: ~$1/day max. Prefer Google/ChatGPT/Claude first. Use Exa only when semantic search adds clear value.

---

## Search Strategies

### For API/Library Documentation
- **Google**: `site:docs.python.org asyncio` or fetch docs URLs directly
- **Markdown.new**: `WebFetch url="https://markdown.new/https://docs.python.org/3/..."`
- **GitHub**: `WebFetch url="https://markdown.new/https://raw.githubusercontent.com/..."`
- Search for changelog or release notes for version-specific information

### For Best Practices
- **ChatGPT**: Ask for synthesized best practices with citations
- **Google**: Search for recent articles with `after:` date filter
- Cross-reference multiple sources to identify consensus
- Search for both "best practices" and "anti-patterns" to get full picture

### For Technical Solutions
- **Google**: Use specific error messages in quotes
- **ChatGPT/Claude**: Describe the problem for AI-synthesized solutions
- Search Stack Overflow: `site:stackoverflow.com` via Google
- Look for GitHub issues and discussions in relevant repositories

### For Comparisons
- **ChatGPT**: "Compare X vs Y for [use case]" — gets synthesized comparison
- **Google**: Search "X vs Y" for benchmark articles and blog posts
- **Claude**: Cross-reference for a different analytical perspective
- Find migration guides between technologies

---

## Method Selection Guide

| Scenario | Method | Cost |
|----------|--------|------|
| Know the exact URL | Markdown.new + WebFetch | Free |
| GitHub/PyPI/npm info | WebFetch (direct URL) | Free |
| Keyword search with links | Google via surf/WebFetch | Free |
| Site-specific search | Google with `site:` | Free |
| Synthesized answer with sources | ChatGPT via surf | Free |
| Cross-reference / second opinion | Claude via surf | Free |
| Semantic/intelligent search | Exa API | ~$0.005-0.008 |

### Fallback Order
1. **First**: Check if you can fetch a known URL via markdown.new + WebFetch (FREE)
2. **Second**: Google search for keyword/domain-specific results (FREE)
3. **Third**: ChatGPT search for AI-synthesized answers with citations (FREE)
4. **Fourth**: Claude search for cross-referencing or deeper analysis (FREE)
5. **Last**: Exa API for semantic search when free methods aren't sufficient

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
- **Dynamic Dates**: NEVER hardcode years in queries — use Google's `after:` filter or Exa's `maxAgeHours`

## Search Efficiency

- **Cheapest method first**: Check if a direct URL fetch via markdown.new + WebFetch answers the question
- **Google before AI search**: Use Google when you need specific links or domain-specific results
- **AI search for synthesis**: Use ChatGPT/Claude when you need summarized, multi-source answers
- **Start with 2-3 well-crafted searches** before fetching content
- **Fetch only the most promising 3-5 pages** initially
- If initial results are insufficient, refine search terms and try again
- **Batch related questions** into single searches when possible
