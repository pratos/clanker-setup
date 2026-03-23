/**
 * dotclaude — .claude/ Directory Extension for Pi
 *
 * Discovers .claude/ directory and registers:
 * - commands/ → /name commands
 * - agents/ → /agent:name commands (with HumanLayer-style frontmatter: name, description, tools, model, color)
 * - rules/ → system prompt injection
 * - settings.json → thinking level, etc.
 *
 * Also provides:
 * - code_execute tool — sandboxed Python via Pydantic Monty (external functions = pi tools)
 *
 * Agents support tiered search: LSP + DeepWiki first, grep/glob as fallback.
 * Tools and model are scoped per-agent and restored after the agent turn completes.
 *
 * Based on the claude-rules.ts example pattern.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { truncateHead, DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, formatSize } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { Text } from "@mariozechner/pi-tui";
import * as fs from "node:fs";
import * as path from "node:path";

// ── Types ──────────────────────────────────────────────────────────

interface ParsedMarkdown {
  meta: Record<string, string>;
  body: string;
}

type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

const VALID_THINKING_LEVELS: ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh"];

interface AgentMeta {
  name: string;
  description: string;
  body: string;
  tools?: string;
  toolNames?: string[];
  model?: string;
  thinking?: ThinkingLevel;
  color?: string;
}

// ── Frontmatter Parser ─────────────────────────────────────────────

function parseFrontmatter(content: string): ParsedMarkdown {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: content };
  const meta: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx > 0) meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return { meta, body: match[2] };
}

// ── File Discovery ─────────────────────────────────────────────────

function findMarkdownFiles(
  dir: string
): Array<{ name: string; relPath: string; fullPath: string }> {
  if (!fs.existsSync(dir)) return [];
  const results: Array<{
    name: string;
    relPath: string;
    fullPath: string;
  }> = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      for (const sub of findMarkdownFiles(fullPath)) {
        results.push({ ...sub, relPath: `${entry.name}/${sub.relPath}` });
      }
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      results.push({
        name: entry.name.replace(/\.md$/, ""),
        relPath: entry.name,
        fullPath,
      });
    }
  }
  return results;
}

// ── Tool Name Mapping (Agent Frontmatter → Pi) ────────────────────────────

const TOOL_NAME_MAP: Record<string, string> = {
  grep: "grep",
  Grep: "grep",
  glob: "find",
  Glob: "find",
  ls: "ls",
  LS: "ls",
  read: "read",
  Read: "read",
  write: "write",
  Write: "write",
  edit: "edit",
  Edit: "edit",
  bash: "bash",
  Bash: "bash",
  lsp: "lsp",
  LSP: "lsp",
  find: "find",
  Find: "find",
  deepwiki: "deepwiki_ask_question",
  DeepWiki: "deepwiki_ask_question",
  deepwiki_read_wiki_structure: "deepwiki_read_wiki_structure",
  deepwiki_read_wiki_contents: "deepwiki_read_wiki_contents",
  deepwiki_ask_question: "deepwiki_ask_question",
  code_execute: "code_execute",
  CodeExecute: "code_execute",
};

function parseToolsList(toolsStr: string | undefined): string[] | undefined {
  if (!toolsStr) return undefined;
  const names = toolsStr
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const mapped = names.map((n) => TOOL_NAME_MAP[n]).filter(Boolean);
  return mapped.length > 0 ? mapped : undefined;
}

// ── Model Mapping ──────────────────────────────────────────────────

const MODEL_MAP: Record<string, { provider: string; pattern: RegExp }> = {
  opus: { provider: "anthropic", pattern: /opus/i },
  sonnet: { provider: "anthropic", pattern: /sonnet/i },
  haiku: { provider: "anthropic", pattern: /haiku/i },
};

// ── Extension Entry Point ──────────────────────────────────────────

export default function dotclaudeExtension(pi: ExtensionAPI) {
  let claudeDir = "";
  let commands: Array<{ name: string; description: string; body: string }> = [];
  let agents: AgentMeta[] = [];
  let ruleFiles: string[] = [];

  // Tool/model/thinking restore state
  let savedTools: string[] | undefined;
  let savedModel: any = undefined;
  let savedThinking: ThinkingLevel | undefined;

  // Session naming state
  let sessionNamed = false;

  // Active agent tracking (for consolidated notification + summary)
  let activeAgentName: string | null = null;

  // ── Session Start: Discover .claude/ ──────────────────────────

  pi.on("session_start", async (_event, ctx) => {
    claudeDir = path.join(ctx.cwd, ".claude");
    if (!fs.existsSync(claudeDir)) return;

    // ── Discover commands ──
    const cmdDir = path.join(claudeDir, "commands");
    commands = findMarkdownFiles(cmdDir).map((f) => {
      const content = fs.readFileSync(f.fullPath, "utf-8");
      const { meta, body } = parseFrontmatter(content);
      return { name: f.name, description: meta.description || f.name, body };
    });

    for (const cmd of commands) {
      pi.registerCommand(cmd.name, {
        description: cmd.description,
        handler: async (args) => {
          const prompt =
            cmd.body + (args ? `\n\nAdditional context: ${args}` : "");
          pi.sendUserMessage(prompt);
        },
      });
    }

    // ── Discover agents (HumanLayer frontmatter) ──
    const agentDir = path.join(claudeDir, "agents");
    agents = findMarkdownFiles(agentDir).map((f) => {
      const content = fs.readFileSync(f.fullPath, "utf-8");
      const { meta, body } = parseFrontmatter(content);
      return {
        name: meta.name || f.name,
        description: meta.description || f.name,
        body,
        tools: meta.tools,
        toolNames: parseToolsList(meta.tools),
        model: meta.model,
        thinking: VALID_THINKING_LEVELS.includes(meta.thinking as ThinkingLevel)
          ? (meta.thinking as ThinkingLevel)
          : undefined,
        color: meta.color,
      };
    });

    for (const agent of agents) {
      pi.registerCommand(`agent:${agent.name}`, {
        description: agent.description,
        handler: async (args, ctx) => {
          const configParts: string[] = [];

          // ── Save and scope tools ──
          if (agent.toolNames) {
            savedTools = pi.getActiveTools();
            pi.setActiveTools(agent.toolNames);
            configParts.push(`${agent.toolNames.length} tools`);
          }

          // ── Save and set model ──
          if (agent.model) {
            const mapping = MODEL_MAP[agent.model.toLowerCase()];
            if (mapping) {
              const allModels = ctx.modelRegistry.getModels();
              const match = allModels.find(
                (m: any) =>
                  m.provider === mapping.provider &&
                  mapping.pattern.test(m.id)
              );
              if (match) {
                savedModel = ctx.model;
                const ok = await pi.setModel(match);
                if (ok) configParts.push(agent.model);
              }
            }
          }

          // ── Save and set thinking level ──
          if (agent.thinking) {
            savedThinking = pi.getThinkingLevel() as ThinkingLevel;
            pi.setThinkingLevel(agent.thinking);
            configParts.push(`thinking:${agent.thinking}`);
          }

          // ── Consolidated notification ──
          if (ctx.hasUI && configParts.length > 0) {
            ctx.ui.notify(
              `▸ ${agent.name} [${configParts.join(", ")}]`,
              "info"
            );
          }

          // ── Track active agent ──
          activeAgentName = agent.name;

          // ── Send agent prompt ──
          const prompt =
            agent.body + (args ? `\n\nTask: ${args}` : "");
          pi.sendUserMessage(prompt);
        },
      });
    }

    // ── Discover rules ──
    const rulesDir = path.join(claudeDir, "rules");
    ruleFiles = findMarkdownFiles(rulesDir).map((f) => f.relPath);

    // ── Apply settings ──
    const settingsPath = path.join(claudeDir, "settings.json");
    if (fs.existsSync(settingsPath)) {
      try {
        const settings = JSON.parse(
          fs.readFileSync(settingsPath, "utf-8")
        );
        if (
          settings.thinkingLevel &&
          VALID_THINKING_LEVELS.includes(settings.thinkingLevel)
        ) {
          pi.setThinkingLevel(settings.thinkingLevel);
        } else if (settings.alwaysThinkingEnabled) {
          pi.setThinkingLevel("high");
        }
      } catch {}
    }

    // Check if session already has a name
    if (pi.getSessionName()) sessionNamed = true;
  });

  // ── Session Auto-Naming ─────────────────────────────────────────

  pi.on("input", async (event, _ctx) => {
    if (sessionNamed || !event.text || event.source === "extension") return;
    if (event.text.startsWith("/")) return;

    const text = event.text.trim();
    if (text.length > 0) {
      const name = text.length > 50 ? text.slice(0, 50) + "…" : text;
      pi.setSessionName(name);
      sessionNamed = true;
    }
  });

  // ── Restore tools/model after agent turn ──────────────────────

  pi.on("agent_end", async (_event, _ctx) => {
    if (savedTools) {
      pi.setActiveTools(savedTools);
      savedTools = undefined;
    }
    if (savedModel) {
      await pi.setModel(savedModel);
      savedModel = undefined;
    }
    if (savedThinking) {
      pi.setThinkingLevel(savedThinking);
      savedThinking = undefined;
    }
    activeAgentName = null;
  });

  // ── System Prompt: Inject agent list + rules ──────────────────

  // ── Track files already read this session (for intercept logic) ──
  const filesReadThisSession = new Set<string>();
  let turnReadCount = 0;

  pi.on("agent_start", async () => {
    turnReadCount = 0;
  });

  pi.on("before_agent_start", async (event) => {
    let additions = "";

    if (commands.length > 0) {
      const cmdList = commands
        .map((c) => `- /${c.name} — ${c.description}`)
        .join("\n");
      additions += `\n\n## Available Commands\n\nThe following slash commands are available. When a user's request matches a command's purpose, suggest they use it or invoke it directly:\n\n${cmdList}\n`;
    }

    if (agents.length > 0) {
      const agentList = agents
        .map((a) => {
          let line = `- /agent:${a.name} — ${a.description}`;
          if (a.tools) line += ` [tools: ${a.tools}]`;
          if (a.model) line += ` [model: ${a.model}]`;
          if (a.thinking) line += ` [thinking: ${a.thinking}]`;
          return line;
        })
        .join("\n");
      additions += `\n\n## Available Sub-Agents\n\nYou can suggest the user invoke these specialized agents:\n\n${agentList}\n`;
    }

    if (ruleFiles.length > 0) {
      const rulesList = ruleFiles
        .map((f) => `- .claude/rules/${f}`)
        .join("\n");
      additions += `\n\n## Project Rules\n\nThe following project rules are available in .claude/rules/:\n\n${rulesList}\n\nWhen working on tasks related to these rules, use the read tool to load the relevant rule files for guidance.\n`;
    }

    // ── Search strategy guidance ──
    additions += `\n\n## Search Strategy

When you need to find or understand code, prefer targeted tools over reading entire files:

1. **grep/find first** — Use \`grep\` for pattern matching and \`find\` for file discovery
2. **code_execute for batch ops** — Use Python sandbox for multi-file analysis (3+ lookups)
3. **read with offset/limit** — When you know the file, read only the relevant section
4. **Avoid full-file reads for exploration** — Reading an entire unfamiliar file wastes context. Use grep to find the relevant lines first, then read with offset/limit.

If you find yourself wanting to grep/find/read more than twice, use \`/agent:codebase-locator\` or \`code_execute\` instead.\n`;

    if (additions) {
      return { systemPrompt: event.systemPrompt + additions };
    }
  });

  // ── Auto-intercept: catch exploratory full-file reads ──────────

  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "read") return;

    const filePath = (event.input as any).path as string | undefined;
    const offset = (event.input as any).offset as number | undefined;
    const limit = (event.input as any).limit as number | undefined;

    if (!filePath) return;

    // Allow: reads with offset/limit (targeted), image files, small config files
    if (offset || limit) return;

    const ext = path.extname(filePath).toLowerCase();

    // Allow: images, configs, markdown — these are fine to read fully
    const allowedExts = new Set([
      ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg",
      ".json", ".yaml", ".yml", ".toml", ".ini", ".env",
      ".md", ".txt", ".lock",
    ]);
    if (allowedExts.has(ext)) return;

    // Allow: files we've already read this session (re-reads are intentional)
    const resolved = path.resolve(ctx.cwd, filePath);
    if (filesReadThisSession.has(resolved)) return;

    // Track this read
    filesReadThisSession.add(resolved);
    turnReadCount++;

    // Check file size — only intercept large files (>200 lines)
    try {
      const stat = fs.statSync(resolved);
      if (stat.size < 5000) return; // ~200 lines, let small files through
    } catch {
      return; // file doesn't exist, let the read tool handle the error
    }

    // If this is the 3rd+ full-file read this turn, nudge harder
    if (turnReadCount >= 3 && ctx.hasUI) {
      ctx.ui.setStatus(
        "search-hint",
        "💡 Multiple full reads — consider grep, code_execute, or /agent:codebase-locator"
      );
    }
  });

  // ── Code Execute Tool (Pydantic Monty Sandbox) ────────────────

  let montyModule: any = null;
  function getMonty() {
    if (!montyModule) {
      try {
        montyModule = require("@pydantic/monty");
      } catch (e) {
        throw new Error(
          "code_execute requires @pydantic/monty. Run: cd ~/.pi/agent/extensions/dotclaude && npm install"
        );
      }
    }
    return montyModule;
  }

  const MONTY_LIMITS = {
    maxAllocations: 500_000,
    maxMemory: 50 * 1024 * 1024,
    maxDurationSecs: 60,
    maxRecursionDepth: 100,
  };

  pi.registerTool({
    name: "code_execute",
    label: "Code Execute",
    description: `Execute Python in a sandboxed interpreter (Pydantic Monty).
Prefer this for repo-wide analysis, repeated lookups, loops, grouping, ranking, counting,
filtering, or any task with 3+ dependent tool calls. Avoids model round-trips.
Code runs in a secure sandbox — only the tool helpers below are available.

Available helpers (call as regular functions, async is handled automatically):
  read(path, offset=None, limit=None) → str     Read a file
  grep(pattern, path=".") → str                 Search with ripgrep
  find(pattern, path=".") → str                 Find files by glob
  ls(path=".") → str                            List directory
  bash(command, timeout=30) → str               Run shell command
  write(path, content) → str                    Write a file
  edit(path, old_text, new_text) → str           Edit a file
  cwd: str                                      Current working directory

State does NOT persist across calls. Each call is a fresh script.
No 'import' or 'await' — just call helpers directly. Use loops for iteration.

Example:
  files = find("*.ts", "src").strip().splitlines()
  results = [read(f) for f in files[:20]]
  todos = [(f, c.count("TODO")) for f, c in zip(files, results) if "TODO" in c]
  for name, count in sorted(todos, key=lambda x: -x[1])[:10]:
      print(f"{name}: {count} TODOs")`,

    parameters: Type.Object({
      code: Type.String({
        description: "Python code to execute (call helpers directly, no import/await needed)",
      }),
    }),

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const { Monty, runMontyAsync } = getMonty();
      let nestedCalls = 0;
      let printOutput = "";
      const startTime = Date.now();

      const externalFunctions: Record<
        string,
        (...args: any[]) => Promise<string>
      > = {
        read: async (filePath: string, offset?: number, limit?: number) => {
          nestedCalls++;
          const resolved = path.resolve(ctx.cwd, String(filePath));
          const result = await pi.exec("cat", [resolved], {
            signal,
            timeout: 30000,
          });
          let lines = result.stdout.split("\n");
          if (offset) lines = lines.slice(offset - 1);
          if (limit) lines = lines.slice(0, limit);
          return lines.join("\n");
        },
        grep: async (pattern: string, searchPath = ".") => {
          nestedCalls++;
          const resolved = path.resolve(ctx.cwd, String(searchPath));
          const result = await pi.exec(
            "rg",
            ["-n", "--no-heading", String(pattern), resolved],
            { signal, timeout: 30000 }
          );
          return result.stdout;
        },
        find: async (pattern: string, searchPath = ".") => {
          nestedCalls++;
          const resolved = path.resolve(ctx.cwd, String(searchPath));
          const result = await pi.exec(
            "find",
            [resolved, "-name", String(pattern), "-type", "f"],
            { signal, timeout: 30000 }
          );
          return result.stdout;
        },
        ls: async (dirPath = ".") => {
          nestedCalls++;
          const resolved = path.resolve(ctx.cwd, String(dirPath));
          const result = await pi.exec("ls", ["-la", resolved], {
            signal,
            timeout: 30000,
          });
          return result.stdout;
        },
        bash: async (command: string, timeout = 30) => {
          nestedCalls++;
          const result = await pi.exec("bash", ["-c", String(command)], {
            signal,
            timeout: Number(timeout) * 1000,
            cwd: ctx.cwd,
          });
          return (
            result.stdout + (result.stderr ? `\nSTDERR: ${result.stderr}` : "")
          );
        },
        write: async (filePath: string, content: string) => {
          nestedCalls++;
          const resolved = path.resolve(ctx.cwd, String(filePath));
          const dir = path.dirname(resolved);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(resolved, String(content));
          return `Written: ${filePath}`;
        },
        edit: async (
          filePath: string,
          oldText: string,
          newText: string
        ) => {
          nestedCalls++;
          const resolved = path.resolve(ctx.cwd, String(filePath));
          if (!fs.existsSync(resolved))
            return `Error: file not found: ${filePath}`;
          const content = fs.readFileSync(resolved, "utf-8");
          if (!content.includes(String(oldText)))
            return `Error: old_text not found in ${filePath}`;
          fs.writeFileSync(
            resolved,
            content.replace(String(oldText), String(newText))
          );
          return `Edited: ${filePath}`;
        },
      };

      try {
        const m = new Monty(params.code, { inputs: ["cwd"] });

        const result = await runMontyAsync(m, {
          inputs: { cwd: ctx.cwd },
          limits: MONTY_LIMITS,
          externalFunctions,
          printCallback: (_stream: string, text: string) => {
            printOutput += text;
          },
        });

        const elapsed = Date.now() - startTime;
        const resultStr =
          result !== undefined && result !== null
            ? `\n${typeof result === "string" ? result : JSON.stringify(result, null, 2)}`
            : "";
        let output = (printOutput + resultStr).trim();

        const truncation = truncateHead(output, {
          maxLines: DEFAULT_MAX_LINES,
          maxBytes: DEFAULT_MAX_BYTES,
        });
        if (truncation.truncated) {
          output = truncation.content;
          output += `\n\n[Output truncated: ${truncation.outputLines} of ${truncation.totalLines} lines (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)})]`;
        }

        return {
          content: [{ type: "text", text: output || "(no output)" }],
          details: {
            durationMs: elapsed,
            nestedCalls,
            sandbox: "monty",
            code: params.code,
          },
        };
      } catch (err: any) {
        const elapsed = Date.now() - startTime;
        const errMsg =
          typeof err.display === "function"
            ? err.display("traceback")
            : err.message;
        return {
          content: [
            {
              type: "text",
              text: `Error: ${errMsg}\n${printOutput}`.trim(),
            },
          ],
          details: {
            durationMs: elapsed,
            nestedCalls,
            sandbox: "monty",
            error: true,
            code: params.code,
          },
          isError: true,
        };
      }
    },

    renderCall(args, theme) {
      const lines = (args.code || "").split("\n");
      const preview = lines.slice(0, 8);
      let text =
        theme.fg("toolTitle", theme.bold("code_execute")) +
        theme.fg("dim", " [monty]") +
        "\n";
      for (const line of preview) text += "  " + theme.fg("toolOutput", line) + "\n";
      if (lines.length > 8)
        text += theme.fg("muted", `  … +${lines.length - 8} lines`);
      return new Text(text.trimEnd(), 0, 0);
    },

    renderResult(result, { expanded }, theme) {
      const details = result.details as
        | {
            durationMs?: number;
            nestedCalls?: number;
            error?: boolean;
            code?: string;
          }
        | undefined;
      const textContent = result.content
        .filter((c): c is { type: "text"; text: string } => c.type === "text")
        .map((c) => c.text)
        .join("\n");
      const isError = result.isError || details?.error;

      let text = isError
        ? theme.fg("error", "✗ Error")
        : theme.fg("success", "✓");
      if (details?.durationMs)
        text +=
          " " + theme.fg("dim", `${(details.durationMs / 1000).toFixed(1)}s`);
      if (details?.nestedCalls)
        text +=
          " " + theme.fg("dim", `${details.nestedCalls} tool calls`);
      text += "\n";

      const lines = textContent.split("\n");
      const max = expanded ? lines.length : 20;
      text += lines
        .slice(0, max)
        .map((l) => theme.fg("toolOutput", l))
        .join("\n");
      if (lines.length > max)
        text +=
          "\n" +
          theme.fg("muted", `… ${lines.length - max} more lines (Ctrl+O)`);
      return new Text(text, 0, 0);
    },
  });
}
