#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXT_LIST="$ROOT/pi/extensions.txt"

if ! command -v pi >/dev/null 2>&1; then
  echo "pi not found. Install with: npm install -g @mariozechner/pi-coding-agent" >&2
  exit 1
fi

if [[ ! -f "$EXT_LIST" ]]; then
  echo "Missing $EXT_LIST. Run scripts/pi-export.sh first." >&2
  exit 1
fi

echo "Installing packages from $EXT_LIST"
while IFS= read -r line; do
  line="${line%%#*}"
  line="$(echo "$line" | xargs)"
  [[ -z "$line" ]] && continue
  echo "-> $line"
  pi install "$line"
done < "$EXT_LIST"

echo "Done. Skills list: $ROOT/pi/skills.txt"
