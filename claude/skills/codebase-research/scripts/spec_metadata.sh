#!/usr/bin/env bash
set -euo pipefail

# Collect metadata
DATETIME_TZ=$(date '+%Y-%m-%d %H:%M:%S %Z')
FILENAME_TS=$(date '+%Y-%m-%d_%H-%M-%S')

if command -v git >/dev/null 2>&1 && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || true)
  REPO_NAME=""
  if [ -n "$REPO_ROOT" ]; then
    REPO_NAME=$(basename "$REPO_ROOT" 2>/dev/null || true)
  fi
  GIT_BRANCH=$(git branch --show-current 2>/dev/null || git rev-parse --abbrev-ref HEAD 2>/dev/null || true)
  GIT_COMMIT=$(git rev-parse HEAD 2>/dev/null || true)
  GIT_USER_NAME=$(git config user.name 2>/dev/null || true)
else
  REPO_ROOT=""
  REPO_NAME=""
  GIT_BRANCH=""
  GIT_COMMIT=""
  GIT_USER_NAME=""
fi

# GitHub user info if gh is available
if command -v gh >/dev/null 2>&1; then
  GH_USER_NAME=$(gh api user --jq .login 2>/dev/null || true)
  GH_NAME=$(gh api user --jq .name 2>/dev/null || true)
else
  GH_USER_NAME=""
  GH_NAME=""
fi

# Print similar to the individual command outputs
echo "Current Date/Time (TZ): $DATETIME_TZ"
[ -n "$GIT_USER_NAME" ] && echo "Git User Name: $GIT_USER_NAME"
[ -n "$GIT_COMMIT" ] && echo "Current Git Commit Hash: $GIT_COMMIT"
[ -n "$GIT_BRANCH" ] && echo "Current Branch Name: $GIT_BRANCH"
[ -n "$REPO_NAME" ] && echo "Repository Name: $REPO_NAME"
echo "Timestamp For Filename: $FILENAME_TS"
[ -n "$GH_NAME" ] && echo "GitHub Name: $GH_NAME"
[ -n "$GH_USER_NAME" ] && echo "GitHub Username: $GH_USER_NAME"
