---
description: Create a git commit, push it
model: haiku
---

## Context

Current git status: !`git status`

Current git diff (staged and unstaged changes): !`git diff HEAD`

Current branch: !`git branch --show-current`

Recent commits: !`git log --oneline -10`

## Commit Format

Use Conventional Commits

```
<type>: <description>

[optional body]
[optional footer]
```

### Types

Use `feat:` for a new feature, `fix:` for a bug fix, `perf:` for a performance improvement, `docs:` for documentation, `test:` for tests, `build:` for the build system and `chore:` for maintenance.

## Your task

Based on the above changes, create a single git commit push it. Don't add any files we did not generate in this session. Commit files that are already staged or were created in this session.
