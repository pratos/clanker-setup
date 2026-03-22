# dotclaude Extension for Pi

A pi extension that integrates `.claude/` directory configuration — commands, agents, rules, and settings — with additional features: sandboxed code execution, a live tool activity panel, and session management.

## Quick Start

The extension loads automatically when pi starts. It discovers `.claude/` in your project root and registers everything it finds. No manual configuration needed.

```
~/.claude/
├── commands/     → /commit, /plan, /implement, /debug
├── agents/       → /agent:codebase-locator, /agent:codebase-analyzer, ...
├── rules/        → injected into system prompt
└── settings.json → thinking level, permissions
```

## Commands

Slash commands from `.claude/commands/*.md`. Type `/` in pi to see autocomplete.

| Command | Description |
|---------|-------------|
| `/commit` | Analyze git changes, stage, review, commit, and push with proper format |
| `/plan` | Create a detailed implementation plan through interactive research and phased planning |
| `/implement` | Implement an approved plan phase by phase with verification at each step |
| `/debug` | Investigate and debug an issue with systematic root cause analysis |
| `/history` | Show tool execution history for the current session, grouped by turn |

### `/history`

Shows every tool call made during the session, organized by agent turn with timing and error details:

```
Tool Execution History

  ✓ read src/index.ts              0.1s
  ✓ grep /TODO/ in src/            0.3s
  ✗ $ npm test                     2.1s
    ↳ Error: test script missing
  ─── turn 1: 3 tools, 2.5s, 1 err ───

  ✓ read package.json              0.0s
  ✓ edit package.json              0.1s
  ─── turn 2: 2 tools, 0.1s ───

Total: 5 tools · 2.6s · 1 errors
```

## Agents

