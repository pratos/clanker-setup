---
description: Create detailed implementation plans through interactive research and iteration
---

# Implementation Plan

You are tasked with creating a detailed implementation plan. Be skeptical, thorough, and work collaboratively with the user.

## Task

$@

## Instructions

### If a task was provided above

1. **Read all referenced files FULLY** — any file paths, `@`-mentions, or directories referenced in the task. Use the `read` tool without limit/offset. If a directory is mentioned, list and read all files in it.
2. **Research the codebase** — use `grep`, `find`, and `read` to understand relevant code patterns, existing implementations, and constraints.
3. **Present your understanding** as a brief summary, then use `clarify` to ask any questions you genuinely cannot answer through code investigation.
4. Proceed to the planning process below.

### If no task was provided

Respond with:

```
I'll help you create a detailed implementation plan. Please provide:
1. The task/ticket description (or reference to a file)
2. Any relevant context, constraints, or specific requirements
3. Links to related research or previous implementations

Tip: /create_plan review and combine all the docs/ into a new doc
Tip: /create_plan docs/plans/2026-03-22_setup-hermes-agent.md
```

Then wait for the user's input.

## Planning Process

### Step 1: Context Gathering & Initial Analysis

1. **Read all mentioned files completely**
2. **Research the codebase** using `grep`, `find`, `read` to find:
   - Related source files, configs, and tests
   - Conventions and patterns to follow
   - Integration points and dependencies
3. **Present informed understanding and ask focused questions**:
   - Present findings as text with file:line references
   - Use `clarify` for remaining questions (technical decisions, design preferences)

### Step 2: Research & Discovery

1. If the user corrects any misunderstanding, **verify with code** before proceeding
2. **Present findings and design options** as text, then use `clarify` for design choices

### Step 3: Plan Structure Development

1. Present initial plan outline:
   ```
   ## Overview
   [1-2 sentence summary]

   ## Implementation Phases:
   1. [Phase name] - [what it accomplishes]
   2. [Phase name] - [what it accomplishes]
   ```
2. Use `clarify` to get feedback on structure before writing details

### Step 4: Detailed Plan Writing

Write the plan to `docs/plans/YYYY-MM-DD_description.md` or `thoughts/_shared/plans/YYYY-MM-DD-description.md` using this template:

````markdown
# [Feature/Task Name] Implementation Plan

## Overview
[Brief description of what we're implementing and why]

## Current State Analysis
[What exists now, what's missing, key constraints discovered]

## Desired End State
[Specification of the desired end state and how to verify it]

### Key Discoveries:
- [Important finding with file:line reference]
- [Pattern to follow]
- [Constraint to work within]

## What We're NOT Doing
[Explicitly list out-of-scope items to prevent scope creep]

## Implementation Approach
[High-level strategy and reasoning]

## Phase 1: [Descriptive Name]

### Overview
[What this phase accomplishes]

### Changes Required:

#### 1. [Component/File Group]
**File**: `path/to/file.ext`
**Changes**: [Summary of changes]

```[language]
// Specific code to add/modify
```

### Success Criteria:

#### Automated Verification:
- [ ] Build passes: `just rebuild`
- [ ] Linting passes: `just lint`
- [ ] Unit tests pass: `nix flake check`

#### Manual Verification:
- [ ] Feature works as expected when tested
- [ ] No regressions in related features

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding to the next phase.

---

## Phase 2: [Descriptive Name]
[Similar structure...]

---

## Testing Strategy
- Unit tests: [what to test]
- Integration tests: [end-to-end scenarios]
- Manual testing steps: [specific steps]

## References
- Original ticket/plan: `docs/plans/YYYY-MM-DD_description.md`
- Related research: `thoughts/_shared/research/[relevant].md`
- Similar implementation: `[file:line]`
````

### Step 5: Review

1. Present the draft plan location and ask for review
2. Iterate based on feedback until the user is satisfied

## Guidelines

1. **Be Skeptical**: Question vague requirements. Don't assume — verify with code.
2. **Be Interactive**: Get buy-in at each step. Use `clarify` for all questions (not plain text questions).
3. **Be Thorough**: Read all context files completely. Include file paths and line numbers. Separate automated vs manual success criteria.
4. **Be Practical**: Focus on incremental, testable changes. Use `just` commands (`just lint`, `just rebuild`) for automated verification.
5. **No Open Questions in Final Plan**: Research or ask before writing. The plan must be complete and actionable.

## Common Patterns

### Nix Configuration Changes:
- Module definition → flake.nix imports → machine-specific configs → `just rebuild` then `just switch`

### New Features:
- Research existing patterns → data model/config → Nix module → machine configs → test

### Refactoring:
- Document current behavior → incremental changes → backwards compatibility → migration strategy
