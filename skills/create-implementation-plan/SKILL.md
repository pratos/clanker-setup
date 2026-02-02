---
name: create-implementation-plan
description: Creates detailed implementation plans through an interactive, iterative process. Use when you need to plan a feature, task, or ticket with thorough research, phased approach, and clear success criteria.
---

# Create Implementation Plan

## Activation

**When this skill is triggered, ALWAYS display this banner first:**

```
╭─────────────────────────────────────────────────────────────╮
│  📐 SKILL ACTIVATED: create-implementation-plan             │
├─────────────────────────────────────────────────────────────┤
│  Task: [ticket/feature being planned]                       │
│  Action: Research → Design → Plan → Review                  │
│  Output: Phased implementation plan with success criteria   │
╰─────────────────────────────────────────────────────────────╯
```

You are tasked with creating detailed implementation plans through an interactive, iterative process. Be skeptical, thorough, and work collaboratively to produce high-quality technical specifications.

## When to Use

This skill activates when:
- "create a plan for"
- "plan the implementation of"
- "how should we build"
- "design the approach for"
- Need structured planning before coding

## Process Steps

### Step 1: Context Gathering & Initial Analysis

1. **Read all mentioned files completely**:
   - Ticket files, research documents, related plans
   - Any JSON/data files mentioned
   - Read files FULLY - never partially

2. **Research the codebase**:
   - Find all files related to the ticket/task
   - Understand how current implementation works
   - Find any existing documents about this feature
   - Trace data flow and key functions

3. **Present informed understanding**:
   ```
   Based on the ticket and my research of the codebase, I understand we need to [accurate summary].

   I've found that:
   - [Current implementation detail with file:line reference]
   - [Relevant pattern or constraint discovered]
   - [Potential complexity or edge case identified]

   Questions that my research couldn't answer:
   - [Specific technical question that requires human judgment]
   - [Business logic clarification]
   ```

### Step 2: Research & Discovery

After getting initial clarifications:

1. **Verify any corrections**: Don't just accept corrections - verify in the code
2. **Find similar patterns**: Look for features we can model after
3. **Identify integration points**: Where does this connect with existing code?

4. **Present findings and design options**:
   ```
   Based on my research, here's what I found:

   **Current State:**
   - [Key discovery about existing code]
   - [Pattern or convention to follow]

   **Design Options:**
   1. [Option A] - [pros/cons]
   2. [Option B] - [pros/cons]

   Which approach aligns best with your vision?
   ```

### Step 3: Plan Structure Development

Once aligned on approach:

```
Here's my proposed plan structure:

## Overview
[1-2 sentence summary]

## Implementation Phases:
1. [Phase name] - [what it accomplishes]
2. [Phase name] - [what it accomplishes]
3. [Phase name] - [what it accomplishes]

Does this phasing make sense? Should I adjust the order or granularity?
```

### Step 4: Detailed Plan Writing

**Always save the plan to** `docs/plans/YYYY-MM-DD_<slug>.md` **with code snippets and a checklist** so implementation can be tracked.

Use this template structure:

```markdown
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
- [ ] Tests pass
- [ ] Type checking passes
- [ ] Linting passes
- [ ] Manual verification: [specific check]

---

## Phase 2: [Descriptive Name]
[Similar structure...]

---

## References
- Original ticket: [link/path]
- Related research: [link/path]
- Similar implementation: [file:line]
```

### Step 5: Review

1. **Present the draft plan** and ask for feedback
2. **Iterate based on feedback** - adjust phases, success criteria, scope
3. **Continue refining** until satisfied

## Important Guidelines

1. **Be Skeptical**: Question vague requirements, identify issues early, verify with code
2. **Be Interactive**: Don't write the full plan in one shot, get buy-in at each step
3. **Be Thorough**: Read all context files completely, include specific file paths and line numbers
4. **Be Practical**: Focus on incremental, testable changes, consider edge cases
5. **No Open Questions**: If you encounter unresolved questions, STOP and clarify before finalizing
