# Pi setup snapshot

This repo captures your Pi packages plus custom skills/extensions you want to sync to `~/.pi` on a new machine.

## Contents

- `pi/extensions.txt`: package sources for `pi install`
- `pi/settings.json`: Pi settings snapshot (syncs to `~/.pi/agent/settings.json`)
- `pi/mcp.json`: Pi MCP servers config (syncs to `~/.pi/agent/mcp.json`)
- `claude/mcp.json`: Claude Code MCP servers config (syncs to `~/.claude/mcp.json`)
- `claude/settings.json`: Claude Code settings (syncs to `~/.claude/settings.json`)
- `skills/`: custom skills to sync into `~/.pi/agent/skills`
- `extensions/`: custom extensions to sync into `~/.pi/agent/extensions`
- `flake.nix` / `nix/home-module.nix`: home-manager module for declarative setup

## Setup

### Nix / home-manager (recommended)

Add this repo as a flake input and enable the module:

```nix
# flake.nix inputs
inputs.clanker-setup.url = "github:pratos/clanker-setup";

# in your home-manager modules list
inputs.clanker-setup.homeManagerModules.default

# then in your home config (or a wrapper module)
programs.pi.enable = true;
```

This will:
1. Install prerequisite CLI tools (`bat`, `delta`, `glow`) via nix
2. Declaratively sync skills, extensions, and settings into `~/.pi/agent/`
3. Run `pi install` for each npm package in `pi/extensions.txt` during activation

**Options:**
- `programs.pi.skipBootstrap = true` — skip the `pi install` activation step (useful in CI)

### One-command setup (no nix)

```bash
bash scripts/pi-setup.sh
```

### Step-by-step (no nix)

1) Install required CLI tools (for some extensions):

```bash
bash scripts/pi-prereqs.sh
```

Supports Homebrew (macOS) and Linux package managers: apt, dnf, yum, pacman, apk, zypper.
On Debian/Ubuntu, the `bat` binary may be `batcat`.

2) Install Pi:

```bash
npm install -g @mariozechner/pi-coding-agent
```

3) Install packages listed in `pi/extensions.txt`:

```bash
bash scripts/pi-install.sh
```

4) Sync skills/extensions/settings from this repo into `~/.pi`:

```bash
bash scripts/pi-sync.sh
```

## Update the package list (current machine)

```bash
bash scripts/pi-export.sh
```

> Note: skills/extensions are synced from this repo; `pi install` only manages packages.
