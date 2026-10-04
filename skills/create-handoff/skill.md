---
name: create-handoff
description: Create handoff document for transferring work to another session. Use when ending a session and need to preserve context, learnings, and next steps for continuity.
---

# Create Handoff

## Activation

**When this skill is triggered, ALWAYS display this banner first:**

```
╭─────────────────────────────────────────────────────────────╮
│  📋 SKILL ACTIVATED: create-handoff                         │
├─────────────────────────────────────────────────────────────┤
│  Action: Document session context for continuity            │
│  Output: Handoff document with learnings and next steps     │
╰─────────────────────────────────────────────────────────────╯
```

## When to Use

This skill activates when:
- "create a handoff"
- "save session context"
- "hand off this work"
- "document what we did for the next session"
- Ending a session and need to preserve context

## Process

### 1. Gather Metadata

Collect current state:
```bash
git branch --show-current
git rev-parse --short HEAD
git remote get-url origin 2>/dev/null | xargs basename -s .git
date -u +"%Y-%m-%dT%H:%M:%SZ"
```

### 2. Determine Filepath

Save handoff to: `docs/handoffs/YYYY-MM-DD_HH-MM-SS_description.md`

If a ticket/issue number is involved:
`docs/handoffs/TICKET-XXXX/YYYY-MM-DD_HH-MM-SS_TICKET-XXXX_description.md`

Examples:
- With ticket: `docs/handoffs/ISSUE-42/2025-01-08_13-55-22_ISSUE-42_create-context-compaction.md`
- Without ticket: `docs/handoffs/2025-01-08_13-55-22_create-context-compaction.md`

### 3. Write Handoff Document

Use this template:

```markdown
---
date: [Current date and time with timezone in ISO format]
git_commit: [Current commit hash]
branch: [Current branch name]
repository: [Repository name]
topic: "[Feature/Task Name]"
tags: [implementation, relevant-component-names]
status: complete
---

# Handoff: [TICKET-XXXX] [concise description]

## Task(s)
[Description of the task(s) worked on, with status of each:
completed, work in progress, planned/discussed.
If working from a plan, note which phase you're on.
Reference the plan/research documents you're working from.]

## Critical References
[List 2-3 most important specification docs, architectural decisions,
or design docs that must be followed. Leave blank if none.]

## Recent Changes
[Describe recent changes made to the codebase in file:line syntax]

## Learnings
[Important things learned - patterns, root causes of bugs,
or other critical info for whoever picks up this work.
Include explicit file paths.]

## Artifacts
[Exhaustive list of artifacts produced or updated as filepaths
and/or file:line references - plans, research docs, etc.
that should be read to resume work.]

## Action Items & Next Steps
[List of action items and next steps for the next session
based on tasks and their statuses]

## Other Notes
[Other notes, references, or useful information - where relevant
code sections are, where docs are, or other important context
that doesn't fit above]
```

### 4. Present to User

After writing the handoff:

```
Handoff created! You can resume from this handoff in a new session with:

/resume-handoff docs/handoffs/[path-to-handoff].md
```

## Important Guidelines

- **More information, not less** - This template is the minimum
- **Be thorough and precise** - Include both top-level objectives and lower-level details
- **Avoid excessive code snippets** - Prefer `file:line` references that an agent can follow later
- **Include all artifacts** - Every file you created, modified, or referenced
- **Capture learnings** - Patterns, gotchas, and discoveries are the most valuable part
