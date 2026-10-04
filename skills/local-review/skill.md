---
name: local-review
description: Set up a worktree for reviewing a colleague's branch locally. Use when you need to check out someone else's branch for code review without disrupting your current work.
---

# Local Review

## Activation

**When this skill is triggered, ALWAYS display this banner first:**

```
╭─────────────────────────────────────────────────────────────╮
│  👀 SKILL ACTIVATED: local-review                           │
├─────────────────────────────────────────────────────────────┤
│  Branch: [username:branchName]                              │
│  Action: Set up worktree for local code review              │
│  Output: Isolated review environment                        │
╰─────────────────────────────────────────────────────────────╯
```

## When to Use

This skill activates when:
- "review this branch locally"
- "set up a review for [username]'s branch"
- "check out [branch] for review"
- "local review of [PR/branch]"
- Need to review code without disrupting current work

## Process

### Step 1: Parse Input

Extract from format `gh_username:branchName`:
- GitHub username
- Branch name

If no parameter provided, ask:
```
Please provide the branch to review in format: username:branchName
Example: /local-review johndoe:feature/add-auth
```

### Step 2: Extract Short Name

- Look for ticket numbers in branch name (e.g., `eng-1696`, `ISSUE-42`)
- Use ticket number as short worktree name
- If no ticket found, use sanitized branch name

### Step 3: Set Up Remote and Worktree

```bash
# Get repo name
REPO_NAME=$(basename $(git rev-parse --show-toplevel))

# Check if remote already exists
git remote -v | grep USERNAME

# If not, add remote
git remote add USERNAME git@github.com:USERNAME/$REPO_NAME

# Fetch from remote
git fetch USERNAME

# Create worktree
git worktree add -b review-BRANCHNAME ~/wt/$REPO_NAME/SHORT_NAME USERNAME/BRANCHNAME
```

### Step 4: Configure Worktree

```bash
WORKTREE=~/wt/$REPO_NAME/SHORT_NAME

# Copy local settings if they exist
cp .Codex/settings.local.json $WORKTREE/.Codex/ 2>/dev/null

# Run project setup if available
cd $WORKTREE && make setup 2>/dev/null || npm install 2>/dev/null || mix deps.get 2>/dev/null
```

### Step 5: Present Review Environment

```
Review environment ready!

Worktree: ~/wt/$REPO_NAME/SHORT_NAME
Branch: USERNAME/BRANCHNAME

To start reviewing:
  cd ~/wt/$REPO_NAME/SHORT_NAME

To clean up when done:
  git worktree remove ~/wt/$REPO_NAME/SHORT_NAME
```

## Error Handling

- **Worktree already exists**: Inform user, suggest removal first
- **Remote fetch fails**: Check if username/repo exists
- **Setup fails**: Provide error but continue

## Example Usage

```
/local-review johndoe:feature/add-authentication
```

This will:
1. Add 'johndoe' as a remote (if needed)
2. Create worktree at `~/wt/myproject/add-auth`
3. Set up the environment
4. Provide instructions for reviewing
