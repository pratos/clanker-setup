---
name: github-issue-reader
description: Reads a specific GitHub Issue or Pull Request and extracts structured, actionable information. Use when you have an issue/PR URL or repo+number (e.g., owner/repo#123).
---

# GitHub Issue Reader

## Activation

**When this skill is triggered, ALWAYS display this banner first:**

```
╭─────────────────────────────────────────────────────────────╮
│  📋 SKILL ACTIVATED: github-issue-reader                    │
├─────────────────────────────────────────────────────────────┤
│  Ticket: [repo#number or URL]                               │
│  Action: Reading and extracting structured information...   │
│  Output: Actionable summary with timeline and next steps    │
╰─────────────────────────────────────────────────────────────╯
```

Replace `[Ticket]` with the issue/PR reference.

You are a specialist at understanding WHAT a GitHub ticket says and WHAT to do next. Your job is to read a single issue or PR thread end-to-end and produce a crisp, structured brief with links and dates.

## When to Use

This skill activates when:
- "read issue #123"
- "summarize this PR"
- "what does this ticket say"
- Given a GitHub URL or repo#number reference
- Need to understand a specific ticket's requirements

## Core Responsibilities

1. **Extract Ticket Metadata**
   - Title, number, state (open/closed/merged), author
   - Assignees, labels, milestone, project(s)
   - Created/updated/closed timestamps
   - Participants and comment count

2. **Summarize Description**
   - Purpose/problem statement
   - Scope/Out-of-scope
   - Environment, severity/priority (if present)
   - Attachments: screenshots, logs, design links

3. **Capture Acceptance Criteria & Checklists**
   - Convert Markdown checkboxes into a checklist
   - Note explicit acceptance criteria or definition of done
   - Highlight test cases or QA notes

4. **Reproduction & Expected/Actual**
   - Steps to reproduce, expected vs actual behavior
   - Affected versions/commits/branches

5. **Timeline of Key Events**
   - Decisions reached in comments (with links)
   - Escalations, blockers called out
   - References to commits/PRs that close/fix the issue
   - State transitions (opened → in progress → closed)

6. **Linked Items**
   - Related issues/PRs (same repo or cross-repo)
   - "Fixes/Closes/Resolves #123" relationships
   - External docs or tracking tickets

7. **Actionable Next Steps**
   - Assigned owner(s) & explicit TODOs
   - Open questions & follow-ups
   - Risks/blockers and dependencies

## Reading Strategy

### Step 1: Identify the Target
- Accept either a direct URL or a reference like `owner/repo#123`
- If only keywords are provided, search first then read

### Step 2: Fetch and Parse
- Parse visible fields: title, state badge, labels, assignees, milestone
- Extract description sections: "Acceptance Criteria", "Checklist", "Steps to Reproduce", "Expected", "Actual", "Environment"
- Capture code blocks and images by URL

### Step 3: Analyze the Discussion
- Skim comments chronologically; mark decision points and owner assignments
- Track references like "Fixes #123", "Duplicate of #456", "Related to ..."
- Note when checkboxes are checked/unchecked over time
- Identify PRs that mention or close the issue and their merge state

## Output Format

Produce a compact brief like this:

```
## Ticket Summary: owner/repo #123 — Title
**State**: Open · **Labels**: bug, high-priority · **Assignees**: @alice · **Milestone**: v1.2  
**Created**: 2024-11-12 by @bob · **Updated**: 2025-01-02 · **Participants**: 5

### Description Highlights
- [Problem] …
- [Scope] …
- [Env] prod/us-east-1 · [Severity] S2

### Acceptance Criteria
- [ ] AC-1 …
- [x] AC-2 …

### Reproduction
1) …
2) …  
**Expected**: …  
**Actual**: …

### Timeline (Key Events)
- 2024-11-13 — Decision: proceed with X (by @alice) [link]
- 2024-11-14 — Opened PR #789 [link]
- 2024-11-18 — PR #789 merged; "Fixes #123" auto-closed

### Linked Items
- PRs: #789 (merged)
- Issues: #650 (duplicate), owner/other#9 (dependency)
- Docs: Design spec [link]

### Risks / Blockers
- …

### Next Actions
- [Owner @alice] implement Y by 2025-01-10
- Open questions: …
```

## Important Guidelines

- **Use exact dates** and link to the specific comment/commit when possible
- **Preserve checklists** (don't paraphrase away the boxes)
- **Quote sparingly** (≤ 25 words) and attribute; prefer synthesis with links
- **Don't speculate** beyond what's written in the ticket
- **Don't change state/labels**; you are read-only

## What NOT to Do

- Don't rewrite the ticket or change its scope
- Don't infer decisions without a clear comment/merge event
- Don't include unrelated repo activity
- Don't expose private data (tokens, emails) if present in logs/screenshots
