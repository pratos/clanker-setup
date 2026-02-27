# Home-manager module for Pi coding agent setup.
# Syncs skills, extensions, and settings declaratively via home.file,
# then runs `pi install` for npm packages during activation.
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

  # Build home.file entries for every file under a source directory.
  # Maps  <srcDir>/<relative-path>  →  <destPrefix>/<relative-path>
  mkFileSet = srcDir: destPrefix: let
    # Recursively collect files from the nix store path
    collect = dir: prefix: let
      entries = builtins.readDir dir;
      process = name: type:
        if type == "directory"
        then collect (dir + "/${name}") (
          if prefix == ""
          then name
          else "${prefix}/${name}"
        )
        else [
          {
            name =
              if prefix == ""
              then "${destPrefix}/${name}"
              else "${destPrefix}/${prefix}/${name}";
            value = {
              source = dir + "/${name}";
            };
          }
        ];
    in
      lib.concatLists (lib.mapAttrsToList process entries);
  in
    builtins.listToAttrs (collect srcDir "");

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

    # Install extension packages
    ${lib.concatMapStringsSep "\n" (pkg: ''
      echo "pi install: ${pkg}"
      "$pi_bin" install "${pkg}" || echo "  warning: failed to install ${pkg}"
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

    # Declaratively sync skills, extensions, and settings into ~/.pi/agent/
    home.file =
      # settings.json
      {
        ".pi/agent/settings.json".source = "${flakeSrc}/pi/settings.json";
      }
      # skills/*
      // mkFileSet "${flakeSrc}/skills" ".pi/agent/skills"
      # extensions/*
      // mkFileSet "${flakeSrc}/extensions" ".pi/agent/extensions";

    # Run `pi install` for each npm package during activation
    home.activation.piBootstrap = lib.mkIf (!cfg.skipBootstrap)
      (lib.hm.dag.entryAfter ["writeBoundary"] ''
        ${piBootstrap}
      '');
  };
}
