---
name: resume-handoff
description: Resume work from a handoff document with context analysis and validation. Use when starting a new session and need to pick up where a previous session left off.
---

# Resume Handoff

## Activation

**When this skill is triggered, ALWAYS display this banner first:**

```
╭─────────────────────────────────────────────────────────────╮
│  ▶️  SKILL ACTIVATED: resume-handoff                         │
├─────────────────────────────────────────────────────────────┤
│  Handoff: [path to handoff document]                        │
│  Action: Analyze context → Verify state → Resume work       │
│  Output: Validated continuation of previous session         │
╰─────────────────────────────────────────────────────────────╯
```

## When to Use

This skill activates when:
- "resume from handoff"
- "pick up where we left off"
- "continue from the handoff"
- "load the handoff document"
- Starting a new session with prior context to restore

## Initial Response

**If handoff path provided**: Read it immediately and begin analysis.

**If ticket/issue number provided**: Search for the most recent handoff:
```bash
ls -lt docs/handoffs/TICKET-XXXX/ 2>/dev/null | head
```
Use the most recent file by date in the filename.

**If no parameters**: Ask for the path:
```
Which handoff would you like to resume from?

Tip: You can invoke with a path: `/resume-handoff docs/handoffs/path/to/handoff.md`
or list available handoffs: `ls -lt docs/handoffs/`
```

## Process Steps

### Step 1: Read and Analyze Handoff

1. **Read handoff document completely**
2. **Extract all sections**:
   - Task(s) and their statuses
   - Recent changes
   - Learnings
   - Artifacts
   - Action items and next steps
3. **Read all referenced artifacts** (plans, research docs) in the main context
4. **Wait for all reading to complete**

### Step 2: Verify Current State

Spawn parallel research tasks:

- **Verify git state**: Check branch, recent commits, uncommitted changes
- **Verify file state**: Confirm referenced files still exist and match expectations
- **Read critical files**: Read files from "Learnings" and "Recent changes" sections

### Step 3: Present Analysis

```
I've analyzed the handoff from [date]. Here's the current situation:

**Original Tasks:**
- [Task 1]: [Status from handoff] → [Current verification]
- [Task 2]: [Status from handoff] → [Current verification]

**Key Learnings Validated:**
- [Learning with file:line reference] - [Still valid/Changed]

**Recent Changes Status:**
- [Change 1] - [Verified present/Missing/Modified]

**Artifacts Reviewed:**
- [Document 1]: [Key takeaway]

**Recommended Next Actions:**
1. [Most logical next step based on handoff]
2. [Second priority action]

**Potential Issues:**
- [Any conflicts or regressions found]

Shall I proceed with [recommended action 1], or would you like to adjust?
```

### Step 4: Create Action Plan

1. Convert action items from handoff into a todo list
2. Add any new tasks discovered during analysis
3. Prioritize based on dependencies
4. Get user confirmation before starting

### Step 5: Begin Implementation

1. Start with the first approved task
2. Reference learnings from handoff throughout
3. Apply documented patterns and approaches
4. Update progress as tasks complete

## Common Scenarios

### Clean Continuation
All changes present, no conflicts → Proceed with action items

### Diverged Codebase
Some changes missing or modified → Reconcile differences, adapt plan

### Incomplete Work
Tasks marked in-progress → Complete unfinished work first

### Stale Handoff
Significant time passed, major refactoring → Re-evaluate strategy

## Important Guidelines

1. **Be Thorough**: Read entire handoff, verify ALL mentioned changes
2. **Be Interactive**: Present findings before starting work
3. **Leverage Wisdom**: Pay attention to "Learnings" section
4. **Validate First**: Never assume handoff state matches current state
5. **Track Continuity**: Consider creating a new handoff when done
