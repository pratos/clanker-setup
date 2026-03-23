#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# ---------------------------------------------------------------------------
# Prereqs: install bat, git-delta, glow
# Skip with SKIP_PREREQS=1 (e.g. when Nix handles packages)
# ---------------------------------------------------------------------------
install_prereqs() {
	if [ "${SKIP_PREREQS:-0}" = "1" ]; then
		echo "→ Skipping prereqs (SKIP_PREREQS=1)"
		return 0
	fi

	echo "→ Installing prerequisites (bat, git-delta, glow)"

	local run="sudo"
	if command -v sudo >/dev/null 2>&1 && [ "${EUID:-0}" -ne 0 ]; then
		run="sudo"
	else
		run=""
	fi

	if command -v brew >/dev/null 2>&1; then
		brew install bat git-delta glow
		return 0
	fi

	if [ "$(uname -s)" != "Linux" ]; then
		echo "Unsupported OS. Install bat, git-delta, and glow manually." >&2
		return 1
	fi

	if command -v apt-get >/dev/null 2>&1; then
		$run apt-get update
		$run apt-get install -y bat git-delta glow
	elif command -v dnf >/dev/null 2>&1; then
		$run dnf install -y bat git-delta glow
	elif command -v yum >/dev/null 2>&1; then
		$run yum install -y bat git-delta glow
	elif command -v pacman >/dev/null 2>&1; then
		$run pacman -Sy --noconfirm --needed bat git-delta glow
	elif command -v apk >/dev/null 2>&1; then
		$run apk add bat git-delta glow
	elif command -v zypper >/dev/null 2>&1; then
		$run zypper install -y bat git-delta glow
	else
		echo "No supported package manager found. Install bat, git-delta, and glow manually." >&2
		return 1
	fi
}

# ---------------------------------------------------------------------------
# Ensure pi binary is available
# ---------------------------------------------------------------------------
ensure_pi() {
	if command -v pi >/dev/null 2>&1; then return 0; fi

	echo "→ pi not found. Installing @mariozechner/pi-coding-agent..."
	if command -v npm >/dev/null 2>&1; then
		npm install -g @mariozechner/pi-coding-agent
	else
		echo "npm not found. Install Node.js first." >&2
		exit 1
	fi
}

