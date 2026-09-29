#!/usr/bin/env bash
# Sync Pi skills into Hermes and wire @effect/language-service into tsserver.
# Safe to re-run. No-ops when ~/.hermes is missing.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
SKILLS_SRC="${SKILLS_SRC:-$ROOT/skills}"
SKILLS_DEST="$HERMES_HOME/skills/pi"
LSP_PREFIX="$HERMES_HOME/lsp"
EFFECT_PKG="@effect/language-service"

if [ ! -d "$HERMES_HOME" ]; then
	echo "→ Hermes not installed ($HERMES_HOME missing), skipping"
	exit 0
fi

sync_skills() {
	if [ "${SKIP_SKILLS:-0}" = "1" ]; then
		echo "→ Skipping skill sync (SKIP_SKILLS=1)"
		return 0
	fi
	if [ ! -d "$SKILLS_SRC" ]; then
		echo "→ No skills source at $SKILLS_SRC, skipping"
		return 0
	fi

	mkdir -p "$SKILLS_DEST"
	chmod -R u+rwX "$SKILLS_DEST" 2>/dev/null || true

	if command -v rsync >/dev/null 2>&1; then
		rsync -a --delete --exclude='node_modules' "$SKILLS_SRC/" "$SKILLS_DEST/"
	else
		find "$SKILLS_DEST" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
		cp -R "$SKILLS_SRC/." "$SKILLS_DEST/"
	fi
	chmod -R u+rwX "$SKILLS_DEST" 2>/dev/null || true
	echo "→ Synced skills → $SKILLS_DEST"
}

install_effect_ls() {
	if [ "${SKIP_EFFECT_LS:-0}" = "1" ]; then
		echo "→ Skipping Effect language-service (SKIP_EFFECT_LS=1)"
		return 0
	fi
	if ! command -v npm >/dev/null 2>&1; then
		echo "→ npm not found, skipping $EFFECT_PKG" >&2
		return 0
	fi

	mkdir -p "$LSP_PREFIX"
	echo "→ Installing $EFFECT_PKG into $LSP_PREFIX"
	if ! npm install --prefix "$LSP_PREFIX" "$EFFECT_PKG" --omit=dev; then
		echo "  warning: npm install $EFFECT_PKG failed (network?)" >&2
		return 0
	fi
	npm audit fix --prefix "$LSP_PREFIX" --omit=dev \
		|| echo "  warning: npm audit fix failed in $LSP_PREFIX" >&2

	local plugin_dir="$LSP_PREFIX/node_modules/@effect/language-service"
	if [ ! -d "$plugin_dir" ]; then
		echo "  warning: $plugin_dir missing after install" >&2
		return 0
	fi

	wire_typescript_plugin "$plugin_dir"
}

wire_typescript_plugin() {
	local plugin_dir="$1"
	if ! command -v hermes >/dev/null 2>&1; then
		echo "→ hermes CLI not on PATH; add this to config.yaml manually:"
		echo "    lsp.servers.typescript.initialization_options.plugins:"
		echo "      - name: \"$EFFECT_PKG\""
		echo "        location: \"$plugin_dir\""
		return 0
	fi

	local payload
	payload="[{name: '${EFFECT_PKG}', location: '${plugin_dir}'}]"
	if hermes config set --force lsp.servers.typescript.initialization_options.plugins "$payload"; then
		echo "→ Wired $EFFECT_PKG into typescript-language-server plugins"
	else
		echo "  warning: hermes config set failed for Effect language-service" >&2
	fi
}

sync_skills
install_effect_ls

echo "✓ Hermes setup complete"
