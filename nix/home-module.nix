# Home-manager module for Pi coding agent setup.
# Copies skills, extensions, and settings into ~/.pi/agent/ during activation,
# then runs `pi install` for npm packages.
#
# Usage (in your flake):
#   inputs.clanker-setup.url = "github:pratos/clanker-setup";
#   # then in home-manager modules:
#   inputs.clanker-setup.homeManagerModules.default
flakeSrc: {
  config,
  lib,
  pkgs,
  ...
}: let
  cfg = config.programs.pi;

  # Read extensions.txt, strip comments/blanks, produce a list of package names
  extensionLines = lib.splitString "\n" (builtins.readFile "${flakeSrc}/pi/extensions.txt");
  extensionPackages = builtins.filter (line: line != "" && !(lib.hasPrefix "#" line))
    (map (line: lib.trim (builtins.head (lib.splitString "#" line))) extensionLines);

  piSync = pkgs.writeShellScript "pi-sync" ''
    set -euo pipefail

    PI_DIR="$HOME/.pi/agent"
    mkdir -p "$PI_DIR/skills" "$PI_DIR/extensions"

    echo "pi sync: copying settings"
    cp -f "${flakeSrc}/pi/settings.json" "$PI_DIR/settings.json"
    # clean up any leftover backup files from previous home-manager runs
    rm -f "$PI_DIR/settings.json.backup"

    echo "pi sync: copying skills"
    ${pkgs.rsync}/bin/rsync -a --delete "${flakeSrc}/skills/" "$PI_DIR/skills/"

    echo "pi sync: copying extensions"
    ${pkgs.rsync}/bin/rsync -a --delete "${flakeSrc}/extensions/" "$PI_DIR/extensions/"

    echo "pi sync: done"
  '';

  piBootstrap = pkgs.writeShellScript "pi-bootstrap" ''
    set -euo pipefail

    export PATH="$HOME/.bun/bin:$PATH"

    # Locate pi binary
    pi_bin=""
    if command -v pi >/dev/null 2>&1; then
      pi_bin="$(command -v pi)"
    elif [ -x "$HOME/.bun/bin/pi" ]; then
      pi_bin="$HOME/.bun/bin/pi"
    fi

    # Install pi if missing
    if [ -z "$pi_bin" ]; then
      if command -v bun >/dev/null 2>&1; then
        echo "Installing pi via bun..."
        bun install --global @mariozechner/pi-coding-agent
        pi_bin="$HOME/.bun/bin/pi"
      elif command -v npm >/dev/null 2>&1; then
        echo "Installing pi via npm..."
        npm install -g @mariozechner/pi-coding-agent
        pi_bin="$(command -v pi || true)"
      else
        echo "pi bootstrap: skipped (no bun/npm available)" >&2
        exit 0
      fi
    fi

    if [ -z "$pi_bin" ] || [ ! -x "$pi_bin" ]; then
      echo "pi bootstrap: failed (pi not found after install)" >&2
      exit 0
    fi

    export PATH="$(dirname "$pi_bin"):$PATH"

    installed_file="$(mktemp -t pi-installed.XXXXXX 2>/dev/null || mktemp)"
    trap 'rm -f "$installed_file"' EXIT

    if [ -f "$HOME/.pi/agent/settings.json" ]; then
      python3 - <<'PY' > "$installed_file" || true
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
      grep -Fxq -- "$1" "$installed_file" 2>/dev/null
    }

    # Install extension packages
    ${lib.concatMapStringsSep "\n" (pkg: ''
      if is_installed "${pkg}"; then
        echo "pi install: ${pkg} (already installed)"
      else
        echo "pi install: ${pkg}"
        "$pi_bin" install "${pkg}" || echo "  warning: failed to install ${pkg}"
        echo "${pkg}" >> "$installed_file"
      fi
    '') extensionPackages}

    echo "pi bootstrap: done"
  '';
in {
  options.programs.pi = {
    enable = lib.mkEnableOption "Pi coding agent setup";

    installMethod = lib.mkOption {
      type = lib.types.enum ["bun" "npm"];
      default = "bun";
      description = "Package manager used to install pi globally.";
    };

    skipBootstrap = lib.mkOption {
      type = lib.types.bool;
      default = false;
      description = "Skip the activation-time pi install step (useful in CI).";
    };
  };

  config = lib.mkIf cfg.enable {
    # Prerequisite CLI tools (replaces pi-prereqs.sh)
    home.packages = with pkgs; [
      bat
      delta
      glow
    ];

    # Sync skills, extensions, and settings into ~/.pi/agent/ via copy
    # (not home.file symlinks — Pi's config dir is mutable)
    home.activation.piSync =
      lib.hm.dag.entryAfter ["writeBoundary"] ''
        ${piSync}
      '';

    # Run `pi install` for each npm package during activation
    home.activation.piBootstrap = lib.mkIf (!cfg.skipBootstrap)
      (lib.hm.dag.entryAfter ["piSync"] ''
        ${piBootstrap}
      '');
  };
}
