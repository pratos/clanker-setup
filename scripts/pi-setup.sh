#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm not found. Install Node.js first." >&2
  exit 1
fi

if ! command -v pi >/dev/null 2>&1; then
  echo "pi not found. Installing @mariozechner/pi-coding-agent..."
  npm install -g @mariozechner/pi-coding-agent
fi

bash "$ROOT/scripts/pi-prereqs.sh"
bash "$ROOT/scripts/pi-install.sh"
bash "$ROOT/scripts/pi-sync.sh"
