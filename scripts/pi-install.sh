#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXT_LIST="$ROOT/pi/extensions.txt"
SETTINGS="$HOME/.pi/agent/settings.json"

# Note: macOS ships Bash 3.2 which doesn't support associative arrays.
# Use a temp file as a simple set of already-installed package sources.
INSTALLED_FILE="$(mktemp -t pi-installed.XXXXXX 2>/dev/null || mktemp)"
trap 'rm -f "$INSTALLED_FILE"' EXIT

if ! command -v pi >/dev/null 2>&1; then
  echo "pi not found. Install with: npm install -g @mariozechner/pi-coding-agent" >&2
  exit 1
fi

if [[ ! -f "$EXT_LIST" ]]; then
  echo "Missing $EXT_LIST. Run scripts/pi-export.sh first." >&2
  exit 1
fi

if [[ -f "$SETTINGS" ]]; then
  python3 - <<'PY' > "$INSTALLED_FILE" || true
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
fi

is_installed() {
  grep -Fxq -- "$1" "$INSTALLED_FILE" 2>/dev/null
}

echo "Installing packages from $EXT_LIST"
while IFS= read -r line; do
  line="${line%%#*}"
  line="$(echo "$line" | xargs)"
  [[ -z "$line" ]] && continue

  if is_installed "$line"; then
    echo "-> $line (already installed)"
    continue
  fi

  echo "-> $line"
  pi install "$line"
  echo "$line" >> "$INSTALLED_FILE"

done < "$EXT_LIST"

echo "Done."
