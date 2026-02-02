#!/usr/bin/env bash
set -euo pipefail

run() {
  if command -v sudo >/dev/null 2>&1 && [[ ${EUID:-0} -ne 0 ]]; then
    sudo "$@"
  else
    "$@"
  fi
}

if command -v brew >/dev/null 2>&1; then
  brew install bat git-delta glow
  exit 0
fi

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "Unsupported OS. Install bat, git-delta, and glow manually." >&2
  exit 1
fi

if command -v apt-get >/dev/null 2>&1; then
  run apt-get update
  run apt-get install -y bat git-delta glow
  exit 0
fi

if command -v dnf >/dev/null 2>&1; then
  run dnf install -y bat git-delta glow
  exit 0
fi

if command -v yum >/dev/null 2>&1; then
  run yum install -y bat git-delta glow
  exit 0
fi

if command -v pacman >/dev/null 2>&1; then
  run pacman -Sy --noconfirm --needed bat git-delta glow
  exit 0
fi

if command -v apk >/dev/null 2>&1; then
  run apk add bat git-delta glow
  exit 0
fi

if command -v zypper >/dev/null 2>&1; then
  run zypper install -y bat git-delta glow
  exit 0
fi

echo "No supported package manager found. Install bat, git-delta, and glow manually." >&2
exit 1
