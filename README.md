# Pi Setup

Skills, extensions, and settings for [Pi coding agent](https://github.com/mariozechner/pi-coding-agent), synced to `~/.pi/agent/`.

## Contents

| Path                | Syncs to                    | Description                                                 |
| ------------------- | --------------------------- | ----------------------------------------------------------- |
| `skills/`           | `~/.pi/agent/skills/` and `~/.hermes/skills/pi/` | Custom skills (Pi + Hermes)                  |
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

Hermes (optional):

```bash
bash scripts/hermes-setup.sh
```

Copies `skills/` to `~/.hermes/skills/pi/` (does not touch bundled Hermes skills) and installs `@effect/language-service` into Hermes's TypeScript language server. No-ops if `~/.hermes` is missing. `pi-setup.sh` runs this automatically.

- `SKIP_SKILLS=1` — skip skill copy
- `SKIP_EFFECT_LS=1` — skip the Effect TS plugin
- `SKILLS_SRC=/path` — copy a different skills tree (used by Nix after it adds extra skills)

## Updating the package list

```bash
bash scripts/pi-export.sh
```

Exports currently installed Pi packages back to `pi/extensions.txt`.
