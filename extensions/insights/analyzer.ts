/**
 * Insights — Actionable Analyzer
 *
 * Reads raw JSONL session files from ~/.pi/agent/sessions/ and generates
 * actionable insights about prompting, skills, tooling, and efficiency.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";
import { extToLanguage } from "./types.js";

// ── Types ──

export type InsightCategory = "prompting" | "skill" | "tooling" | "efficiency" | "workflow";
export type InsightSeverity = "info" | "suggestion" | "warning";

export interface ActionableInsight {
  category: InsightCategory;
  severity: InsightSeverity;
  emoji: string;
  title: string;
  description: string;
  evidence: string[];
  action: string;
}

interface ParsedSession {
  sessionId: string;
  project: string;
  startTime: number;
  endTime: number;
  userMessages: UserMessage[];
  agentTurns: number;
  toolCalls: ParsedToolCall[];
  toolErrors: ParsedToolError[];
  skillsLoaded: string[];
  bashCommands: string[];
  curlUrls: string[];
  filesRead: Record<string, number>;
}

interface UserMessage {
  text: string;
  timestamp: number;
  charLength: number;
}

interface ParsedToolCall {
  name: string;
  timestamp: number;
  filePath?: string;
}

interface ParsedToolError {
  toolName: string;
  errorMsg: string;
  timestamp: number;
}

// ── JSONL Parser ──

const RAW_SESSIONS_DIR = path.join(
  process.env.HOME || "~",
  ".pi",
  "agent",
  "sessions"
);

async function parseRawSession(filePath: string): Promise<ParsedSession | null> {
  const stream = fs.createReadStream(filePath, { encoding: "utf-8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  const events: any[] = [];
  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line.trim()));
    } catch {
      // skip
    }
  }

  if (events.length === 0) return null;

  const sessionEvent = events.find((e) => e.type === "session");
  if (!sessionEvent) return null;

  const sessionId = sessionEvent.id;
  const project = path.basename(path.dirname(filePath));
  const startTime = new Date(sessionEvent.timestamp).getTime();

  const userMessages: UserMessage[] = [];
  let agentTurns = 0;
  const toolCalls: ParsedToolCall[] = [];
  const toolErrors: ParsedToolError[] = [];
  const skillsLoaded = new Set<string>();
  const bashCommands: string[] = [];
  const curlUrls: string[] = [];
  const filesRead: Record<string, number> = {};
  let lastTimestamp = startTime;

  for (const event of events) {
    if (event.type !== "message") continue;
    const msg = event.message;
    if (!msg) continue;

    const timestamp = new Date(event.timestamp).getTime();
    lastTimestamp = Math.max(lastTimestamp, timestamp);
    const role = msg.role;

    if (role === "user") {
      let text = "";
      const content = msg.content;
      if (Array.isArray(content)) {
        for (const b of content) {
          if (b?.type === "text") text += b.text || "";
        }
      } else if (typeof content === "string") {
        text = content;
      }
      if (text.trim()) {
        userMessages.push({ text, timestamp, charLength: text.trim().length });
      }
    }

    if (role === "assistant") {
      agentTurns++;
      const content = msg.content;
      if (Array.isArray(content)) {
        for (const b of content) {
          if (b?.type === "toolCall") {
            const name = b.name || "";
            const args = b.arguments || {};
            const filePath = typeof args === "object" ? args.path || args.filePath : undefined;

            toolCalls.push({ name, timestamp, filePath });

            // Track file reads
            if (name === "read" && filePath) {
              filesRead[filePath] = (filesRead[filePath] || 0) + 1;
              if (path.basename(filePath) === "SKILL.md") {
                const skillName = path.basename(path.dirname(filePath));
                if (skillName && skillName !== "." && skillName !== "..") {
                  skillsLoaded.add(skillName);
                }
              }
            }

            // Track bash commands
            if (name === "bash" && typeof args === "object" && args.command) {
              bashCommands.push(args.command);
              if (args.command.includes("curl") && args.command.includes("http")) {
                const urls = args.command.match(/https?:\/\/[^\s"']+/g) || [];
                curlUrls.push(...urls);
              }
            }
          }
        }
      }
    }

    if (role === "toolResult") {
      if (msg.isError) {
        let errorText = "";
        if (Array.isArray(msg.content)) {
          errorText = msg.content
            .filter((c: any) => c.type === "text")
            .map((c: any) => c.text)
            .join("\n")
            .slice(0, 300);
        } else if (typeof msg.content === "string") {
          errorText = msg.content.slice(0, 300);
        }
        toolErrors.push({
          toolName: msg.toolName || "",
          errorMsg: errorText,
          timestamp,
        });
      }
    }
  }

  if (userMessages.length === 0 && toolCalls.length === 0) return null;

  return {
    sessionId,
    project,
    startTime,
    endTime: lastTimestamp,
    userMessages,
    agentTurns,
    toolCalls,
    toolErrors,
    skillsLoaded: [...skillsLoaded],
    bashCommands,
    curlUrls,
    filesRead,
  };
}

// ── Insight Generators ──

const CORRECTION_SIGNALS = [
  "no,", "not what", "wrong", "actually,", "instead,",
  "that's not", "don't do", "shouldn't have", "wait,", "nope",
  "incorrect", "i said", "i meant", "not like that", "try again",
  "that's wrong", "no that", "not right",
];

function analyzePromptingPatterns(sessions: ParsedSession[]): ActionableInsight[] {
  const insights: ActionableInsight[] = [];

  // 1. Correction rate
  let totalCorrections = 0;
  let totalUserMsgs = 0;
  const correctionExamples: string[] = [];

  for (const s of sessions) {
    for (const msg of s.userMessages) {
      totalUserMsgs++;
      const lower = msg.text.toLowerCase();
      if (CORRECTION_SIGNALS.some((sig) => lower.includes(sig))) {
        totalCorrections++;
        if (correctionExamples.length < 5) {
          correctionExamples.push(
            `"${msg.text.trim().slice(0, 80)}${msg.text.length > 80 ? "…" : ""}"`
          );
        }
      }
    }
  }

  const correctionRate = totalUserMsgs > 0 ? totalCorrections / totalUserMsgs : 0;
  if (correctionRate > 0.02) {
    insights.push({
      category: "prompting",
      severity: correctionRate > 0.08 ? "warning" : "suggestion",
      emoji: "🔄",
      title: `${(correctionRate * 100).toFixed(1)}% of messages are corrections`,
      description:
        `${totalCorrections}/${totalUserMsgs} messages correct the agent. ` +
        `This suggests prompts could be more specific upfront.`,
      evidence: correctionExamples,
      action:
        "Include expected format, constraints, and non-obvious context in your initial prompt. " +
        "Use prompt templates (/prompt) for recurring tasks.",
    });
  }

  // 2. Short prompt ratio
  const shortMsgs = sessions.flatMap((s) =>
    s.userMessages.filter((m) => m.charLength < 30 && m.charLength > 0)
  );
  const shortRatio = totalUserMsgs > 0 ? shortMsgs.length / totalUserMsgs : 0;
  if (shortRatio > 0.15) {
    const examples = shortMsgs
      .slice(0, 6)
      .map((m) => `"${m.text.trim().slice(0, 50)}"`);
    insights.push({
      category: "prompting",
      severity: "suggestion",
      emoji: "📝",
      title: `${(shortRatio * 100).toFixed(0)}% of prompts are very short (<30 chars)`,
      description:
        `${shortMsgs.length} of ${totalUserMsgs} messages are very brief. ` +
        `Short prompts often lead to multiple rounds of clarification.`,
      evidence: examples,
      action:
        "Add context about what you want, where, and how. " +
        "Even 1-2 extra sentences can save several correction rounds. " +
        "Consider creating pi prompt templates for recurring patterns.",
    });
  }

  // 3. Prompt length distribution shift
  const short = sessions.flatMap((s) => s.userMessages.filter((m) => m.charLength < 30)).length;
  const medium = sessions.flatMap((s) => s.userMessages.filter((m) => m.charLength >= 30 && m.charLength < 200)).length;
  const long = sessions.flatMap((s) => s.userMessages.filter((m) => m.charLength >= 200)).length;
  if (totalUserMsgs > 10) {
    insights.push({
      category: "prompting",
      severity: "info",
      emoji: "📊",
      title: "Prompt length breakdown",
      description:
        `Short (<30): ${short} (${Math.round((100 * short) / totalUserMsgs)}%) · ` +
        `Medium (30-200): ${medium} (${Math.round((100 * medium) / totalUserMsgs)}%) · ` +
        `Detailed (200+): ${long} (${Math.round((100 * long) / totalUserMsgs)}%)`,
      evidence: [],
      action:
        "The sweet spot is medium-length prompts with clear intent. " +
        "Very long prompts can be split into steps; very short ones often need follow-ups.",
    });
  }

  return insights;
}

function analyzeSkillPatterns(sessions: ParsedSession[]): ActionableInsight[] {
  const insights: ActionableInsight[] = [];

  // Skill usage frequency
  const skillUsage: Record<string, number> = {};
  const skillErrorCounts: Record<string, number> = {};

  for (const s of sessions) {
    for (const skill of s.skillsLoaded) {
      skillUsage[skill] = (skillUsage[skill] || 0) + 1;
    }
    // Count errors in sessions where skills were loaded
    if (s.skillsLoaded.length > 0) {
      for (const err of s.toolErrors) {
        for (const skill of s.skillsLoaded) {
          skillErrorCounts[skill] = (skillErrorCounts[skill] || 0) + 1;
        }
      }
    }
  }

  // 1. High-error skills
  const highErrorSkills = Object.entries(skillUsage)
    .map(([skill, uses]) => ({
      skill,
      uses,
      errors: skillErrorCounts[skill] || 0,
      errorRate: (skillErrorCounts[skill] || 0) / Math.max(uses, 1),
    }))
    .filter((s) => s.errors > 10 && s.uses >= 3)
    .sort((a, b) => b.errorRate - a.errorRate);

  if (highErrorSkills.length > 0) {
    const evidence = highErrorSkills
      .slice(0, 5)
      .map((s) => `${s.skill}: ${s.errors} errors across ${s.uses} uses`);
    insights.push({
      category: "skill",
      severity: "warning",
      emoji: "⚠️",
      title: "Skills with high error rates during their sessions",
      description:
        "These skills are loaded in sessions that have many tool errors. " +
        "The skill instructions may need refinement or the workflows they guide may be fragile.",
      evidence,
      action:
        "Review these skill SKILL.md files for unclear instructions, " +
        "missing error handling guidance, or outdated tool patterns. " +
        "Consider adding fallback instructions.",
    });
  }

  // 2. Skill candidates from repeated tool sequences
  const toolBigrams: Record<string, number> = {};
  const toolTrigrams: Record<string, number> = {};
  for (const s of sessions) {
    const names = s.toolCalls.map((t) => t.name);
    for (let i = 0; i < names.length - 1; i++) {
      const key = `${names[i]}→${names[i + 1]}`;
      toolBigrams[key] = (toolBigrams[key] || 0) + 1;
    }
    for (let i = 0; i < names.length - 2; i++) {
      const key = `${names[i]}→${names[i + 1]}→${names[i + 2]}`;
      toolTrigrams[key] = (toolTrigrams[key] || 0) + 1;
    }
  }

  const topTrigrams = Object.entries(toolTrigrams)
    .sort((a, b) => b[1] - a[1])
    .filter(([key]) => !key.includes("bash→bash→bash")) // exclude trivial
    .slice(0, 5);

  if (topTrigrams.length > 0) {
    const evidence = topTrigrams.map(([key, count]) => `${count}x ${key}`);
    insights.push({
      category: "skill",
      severity: "info",
      emoji: "🔗",
      title: "Most common tool sequences (potential skill candidates)",
      description:
        "These tool patterns repeat frequently. Encoding them as skills " +
        "or prompt templates could save time and reduce errors.",
      evidence,
      action:
        "Create skills for your most common workflows. For example, " +
        "a 'read→edit→bash' sequence for a specific file type could become a skill.",
    });
  }

  return insights;
}

function analyzeToolingOpportunities(sessions: ParsedSession[]): ActionableInsight[] {
  const insights: ActionableInsight[] = [];

  // 1. Bash command patterns
  const bashPatterns: Record<string, number> = {};
  const allBashCmds: string[] = [];
  for (const s of sessions) {
    allBashCmds.push(...s.bashCommands);
    for (const cmd of s.bashCommands) {
      const base = cmd.trim().split(/\s+/)[0] || "";
      if (["find", "ls", "grep", "cat", "head", "tail", "wc"].includes(base)) {
        bashPatterns[base] = (bashPatterns[base] || 0) + 1;
      } else if (cmd.includes("curl")) {
        bashPatterns["curl"] = (bashPatterns["curl"] || 0) + 1;
      } else if (cmd.includes("git")) {
        bashPatterns["git"] = (bashPatterns["git"] || 0) + 1;
      } else if (cmd.includes("python")) {
        bashPatterns["python"] = (bashPatterns["python"] || 0) + 1;
      } else if (cmd.includes("nix")) {
        bashPatterns["nix"] = (bashPatterns["nix"] || 0) + 1;
      } else if (cmd.includes("jq")) {
        bashPatterns["jq"] = (bashPatterns["jq"] || 0) + 1;
      }
    }
  }

  // Suggest replacing bash with native tools
  const nativeToolReplacements: Record<string, string> = {
    "find": "find tool (native, faster, respects .gitignore)",
    "grep": "grep tool (native, faster, respects .gitignore)",
    "ls": "ls tool (native, faster)",
    "cat": "read tool (native, with offset/limit)",
  };

  const replaceable = Object.entries(bashPatterns)
    .filter(([cmd]) => cmd in nativeToolReplacements)
    .sort((a, b) => b[1] - a[1]);

  if (replaceable.length > 0 && replaceable.reduce((s, [, c]) => s + c, 0) > 50) {
    const evidence = replaceable.map(
      ([cmd, count]) => `${count}x bash ${cmd} → use ${nativeToolReplacements[cmd]}`
    );
    insights.push({
      category: "tooling",
      severity: "suggestion",
      emoji: "🔧",
      title: "Bash commands that have native tool equivalents",
      description:
        "Many bash commands are being used instead of pi's native tools, " +
        "which are faster and respect .gitignore.",
      evidence,
      action:
        "Update your workflow/skills to prefer native tools (read, grep, find, ls) " +
        "over bash equivalents. Native tools also have better error handling.",
    });
  }

  // 2. URL/API patterns → MCP opportunities
  const domainCounts: Record<string, number> = {};
  for (const s of sessions) {
    for (const url of s.curlUrls) {
      try {
        const domain = new URL(url).hostname;
        domainCounts[domain] = (domainCounts[domain] || 0) + 1;
      } catch {
        // skip
      }
    }
  }

  const frequentDomains = Object.entries(domainCounts)
    .filter(([domain, count]) => count >= 10 && !domain.includes("localhost"))
    .sort((a, b) => b[1] - a[1]);

  if (frequentDomains.length > 0) {
    const evidence = frequentDomains
      .slice(0, 8)
      .map(([domain, count]) => `${count}x ${domain}`);
    insights.push({
      category: "tooling",
      severity: "suggestion",
      emoji: "🌐",
      title: "Frequently accessed APIs → MCP server candidates",
      description:
        "These domains are accessed frequently via curl. " +
        "Creating MCP servers or dedicated tools for them would be more reliable and faster.",
      evidence,
      action:
        "Consider creating MCP servers for your most-used APIs. " +
        "For GitHub (api.github.com), use the official GitHub MCP server. " +
        "For Exa, create a simple MCP wrapper. " +
        "For documentation sites, consider a DeepWiki MCP or local caching.",
    });
  }

  return insights;
}

function analyzeEfficiency(sessions: ParsedSession[]): ActionableInsight[] {
  const insights: ActionableInsight[] = [];

  // 1. File re-reads across sessions
  const globalReads: Record<string, number> = {};
  for (const s of sessions) {
    for (const [file, count] of Object.entries(s.filesRead)) {
      globalReads[file] = (globalReads[file] || 0) + count;
    }
  }

  const heavyReads = Object.entries(globalReads)
    .filter(([, count]) => count > 10)
    .sort((a, b) => b[1] - a[1]);

  if (heavyReads.length > 0) {
    const evidence = heavyReads
      .slice(0, 8)
      .map(([file, count]) => `${count}x ${path.basename(file)}`);

    const totalWastedReads = heavyReads.reduce((s, [, c]) => s + c - 1, 0);
    insights.push({
      category: "efficiency",
      severity: "suggestion",
      emoji: "📖",
      title: `~${totalWastedReads} redundant file reads across sessions`,
      description:
        "These files are read repeatedly. This wastes context window tokens " +
        "and slows down responses.",
      evidence,
      action:
        "For frequently-read config files, consider adding key content to AGENTS.md or skills. " +
        "For plan files, use context_tag to bookmark progress instead of re-reading. " +
        "For skills, they're auto-loaded — no need to read them again mid-session.",
    });
  }

  // 2. Tool error hotspots
  const errorsByTool: Record<string, number> = {};
  const errorExamples: Record<string, string[]> = {};
  for (const s of sessions) {
    for (const err of s.toolErrors) {
      errorsByTool[err.toolName] = (errorsByTool[err.toolName] || 0) + 1;
      if (!errorExamples[err.toolName]) errorExamples[err.toolName] = [];
      if (errorExamples[err.toolName].length < 3 && err.errorMsg) {
        errorExamples[err.toolName].push(err.errorMsg.slice(0, 100));
      }
    }
  }

  const totalErrors = Object.values(errorsByTool).reduce((s, c) => s + c, 0);
  if (totalErrors > 20) {
    const evidence = Object.entries(errorsByTool)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tool, count]) => {
        const ex = errorExamples[tool]?.[0];
        return `${count}x ${tool}${ex ? ` (e.g., "${ex.slice(0, 60)}…")` : ""}`;
      });
    insights.push({
      category: "efficiency",
      severity: totalErrors > 200 ? "warning" : "suggestion",
      emoji: "💥",
      title: `${totalErrors} tool errors across sessions`,
      description:
        "Tool errors waste time and tokens on retries. " +
        "Most errors come from bash commands (permissions, wrong paths, fish/bash conflicts).",
      evidence,
      action:
        "For bash errors: ensure scripts use bash syntax (not fish). " +
        "For read/edit errors: verify file paths exist before operating. " +
        "Consider adding error handling instructions to your skills.",
    });
  }

  // 3. High agent-turn-per-message sessions
  const highTurnSessions = sessions
    .filter((s) => s.userMessages.length > 0)
    .map((s) => ({
      id: s.sessionId.slice(0, 8),
      project: s.project.replace("--Users-pratos-", "").replace("--", "/"),
      ratio: s.agentTurns / s.userMessages.length,
      msgs: s.userMessages.length,
      turns: s.agentTurns,
    }))
    .filter((s) => s.ratio > 20 && s.msgs >= 2)
    .sort((a, b) => b.ratio - a.ratio);

  if (highTurnSessions.length > 3) {
    const evidence = highTurnSessions.slice(0, 5).map(
      (s) => `${s.ratio.toFixed(0)} turns/msg in ${s.project} (${s.msgs} msgs, ${s.turns} turns)`
    );
    insights.push({
      category: "efficiency",
      severity: "info",
      emoji: "⚡",
      title: `${highTurnSessions.length} sessions with very high autonomy (>20 turns/msg)`,
      description:
        "In these sessions, the agent did a lot of work per user message. " +
        "This is efficient if the output was correct, but may indicate " +
        "the agent going off-track on complex tasks.",
      evidence,
      action:
        "For complex tasks, break them into smaller prompts. " +
        "Use /agent:create-implementation-plan for multi-step work. " +
        "Add checkpoints with context_tag between major steps.",
    });
  }

  return insights;
}

function analyzeWorkflow(sessions: ParsedSession[]): ActionableInsight[] {
  const insights: ActionableInsight[] = [];

  // 1. Project distribution
  const projectSessions: Record<string, number> = {};
  const projectMsgs: Record<string, number> = {};
  for (const s of sessions) {
    const name = s.project.replace("--Users-pratos-", "").replace(/--/g, "/").replace(/-$/, "");
    projectSessions[name] = (projectSessions[name] || 0) + 1;
    projectMsgs[name] = (projectMsgs[name] || 0) + s.userMessages.length;
  }

  const sortedProjects = Object.entries(projectMsgs).sort((a, b) => b[1] - a[1]);
  if (sortedProjects.length > 1) {
    const evidence = sortedProjects
      .slice(0, 8)
      .map(([proj, msgs]) => `${msgs} msgs across ${projectSessions[proj]} sessions in ${proj}`);
    insights.push({
      category: "workflow",
      severity: "info",
      emoji: "📁",
      title: `Active across ${sortedProjects.length} projects`,
      description: "Your pi usage is spread across these projects.",
      evidence,
      action:
        "Consider creating project-specific AGENTS.md files with architecture notes " +
        "for your most active projects. This helps the agent be more effective from the start.",
    });
  }

  // 2. Session fragmentation
  const shortSessions = sessions.filter(
    (s) => s.userMessages.length <= 2 && s.toolCalls.length < 10
  );
  const fragRatio = sessions.length > 0 ? shortSessions.length / sessions.length : 0;
  if (fragRatio > 0.2 && shortSessions.length > 10) {
    insights.push({
      category: "workflow",
      severity: "suggestion",
      emoji: "🧩",
      title: `${(fragRatio * 100).toFixed(0)}% of sessions are very short (≤2 messages)`,
      description:
        `${shortSessions.length} of ${sessions.length} sessions had minimal interaction. ` +
        "This may indicate frequent session restarts or context loss.",
      evidence: [
        `${shortSessions.length} short sessions vs ${sessions.length - shortSessions.length} substantial ones`,
      ],
      action:
        "Use /session to resume existing sessions instead of starting fresh. " +
        "Use context_tag to bookmark progress before stopping. " +
        "Combine related quick tasks into single sessions.",
    });
  }

  // 3. Language diversity
  const langCounts: Record<string, number> = {};
  for (const s of sessions) {
    for (const tc of s.toolCalls) {
      if (tc.filePath) {
        const ext = path.extname(tc.filePath);
        const lang = extToLanguage(ext);
        if (lang) langCounts[lang] = (langCounts[lang] || 0) + 1;
      }
    }
  }

  const sortedLangs = Object.entries(langCounts).sort((a, b) => b[1] - a[1]);
  if (sortedLangs.length > 0) {
    const evidence = sortedLangs.slice(0, 8).map(([lang, count]) => `${count}x ${lang}`);
    insights.push({
      category: "workflow",
      severity: "info",
      emoji: "🗣️",
      title: `Working in ${sortedLangs.length} languages`,
      description: "Your language distribution across all sessions.",
      evidence,
      action:
        "Ensure you have linting/type-checking skills for your top languages. " +
        "Consider language-specific AGENTS.md sections for coding conventions.",
    });
  }

  return insights;
}

// ── Main Analysis Entry Point ──

export async function generateInsights(days?: number): Promise<ActionableInsight[]> {
  // Load raw sessions
  const sessions: ParsedSession[] = [];
  const cutoff = days ? Date.now() - days * 86400000 : 0;

  if (!fs.existsSync(RAW_SESSIONS_DIR)) return [];

  const projectDirs = fs.readdirSync(RAW_SESSIONS_DIR).filter((d) => {
    try {
      return fs.statSync(path.join(RAW_SESSIONS_DIR, d)).isDirectory();
    } catch {
      return false;
    }
  });

  for (const dir of projectDirs) {
    const dirPath = path.join(RAW_SESSIONS_DIR, dir);
    let files: string[];
    try {
      files = fs.readdirSync(dirPath).filter((f) => f.endsWith(".jsonl"));
    } catch {
      continue;
    }

    for (const file of files) {
      try {
        const parsed = await parseRawSession(path.join(dirPath, file));
        if (parsed && parsed.startTime >= cutoff) {
          sessions.push(parsed);
        }
      } catch {
        // skip
      }
    }
  }

  if (sessions.length === 0) return [];

  sessions.sort((a, b) => a.startTime - b.startTime);

  // Run all analyzers
  const insights: ActionableInsight[] = [
    ...analyzePromptingPatterns(sessions),
    ...analyzeSkillPatterns(sessions),
    ...analyzeToolingOpportunities(sessions),
    ...analyzeEfficiency(sessions),
    ...analyzeWorkflow(sessions),
  ];

  // Sort: warnings first, then suggestions, then info
  const severityOrder: Record<InsightSeverity, number> = {
    warning: 0,
    suggestion: 1,
    info: 2,
  };
  insights.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return insights;
}
