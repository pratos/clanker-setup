---
description: Analyze git changes and create a commit with proper format — stage, review, commit, push
---

# Commit Changes

## Activation

```
╭─────────────────────────────────────────────────────────────╮
│  📝 COMMAND: commit                                         │
├─────────────────────────────────────────────────────────────┤
│  Action: Stage → Review → Commit → [Push if requested]      │
│  Format: (type) description                                 │
╰─────────────────────────────────────────────────────────────╯
```

## Workflow Steps

### Step 1: Check Status

```bash
git status
```

Review what files are:
- Modified (staged and unstaged)
- Untracked (new files)
- Deleted

### Step 1.1: Check for Unmerged Files

```bash
git diff --name-only --diff-filter=U
```

If any files are listed, **stop** and resolve merge conflicts before proceeding.

### Step 2: Stage Changes

Stage only relevant files (not unrelated files):

```bash
# Stage specific files
git add path/to/file1.py path/to/file2.yaml

# Or stage all changes (use with caution)
git add -A
```

**Rules:**
- Do NOT stage unrelated files (e.g., personal notes, temp files)
- Do NOT stage files in `thoughts/` unless explicitly requested
- Review what you're staging before committing

### Step 3: Review Changes

```bash
# Review staged changes
git diff --staged

# Or for a summary
git diff --staged --stat
```

Verify:
- Changes are intentional
- No debug code left behind
- No secrets or credentials included

### Step 3.1: Secrets/Keys Scan (staged diff)

```bash
git diff --staged -U0 | rg -n '(api[_-]?key|secret|token|password|private[_-]?key|client[_-]?secret|access[_-]?key|BEGIN (RSA|EC|OPENSSH) PRIVATE KEY)'
```

If any matches appear, **flag them** and do not commit until resolved.

### Step 4: Commit with Proper Message

Follow the project's commit format: `(type) description`

**Auto-description requirement:**
- Propose a commit message based on the current session and staged diff before asking the user to confirm.
- Example prompt: "Suggested commit: `(chore) ...` — approve or provide a different message?"
- When committing, include a concise 2–4 bullet summary in the commit body documenting key changes.

```bash
git commit -m "(type) short description of changes"
```

**Commit Types:**
| Type | Usage |
|------|-------|
| `feat` | New feature or capability |
| `fix` | Bug fix |
| `refactor` | Code restructuring without behavior change |
| `docs` | Documentation only |
| `test` | Adding or updating tests |
| `chore` | Maintenance, dependencies, configs |
| `perf` | Performance improvements |

**Examples:**
```bash
git commit -m "(feat) add DAPS finetune config with staged training"
git commit -m "(fix) correct CSV paths for DAPS dataset"
git commit -m "(refactor) extract loss computation to separate module"
git commit -m "(docs) update README with training instructions"
```

**Rules:**
- Keep message under 72 characters
- Use imperative mood ("add" not "added")
- Do NOT include "Co-Authored-By: Claude" or similar
- Be specific about what changed

### Step 5: Push (Only if Requested)

```bash
git push
```

**Before pushing, verify:**
- All tests pass (if applicable)
- No WIP commits being pushed
- On correct branch

## Red Flags

❌ Committing without reviewing changes first
❌ Using vague commit messages like "update" or "fix stuff"
❌ Staging all files blindly with `git add .`
❌ Pushing without verifying the branch
❌ Including secrets, credentials, or API keys
❌ Unmerged/conflict files present
❌ Committing large binary files or datasets

## Success Criteria

✅ Only relevant files are staged
✅ Changes are reviewed before committing
✅ Commit message follows `(type) description` format
✅ Commit message is descriptive and concise
✅ Push only when explicitly requested
