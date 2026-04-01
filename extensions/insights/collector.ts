/**
 * Insights — Data Collection & Persistence
 *
 * Collects session data from pi events and persists to ~/.pi/insights/sessions/
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { isToolCallEventType } from "@mariozechner/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";
import type { AggregatedStats, SessionRecord, ToolCallRecord } from "./types.js";
import { extToLanguage } from "./types.js";

const INSIGHTS_DIR = path.join(
  process.env.HOME || process.env.USERPROFILE || "~",
  ".pi",
  "insights",
  "sessions"
);

function ensureDir() {
  fs.mkdirSync(INSIGHTS_DIR, { recursive: true });
}

function writeSession(record: SessionRecord) {
  ensureDir();
  const filename = `${record.sessionId}.json`;
  fs.writeFileSync(
    path.join(INSIGHTS_DIR, filename),
    JSON.stringify(record, null, 2)
  );
}

export function loadAllSessions(days?: number): SessionRecord[] {
  ensureDir();
  const files = fs.readdirSync(INSIGHTS_DIR).filter((f) => f.endsWith(".json"));
  const cutoff = days ? Date.now() - days * 86400000 : 0;

  const sessions: SessionRecord[] = [];
  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(INSIGHTS_DIR, file), "utf-8");
      const record: SessionRecord = JSON.parse(raw);
      if (record.startTime >= cutoff) {
        sessions.push(record);
      }
    } catch {
      // skip corrupt files
    }
  }

  return sessions.sort((a, b) => a.startTime - b.startTime);
}

export function clearSessions() {
  ensureDir();
  const files = fs.readdirSync(INSIGHTS_DIR).filter((f) => f.endsWith(".json"));
  for (const file of files) {
    fs.unlinkSync(path.join(INSIGHTS_DIR, file));
  }
  return files.length;
}

export function aggregate(sessions: SessionRecord[]): AggregatedStats {
  if (sessions.length === 0) {
    return {
      startDate: "",
      endDate: "",
      sessions: 0,
      messages: 0,
      agentTurns: 0,
      totalToolCalls: 0,
      toolUsage: {},
      toolErrors: {},
      totalErrors: 0,
      filesTouched: 0,
      languages: {},
      skillsUsed: {},
      totalSessionTime: 0,
      totalToolTime: 0,
      avgResponseTime: 0,
      medianResponseTime: 0,
      responseTimeBuckets: {},
      messagesByHour: {},
      msgsPerSession: 0,
      activeDays: 0,
      msgsPerDay: 0,
      sessionRecords: [],
    };
  }

  const toolUsage: Record<string, number> = {};
  const toolErrors: Record<string, number> = {};
  const languages: Record<string, number> = {};
  const skillsUsed: Record<string, number> = {};
  const messagesByHour: Record<number, number> = {};
  const allResponseTimes: number[] = [];
  const allFiles = new Set<string>();
  const activeDays = new Set<string>();

  let totalMessages = 0;
  let totalAgentTurns = 0;
  let totalToolCalls = 0;
  let totalErrors = 0;
  let totalSessionTime = 0;
  let totalToolTime = 0;

  for (const session of sessions) {
    totalMessages += session.userMessages;
    totalAgentTurns += session.agentTurns;
    totalSessionTime += session.endTime - session.startTime;

    // Active days
    activeDays.add(new Date(session.startTime).toISOString().slice(0, 10));

    // Tool usage
    for (const tc of session.toolCalls) {
      toolUsage[tc.name] = (toolUsage[tc.name] || 0) + 1;
      totalToolCalls++;
      totalToolTime += tc.duration;

      if (!tc.success) {
        toolErrors[tc.name] = (toolErrors[tc.name] || 0) + 1;
        totalErrors++;
      }

      // Message time distribution
      const hour = new Date(tc.timestamp).getHours();
      messagesByHour[hour] = (messagesByHour[hour] || 0) + 1;
    }

    // Files
    for (const f of session.filesTouched) {
      allFiles.add(f);
    }

    // Languages
    for (const [lang, count] of Object.entries(session.languages)) {
      languages[lang] = (languages[lang] || 0) + count;
    }

    // Skills
    for (const skill of session.skillsLoaded) {
      skillsUsed[skill] = (skillsUsed[skill] || 0) + 1;
    }

    // Response times
    allResponseTimes.push(...session.userResponseTimes);
  }

  // Response time stats
  allResponseTimes.sort((a, b) => a - b);
  const avgResponseTime =
    allResponseTimes.length > 0
      ? allResponseTimes.reduce((s, t) => s + t, 0) / allResponseTimes.length
      : 0;
  const medianResponseTime =
    allResponseTimes.length > 0
      ? allResponseTimes[Math.floor(allResponseTimes.length / 2)]
      : 0;

  // Response time buckets
  const buckets: Record<string, number> = {
    "< 5s": 0,
    "5-15s": 0,
    "15-30s": 0,
    "30s-1m": 0,
    "1-2m": 0,
    "2-5m": 0,
    "> 5m": 0,
  };
  for (const t of allResponseTimes) {
    if (t < 5000) buckets["< 5s"]++;
    else if (t < 15000) buckets["5-15s"]++;
    else if (t < 30000) buckets["15-30s"]++;
    else if (t < 60000) buckets["30s-1m"]++;
    else if (t < 120000) buckets["1-2m"]++;
    else if (t < 300000) buckets["2-5m"]++;
    else buckets["> 5m"]++;
  }

  const startDate = new Date(sessions[0].startTime).toISOString().slice(0, 10);
  const endDate = new Date(sessions[sessions.length - 1].startTime)
    .toISOString()
    .slice(0, 10);

  return {
    startDate,
    endDate,
    sessions: sessions.length,
    messages: totalMessages,
    agentTurns: totalAgentTurns,
    totalToolCalls,
    toolUsage,
    toolErrors,
    totalErrors,
    filesTouched: allFiles.size,
    languages,
    skillsUsed,
    totalSessionTime,
    totalToolTime,
    avgResponseTime,
    medianResponseTime,
    responseTimeBuckets: buckets,
    messagesByHour,
    msgsPerSession: totalMessages / sessions.length,
    activeDays: activeDays.size,
    msgsPerDay:
      activeDays.size > 0 ? totalMessages / activeDays.size : totalMessages,
    sessionRecords: sessions,
  };
}

// ── Session Collector (wired to pi events) ──────────────────

export function setupCollector(pi: ExtensionAPI) {
  let currentSession: Partial<SessionRecord> = {};
  let pendingTools = new Map<
    string,
    { name: string; startTime: number; filePath?: string }
  >();
  let lastAgentEndTime: number | undefined;
  let skillsSet = new Set<string>();

  function extractFilePath(event: any): string | undefined {
    const input = event.input || event.args;
    if (!input) return undefined;
    return input.path || input.filePath || undefined;
  }

  pi.on("session_start", async (_event, ctx) => {
    const sessionFile = ctx.sessionManager.getSessionFile?.() ?? `ephemeral-${Date.now()}`;
    currentSession = {
      sessionId: path.basename(sessionFile, ".json"),
      startTime: Date.now(),
      userMessages: 0,
      agentTurns: 0,
      toolCalls: [],
      filesTouched: [],
      languages: {},
      skillsLoaded: [],
      userResponseTimes: [],
      cwd: ctx.cwd,
    };
    pendingTools.clear();
    skillsSet.clear();
    lastAgentEndTime = undefined;
  });

  pi.on("input", async (_event, _ctx) => {
    currentSession.userMessages = (currentSession.userMessages ?? 0) + 1;

    // Track response time from last agent_end
    if (lastAgentEndTime) {
      const responseTime = Date.now() - lastAgentEndTime;
      currentSession.userResponseTimes?.push(responseTime);
      lastAgentEndTime = undefined;
    }

    return { action: "continue" as const };
  });

  pi.on("agent_start", async (_event, _ctx) => {
    currentSession.agentTurns = (currentSession.agentTurns ?? 0) + 1;
  });

  pi.on("agent_end", async (_event, _ctx) => {
    lastAgentEndTime = Date.now();
  });

  // Detect skill loading via SKILL.md reads
  pi.on("tool_call", async (event, _ctx) => {
    if (!isToolCallEventType("read", event)) return;
    const filePath = event.input.path;
    if (!filePath) return;
    if (path.basename(filePath) === "SKILL.md") {
      const skillName = path.basename(path.dirname(filePath));
      if (skillName && skillName !== "." && skillName !== "..") {
        skillsSet.add(skillName);
      }
    }
  });

  pi.on("tool_execution_start", async (event, _ctx) => {
    const filePath = extractFilePath(event);
    pendingTools.set(event.toolCallId, {
      name: event.toolName,
      startTime: Date.now(),
      filePath,
    });

    // Track file
    if (filePath) {
      const files = currentSession.filesTouched ?? [];
      if (!files.includes(filePath)) {
        files.push(filePath);
        currentSession.filesTouched = files;

        // Track language
        const ext = path.extname(filePath);
        const lang = extToLanguage(ext);
        if (lang) {
          const langs = currentSession.languages ?? {};
          langs[lang] = (langs[lang] || 0) + 1;
          currentSession.languages = langs;
        }
      }
    }
  });

  pi.on("tool_execution_end", async (event, _ctx) => {
    const pending = pendingTools.get(event.toolCallId);
    if (!pending) return;

    const record: ToolCallRecord = {
      name: pending.name,
      duration: Date.now() - pending.startTime,
      success: !event.isError,
      timestamp: pending.startTime,
      filePath: pending.filePath,
    };

    if (event.isError && event.result) {
      const texts = (event.result.content || [])
        .filter((c: any) => c.type === "text")
        .map((c: any) => c.text);
      record.errorMsg = texts.join("\n").slice(0, 200);
    }

    currentSession.toolCalls?.push(record);
    pendingTools.delete(event.toolCallId);
  });

  // Save session data on shutdown or session switch
  function saveCurrentSession() {
    if (!currentSession.sessionId || !currentSession.startTime) return;
    if ((currentSession.toolCalls?.length ?? 0) === 0 && (currentSession.userMessages ?? 0) === 0) return;

    const record: SessionRecord = {
      sessionId: currentSession.sessionId!,
      startTime: currentSession.startTime!,
      endTime: Date.now(),
      userMessages: currentSession.userMessages ?? 0,
      agentTurns: currentSession.agentTurns ?? 0,
      toolCalls: currentSession.toolCalls ?? [],
      filesTouched: currentSession.filesTouched ?? [],
      languages: currentSession.languages ?? {},
      skillsLoaded: [...skillsSet],
      userResponseTimes: currentSession.userResponseTimes ?? [],
      cwd: currentSession.cwd ?? process.cwd(),
    };

    try {
      writeSession(record);
    } catch {
      // silently fail
    }
  }

  pi.on("session_shutdown", async (_event, _ctx) => {
    saveCurrentSession();
  });

  pi.on("session_before_switch", async (_event, _ctx) => {
    saveCurrentSession();
  });

  return { saveCurrentSession };
}