Sub-agents from `.claude/agents/*.md` using [HumanLayer frontmatter format](#agent-frontmatter). Invoked via `/agent:name` or suggested by the LLM.

| Agent | Description | Tools |
|-------|-------------|-------|
| `codebase-locator` | Locates files and components relevant to a feature or task. "Super Grep" with LSP-first search. | LSP, DeepWiki, Grep, Glob, LS |
| `codebase-analyzer` | Analyzes HOW specific code works — traces data flow, explains implementation details. | LSP, DeepWiki, Grep, Glob, LS, Read |
| `codebase-pattern-finder` | Finds similar implementations, usage examples, or existing patterns to model after. | LSP, DeepWiki, Grep, Glob, LS, Read |
| `codebase-research` | Comprehensive codebase research — explores components, connections, patterns. Generates ASCII architecture diagrams. | LSP, DeepWiki, Grep, Glob, LS, Read, Bash |
| `code-duplication-check` | Prevents recreating existing code — searches for similar implementations before writing new code. | LSP, DeepWiki, Grep, Glob, LS, Read |

### How agents work

When you invoke `/agent:codebase-locator find the auth middleware`, the extension:

1. **Scopes tools** — limits active tools to only those listed in the agent's frontmatter
2. **Switches model** — if the agent specifies `model: sonnet`, switches to it
3. **Sets thinking level** — if `thinking: high`, adjusts reasoning depth
4. **Sends the agent prompt** — the agent's markdown body + your task
5. **Restores everything** — after the turn, tools/model/thinking revert to previous values

You see a single notification: `▸ codebase-locator [5 tools, sonnet, thinking:high]`

When the agent finishes: `✓ codebase-locator done: 23 tools in 28.3s`

## Code Execution (`code_execute`)

A sandboxed Python interpreter powered by [Pydantic Monty](https://github.com/pydantic/monty) — a Rust-based Python VM with <1μs startup and zero syscall access.

The LLM uses this tool automatically when it needs to do repo-wide analysis, loops, filtering, counting, or any task with 3+ dependent tool calls. It avoids model round-trips by writing Python that calls pi's tools directly.

### Available helpers

```python
read(path, offset=None, limit=None) → str     # Read a file
grep(pattern, path=".") → str                 # Search with ripgrep
find(pattern, path=".") → str                 # Find files by glob
ls(path=".") → str                            # List directory
bash(command, timeout=30) → str               # Run shell command
write(path, content) → str                    # Write a file
edit(path, old_text, new_text) → str           # Edit a file
cwd: str                                      # Current working directory
```

### Example

```python
# Find all TypeScript files with TODOs, ranked by count
files = find("*.ts", "src").strip().splitlines()
results = [read(f) for f in files[:20]]
todos = [(f, c.count("TODO")) for f, c in zip(files, results) if "TODO" in c]
for name, count in sorted(todos, key=lambda x: -x[1])[:10]:
    print(name + ": " + str(count) + " TODOs")
```

### Sandbox limits

| Limit | Value |
|-------|-------|
| Memory | 50 MB |
| Duration | 60 seconds |
| Max allocations | 500,000 |
| Recursion depth | 100 |
| 3rd-party imports | ❌ Not available (sandbox trade-off) |

For tasks needing packages (pandas, requests, etc.), the LLM falls back to the `bash` tool with `uv run`.

## Tool Activity Panel

A floating TUI overlay that shows live tool execution during agent turns. Appears on the right side of the terminal.

### Toggle

**`Ctrl+Shift+A`** — show/hide the panel

The panel also:
- **Auto-shows** on the first tool call of each agent turn
- **Auto-hides** 3 seconds after the agent completes
- **Hides on narrow terminals** (< 100 columns)

### What it shows

```
╭─ Tool Activity ──────────── 23 · 28.3s ╮
│ ✓ 20  ✗ 3                              │
├─────────────────────────────────────────┤
│ ✓ read src/index.ts              0.1s  │
│ ✓ grep /TODO/ in src/            0.3s  │
│ ✗ $ npm test                     2.1s  │
│   ↳ Error: test script missing         │
│ ✓ edit package.json              0.1s  │
│ ○ read src/config.ts               …   │
╰────────────────── Ctrl+Shift+A toggle ─╯
```

### Compact tool formatting

| Tool | Display |
|------|---------|
| `bash` | `$ npm test` (skips comments/shebangs) |
| `read` | `read src/index.ts:1-50` |
| `write` | `write dist/bundle.js` |
| `edit` | `edit src/config.ts` |
| `grep` | `grep /TODO/ in src/` |
| `find` | `find *.ts in src/` |
| `ls` | `ls src/components/` |
| `lsp` | `lsp symbols "UserService"` |
| `code_execute` | `python 12 lines` |
| `deepwiki_*` | `dw:ask_question {"repo":"..."}` |
| MCP tools | `tool_name {"key":"va..."}` |

### Status bar

Even without the overlay, the status bar always shows the current/last tool:
- During execution: `○ read src/index.ts`
- After completion: `✓ 23 tools · 28.3s`
- With errors: `✓ 23 tools · 28.3s · 3 err`

## Session Auto-Naming

The extension automatically names your session based on the first real user message. This makes sessions identifiable in the session selector (`/resume`) instead of showing as "unnamed".

- First message "refactor the auth middleware" → session named `refactor the auth middleware`
- Slash commands (`/commit`, `/plan`, etc.) are skipped — waits for a real message
- Respects existing names — won't overwrite if you've already named the session via `/session-name`

## Agent Frontmatter

All `.claude/agents/*.md` files use this format:

```yaml
---
name: agent-name                    # Required — used for /agent:name command
description: What this agent does   # Required — shown in autocomplete + system prompt
tools: Tool1, Tool2, Tool3          # Optional — scopes active tools for this agent
model: sonnet                       # Optional — switches to this model for the turn
thinking: high                      # Optional — sets thinking level for the turn
color: blue                         # Optional — future: status/widget styling
---

[Agent instructions in markdown...]
```

### Available tool names

`LSP`, `DeepWiki`, `Grep`, `Glob`, `LS`, `Read`, `Write`, `Edit`, `Bash`, `Find`, `CodeExecute`

### Available thinking levels

`off`, `minimal`, `low`, `medium`, `high`, `xhigh`

### Available models

`opus`, `sonnet`, `haiku` (maps to the latest available Anthropic model matching the pattern)

## Settings (`settings.json`)

The `.claude/settings.json` supports:

```json
{
  "thinkingLevel": "high",
  "alwaysThinkingEnabled": true
}
```

| Field | Type | Description |
|-------|------|-------------|
| `thinkingLevel` | string | Explicit level: `off`, `minimal`, `low`, `medium`, `high`, `xhigh` |
| `alwaysThinkingEnabled` | boolean | Legacy fallback: `true` → `"high"` |

`thinkingLevel` takes priority over `alwaysThinkingEnabled`.

## Rules

Place markdown files in `.claude/rules/`. They are listed in the system prompt so the LLM knows they exist and can read them when relevant.

```
.claude/rules/
├── code-style.md        # Coding conventions
├── testing.md           # Testing requirements
└── security.md          # Security guidelines
```

## Search Strategy

All codebase agents follow a tiered search approach:

### Tier 1: LSP + DeepWiki (always first)

- **LSP** — semantic code search: `workspace_symbols`, `references`, `definition`, `symbols`
- **DeepWiki MCP** — documentation for any GitHub repo: `deepwiki_ask_question`, `deepwiki_read_wiki_structure`

For one-off lookups ("where is X defined?"), this is usually sufficient.

### Tier 2: Grep/Glob/LS (fallback)

When LSP + DeepWiki don't have the answer, agents fall back to exhaustive file-level search with grep, glob, find, and bash.

### Tier 3: Web research (external)

For information not in the codebase or any GitHub repo — use Dia browser + `surf-cli` via bash.

## Adding Your Own

### Add a command

Create `.claude/commands/your-command.md`:

```markdown
---
description: What this command does
---

[Instructions for the LLM when /your-command is invoked...]
```

### Add an agent

Create `.claude/agents/your-agent.md`:

```markdown
---
name: your-agent
description: What this agent does
tools: Read, Grep, Bash
model: sonnet
thinking: medium
---

[Agent instructions — what to do, how to search, what to output...]
```

### Add a rule

Create `.claude/rules/your-rule.md` with any guidelines. The LLM will read it when working on related tasks.

## File Structure

```
clanker-setup/
├── extensions/
│   └── dotclaude/               # This extension
│       ├── index.ts             # Extension entry point (~1100 lines)
│       ├── package.json         # @pydantic/monty dependency
│       └── node_modules/        # Installed via npm
├── claude/
│   ├── commands/                # Slash commands
│   │   ├── commit.md
│   │   ├── plan.md
│   │   ├── implement.md
│   │   └── debug.md
│   ├── agents/                  # Sub-agents (HumanLayer-style frontmatter)
│   │   ├── codebase-locator.md
│   │   ├── codebase-analyzer.md
│   │   ├── codebase-pattern-finder.md
│   │   ├── codebase-research.md
│   │   └── code-duplication-check.md
│   ├── rules/                   # Project rules (empty by default)
│   └── settings.json            # Claude Code settings
└── skills/                      # Remaining pi skills (8)
    ├── adb-ui-tree/
    ├── github-issue-reader/
    ├── github-issue-searcher/
    ├── obsidian-link-archiver/
    ├── python-uv-setup/
    ├── sops-secret-editor/
    ├── stagehand-browser/
    └── uv-python-execution/
```

## Deployment

The extension is deployed to `~/.pi/agent/extensions/dotclaude/` via:
- **`pi-sync.sh`** — manual sync script
- **`home-module.nix`** — Nix home-manager activation

Both sync the extension files and run `npm install --omit=dev` for the Monty dependency.
