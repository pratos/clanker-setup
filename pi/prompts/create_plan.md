---
description: Create detailed implementation plans through interactive research and iteration
---

Create a detailed implementation plan for the following task:

> $@

## How to proceed

1. **Read all referenced files/directories FULLY** — any file paths, @-mentions, or directories in the task above. If a directory is mentioned, list it and read all files in it.
2. **Research the codebase** — use `grep`, `find`, and `read` to understand relevant code, existing patterns, and constraints.
3. **Present your understanding** briefly with file:line references, then use `clarify` to ask questions you can't answer through code investigation alone.
4. **Present design options** as text, then use `clarify` for the user to choose.
5. **Present plan structure** (phases with 1-line summaries), get feedback via `clarify`.
6. **Write the detailed plan** to `docs/plans/YYYY-MM-DD_description.md` or `thoughts/_shared/plans/YYYY-MM-DD-description.md`.
7. **Present the plan location** and iterate based on feedback.

## Plan template

Use this structure when writing the plan:

```markdown
# [Feature/Task Name] Implementation Plan

## Overview
[What and why]

## Current State Analysis
[What exists, what's missing, key constraints]

## Desired End State
[Specification and how to verify]

## What We're NOT Doing
[Out-of-scope items]

## Phase 1: [Name]
### Changes Required
- **File**: `path/to/file` — [what changes]
### Success Criteria
#### Automated: `just rebuild`, `just lint`, `nix flake check`
#### Manual: [what to test by hand]

## Phase 2: [Name]
[Same structure...]

## References
- [relevant files, plans, research]
```

## Guidelines

- Be skeptical — question vague requirements, verify with code, don't assume
- Be interactive — use `clarify` for ALL questions, get buy-in at each step
- Be thorough — read files completely, include file:line refs, separate automated vs manual success criteria
- Use `just` commands for automated verification (`just lint`, `just rebuild`)
- No open questions in the final plan — resolve everything before writing
