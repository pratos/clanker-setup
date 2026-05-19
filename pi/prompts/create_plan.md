---
description: Create detailed implementation plans through interactive research and iteration
---

Create a detailed implementation plan for the following task:

> $@

## Non-negotiable output requirement

The final plan MUST include the relevant code/config being changed or added. A plan that only describes files in prose is incomplete.

For every file listed under **Changes Required**:

- Include a `### Relevant Code Changes` subsection with a fenced code block.
- Prefer a unified `diff` snippet for edits to existing files.
- Use language-specific fenced code for new files or large additions.
- Keep snippets focused, but include enough surrounding context to make the change implementable.
- If a listed file truly has no code/config change, write `No code change` and explain why.

Before saving the plan, audit it: every changed/added file must have code/diff or an explicit no-code justification.

## How to proceed

1. **Read all referenced files/directories FULLY** — any file paths, @-mentions, or directories in the task above. If a directory is mentioned, list it and read all files in it.
2. **Research the codebase** — use `grep`, `find`, and `read` to understand relevant code, existing patterns, and constraints.
3. **Collect implementation snippets during research** — capture the current code patterns and draft the exact/representative code or config snippets that should appear in the plan.
4. **Present your understanding** briefly with file:line references, then use `clarify` to ask questions you can't answer through code investigation alone.
5. **Present design options** as text, then use `clarify` for the user to choose.
6. **Present plan structure** (phases with 1-line summaries), get feedback via `clarify`.
7. **Write the detailed plan** to `docs/plans/YYYY-MM-DD_description.md` or `thoughts/_shared/plans/YYYY-MM-DD-description.md`.
8. **Run the plan completeness audit** and revise the plan before presenting it if any changed/added file lacks relevant code.
9. **Present the plan location** and iterate based on feedback.

## Plan template

Use this structure when writing the plan:

````markdown
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

### Relevant Code Changes
Mandatory: include the code/config that will be changed or added for every file above. Prefer `diff` for edits and language-specific fences for new code.

#### `path/to/file`
```diff
@@
- existing code/config to replace
+ planned code/config to add
```

### Success Criteria
#### Automated: `just rebuild`, `just lint`, `nix flake check`
#### Manual: [what to test by hand]

## Phase 2: [Name]
[Same structure, including Relevant Code Changes...]

## Plan Completeness Checklist
- [ ] Every file in Changes Required has a Relevant Code Changes snippet or an explicit no-code justification
- [ ] Snippets are concrete enough for an implementer to know what to change
- [ ] File paths and line references are included where useful
- [ ] Automated and manual verification are specified

## References
- [relevant files, plans, research]
````

## Guidelines

- Be skeptical — question vague requirements, verify with code, don't assume
- Be interactive — use `clarify` for ALL questions, get buy-in at each step
- Be thorough — read files completely, include file:line refs, separate automated vs manual success criteria
- Include relevant code — prose-only implementation plans are not acceptable
- Use `just` commands for automated verification (`just lint`, `just rebuild`)
- No open questions in the final plan — resolve everything before writing
