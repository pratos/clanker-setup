---
name: thoughts-locator
description: Discovers relevant documents in a project's docs/thoughts directory. Finds research documents, implementation plans, tickets, PR descriptions, and notes. Use when you need to find what historical documentation exists about a topic.
---

# Thoughts/Docs Locator

## Activation

This skill is primarily used as a sub-agent by other skills (research, planning, etc.) but can also be triggered directly:
- "find docs about X"
- "what thoughts/research exists for"
- "locate existing plans for"
- "search the docs directory"

## Core Responsibilities

1. **Search documentation directories**:
   - `docs/` - project documentation
   - `docs/plans/` - implementation plans
   - `docs/research/` - research documents
   - `docs/handoffs/` - session handoff documents
   - `thoughts/` - if using HumanLayer-style thoughts directory
   - `thoughts/shared/` - team documents
   - Any similar documentation directory structure

2. **Categorize findings by type**:
   - Implementation plans
   - Research documents
   - Handoff documents
   - PR descriptions
   - Tickets/issues
   - General notes and discussions

3. **Return organized results**:
   - Group by document type
   - Include brief one-line description from title/header
   - Note document dates if visible in filename

## Search Strategy

### Directory Patterns
```
docs/                    # Project documentation
├── plans/               # Implementation plans
├── research/            # Research documents
├── handoffs/            # Session handoffs
└── prs/                 # PR descriptions

thoughts/                # HumanLayer-style thoughts
├── shared/              # Team-shared
│   ├── research/
│   ├── plans/
│   └── prs/
└── searchable/          # Search directory (read-only)
```

### Search Patterns
- Use grep for content searching
- Use glob for filename patterns
- Check standard subdirectories
- Search multiple naming conventions

### Path Correction
If files found in `thoughts/searchable/`, report the actual path:
- `thoughts/searchable/shared/research/api.md` → `thoughts/shared/research/api.md`
- Only remove "searchable/" - preserve all other directory structure

## Output Format

```
## Documents about [Topic]

### Implementation Plans
- `docs/plans/2024-01-15_rate-limiting.md` - Rate limiting implementation plan

### Research Documents
- `docs/research/2024-01-10_api-performance.md` - API performance analysis

### Handoffs
- `docs/handoffs/2024-01-20_session-context.md` - Session handoff for rate limiting work

### Related Notes
- `docs/architecture.md` - Contains section on rate limiting design

Total: N relevant documents found
```

## Important Guidelines

- **Don't read full file contents** - Just scan for relevance
- **Preserve directory structure** - Show where documents live
- **Be thorough** - Check all relevant subdirectories
- **Group logically** - Make categories meaningful
- **Use multiple search terms** - Try synonyms and related concepts
- **Check multiple locations** - Both `docs/` and `thoughts/` if they exist
