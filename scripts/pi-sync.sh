#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PI_DIR="$HOME/.pi/agent"
SKILLS_SRC="$ROOT/skills"
EXT_SRC="$ROOT/extensions"
SKILLS_DEST="$PI_DIR/skills"
EXT_DEST="$PI_DIR/extensions"

mkdir -p "$PI_DIR" "$SKILLS_DEST" "$EXT_DEST"
chmod -R u+rwX "$SKILLS_DEST" "$EXT_DEST" 2>/dev/null || true

sync_dir() {
  local src="$1"
  local dest="$2"
  local label="$3"

  if [[ ! -d "$src" ]]; then
    echo "No ${label} directory at $src"
    return 0
  fi

  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete "$src/" "$dest/"
  else
    find "$dest" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
    cp -R "$src/." "$dest/"
  fi

  echo "Synced ${label} -> $dest"
}

sync_dir "$SKILLS_SRC" "$SKILLS_DEST" "skills"

# Extensions: exclude node_modules from delete (installed by npm install below)
if [[ -d "$EXT_SRC" ]]; then
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete --exclude='node_modules' "$EXT_SRC/" "$EXT_DEST/"
  else
    # Fallback: preserve node_modules dirs before delete
    find "$EXT_DEST" -mindepth 1 -maxdepth 1 -not -name node_modules -exec rm -rf {} +
    cp -R "$EXT_SRC/." "$EXT_DEST/"
  fi
  echo "Synced extensions -> $EXT_DEST"
fi

# Install npm dependencies for directory-based extensions with package.json
# --unsafe-perm needed when activation runs as root (sudo darwin-rebuild switch)
for ext_dir in "$EXT_DEST"/*/; do
  if [[ -f "${ext_dir}package.json" ]]; then
    echo "Installing deps for extension: $(basename "$ext_dir")"
    chmod -R u+rwX "$ext_dir" 2>/dev/null || true
    (cd "$ext_dir" && npm install --omit=dev --unsafe-perm 2>&1) || echo "  warning: npm install failed for $(basename "$ext_dir")"
  fi
done

# Sync mcp.json (pi-mcp-adapter config)
if [[ -f "$ROOT/pi/mcp.json" ]]; then
  cp "$ROOT/pi/mcp.json" "$PI_DIR/mcp.json"
  echo "Synced mcp.json -> $PI_DIR/mcp.json"
fi

# Sync Claude Code config
CLAUDE_DIR="$HOME/.claude"
mkdir -p "$CLAUDE_DIR"

if [[ -f "$ROOT/claude/mcp.json" ]]; then
  cp "$ROOT/claude/mcp.json" "$CLAUDE_DIR/mcp.json"
  echo "Synced claude/mcp.json -> $CLAUDE_DIR/mcp.json"
fi

if [[ -f "$ROOT/claude/settings.json" ]]; then
  cp "$ROOT/claude/settings.json" "$CLAUDE_DIR/settings.json"
  echo "Synced claude/settings.json -> $CLAUDE_DIR/settings.json"
fi

# Sync .claude/ subdirectories (commands, agents, rules) for HumanLayer extension
for subdir in commands agents rules; do
  if [[ -d "$ROOT/claude/$subdir" ]]; then
    mkdir -p "$CLAUDE_DIR/$subdir"
    if command -v rsync >/dev/null 2>&1; then
      rsync -a --delete "$ROOT/claude/$subdir/" "$CLAUDE_DIR/$subdir/"
    else
      find "$CLAUDE_DIR/$subdir" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
      cp -R "$ROOT/claude/$subdir/." "$CLAUDE_DIR/$subdir/"
    fi
    echo "Synced claude/$subdir -> $CLAUDE_DIR/$subdir"
  fi
done

if [[ -f "$ROOT/pi/settings.json" ]]; then
  if [[ -f "$PI_DIR/settings.json" ]]; then
    python3 - <<'PY' "$ROOT/pi/settings.json" "$PI_DIR/settings.json" > "$PI_DIR/settings.json.tmp"
import json
import sys

src_path = sys.argv[1]
dst_path = sys.argv[2]

with open(src_path, "r", encoding="utf-8") as fh:
    src = json.load(fh)
with open(dst_path, "r", encoding="utf-8") as fh:
    dst = json.load(fh)

merged = dict(dst)

for key, value in src.items():
    if key in ("packages", "enabledModels"):
        dst_list = [item for item in dst.get(key, []) if item]
        src_list = [item for item in value or [] if item]
        merged[key] = dst_list + [item for item in src_list if item not in dst_list]
    else:
        merged.setdefault(key, value)

json.dump(merged, sys.stdout, indent=2, sort_keys=False)
print()
PY
    mv "$PI_DIR/settings.json.tmp" "$PI_DIR/settings.json"
    echo "Merged settings -> $PI_DIR/settings.json"
  else
    cp "$ROOT/pi/settings.json" "$PI_DIR/settings.json"
    echo "Synced settings -> $PI_DIR/settings.json"
  fi
else
  echo "No settings file at $ROOT/pi/settings.json"
fi
