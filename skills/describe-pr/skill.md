---
name: describe-pr
description: Generate comprehensive PR descriptions by analyzing diffs, commits, and code changes. Use when you need to create or update a pull request description.
---

# Describe PR

## Activation

**When this skill is triggered, ALWAYS display this banner first:**

```
╭─────────────────────────────────────────────────────────────╮
│  📝 SKILL ACTIVATED: describe-pr                            │
├─────────────────────────────────────────────────────────────┤
│  PR: [number or current branch]                             │
│  Action: Analyze diff → Generate description → Update PR    │
│  Output: Comprehensive PR description                       │
╰─────────────────────────────────────────────────────────────╯
```

## When to Use

This skill activates when:
- "describe the PR"
- "generate a PR description"
- "write the PR body"
- "update the PR description"
- Need a comprehensive pull request description

## PR Description Template

```markdown
## What problem(s) was I solving?

## What user-facing changes did I ship?

## How I implemented it

## How to verify it

### Manual Testing

## Description for the changelog
```

## Process Steps

### Step 1: Identify the PR

```bash
# Check current branch PR
gh pr view --json url,number,title,state 2>/dev/null

# If no PR exists, list open PRs
gh pr list --limit 10 --json number,title,headRefName,author
```

If no default remote repository is set, instruct user to run `gh repo set-default`.

### Step 2: Check for Existing Description

```bash
# Check if a previous description was saved
ls /tmp/$(basename $(git rev-parse --show-toplevel))/prs/ 2>/dev/null
```

### Step 3: Gather PR Information

Run these in parallel:
```bash
gh pr diff {number}
gh pr view {number} --json commits
gh pr view {number} --json baseRefName
gh pr view {number} --json url,title,number,state
```

### Step 4: Analyze Changes

- Read through the entire diff carefully
- For context, read files referenced but not in the diff
- Understand purpose and impact of each change
- Identify user-facing vs internal changes
- Look for breaking changes or migration requirements

### Step 5: Run Verification

For each potential verification step:
- If it's a command you can run (`make test`, `npm test`, etc.), **run it**
- If it passes, mark checked: `- [x]`
- If it fails, keep unchecked with explanation: `- [ ]`
- If it requires manual testing, leave unchecked for user

### Step 6: Generate Description

Fill out the template based on analysis:
- Be specific about problems solved
- Focus on user impact
- Include technical details in implementation section
- Write a concise changelog entry
- Ensure all checklist items are addressed

### Step 7: Save and Update

```bash
# Save the description
mkdir -p /tmp/$(basename $(git rev-parse --show-toplevel))/prs/
# Write to /tmp/{repo_name}/prs/{number}_description.md

# Update the PR
gh pr edit {number} --body-file /tmp/{repo_name}/prs/{number}_description.md
```

## Important Guidelines

- **Be thorough but concise** - Descriptions should be scannable
- **Focus on the "why"** as much as the "what"
- **Include breaking changes** prominently
- **Organize by component** if PR touches multiple areas
- **Always attempt verification** commands when possible
- **Clearly communicate** which steps need manual testing
- If any verification steps remain unchecked, remind user before merging
