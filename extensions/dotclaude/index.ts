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
 * - Tool activity panel — floating TUI overlay with Spindle-style compact formatting
 *
 * Agents support tiered search: LSP + DeepWiki first, grep/glob as fallback.
 * Tools and model are scoped per-agent and restored after the agent turn completes.
 *
 * Based on the claude-rules.ts example pattern.
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { isToolCallEventType, truncateHead, DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, formatSize } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { Text, matchesKey, truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import type { Theme, TUI, OverlayHandle } from "@mariozechner/pi-tui";
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
  tools?: string; // raw: "LSP, Grep, Glob, LS"
  toolNames?: string[]; // parsed: ["lsp", "grep", "find", "ls"]
  model?: string; // e.g. "sonnet"
  thinking?: ThinkingLevel; // e.g. "high"
  color?: string; // e.g. "blue", "yellow"
}

interface ToolEntry {
  name: string;
  args: Record<string, any>;
  startTime: number;
  endTime?: number;
  status: "running" | "done" | "error";
  errorMsg?: string;
}

// ── Frontmatter Parser ─────────────────────────────────────────────

/**
 * Parse HumanLayer-style frontmatter.
 * Supports: name, description, tools, model, color
 */
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

// ── Tool Activity Formatting (Spindle-style) ───────────────────────

function fmtTool(name: string, args: Record<string, any>, theme: any): string {
  switch (name) {
    case "bash": {
      const raw = (args.command || "...") as string;
      // Skip shebangs, comments, set flags, empty lines — show the real command
      const realLines = raw.split("\n").filter(
        (l) => {
          const t = l.trim();
          return t && !t.startsWith("#") && !t.startsWith("set ") && t !== "set";
        }
      );
      const cmd = (realLines[0] || raw.split("\n")[0] || "...").trim();
      return (
        theme.fg("muted", "$ ") +
        theme.fg("toolOutput", cmd.length > 40 ? cmd.slice(0, 40) + "…" : cmd)
      );
    }
    case "read": {
      const p = (args.path || "…") as string;
      let t = theme.fg("muted", "read ") + theme.fg("accent", p);
      if (args.offset || args.limit)
        t += theme.fg(
          "dim",
          `:${args.offset ?? 1}${args.limit ? `-${(args.offset ?? 1) + args.limit - 1}` : ""}`
        );
      return t;
    }
    case "write":
      return theme.fg("muted", "write ") + theme.fg("accent", args.path || "…");
    case "edit":
      return theme.fg("muted", "edit ") + theme.fg("accent", args.path || "…");
    case "grep":
      return (
        theme.fg("muted", "grep ") +
        theme.fg("accent", `/${args.pattern || ""}/`) +
        theme.fg("dim", ` in ${args.path || "."}`)
      );
    case "find":
      return (
        theme.fg("muted", "find ") +
        theme.fg("accent", args.pattern || "*") +
        theme.fg("dim", ` in ${args.path || "."}`)
      );
    case "ls":
      return theme.fg("muted", "ls ") + theme.fg("accent", args.path || ".");
    case "lsp":
      return (
        theme.fg("muted", "lsp ") +
        theme.fg("accent", args.action || "…") +
        (args.query ? theme.fg("dim", ` "${args.query}"`) : "")
      );
    case "code_execute": {
      const n = ((args.code || "") as string).split("\n").length;
      return theme.fg("muted", "python ") + theme.fg("accent", `${n} lines`);
    }
    default: {
      const s = JSON.stringify(args);
      return (
        theme.fg("accent", name.replace("deepwiki_", "dw:")) +
        theme.fg("dim", ` ${s.length > 35 ? s.slice(0, 35) + "…" : s}`)
      );
    }
  }
}

// ── Tool Activity Panel Component ──────────────────────────────────

class ToolActivityPanel {
  private scrollOffset = 0;
  private codeLines: string[] = [];
  private codeCurrent = 0;

  constructor(
    private tui: TUI,
    private theme: Theme,
    private history: ToolEntry[],
    private skills: Set<string>,
    private done: () => void
  ) {}

