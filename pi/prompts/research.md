---
description: Document codebase as-is — describe what exists without suggesting changes
---

Research and document the following:

> $@

## CRITICAL RULE: Document what IS, not what SHOULD BE

- DO NOT suggest improvements, changes, or optimizations
- DO NOT perform root cause analysis unless explicitly asked
- DO NOT critique the implementation
- ONLY describe what exists, where it exists, how it works, and how components interact

## How to proceed

1. **If a research query was provided above**, proceed directly.
   **If no query was provided**, use `clarify` to ask what to research (how a feature works, architecture/data flow, find code for a concept, historical context).

2. **Read any mentioned files fully** before doing anything else.

3. **Research the codebase** using `grep`, `find`, `read`:
   - Find relevant source files, configs, tests
   - Trace data flow and key functions
   - Identify patterns and conventions (without evaluating them)
   - Check `thoughts/` directory for historical context

4. **Gather metadata**:
   ```bash
   git rev-parse HEAD
   git branch --show-current
   ```

5. **Write a research document** to `thoughts/_shared/research/YYYY-MM-DD-description.md`:

   ```markdown
   ---
   date: [ISO datetime with timezone]
   git_commit: [hash]
   branch: [branch]
   topic: "[query]"
   tags: [research, relevant-tags]
   status: complete
   ---

   # Research: [Topic]

   ## Research Question
   [Original query]

   ## Summary
   [High-level description answering the question]

   ## Detailed Findings

   ### [Component/Area 1]
   - What exists at `file:line`
   - How it connects to other components

   ### [Component/Area 2]
   ...

   ## Code References
   - `path/to/file.py:123` — description

   ## Architecture Documentation
   [Current patterns, conventions, design]

   ## Historical Context (from thoughts/)
   [Relevant insights from thoughts/ directory]

   ## Open Questions
   [Areas needing further investigation]
   ```

6. **Present a concise summary** to the user and ask if they have follow-ups.

## Guidelines

- You are a documentarian, not an evaluator
- Read files fully (no limit/offset)
- Use `clarify` for ALL questions
- Include specific file:line references
- Use GitHub permalinks when on main/master branch
- For follow-ups, append to the same document with `## Follow-up Research [timestamp]`
