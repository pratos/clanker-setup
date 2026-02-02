#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PI_DIR="$HOME/.pi/agent"
SKILLS_SRC="$ROOT/skills"
EXT_SRC="$ROOT/extensions"
SKILLS_DEST="$PI_DIR/skills"
EXT_DEST="$PI_DIR/extensions"

mkdir -p "$PI_DIR" "$SKILLS_DEST" "$EXT_DEST"

if [[ -d "$SKILLS_SRC" ]]; then
  cp -R "$SKILLS_SRC/." "$SKILLS_DEST/"
  echo "Synced skills -> $SKILLS_DEST"
else
  echo "No skills directory at $SKILLS_SRC"
fi

if [[ -d "$EXT_SRC" ]]; then
  cp -R "$EXT_SRC/." "$EXT_DEST/"
  echo "Synced extensions -> $EXT_DEST"
else
  echo "No extensions directory at $EXT_SRC"
fi

if [[ -f "$ROOT/pi/settings.json" ]]; then
  cp "$ROOT/pi/settings.json" "$PI_DIR/settings.json"
  echo "Synced settings -> $PI_DIR/settings.json"
else
  echo "No settings file at $ROOT/pi/settings.json"
fi