  handleInput(data: string): void {
    if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
      this.done();
    } else if (matchesKey(data, "up")) {
      this.scrollOffset = Math.max(0, this.scrollOffset - 1);
      this.tui.requestRender();
    } else if (matchesKey(data, "down")) {
      this.scrollOffset++;
      this.tui.requestRender();
    }
  }

  updateCodeExec(lines: string[], currentLine: number) {
    this.codeLines = lines;
    this.codeCurrent = currentLine;
    this.tui.requestRender();
  }

  render(width: number): string[] {
    const th = this.theme;
    const W = Math.max(1, width - 2);
    const pad = (s: string) => truncateToWidth(s, W, "…", true);
    const bdr = (c: string) => th.fg("border", c);

    const out: string[] = [];

    // ── Header ──
    const running = this.history.filter((t) => t.status === "running").length;
    const done = this.history.filter((t) => t.status === "done").length;
    const errors = this.history.filter((t) => t.status === "error").length;
    const totalMs = this.history.reduce(
      (s, t) => s + ((t.endTime ?? Date.now()) - t.startTime),
      0
    );
    const stats = `${th.fg("dim", `${this.history.length}`)} · ${th.fg("dim", `${(totalMs / 1000).toFixed(1)}s`)}`;
    const headerTitle = " Tool Activity ";
    const headerRight = ` ${stats} `;
    const dashLen = Math.max(
      0,
      W - visibleWidth(headerTitle) - visibleWidth(headerRight)
    );
    out.push(
      bdr("╭") +
        th.fg("accent", headerTitle) +
        bdr("─".repeat(dashLen)) +
        th.fg("dim", headerRight) +
        bdr("╮")
    );

    // ── Loaded skills ──
    if (this.skills.size > 0) {
      const skillList = [...this.skills].sort().join(th.fg("dim", ", "));
      out.push(
        bdr("│") +
          pad(` ${th.fg("accent", "📚")} ${th.fg("muted", "Skills:")} ${skillList}`) +
          bdr("│")
      );
      out.push(bdr("├") + bdr("─".repeat(W)) + bdr("┤"));
    }

    // ── Counters bar ──
    const counters = [
      running > 0 ? th.fg("accent", `○ ${running} running`) : "",
      done > 0 ? th.fg("success", `✓ ${done}`) : "",
      errors > 0 ? th.fg("error", `✗ ${errors}`) : "",
    ]
      .filter(Boolean)
      .join(th.fg("dim", "  "));
    out.push(bdr("│") + pad(` ${counters}`) + bdr("│"));
    out.push(bdr("├") + bdr("─".repeat(W)) + bdr("┤"));

    // ── Tool history ──
    const maxVisible = 8;
    const endIdx = this.history.length - this.scrollOffset;
    const startIdx = Math.max(0, endIdx - maxVisible);
    const visible = this.history.slice(startIdx, endIdx > 0 ? endIdx : undefined);
    for (const t of visible) {
      const icon =
        t.status === "running"
          ? th.fg("accent", "○")
          : t.status === "error"
            ? th.fg("error", "✗")
            : th.fg("success", "✓");
      const elapsed = t.endTime
        ? th.fg("dim", `${((t.endTime - t.startTime) / 1000).toFixed(1)}s`)
        : th.fg("accent", "…");
      const toolStr = fmtTool(t.name, t.args, th);
      const left = ` ${icon} ${toolStr}`;
      const leftW = visibleWidth(left);
      const elapsedW = visibleWidth(elapsed);
      const gap = Math.max(1, W - leftW - elapsedW - 1);
      out.push(
        bdr("│") + pad(`${left}${" ".repeat(gap)}${elapsed} `) + bdr("│")
      );
      // Show error detail line for failed tools
      if (t.status === "error" && t.errorMsg) {
        const errLine = t.errorMsg.split("\n")[0] || "";
        out.push(
          bdr("│") + pad(`   ${th.fg("error", "↳ " + errLine)}`) + bdr("│")
        );
      }
    }

    if (visible.length === 0) {
      out.push(bdr("│") + pad(th.fg("dim", "  No tool calls yet")) + bdr("│"));
    }

    // ── Live code execution panel (ptc-next style) ──
    const codeExecEntry = this.history.find(
      (t) => t.name === "code_execute" && t.status === "running"
    );
    if (codeExecEntry && this.codeLines.length > 0) {
      out.push(bdr("├") + bdr("─".repeat(W)) + bdr("┤"));
      const codeHeader = ` ─── code_execute ${"─".repeat(Math.max(0, W - 22))}`;
      out.push(bdr("│") + pad(th.fg("muted", codeHeader)) + bdr("│"));

      const start = Math.max(0, this.codeCurrent - 3);
      const codeSlice = this.codeLines.slice(start, start + 6);
      for (let i = 0; i < codeSlice.length; i++) {
        const lineNum = start + i + 1;
        const isCurrent = lineNum === this.codeCurrent;
        const prefix = isCurrent
          ? th.fg("success", `→ ${String(lineNum).padStart(2)} │ `)
          : th.fg("muted", `  ${String(lineNum).padStart(2)} │ `);
        const content = isCurrent
          ? th.fg("text", codeSlice[i])
          : th.fg("muted", codeSlice[i]);
        out.push(bdr("│") + pad(` ${prefix}${content}`) + bdr("│"));
      }
    }

    // ── Footer ──
    const footerLabel = " Ctrl+Shift+A toggle ";
    const footerDash = Math.max(0, W - visibleWidth(footerLabel));
    out.push(
      bdr("╰") + bdr("─".repeat(footerDash)) + th.fg("dim", footerLabel) + bdr("╯")
    );

    return out;
  }

  invalidate(): void {}
}

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

  // Tool activity tracking
  const toolHistory: ToolEntry[] = [];

  // Skill loading tracking
  const loadedSkills = new Set<string>();

  // Overlay panel state
  let overlayHandle: OverlayHandle | null = null;
  let panelVisible = false;
  let panel: ToolActivityPanel | null = null;
  let firstToolOfTurn = true;

  // Session naming state
  let sessionNamed = false;

  // Active agent tracking (for consolidated notification + summary)
  let activeAgentName: string | null = null;
  let agentTurnToolCount = 0;

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
          agentTurnToolCount = 0;

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
        // thinkingLevel: explicit level string (preferred)
        if (
          settings.thinkingLevel &&
          VALID_THINKING_LEVELS.includes(settings.thinkingLevel)
        ) {
          pi.setThinkingLevel(settings.thinkingLevel);
        } else if (settings.alwaysThinkingEnabled) {
          // Legacy fallback: boolean → "high"
          pi.setThinkingLevel("high");
        }
      } catch {}
    }

    // Check if session already has a name
    if (pi.getSessionName()) sessionNamed = true;

    // ── Restore loaded skills from session history ──
    loadedSkills.clear();
    for (const entry of ctx.sessionManager.getBranch()) {
      if (
        entry.type === "custom" &&
        (entry as any).customType === "skill-tracker" &&
        (entry as any).data?.skill
      ) {
        loadedSkills.add((entry as any).data.skill);
      }
    }
  });

  // ── Session Auto-Naming ─────────────────────────────────────────

  pi.on("input", async (event, _ctx) => {
    if (sessionNamed || !event.text || event.source === "extension") return;

    // Skip slash commands — wait for a real user message
    if (event.text.startsWith("/")) return;

    // Take first 50 chars of the first real user message as session name
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
  });

  // ── System Prompt: Inject agent list + rules ──────────────────

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

    if (additions) {
      return { systemPrompt: event.systemPrompt + additions };
    }
  });

  // ── Detect skill loading via read tool ──────────────────────────

  pi.on("tool_call", async (event, _ctx) => {
    if (!isToolCallEventType("read", event)) return;
    const filePath = event.input.path;
    if (!filePath) return;

    const basename = path.basename(filePath);
    if (basename !== "SKILL.md") return;

    const skillName = path.basename(path.dirname(filePath));
    if (!skillName || skillName === "." || skillName === "..") return;

    if (!loadedSkills.has(skillName)) {
      loadedSkills.add(skillName);

      // Persist to session history
      pi.appendEntry("skill-tracker", {
        event: "skill_loaded",
        skill: skillName,
        skills: [...loadedSkills],
        timestamp: Date.now(),
      });
    }
  });

  // ── /history Command ────────────────────────────────────────────

  // Persistent history across turns (toolHistory is cleared each turn)
  const sessionToolLog: ToolEntry[] = [];

  pi.registerCommand("history", {
    description: "Show tool execution history for this session",
    handler: async (_args, ctx) => {
      if (sessionToolLog.length === 0) {
        ctx.ui.notify("No tool calls recorded yet", "info");
        return;
      }

      const theme = ctx.ui.theme;
      const lines: string[] = [];

      // Group by turn (separated by gaps > 2s between entries)
      let turnNum = 1;
      let turnStart = sessionToolLog[0].startTime;
      let turnTools = 0;
      let turnTime = 0;
      let turnErrors = 0;

      lines.push(theme.bold("Tool Execution History"));
      lines.push("");

      if (loadedSkills.size > 0) {
        const skillList = [...loadedSkills].sort().join(", ");
        lines.push(theme.fg("accent", `📚 Skills loaded: ${skillList}`));
        lines.push("");
      }

      for (let i = 0; i < sessionToolLog.length; i++) {
        const t = sessionToolLog[i];
        const prevEnd = i > 0 ? (sessionToolLog[i - 1].endTime ?? sessionToolLog[i - 1].startTime) : t.startTime;

        // New turn if gap > 5s
        if (i > 0 && t.startTime - prevEnd > 5000) {
          lines.push(
            theme.fg("dim", `  ─── turn ${turnNum}: ${turnTools} tools, ${(turnTime / 1000).toFixed(1)}s` +
            (turnErrors ? theme.fg("error", `, ${turnErrors} err`) : "") + ` ───`)
          );
          lines.push("");
          turnNum++;
          turnTools = 0;
          turnTime = 0;
          turnErrors = 0;
          turnStart = t.startTime;
        }

        turnTools++;
        const dur = (t.endTime ?? Date.now()) - t.startTime;
        turnTime += dur;
        if (t.status === "error") turnErrors++;

        const icon = t.status === "error"
          ? theme.fg("error", "✗")
          : theme.fg("success", "✓");
        const elapsed = theme.fg("dim", `${(dur / 1000).toFixed(1)}s`);
        const toolStr = fmtTool(t.name, t.args, theme);
        lines.push(`  ${icon} ${toolStr}  ${elapsed}`);

        if (t.status === "error" && t.errorMsg) {
          lines.push(`    ${theme.fg("error", "↳ " + t.errorMsg.split("\n")[0])}`);
        }
      }

      // Final turn summary
      lines.push(
        theme.fg("dim", `  ─── turn ${turnNum}: ${turnTools} tools, ${(turnTime / 1000).toFixed(1)}s` +
        (turnErrors ? theme.fg("error", `, ${turnErrors} err`) : "") + ` ───`)
      );
      lines.push("");

      // Totals
      const totalTime = sessionToolLog.reduce((s, t) => s + ((t.endTime ?? Date.now()) - t.startTime), 0);
      const totalErrors = sessionToolLog.filter(t => t.status === "error").length;
      lines.push(
        theme.bold(`Total: ${sessionToolLog.length} tools · ${(totalTime / 1000).toFixed(1)}s`) +
        (totalErrors ? theme.fg("error", ` · ${totalErrors} errors`) : "")
      );

      ctx.ui.notify(lines.join("\n"), "info");
    },
  });

  // ── Code Execute Tool (Pydantic Monty Sandbox) ────────────────

  // Lazy-load monty to avoid startup cost if never used
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
    maxMemory: 50 * 1024 * 1024, // 50MB
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

      // Build external functions — pi tools as async Python callables
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

        // Truncate if too large
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
        // Use display() for Monty errors if available
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

  // ── Tool Activity: Overlay Panel + Status Bar ─────────────────

  function showPanel(ctx: ExtensionCommandContext) {
    if (panelVisible) return;
    panelVisible = true;

    // Fire and forget — the overlay runs independently
    ctx.ui
      .custom<void>(
        (tui, theme, _kb, done) => {
          panel = new ToolActivityPanel(tui, theme, toolHistory, loadedSkills, () => {
            panelVisible = false;
            panel = null;
            overlayHandle = null;
            done();
          });
          return panel;
        },
        {
          overlay: true,
          overlayOptions: {
            anchor: "right-center" as const,
            width: "30%",
            minWidth: 38,
            maxHeight: "70%",
            margin: { right: 1, top: 2, bottom: 2 },
            visible: (termWidth: number) => termWidth >= 100,
          },
          onHandle: (handle: OverlayHandle) => {
            overlayHandle = handle;
          },
        }
      )
      .then(() => {
        // Overlay closed (user pressed escape)
        panelVisible = false;
        panel = null;
        overlayHandle = null;
      })
      .catch(() => {
        panelVisible = false;
        panel = null;
        overlayHandle = null;
      });
  }

  function hidePanel() {
    if (overlayHandle) {
      overlayHandle.hide();
      overlayHandle = null;
    }
    panelVisible = false;
    panel = null;
  }

  // Toggle shortcut
  pi.registerShortcut("ctrl+shift+a", {
    description: "Toggle tool activity panel",
    handler: async (ctx) => {
      if (panelVisible) {
        hidePanel();
      } else {
        showPanel(ctx as any);
      }
    },
  });

  // ── Tool execution events → status bar + panel ────────────────

  pi.on("tool_execution_start", async (event, ctx) => {
    const entry: ToolEntry = {
      name: event.toolName,
      args: event.args ?? {},
      startTime: Date.now(),
      status: "running",
    };
    toolHistory.push(entry);
    if (toolHistory.length > 50) toolHistory.shift();

    // Auto-show panel on first tool call of a turn
    if (firstToolOfTurn && ctx.hasUI) {
      firstToolOfTurn = false;
      showPanel(ctx as any);
    }

    // Status bar — always visible
    if (ctx.hasUI) {
      const theme = ctx.ui.theme;
      ctx.ui.setStatus(
        "tool-activity",
        theme.fg("accent", "○ ") +
          fmtTool(event.toolName, event.args ?? {}, theme)
      );
    }

    // Re-render panel
    if (panel) {
      try {
        panel["tui"]?.requestRender?.();
      } catch {}
    }
  });

  pi.on("tool_execution_end", async (event, ctx) => {
    const entry = [...toolHistory]
      .reverse()
      .find((t) => t.name === event.toolName && t.status === "running");
    if (entry) {
      entry.endTime = Date.now();
      entry.status = event.isError ? "error" : "done";
      if (event.isError && event.result) {
        // Extract error text from result content
        const texts = (event.result.content || [])
          .filter((c: any) => c.type === "text")
          .map((c: any) => c.text);
        entry.errorMsg = texts.join("\n").slice(0, 120);
      }
    }
    agentTurnToolCount++;

    if (ctx.hasUI) {
      const theme = ctx.ui.theme;
      const icon = event.isError
        ? theme.fg("error", "✗ ")
        : theme.fg("success", "✓ ");
      const elapsed = entry
        ? ` ${((entry.endTime! - entry.startTime) / 1000).toFixed(1)}s`
        : "";
      ctx.ui.setStatus(
        "tool-activity",
        icon + theme.fg("dim", event.toolName + elapsed)
      );
    }

    if (panel) {
      try {
        panel["tui"]?.requestRender?.();
      } catch {}
    }
  });

  // Agent start → reset for new turn
  pi.on("agent_start", async (_event, _ctx) => {
    firstToolOfTurn = true;
  });

  // Agent end → summary + auto-dismiss
  pi.on("agent_end", async (_event, ctx) => {
    const total = toolHistory.length;
    const errors = toolHistory.filter((t) => t.status === "error").length;
    const totalTime = toolHistory.reduce(
      (s, t) => s + ((t.endTime ?? Date.now()) - t.startTime),
      0
    );

    if (ctx.hasUI && total > 0) {
      const theme = ctx.ui.theme;

      // Status bar summary
      ctx.ui.setStatus(
        "tool-activity",
        `${theme.fg("success", "✓")} ${theme.fg("dim", `${total} tools · ${(totalTime / 1000).toFixed(1)}s`)}` +
          (errors ? theme.fg("error", ` · ${errors} err`) : "")
      );

      // Agent turn summary notification (#5)
      if (activeAgentName) {
        const errText = errors ? ` · ${errors} errors` : "";
        ctx.ui.notify(
          `✓ ${activeAgentName} done: ${total} tools in ${(totalTime / 1000).toFixed(1)}s${errText}`,
          errors ? "warning" : "info"
        );
      }
    }

    activeAgentName = null;
    agentTurnToolCount = 0;

    // Auto-hide panel 3s after agent completes
    setTimeout(() => {
      if (panelVisible) {
        hidePanel();
      }
    }, 3000);

    // Persist to session log before clearing turn history
    sessionToolLog.push(...toolHistory.map((t) => ({ ...t })));
    if (sessionToolLog.length > 200) sessionToolLog.splice(0, sessionToolLog.length - 200);
    toolHistory.length = 0;
  });
}
