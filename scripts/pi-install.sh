#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXT_LIST="$ROOT/pi/extensions.txt"
SETTINGS="$HOME/.pi/agent/settings.json"

declare -A INSTALLED=()

if ! command -v pi >/dev/null 2>&1; then
  echo "pi not found. Install with: npm install -g @mariozechner/pi-coding-agent" >&2
  exit 1
fi

if [[ ! -f "$EXT_LIST" ]]; then
  echo "Missing $EXT_LIST. Run scripts/pi-export.sh first." >&2
  exit 1
fi

if [[ -f "$SETTINGS" ]]; then
  while IFS= read -r pkg; do
    [[ -n "$pkg" ]] && INSTALLED["$pkg"]=1
  done < <(python3 - <<'PY'
import json
import os
import sys

settings = os.path.expanduser("~/.pi/agent/settings.json")
try:
    data = json.load(open(settings))
except Exception:
    sys.exit(0)

for item in data.get("packages", []):
    if isinstance(item, str):
        print(item)
    elif isinstance(item, dict):
        src = item.get("source")
        if src:
            print(src)
PY
  )
fi

echo "Installing packages from $EXT_LIST"
while IFS= read -r line; do
  line="${line%%#*}"
  line="$(echo "$line" | xargs)"
  [[ -z "$line" ]] && continue

  if [[ -n "${INSTALLED[$line]:-}" ]]; then
    echo "-> $line (already installed)"
    continue
  fi

  echo "-> $line"
  pi install "$line"
  INSTALLED["$line"]=1

done < "$EXT_LIST"

echo "Done."