# ---------------------------------------------------------------------------
# Sync: skills, extensions, settings, mcp, claude configs, AGENTS.md
# ---------------------------------------------------------------------------
sync_configs() {
	local PI_DIR="$HOME/.pi/agent"
	local SKILLS_DEST="$PI_DIR/skills"
	local EXT_DEST="$PI_DIR/extensions"
	local CLAUDE_DIR="$HOME/.claude"

	mkdir -p "$PI_DIR" "$SKILLS_DEST" "$EXT_DEST" "$CLAUDE_DIR"
	chmod -R u+rwX "$SKILLS_DEST" "$EXT_DEST" 2>/dev/null || true

	# --- Skills ---
	if [ -d "$ROOT/skills" ]; then
		if command -v rsync >/dev/null 2>&1; then
			rsync -a --delete "$ROOT/skills/" "$SKILLS_DEST/"
		else
			find "$SKILLS_DEST" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
			cp -R "$ROOT/skills/." "$SKILLS_DEST/"
		fi
		echo "→ Synced skills → $SKILLS_DEST"
	fi

	# --- Extensions (exclude node_modules from delete) ---
	if [ -d "$ROOT/extensions" ]; then
		if command -v rsync >/dev/null 2>&1; then
			rsync -a --delete --exclude='node_modules' "$ROOT/extensions/" "$EXT_DEST/"
		else
			find "$EXT_DEST" -mindepth 1 -maxdepth 1 -not -name node_modules -exec rm -rf {} +
			cp -R "$ROOT/extensions/." "$EXT_DEST/"
		fi
		echo "→ Synced extensions → $EXT_DEST"

		# Install npm deps for directory-based extensions
		# chmod needed because rsync from nix store copies read-only permissions
		for ext_dir in "$EXT_DEST"/*/; do
			if [ -f "${ext_dir}package.json" ]; then
				echo "→ Installing deps for extension: $(basename "$ext_dir")"
				chmod -R u+rwX "$ext_dir" 2>/dev/null || true
				(cd "$ext_dir" && npm install --omit=dev 2>&1) || echo "  warning: npm install failed for $(basename "$ext_dir")"
			fi
		done
	fi

	# --- Pi configs ---
	[ -f "$ROOT/pi/mcp.json" ] && cp "$ROOT/pi/mcp.json" "$PI_DIR/mcp.json" && echo "→ Synced mcp.json"

	# --- AGENTS.md ---
	[ -f "$ROOT/pi/AGENTS.md" ] && cp "$ROOT/pi/AGENTS.md" "$PI_DIR/AGENTS.md" && echo "→ Synced AGENTS.md"

	# --- Pi prompt templates (separate from Claude commands) ---
	if [ -d "$ROOT/pi/prompts" ]; then
		local PROMPTS_DEST="$PI_DIR/prompts"
		mkdir -p "$PROMPTS_DEST"
		chmod -R u+rwX "$PROMPTS_DEST" 2>/dev/null || true
		if command -v rsync >/dev/null 2>&1; then
			rsync -a --delete "$ROOT/pi/prompts/" "$PROMPTS_DEST/"
		else
			find "$PROMPTS_DEST" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
			cp -R "$ROOT/pi/prompts/." "$PROMPTS_DEST/"
		fi
		echo "→ Synced pi/prompts → $PROMPTS_DEST"
	fi

	# --- Settings (merge if exists, copy if not) ---
	if [ -f "$ROOT/pi/settings.json" ]; then
		if [ -f "$PI_DIR/settings.json" ]; then
			python3 - "$ROOT/pi/settings.json" "$PI_DIR/settings.json" <<'PY' >"$PI_DIR/settings.json.tmp"
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
			echo "→ Merged settings"
		else
			cp "$ROOT/pi/settings.json" "$PI_DIR/settings.json"
			echo "→ Synced settings"
		fi
	fi

	# --- Claude Code configs ---
	[ -f "$ROOT/claude/mcp.json" ] && cp "$ROOT/claude/mcp.json" "$CLAUDE_DIR/mcp.json" && echo "→ Synced claude/mcp.json"
	[ -f "$ROOT/claude/settings.json" ] && cp "$ROOT/claude/settings.json" "$CLAUDE_DIR/settings.json" && echo "→ Synced claude/settings.json"

	for subdir in commands agents rules; do
		if [ -d "$ROOT/claude/$subdir" ]; then
			mkdir -p "$CLAUDE_DIR/$subdir"
			if command -v rsync >/dev/null 2>&1; then
				rsync -a --delete "$ROOT/claude/$subdir/" "$CLAUDE_DIR/$subdir/"
			else
				find "$CLAUDE_DIR/$subdir" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
				cp -R "$ROOT/claude/$subdir/." "$CLAUDE_DIR/$subdir/"
			fi
			echo "→ Synced claude/$subdir"
		fi
	done
}

# ---------------------------------------------------------------------------
# Install extensions from pi/extensions.txt
# ---------------------------------------------------------------------------
install_extensions() {
	local EXT_LIST="$ROOT/pi/extensions.txt"
	local SETTINGS="$HOME/.pi/agent/settings.json"

	[ -f "$EXT_LIST" ] || {
		echo "Missing $EXT_LIST"
		return 1
	}

	# Note: macOS ships Bash 3.2 which doesn't support associative arrays.
	# Use a temp file as a simple set of already-installed package sources.
	local INSTALLED_FILE
	INSTALLED_FILE="$(mktemp -t pi-installed.XXXXXX 2>/dev/null || mktemp)"
	# shellcheck disable=SC2064
	trap "rm -f '$INSTALLED_FILE'" RETURN

	if [ -f "$SETTINGS" ]; then
		python3 - <<'PY' >"$INSTALLED_FILE" || true
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

	echo "→ Installing extensions from $EXT_LIST"
	while IFS= read -r line; do
		line="${line%%#*}"
		line="$(echo "$line" | xargs)"
		[ -z "$line" ] && continue

		if grep -Fxq -- "$line" "$INSTALLED_FILE" 2>/dev/null; then
			echo "  ✓ $line (already installed)"
		else
			echo "  + $line"
			pi install "$line"
			echo "$line" >>"$INSTALLED_FILE"
		fi
	done <"$EXT_LIST"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
install_prereqs
ensure_pi
sync_configs
install_extensions

echo "✓ Pi setup complete"
