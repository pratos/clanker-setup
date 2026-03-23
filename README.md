# Pi Setup

Skills, extensions, and settings for [Pi coding agent](https://github.com/mariozechner/pi-coding-agent), synced to `~/.pi/agent/`.

## Contents

| Path                | Syncs to                    | Description                                                 |
| ------------------- | --------------------------- | ----------------------------------------------------------- |
| `skills/`           | `~/.pi/agent/skills/`       | Custom Pi skills                                            |
| `extensions/`       | `~/.pi/agent/extensions/`   | Custom Pi extensions                                        |
| `pi/settings.json`  | `~/.pi/agent/settings.json` | Pi settings                                                 |
| `pi/mcp.json`       | `~/.pi/agent/mcp.json`      | MCP server config                                           |
| `pi/extensions.txt` | —                           | Packages to `pi install`                                    |
| `pi/AGENTS.md`      | `~/.pi/agent/AGENTS.md`     | Global agent instructions                                   |
| `claude/`           | `~/.claude/`                | Claude Code config (settings, MCP, commands, agents, rules) |

## Setup

### With Nix (recommended)

Add as a flake input and enable the home-manager module:

```nix
# flake.nix
inputs.clanker-setup.url = "github:pratos/clanker-setup";

# home-manager modules
inputs.clanker-setup.homeManagerModules.default

# home config
programs.pi.enable = true;
```

Options:

- `programs.pi.skipBootstrap = true` — skip `pi install` during activation (useful in CI)

### Without Nix

```bash
bash scripts/pi-setup.sh
```

Installs prerequisites, syncs configs, and runs `pi install` for all extensions.

Set `SKIP_PREREQS=1` to skip system package installation (bat, git-delta, glow).

## Updating the package list

```bash
bash scripts/pi-export.sh
```

Exports currently installed Pi packages back to `pi/extensions.txt`.
