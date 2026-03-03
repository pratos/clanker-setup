---
name: openclaw-nix
description: Manage and debug OpenClaw installed via Nix (nix-darwin/home-manager). Start/stop services, rebuild, and verify workspace/QMD.
---

# OpenClaw Nix Management Skill

## Activation

**When this skill is triggered, ALWAYS display this banner first:**

```
╭─────────────────────────────────────────────────────────────╮
│  ❄️  SKILL ACTIVATED: openclaw-nix                           │
├─────────────────────────────────────────────────────────────┤
│  Target: Nix-managed OpenClaw gateway                       │
│  Action: Rebuild, start/stop service, verify workspace/QMD   │
│  Output: service status, logs, health signals               │
╰─────────────────────────────────────────────────────────────╯
```

Use this skill when OpenClaw is installed via Nix (nix-darwin/home-manager) and the gateway isn’t starting, needs a rebuild, or memory/QMD is misbehaving.

## Preconditions
- Repo checked out locally (this repo lives at `~/.bin`).
- Nix is installed (`nix` works).
- You have the right system for the config (macOS or Linux).

## Steps

1) **Confirm the OpenClaw module is present**
```bash
rg -n "programs.openclaw" nixpkgs/openclaw/pratos-openclaw.nix
rg -n "openclaw" nixpkgs/machines/*.nix
```

2) **Rebuild + activate the configuration**
```bash
nix develop
just switch
```
If you want to build without switching:
```bash
just rebuild
```
On Linux (NixOS), switch with:
```bash
sudo nixos-rebuild switch --flake .#<machine>
```

3) **Find the gateway service name**
macOS:
```bash
launchctl list | rg -i openclaw
```
Linux (systemd user services):
```bash
systemctl --user list-units | rg -i openclaw
```

4) **Stop/start the gateway**
macOS (replace `<label>` with the output from step 3):
```bash
launchctl stop gui/$UID/<label>
launchctl kickstart -k gui/$UID/<label>
```
Linux (replace `<unit>` with the output from step 3):
```bash
systemctl --user stop <unit>
systemctl --user restart <unit>
```

5) **Inspect logs**
macOS:
```bash
log show --last 10m --predicate 'process contains "openclaw"' --info
```
Linux:
```bash
journalctl --user -u <unit> -n 200 --no-pager
```

6) **Verify workspace + QMD availability**
```bash
ls -la ~/.openclaw/workspace
ls -la ~/.local/bin/qmd
qmd --version
```

## Data to Collect for Debugging
Share these with secrets redacted:
- Output of step 3 (service name)
- Recent logs (step 5)
- `~/.openclaw/openclaw.json` (redact tokens)
- `~/.config/openclaw/` file list (no contents)
- `qmd --version` output
