/**
 * Mission Control — Tabbed Panel
 *
 * Unified dashboard opened via Ctrl+Shift+M with four tabs:
 *   1. Sessions — running pi instances
 *   2. Breakdown — 7/30/90d session stats (heatmap, cost, model breakdown)
 *   3. History — tool execution history for current session
 *   4. Context — current context window breakdown
 *
 * Navigation:
 *   Tab / 1-4  — switch tabs
 *   ←/→        — within breakdown: change time range
 *   ↑/↓        — scroll within a tab
 *   q/Esc      — close
 */

import type { ExtensionAPI, ExtensionContext, ExtensionCommandContext, Theme } from "@mariozechner/pi-coding-agent";
import type { TUI } from "@mariozechner/pi-tui";
import { matchesKey, Key, truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { execSync } from "node:child_process";
import { basename, join } from "node:path";
import { readdirSync, statSync, readFileSync, createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import readline from "node:readline";
import os from "node:os";
import path from "node:path";
import type { MissionControlState, PiSession, SessionStatus } from "./state.js";
import { shortenPath, formatDuration, formatTokens, formatCost } from "./utils.js";
import type { ToolEntry } from "./activity-panel.js";
import { fmtTool } from "./activity-panel.js";

// ════════════════════════════════════════════════════════════════════
//  Session Breakdown types and logic (inlined from session-breakdown)
// ════════════════════════════════════════════════════════════════════

type ModelKey = string;

interface ParsedSession {
	filePath: string;
	startedAt: Date;
	dayKeyLocal: string;
	modelsUsed: Set<ModelKey>;
	messages: number;
	tokens: number;
	totalCost: number;
	costByModel: Map<ModelKey, number>;
	messagesByModel: Map<ModelKey, number>;
	tokensByModel: Map<ModelKey, number>;
}

interface DayAgg {
	date: Date;
	dayKeyLocal: string;
	sessions: number;
	messages: number;
	tokens: number;
	totalCost: number;
	costByModel: Map<ModelKey, number>;
	sessionsByModel: Map<ModelKey, number>;
	messagesByModel: Map<ModelKey, number>;
	tokensByModel: Map<ModelKey, number>;
}

interface RangeAgg {
	days: DayAgg[];
	dayByKey: Map<string, DayAgg>;
	sessions: number;
	totalMessages: number;
	totalTokens: number;
	totalCost: number;
	modelCost: Map<ModelKey, number>;
	modelSessions: Map<ModelKey, number>;
	modelMessages: Map<ModelKey, number>;
	modelTokens: Map<ModelKey, number>;
}

interface RGB { r: number; g: number; b: number; }

interface BreakdownData {
	generatedAt: Date;
	ranges: Map<number, RangeAgg>;
	palette: {
		modelColors: Map<ModelKey, RGB>;
		otherColor: RGB;
		orderedModels: ModelKey[];
	};
}

type MeasurementMode = "sessions" | "messages" | "tokens";

const SESSION_ROOT = path.join(os.homedir(), ".pi", "agent", "sessions");
const RANGE_DAYS = [7, 30, 90] as const;
const DEFAULT_BG: RGB = { r: 13, g: 17, b: 23 };
const EMPTY_CELL_BG: RGB = { r: 22, g: 27, b: 34 };
const PALETTE: RGB[] = [
	{ r: 64, g: 196, b: 99 },
	{ r: 47, g: 129, b: 247 },
	{ r: 163, g: 113, b: 247 },
	{ r: 255, g: 159, b: 10 },
	{ r: 244, g: 67, b: 54 },
];

function clamp01(x: number) { return Math.max(0, Math.min(1, x)); }
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function mixRgb(a: RGB, b: RGB, t: number): RGB {
	return { r: Math.round(lerp(a.r, b.r, t)), g: Math.round(lerp(a.g, b.g, t)), b: Math.round(lerp(a.b, b.b, t)) };
}

function weightedMix(colors: Array<{ color: RGB; weight: number }>): RGB {
	let total = 0, r = 0, g = 0, b = 0;
	for (const c of colors) {
		if (!Number.isFinite(c.weight) || c.weight <= 0) continue;
		total += c.weight; r += c.color.r * c.weight; g += c.color.g * c.weight; b += c.color.b * c.weight;
	}
	if (total <= 0) return EMPTY_CELL_BG;
	return { r: Math.round(r / total), g: Math.round(g / total), b: Math.round(b / total) };
}

function ansiFg(rgb: RGB, text: string) { return `\x1b[38;2;${rgb.r};${rgb.g};${rgb.b}m${text}\x1b[0m`; }
function dim(text: string) { return `\x1b[2m${text}\x1b[0m`; }
function bold(text: string) { return `\x1b[1m${text}\x1b[0m`; }
function formatCountBD(n: number): string {
	if (!Number.isFinite(n) || n === 0) return "0";
	if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 10_000) return `${(n / 1_000).toFixed(1)}K`;
	return n.toLocaleString("en-US");
}
function formatUsd(cost: number) {
	if (!Number.isFinite(cost)) return "$0.00";
	if (cost >= 1) return `${cost.toFixed(2)}`;
	if (cost >= 0.1) return `${cost.toFixed(3)}`;
	return `${cost.toFixed(4)}`;
}
function padRight(s: string, n: number) { const d = n - s.length; return d > 0 ? s + " ".repeat(d) : s; }
function padLeft(s: string, n: number) { const d = n - s.length; return d > 0 ? " ".repeat(d) + s : s; }
function toLocalDayKey(d: Date) {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function localMidnight(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0); }
function addDaysLocal(d: Date, days: number) { const x = new Date(d); x.setDate(x.getDate() + days); return x; }
function countDaysInclusiveLocal(start: Date, end: Date) {
	let n = 0; for (let d = new Date(start); d <= end; d = addDaysLocal(d, 1)) n++; return n;
}
function mondayIndex(date: Date) { return (date.getDay() + 6) % 7; }

function modelKeyFromParts(provider?: unknown, model?: unknown): ModelKey | null {
	const p = typeof provider === "string" ? provider.trim() : "";
	const m = typeof model === "string" ? model.trim() : "";
	if (!p && !m) return null;
	if (!p) return m;
	if (!m) return p;
	return `${p}/${m}`;
}

function parseSessionStartFromFilename(name: string): Date | null {
	const m = name.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z_/);
	if (!m) return null;
	const iso = `${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`;
	const d = new Date(iso);
	return Number.isFinite(d.getTime()) ? d : null;
}

function extractCostTotal(usage: any): number {
	if (!usage) return 0;
	const c = usage?.cost;
	if (typeof c === "number") return Number.isFinite(c) ? c : 0;
	if (typeof c === "string") { const n = Number(c); return Number.isFinite(n) ? n : 0; }
	const t = c?.total;
	if (typeof t === "number") return Number.isFinite(t) ? t : 0;
	if (typeof t === "string") { const n = Number(t); return Number.isFinite(n) ? n : 0; }
	return 0;
}

function extractTokensTotal(usage: any): number {
	if (!usage) return 0;
	const readNum = (v: any) => {
		if (typeof v === "number") return Number.isFinite(v) ? v : 0;
		if (typeof v === "string") { const n = Number(v); return Number.isFinite(n) ? n : 0; }
		return 0;
	};
	let total = readNum(usage?.totalTokens) || readNum(usage?.total_tokens) || readNum(usage?.tokens) || readNum(usage?.tokenCount);
	if (total > 0) return total;
	total = readNum(usage?.tokens?.total) || readNum(usage?.tokens?.totalTokens);
	if (total > 0) return total;
	const a = readNum(usage?.promptTokens) || readNum(usage?.prompt_tokens) || readNum(usage?.inputTokens) || readNum(usage?.input_tokens);
	const b = readNum(usage?.completionTokens) || readNum(usage?.completion_tokens) || readNum(usage?.outputTokens) || readNum(usage?.output_tokens);
	return a + b > 0 ? a + b : 0;
}

async function walkSessionFiles(root: string, startCutoffLocal: Date, signal?: AbortSignal): Promise<string[]> {
	const out: string[] = [];
	const stack: string[] = [root];
	while (stack.length) {
		if (signal?.aborted) break;
		const dir = stack.pop()!;
		let entries: any[] = [];
		try { entries = await readdir(dir, { withFileTypes: true }); } catch { continue; }
		for (const ent of entries) {
			if (signal?.aborted) break;
			const p = path.join(dir, ent.name);
			if (ent.isDirectory()) { stack.push(p); continue; }
			if (!ent.isFile() || !ent.name.endsWith(".jsonl")) continue;
			const startedAt = parseSessionStartFromFilename(ent.name);
			if (startedAt) {
				if (localMidnight(startedAt) >= startCutoffLocal) out.push(p);
				continue;
			}
			try { const st = await stat(p); if (localMidnight(new Date(st.mtimeMs)) >= startCutoffLocal) out.push(p); } catch {}
		}
	}
	return out;
}

async function parseSessionFile(filePath: string, signal?: AbortSignal): Promise<ParsedSession | null> {
	let startedAt = parseSessionStartFromFilename(path.basename(filePath));
	let currentModel: ModelKey | null = null;
	const modelsUsed = new Set<ModelKey>();
	let messages = 0, tokens = 0, totalCost = 0;
	const costByModel = new Map<ModelKey, number>();
	const messagesByModel = new Map<ModelKey, number>();
	const tokensByModel = new Map<ModelKey, number>();

	const stream = createReadStream(filePath, { encoding: "utf8" });
	const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
	try {
		for await (const line of rl) {
			if (signal?.aborted) { rl.close(); stream.destroy(); return null; }
			if (!line) continue;
			let obj: any;
			try { obj = JSON.parse(line); } catch { continue; }
			if (!startedAt && obj?.type === "session" && typeof obj?.timestamp === "string") {
				const d = new Date(obj.timestamp);
				if (Number.isFinite(d.getTime())) startedAt = d;
				continue;
			}
			if (obj?.type === "model_change") {
				const mk = modelKeyFromParts(obj.provider, obj.modelId);
				if (mk) { currentModel = mk; modelsUsed.add(mk); }
				continue;
			}
			if (obj?.type !== "message") continue;
			const msg = obj?.message;
			const provider = obj?.provider ?? msg?.provider;
			const model = obj?.model ?? msg?.model;
			const modelId = obj?.modelId ?? msg?.modelId;
			const usage = obj?.usage ?? msg?.usage;
			const mk = modelKeyFromParts(provider, model) ?? modelKeyFromParts(provider, modelId) ?? currentModel ?? "unknown";
			modelsUsed.add(mk);
			messages += 1;
			messagesByModel.set(mk, (messagesByModel.get(mk) ?? 0) + 1);
			const tok = extractTokensTotal(usage);
			if (tok > 0) { tokens += tok; tokensByModel.set(mk, (tokensByModel.get(mk) ?? 0) + tok); }
			const cost = extractCostTotal(usage);
			if (cost > 0) { totalCost += cost; costByModel.set(mk, (costByModel.get(mk) ?? 0) + cost); }
		}
	} finally { rl.close(); stream.destroy(); }
	if (!startedAt) return null;
	return { filePath, startedAt, dayKeyLocal: toLocalDayKey(startedAt), modelsUsed, messages, tokens, totalCost, costByModel, messagesByModel, tokensByModel };
}

function buildRangeAgg(days: number, now: Date): RangeAgg {
	const end = localMidnight(now);
	const start = addDaysLocal(end, -(days - 1));
	const outDays: DayAgg[] = [];
	const dayByKey = new Map<string, DayAgg>();
	for (let i = 0; i < days; i++) {
		const d = addDaysLocal(start, i);
		const dayKeyLocal = toLocalDayKey(d);
		const day: DayAgg = { date: d, dayKeyLocal, sessions: 0, messages: 0, tokens: 0, totalCost: 0, costByModel: new Map(), sessionsByModel: new Map(), messagesByModel: new Map(), tokensByModel: new Map() };
		outDays.push(day);
		dayByKey.set(dayKeyLocal, day);
	}
	return { days: outDays, dayByKey, sessions: 0, totalMessages: 0, totalTokens: 0, totalCost: 0, modelCost: new Map(), modelSessions: new Map(), modelMessages: new Map(), modelTokens: new Map() };
}

function addSessionToRange(range: RangeAgg, session: ParsedSession) {
	const day = range.dayByKey.get(session.dayKeyLocal);
	if (!day) return;
	range.sessions += 1; range.totalMessages += session.messages; range.totalTokens += session.tokens; range.totalCost += session.totalCost;
	day.sessions += 1; day.messages += session.messages; day.tokens += session.tokens; day.totalCost += session.totalCost;
	for (const mk of session.modelsUsed) { day.sessionsByModel.set(mk, (day.sessionsByModel.get(mk) ?? 0) + 1); range.modelSessions.set(mk, (range.modelSessions.get(mk) ?? 0) + 1); }
	for (const [mk, n] of session.messagesByModel.entries()) { day.messagesByModel.set(mk, (day.messagesByModel.get(mk) ?? 0) + n); range.modelMessages.set(mk, (range.modelMessages.get(mk) ?? 0) + n); }
	for (const [mk, n] of session.tokensByModel.entries()) { day.tokensByModel.set(mk, (day.tokensByModel.get(mk) ?? 0) + n); range.modelTokens.set(mk, (range.modelTokens.get(mk) ?? 0) + n); }
	for (const [mk, cost] of session.costByModel.entries()) { day.costByModel.set(mk, (day.costByModel.get(mk) ?? 0) + cost); range.modelCost.set(mk, (range.modelCost.get(mk) ?? 0) + cost); }
}

function sortMapByValueDesc<K extends string>(m: Map<K, number>) {
	return [...m.entries()].map(([key, value]) => ({ key, value })).sort((a, b) => b.value - a.value);
}

function choosePaletteFromLast30Days(range30: RangeAgg, topN = 4) {
	const costSum = [...range30.modelCost.values()].reduce((a, b) => a + b, 0);
	const popularity = costSum > 0 ? range30.modelCost : range30.totalTokens > 0 ? range30.modelTokens : range30.totalMessages > 0 ? range30.modelMessages : range30.modelSessions;
	const sorted = sortMapByValueDesc(popularity);
	const orderedModels = sorted.slice(0, topN).map(x => x.key);
	const modelColors = new Map<ModelKey, RGB>();
	for (let i = 0; i < orderedModels.length; i++) modelColors.set(orderedModels[i], PALETTE[i % PALETTE.length]);
	return { modelColors, otherColor: { r: 160, g: 160, b: 160 } as RGB, orderedModels };
}

function graphMetricForRange(range: RangeAgg, mode: MeasurementMode) {
	if (mode === "tokens") {
		const maxTokens = Math.max(0, ...range.days.map(d => d.tokens));
		if (maxTokens > 0) return { kind: "tokens" as const, max: maxTokens, denom: Math.log1p(maxTokens) };
		mode = "messages";
	}
	if (mode === "messages") {
		const maxMessages = Math.max(0, ...range.days.map(d => d.messages));
		if (maxMessages > 0) return { kind: "messages" as const, max: maxMessages, denom: Math.log1p(maxMessages) };
		mode = "sessions";
	}
	const maxSessions = Math.max(0, ...range.days.map(d => d.sessions));
	return { kind: "sessions" as const, max: maxSessions, denom: Math.log1p(maxSessions) };
}

function dayMixedColor(day: DayAgg, modelColors: Map<ModelKey, RGB>, otherColor: RGB, mode: MeasurementMode): RGB {
	const parts: Array<{ color: RGB; weight: number }> = [];
	let otherWeight = 0;
	let map: Map<ModelKey, number>;
	if (mode === "tokens") map = day.tokens > 0 ? day.tokensByModel : day.messages > 0 ? day.messagesByModel : day.sessionsByModel;
	else if (mode === "messages") map = day.messages > 0 ? day.messagesByModel : day.sessionsByModel;
	else map = day.sessionsByModel;
	for (const [mk, w] of map.entries()) {
		const c = modelColors.get(mk);
		if (c) parts.push({ color: c, weight: w });
		else otherWeight += w;
	}
	if (otherWeight > 0) parts.push({ color: otherColor, weight: otherWeight });
	return weightedMix(parts);
}

function weeksForRange(range: RangeAgg) {
	const days = range.days;
	const start = days[0].date;
	const end = days[days.length - 1].date;
	const gridStart = addDaysLocal(start, -mondayIndex(start));
	const gridEnd = addDaysLocal(end, 6 - mondayIndex(end));
	return Math.ceil(countDaysInclusiveLocal(gridStart, gridEnd) / 7);
}

async function computeBreakdown(signal?: AbortSignal): Promise<BreakdownData> {
	const now = new Date();
	const ranges = new Map<number, RangeAgg>();
	for (const d of RANGE_DAYS) ranges.set(d, buildRangeAgg(d, now));
	const range90 = ranges.get(90)!;
	const start90 = range90.days[0].date;
	const candidates = await walkSessionFiles(SESSION_ROOT, start90, signal);
	for (const filePath of candidates) {
		if (signal?.aborted) break;
		const session = await parseSessionFile(filePath, signal);
		if (!session) continue;
		const sessionDay = localMidnight(session.startedAt);
		for (const d of RANGE_DAYS) {
			const range = ranges.get(d)!;
			const start = range.days[0].date;
			const end = range.days[range.days.length - 1].date;
			if (sessionDay < start || sessionDay > end) continue;
			addSessionToRange(range, session);
		}
	}
	const palette = choosePaletteFromLast30Days(ranges.get(30)!, 4);
	return { generatedAt: now, ranges, palette };
}

// ════════════════════════════════════════════════════════════════════
//  Sessions tab helpers
// ════════════════════════════════════════════════════════════════════

const CPU_WORKING_THRESHOLD = 5.0;
const SESSION_ACTIVE_THRESHOLD_MS = 10_000;

function cwdToSessionDir(cwd: string): string {
	const home = process.env.HOME || process.env.USERPROFILE || "";
	const piDir = process.env.PI_CODING_AGENT_DIR || join(home, ".pi", "agent");
	const encoded = "-" + cwd.replace(/\//g, "-") + "-";
	return join(piDir, "sessions", encoded);
}

function getSessionDetail(cwd: string): string | undefined {
	try {
		const sessionDir = cwdToSessionDir(cwd);
		const files = readdirSync(sessionDir)
			.filter(f => f.endsWith(".jsonl"))
			.map(f => ({ name: f, path: join(sessionDir, f), mtime: statSync(join(sessionDir, f)).mtimeMs }))
			.sort((a, b) => b.mtime - a.mtime);
		if (files.length === 0) return undefined;
		const timeSinceModified = Date.now() - files[0].mtime;
		if (timeSinceModified > SESSION_ACTIVE_THRESHOLD_MS) {
			const idleSecs = Math.floor(timeSinceModified / 1000);
			if (idleSecs < 60) return `idle ${idleSecs}s`;
			const idleMins = Math.floor(idleSecs / 60);
			if (idleMins < 60) return `idle ${idleMins}m`;
			return `idle ${Math.floor(idleMins / 60)}h`;
		}
		const content = readFileSync(files[0].path, "utf-8");
		const lines = content.trim().split("\n");
		for (let i = lines.length - 1; i >= Math.max(0, lines.length - 10); i--) {
			try {
				const entry = JSON.parse(lines[i]);
				if (entry.type === "message" && entry.message) {
					if (entry.message.role === "assistant" && entry.message.content) {
						for (const block of entry.message.content) {
							if (block.type === "toolCall" || block.type === "tool_use") return `running ${block.name}`;
						}
					}
					if (entry.message.role === "toolResult" && entry.message.toolName) return `ran ${entry.message.toolName}`;
				}
			} catch {}
		}
		return "active";
	} catch { return undefined; }
}

function findPiProcesses(myPid: number): PiSession[] {
	try {
		const psOutput = execSync("ps -eo pid,comm,etime,%cpu 2>/dev/null", { encoding: "utf-8", timeout: 5000, stdio: ["pipe", "pipe", "pipe"] }).trim();
		if (!psOutput) return [];
		const sessions: PiSession[] = [];
		for (const line of psOutput.split("\n")) {
			const match = line.trim().match(/^(\d+)\s+pi\s+(\S+)\s+([\d.]+)$/);
			if (!match) continue;
			const pid = parseInt(match[1], 10);
			if (pid === myPid || isNaN(pid)) continue;
			const elapsed = match[2].trim();
			const cpuPercent = parseFloat(match[3]);
			try {
				const cwdOutput = execSync(`lsof -p ${pid} 2>/dev/null | grep cwd | awk '{print $NF}'`, { encoding: "utf-8", timeout: 3000, stdio: ["pipe", "pipe", "pipe"] }).trim();
				if (cwdOutput) {
					const isWorking = cpuPercent > CPU_WORKING_THRESHOLD;
					const detail = getSessionDetail(cwdOutput);
					sessions.push({ pid, cwd: cwdOutput, cwdShort: basename(cwdOutput), isActive: true, lastSeen: Date.now(), elapsed, cpuPercent, status: isWorking ? "working" : "idle", statusDetail: detail });
				}
			} catch {}
		}
		return sessions;
	} catch { return []; }
}

// ════════════════════════════════════════════════════════════════════
//  Tab IDs
// ════════════════════════════════════════════════════════════════════

type TabId = "sessions" | "breakdown" | "history" | "context";
const TAB_ORDER: TabId[] = ["sessions", "breakdown", "history", "context"];
const TAB_LABELS: Record<TabId, string> = {
	sessions: "Sessions",
	breakdown: "Breakdown",
	history: "History",
	context: "Context",
};

// ════════════════════════════════════════════════════════════════════
//  Tabbed Panel Component
// ════════════════════════════════════════════════════════════════════

class MissionControlPanel {
	private tui: TUI;
	private theme: Theme;
	private onDone: () => void;

	// Tab state
	private activeTab: TabId = "sessions";
	private scrollOffset = 0;

	// Sessions tab
	private sessions: PiSession[];
	private currentCwd: string;
	private currentPid: number;
	private currentStatus: SessionStatus;

	// Breakdown tab
	private breakdownData: BreakdownData | null = null;
	private breakdownLoading = false;
	private breakdownError: string | null = null;
	private rangeIndex = 1; // default 30d
	private measurement: MeasurementMode = "sessions";

	// History tab
	private sessionToolLog: ToolEntry[];
	private loadedSkills: Set<string>;

	// Context tab
	private state: MissionControlState;
	private ctx: ExtensionContext | ExtensionCommandContext;
	private pi: ExtensionAPI;

	// Rendering cache
	private cachedWidth?: number;
	private cachedLines?: string[];

	constructor(
		tui: TUI,
		theme: Theme,
		onDone: () => void,
		sessions: PiSession[],
		currentCwd: string,
		currentPid: number,
		currentStatus: SessionStatus,
		sessionToolLog: ToolEntry[],
		loadedSkills: Set<string>,
		state: MissionControlState,
		ctx: ExtensionContext | ExtensionCommandContext,
		pi: ExtensionAPI,
	) {
		this.tui = tui;
		this.theme = theme;
		this.onDone = onDone;
		this.sessions = sessions;
		this.currentCwd = currentCwd;
		this.currentPid = currentPid;
		this.currentStatus = currentStatus;
		this.sessionToolLog = sessionToolLog;
		this.loadedSkills = loadedSkills;
		this.state = state;
		this.ctx = ctx;
		this.pi = pi;

		// Start loading breakdown data in background
		this.loadBreakdownData();
	}

	private async loadBreakdownData() {
		this.breakdownLoading = true;
		this.invalidate();
		this.tui.requestRender();
		try {
			this.breakdownData = await computeBreakdown();
			this.breakdownError = null;
		} catch (err: any) {
			this.breakdownError = err?.message ?? "Failed to load breakdown data";
		} finally {
			this.breakdownLoading = false;
			this.invalidate();
			this.tui.requestRender();
		}
	}

	handleInput(data: string): void {
		// Close
		if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c")) || data.toLowerCase() === "q") {
			this.onDone();
			return;
		}

		// Tab switching with number keys
		if (data === "1") { this.switchTab("sessions"); return; }
		if (data === "2") { this.switchTab("breakdown"); return; }
		if (data === "3") { this.switchTab("history"); return; }
		if (data === "4") { this.switchTab("context"); return; }

		// Tab switching with tab key
		if (matchesKey(data, Key.tab)) {
			const idx = TAB_ORDER.indexOf(this.activeTab);
			this.switchTab(TAB_ORDER[(idx + 1) % TAB_ORDER.length]);
			return;
		}
		if (matchesKey(data, Key.shift("tab"))) {
			const idx = TAB_ORDER.indexOf(this.activeTab);
			this.switchTab(TAB_ORDER[(idx + TAB_ORDER.length - 1) % TAB_ORDER.length]);
			return;
		}

		// Breakdown-specific controls
		if (this.activeTab === "breakdown") {
			if (matchesKey(data, Key.left) || data.toLowerCase() === "h") {
				this.rangeIndex = (this.rangeIndex + RANGE_DAYS.length - 1) % RANGE_DAYS.length;
				this.invalidate(); this.tui.requestRender(); return;
			}
			if (matchesKey(data, Key.right) || data.toLowerCase() === "l") {
				this.rangeIndex = (this.rangeIndex + 1) % RANGE_DAYS.length;
				this.invalidate(); this.tui.requestRender(); return;
			}
			if (data.toLowerCase() === "m") {
				const order: MeasurementMode[] = ["sessions", "messages", "tokens"];
				const idx = order.indexOf(this.measurement);
				this.measurement = order[(idx + 1) % order.length];
				this.invalidate(); this.tui.requestRender(); return;
			}
		}

		// Scrolling
		if (matchesKey(data, Key.up) || data.toLowerCase() === "k") {
			this.scrollOffset = Math.max(0, this.scrollOffset - 1);
			this.invalidate(); this.tui.requestRender(); return;
		}
		if (matchesKey(data, Key.down) || data.toLowerCase() === "j") {
			this.scrollOffset++;
			this.invalidate(); this.tui.requestRender(); return;
		}
		if (matchesKey(data, "pageup")) {
			this.scrollOffset = Math.max(0, this.scrollOffset - 10);
			this.invalidate(); this.tui.requestRender(); return;
		}
		if (matchesKey(data, "pagedown")) {
			this.scrollOffset += 10;
			this.invalidate(); this.tui.requestRender(); return;
		}
	}

	private switchTab(tab: TabId) {
		if (this.activeTab === tab) return;
		this.activeTab = tab;
		this.scrollOffset = 0;
		this.invalidate();
		this.tui.requestRender();
	}

	render(width: number): string[] {
		if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;

		const t = this.theme;
		const lines: string[] = [];

		// ── Tab bar ──
		const tabBar = this.renderTabBar(width);
		lines.push(tabBar);
		lines.push(t.fg("dim", "─".repeat(width)));

		// ── Tab content ──
		let content: string[];
		switch (this.activeTab) {
			case "sessions": content = this.renderSessionsTab(width); break;
			case "breakdown": content = this.renderBreakdownTab(width); break;
			case "history": content = this.renderHistoryTab(width); break;
			case "context": content = this.renderContextTab(width); break;
			default: content = []; break;
		}

		// Apply scrolling
		const maxScroll = Math.max(0, content.length - 20);
		this.scrollOffset = Math.min(this.scrollOffset, maxScroll);
		const visibleContent = content.slice(this.scrollOffset, this.scrollOffset + 20);

		if (this.scrollOffset > 0) {
			lines.push(truncateToWidth(t.fg("dim", `  ↑ ${this.scrollOffset} lines above`), width));
		}
		lines.push(...visibleContent);
		if (this.scrollOffset < maxScroll) {
			lines.push(truncateToWidth(t.fg("dim", `  ↓ ${maxScroll - this.scrollOffset} lines below`), width));
		}

		// ── Footer ──
		lines.push(t.fg("dim", "─".repeat(width)));
		let footer = "tab/1-4 switch · ↑↓ scroll · q close";
		if (this.activeTab === "breakdown") footer = "tab/1-4 switch · ←→ range · m metric · ↑↓ scroll · q close";
		lines.push(truncateToWidth("  " + t.fg("dim", footer), width));

		this.cachedWidth = width;
		this.cachedLines = lines;
		return lines;
	}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}

	// ── Tab bar ──

	private renderTabBar(width: number): string {
		const t = this.theme;
		const parts: string[] = [];
		parts.push(" " + t.fg("accent", t.bold("⌘ Mission Control")) + "  ");

		for (let i = 0; i < TAB_ORDER.length; i++) {
			const tab = TAB_ORDER[i];
			const label = `${i + 1}:${TAB_LABELS[tab]}`;
			if (tab === this.activeTab) {
				parts.push(t.fg("accent", `[${label}]`));
			} else {
				parts.push(t.fg("dim", ` ${label} `));
			}
			if (i < TAB_ORDER.length - 1) parts.push(" ");
		}

		return truncateToWidth(parts.join(""), width);
	}

	// ── Sessions tab ──

	private renderSessionsTab(width: number): string[] {
		const t = this.theme;
		const lines: string[] = [];

		const totalCount = this.sessions.length + 1;
		const workingCount = this.sessions.filter(s => s.status === "working").length + (this.currentStatus === "working" ? 1 : 0);
		let summary = t.fg("muted", `${totalCount} session${totalCount !== 1 ? "s" : ""}`);
		if (workingCount > 0) summary += t.fg("warning", ` · ${workingCount} working`);
		lines.push(truncateToWidth("  " + summary, width));
		lines.push("");

		// Current session
		const statusStr = this.currentStatus === "working" ? t.fg("warning", "⟳ working") : t.fg("success", "● this");
		lines.push(truncateToWidth(`  ${statusStr}  ${t.fg("dim", String(this.currentPid))}  ${t.fg("muted", shortenPath(this.currentCwd))}  ${t.fg("dim", "current session")}`, width));

		// Other sessions
		for (const s of this.sessions) {
			const sStatus = s.status === "working" ? t.fg("warning", "⟳ working") : t.fg("dim", "● idle");
			const cpu = s.cpuPercent !== undefined ? `${s.cpuPercent.toFixed(1)}%` : "—";
			const cpuColor = s.cpuPercent !== undefined && s.cpuPercent > CPU_WORKING_THRESHOLD ? "warning" : "dim";
			const detailParts: string[] = [];
			if (s.elapsed) detailParts.push("⏱ " + s.elapsed);
			if (s.statusDetail) detailParts.push(s.statusDetail);
			const detail = detailParts.join(" · ") || "—";
			lines.push(truncateToWidth(`  ${sStatus}  ${t.fg("dim", String(s.pid))}  ${t.fg("muted", shortenPath(s.cwd))}  ${t.fg(cpuColor, cpu)}  ${t.fg("dim", detail)}`, width));
		}

		if (this.sessions.length === 0) {
			lines.push("");
			lines.push(truncateToWidth("  " + t.fg("dim", "No other pi sessions running"), width));
		}

		return lines;
	}

	// ── Breakdown tab ──

	private renderBreakdownTab(width: number): string[] {
		const t = this.theme;
		const lines: string[] = [];

		if (this.breakdownLoading) {
			lines.push("");
			lines.push(truncateToWidth("  " + t.fg("accent", "○") + " " + t.fg("muted", "Analyzing sessions (last 90 days)…"), width));
			lines.push("");
			return lines;
		}

		if (this.breakdownError || !this.breakdownData) {
			lines.push("");
			lines.push(truncateToWidth("  " + t.fg("error", "✗ ") + t.fg("muted", this.breakdownError ?? "No breakdown data"), width));
			lines.push("");
			return lines;
		}

		const data = this.breakdownData;
		const selectedDays = RANGE_DAYS[this.rangeIndex];
		const range = data.ranges.get(selectedDays)!;
		const metric = graphMetricForRange(range, this.measurement);

		// Range selector
		const rangeTab = (days: number, idx: number) => idx === this.rangeIndex ? bold(`[${days}d]`) : dim(` ${days}d `);
		const metricTab = (mode: MeasurementMode, label: string) => mode === this.measurement ? bold(`[${label}]`) : dim(` ${label} `);
		lines.push(truncateToWidth(`  ${rangeTab(7, 0)} ${rangeTab(30, 1)} ${rangeTab(90, 2)}    ${metricTab("sessions", "sess")} ${metricTab("messages", "msg")} ${metricTab("tokens", "tok")}`, width));

		// Summary
		const avg = range.sessions > 0 ? range.totalCost / range.sessions : 0;
		const costPart = range.totalCost > 0 ? `${formatUsd(range.totalCost)} · avg ${formatUsd(avg)}/session` : "$0.0000";
		let summaryText: string;
		if (metric.kind === "tokens") summaryText = `Last ${selectedDays} days: ${formatCountBD(range.sessions)} sessions · ${formatCountBD(range.totalTokens)} tokens · ${costPart}`;
		else if (metric.kind === "messages") summaryText = `Last ${selectedDays} days: ${formatCountBD(range.sessions)} sessions · ${formatCountBD(range.totalMessages)} messages · ${costPart}`;
		else summaryText = `Last ${selectedDays} days: ${formatCountBD(range.sessions)} sessions · ${costPart}`;
		lines.push(truncateToWidth("  " + summaryText + dim(`   (graph: ${metric.kind}/day)`), width));
		lines.push("");

		// Heatmap graph
		const graphLines = this.renderHeatmap(range, data.palette.modelColors, data.palette.otherColor, metric, width - 4);
		const legendItems = this.renderLegendItems(data.palette.modelColors, data.palette.orderedModels, data.palette.otherColor);

		// Try side-by-side graph + legend
		const graphWidth = Math.max(0, ...graphLines.map(l => visibleWidth(l)));
		const sep = 3;
		const legendWidth = width - 4 - graphWidth - sep;
		const showSideLegend = legendWidth >= 22;

		if (showSideLegend) {
			const legendBlock: string[] = [dim("Top models (30d palette):"), ...legendItems];
			while (legendBlock.length < graphLines.length) legendBlock.push("");
			for (let i = 0; i < graphLines.length; i++) {
				const left = graphLines[i];
				const leftW = visibleWidth(left);
				const pad = " ".repeat(Math.max(0, graphWidth - leftW));
				const right = truncateToWidth(legendBlock[i] ?? "", legendWidth);
				lines.push(truncateToWidth("  " + left + pad + " ".repeat(sep) + right, width));
			}
		} else {
			for (const gl of graphLines) lines.push(truncateToWidth("  " + gl, width));
			lines.push("");
			lines.push(truncateToWidth("  " + dim("Top models (30d palette):"), width));
			for (const it of legendItems) lines.push(truncateToWidth("  " + it, width));
		}

		lines.push("");

		// Model table
		const tableLines = this.renderModelTable(range, metric.kind);
		for (const tl of tableLines) lines.push(truncateToWidth("  " + tl, width));

		return lines;
	}

	private renderHeatmap(range: RangeAgg, modelColors: Map<ModelKey, RGB>, otherColor: RGB, metric: { kind: string; denom: number }, availableWidth: number): string[] {
		const days = range.days;
		const start = days[0].date;
		const end = days[days.length - 1].date;
		const gridStart = addDaysLocal(start, -mondayIndex(start));
		const gridEnd = addDaysLocal(end, 6 - mondayIndex(end));
		const totalGridDays = countDaysInclusiveLocal(gridStart, gridEnd);
		const weeks = Math.ceil(totalGridDays / 7);

		const leftMargin = 4;
		const gap = 1;
		const graphArea = Math.max(1, availableWidth - leftMargin);
		const idealCellWidth = Math.floor((graphArea + gap) / Math.max(1, weeks)) - gap;
		const selectedDays = RANGE_DAYS[this.rangeIndex];
		const maxScale = selectedDays === 7 ? 4 : selectedDays === 30 ? 3 : 2;
		const cellWidth = Math.min(maxScale, Math.max(1, idealCellWidth));
		const block = "█".repeat(cellWidth);
		const gapStr = " ".repeat(gap);
		const denom = metric.denom;
		const labelByRow = new Map<number, string>([[0, "Mon"], [2, "Wed"], [4, "Fri"]]);

		const lines: string[] = [];
		for (let row = 0; row < 7; row++) {
			const label = labelByRow.get(row);
			let line = label ? padRight(label, 3) + " " : "    ";
			for (let w = 0; w < weeks; w++) {
				const cellDate = addDaysLocal(gridStart, w * 7 + row);
				const inRange = cellDate >= start && cellDate <= end;
				const colGap = w < weeks - 1 ? gapStr : "";
				if (!inRange) { line += " ".repeat(cellWidth) + colGap; continue; }
				const key = toLocalDayKey(cellDate);
				const day = range.dayByKey.get(key);
				const value = metric.kind === "tokens" ? (day?.tokens ?? 0) : metric.kind === "messages" ? (day?.messages ?? 0) : (day?.sessions ?? 0);
				if (!day || value <= 0) { line += ansiFg(EMPTY_CELL_BG, block) + colGap; continue; }
				const hue = dayMixedColor(day, modelColors, otherColor, this.measurement);
				let intensity = denom > 0 ? Math.log1p(value) / denom : 0;
				intensity = 0.2 + 0.8 * clamp01(intensity);
				const rgb = mixRgb(DEFAULT_BG, hue, intensity);
				line += ansiFg(rgb, block) + colGap;
			}
			lines.push(line);
		}
		return lines;
	}

	private renderLegendItems(modelColors: Map<ModelKey, RGB>, orderedModels: ModelKey[], otherColor: RGB): string[] {
		const items: string[] = [];
		for (const mk of orderedModels) {
			const c = modelColors.get(mk);
			if (!c) continue;
			const displayName = mk.includes("/") ? mk.slice(mk.indexOf("/") + 1) : mk;
			items.push(`${ansiFg(c, "█")} ${displayName}`);
		}
		items.push(`${ansiFg(otherColor, "█")} other`);
		return items;
	}

	private renderModelTable(range: RangeAgg, kind: string): string[] {
		let perModel: Map<ModelKey, number>;
		let total = 0;
		if (kind === "tokens") { perModel = range.modelTokens; total = range.totalTokens; }
		else if (kind === "messages") { perModel = range.modelMessages; total = range.totalMessages; }
		else { perModel = range.modelSessions; total = range.sessions; }

		const sorted = sortMapByValueDesc(perModel);
		const rows = sorted.slice(0, 8);
		const valueWidth = kind === "tokens" ? 10 : 8;
		const modelWidth = Math.min(36, Math.max("model".length, ...rows.map(r => r.key.length)));

		const lines: string[] = [];
		lines.push(`${padRight("model", modelWidth)}  ${padLeft(kind, valueWidth)}  ${padLeft("cost", 10)}  ${padLeft("share", 6)}`);
		lines.push(`${"-".repeat(modelWidth)}  ${"-".repeat(valueWidth)}  ${"-".repeat(10)}  ${"-".repeat(6)}`);
		for (const r of rows) {
			const value = perModel.get(r.key) ?? 0;
			const cost = range.modelCost.get(r.key) ?? 0;
			const share = total > 0 ? `${Math.round((value / total) * 100)}%` : "0%";
			lines.push(`${padRight(r.key.slice(0, modelWidth), modelWidth)}  ${padLeft(formatCountBD(value), valueWidth)}  ${padLeft(formatUsd(cost), 10)}  ${padLeft(share, 6)}`);
		}
		if (sorted.length === 0) lines.push(dim("(no model data found)"));
		return lines;
	}

	// ── History tab ──

	private renderHistoryTab(width: number): string[] {
		const t = this.theme;
		const lines: string[] = [];

		if (this.sessionToolLog.length === 0) {
			lines.push("");
			lines.push(truncateToWidth("  " + t.fg("dim", "No tool calls recorded yet in this session"), width));
			lines.push("");
			return lines;
		}

		// Skills
		if (this.loadedSkills.size > 0) {
			const skillList = [...this.loadedSkills].sort().join(", ");
			lines.push(truncateToWidth("  " + t.fg("accent", "📚 Skills: ") + t.fg("muted", skillList), width));
			lines.push("");
		}

		// Summary stats
		const totalTime = this.sessionToolLog.reduce((s, tool) => s + ((tool.endTime ?? Date.now()) - tool.startTime), 0);
		const totalErrors = this.sessionToolLog.filter(tool => tool.status === "error").length;
		const totalCtxTokens = this.sessionToolLog.reduce((s, tool) => s + (tool.resultTokens ?? 0), 0);
		lines.push(truncateToWidth(
			"  " + t.fg("accent", t.bold("Summary")) + "  " +
			t.fg("muted", `${this.sessionToolLog.length} tools`) + "  " +
			t.fg("dim", `${(totalTime / 1000).toFixed(1)}s`) +
			(totalErrors > 0 ? "  " + t.fg("error", `${totalErrors} errors`) : "") +
			(totalCtxTokens > 0 ? "  " + t.fg("muted", `+${formatTokens(totalCtxTokens)} ctx`) : ""),
			width,
		));
		lines.push("");

		// Tool entries grouped by turns
		let turnNum = 1;
		let turnTools = 0;
		let turnTime = 0;
		let turnErrors = 0;

		for (let i = 0; i < this.sessionToolLog.length; i++) {
			const tool = this.sessionToolLog[i];
			const prevEnd = i > 0 ? (this.sessionToolLog[i - 1].endTime ?? this.sessionToolLog[i - 1].startTime) : tool.startTime;
			if (i > 0 && tool.startTime - prevEnd > 5000) {
				lines.push(truncateToWidth("  " + t.fg("dim", `── turn ${turnNum}: ${turnTools} tools, ${(turnTime / 1000).toFixed(1)}s${turnErrors ? ` (${turnErrors} err)` : ""} ──`), width));
				lines.push("");
				turnNum++; turnTools = 0; turnTime = 0; turnErrors = 0;
			}
			turnTools++;
			const dur = (tool.endTime ?? Date.now()) - tool.startTime;
			turnTime += dur;
			if (tool.status === "error") turnErrors++;

			const icon = tool.status === "error" ? t.fg("error", "✗") : tool.status === "running" ? t.fg("accent", "○") : t.fg("success", "✓");
			const elapsed = t.fg("dim", `${(dur / 1000).toFixed(1)}s`);
			const ctxInfo = tool.resultTokens ? t.fg("muted", ` +${formatTokens(tool.resultTokens)}`) : "";
			const toolStr = fmtTool(tool.name, tool.args, t);
			lines.push(truncateToWidth(`  ${icon} ${toolStr}  ${elapsed}${ctxInfo}`, width));
			if (tool.status === "error" && tool.errorMsg) {
				lines.push(truncateToWidth(`    ${t.fg("error", "↳ " + tool.errorMsg.split("\n")[0])}`, width));
			}
		}

		// Final turn summary
		lines.push(truncateToWidth("  " + t.fg("dim", `── turn ${turnNum}: ${turnTools} tools, ${(turnTime / 1000).toFixed(1)}s${turnErrors ? ` (${turnErrors} err)` : ""} ──`), width));

		return lines;
	}

	// ── Context tab ──

	private renderContextTab(width: number): string[] {
		const t = this.theme;
		const lines: string[] = [];

		const usage = this.ctx.getContextUsage?.();
		const percent = usage?.percent ?? this.state.contextPercent ?? 0;
		const tokens = usage?.tokens ?? this.state.contextTokens ?? 0;
		const ctxWindow = usage?.contextWindow ?? this.state.contextWindow ?? 0;

		// Context usage overview
		lines.push(truncateToWidth("  " + t.fg("accent", t.bold("Context Window Usage")), width));
		lines.push("");

		if (ctxWindow > 0) {
			// Progress bar
			const barWidth = Math.max(10, width - 8);
			const pct = Math.round(percent);
			const filled = Math.round((pct / 100) * barWidth);
			const color = pct > 80 ? "error" : pct > 60 ? "warning" : "success";
			const bar = t.fg(color, "█".repeat(filled)) + t.fg("dim", "░".repeat(barWidth - filled));
			lines.push(truncateToWidth("  " + bar, width));
			lines.push(truncateToWidth("  " + t.fg("muted", `${pct}% used`) + "  " + t.fg("dim", `${formatTokens(tokens)} / ${formatTokens(ctxWindow)} tokens`), width));
		} else {
			lines.push(truncateToWidth("  " + t.fg("dim", "Context usage not available yet (send a message first)"), width));
		}

		lines.push("");
		lines.push(truncateToWidth("  " + t.fg("accent", t.bold("Session Stats")), width));
		lines.push("");

		// Session stats
		const elapsed = formatDuration(Date.now() - this.state.sessionStartTime);
		lines.push(truncateToWidth(`  ${t.fg("dim", "Session time:")}   ${t.fg("muted", elapsed)}`, width));
		lines.push(truncateToWidth(`  ${t.fg("dim", "Turns:")}          ${t.fg("muted", String(this.state.turnCount))}`, width));
		lines.push(truncateToWidth(`  ${t.fg("dim", "Tool calls:")}     ${t.fg("muted", String(this.state.toolCallCount))}`, width));
		lines.push(truncateToWidth(`  ${t.fg("dim", "Input tokens:")}   ${t.fg("muted", formatTokens(this.state.totalInputTokens))}`, width));
		lines.push(truncateToWidth(`  ${t.fg("dim", "Output tokens:")}  ${t.fg("muted", formatTokens(this.state.totalOutputTokens))}`, width));
		lines.push(truncateToWidth(`  ${t.fg("dim", "Total cost:")}     ${t.fg("accent", formatCost(this.state.totalCost))}`, width));

		// Model info
		const model = this.ctx.model;
		if (model) {
			lines.push("");
			lines.push(truncateToWidth("  " + t.fg("accent", t.bold("Current Model")), width));
			lines.push("");
			lines.push(truncateToWidth(`  ${t.fg("dim", "Provider:")}  ${t.fg("muted", model.provider)}`, width));
			lines.push(truncateToWidth(`  ${t.fg("dim", "Model:")}     ${t.fg("accent", model.id)}`, width));
			if (ctxWindow > 0) {
				lines.push(truncateToWidth(`  ${t.fg("dim", "Context:")}   ${t.fg("muted", formatTokens(ctxWindow) + " tokens")}`, width));
			}
		}

		// Modified files
		if (this.state.modifiedFiles.size > 0) {
			lines.push("");
			lines.push(truncateToWidth("  " + t.fg("accent", t.bold(`Modified Files (${this.state.modifiedFiles.size})`)), width));
			lines.push("");
			const sortedFiles = [...this.state.modifiedFiles].sort();
			for (const file of sortedFiles.slice(0, 20)) {
				lines.push(truncateToWidth(`  ${t.fg("success", "•")} ${t.fg("muted", shortenPath(file))}`, width));
			}
			if (sortedFiles.length > 20) {
				lines.push(truncateToWidth(`  ${t.fg("dim", `… and ${sortedFiles.length - 20} more`)}`, width));
			}
		}

		// Git status
		if (this.state.gitDirty || this.state.gitAdded > 0 || this.state.gitRemoved > 0) {
			lines.push("");
			lines.push(truncateToWidth("  " + t.fg("accent", t.bold("Git Status")), width));
			lines.push("");
			const parts: string[] = [];
			if (this.state.gitAdded > 0) parts.push(t.fg("success", `+${this.state.gitAdded}`));
			if (this.state.gitRemoved > 0) parts.push(t.fg("error", `-${this.state.gitRemoved}`));
			if (this.state.sawCommit) parts.push(t.fg("success", "committed"));
			else if (this.state.gitDirty) parts.push(t.fg("warning", "uncommitted changes"));
			lines.push(truncateToWidth("  " + parts.join("  "), width));
		}

		return lines;
	}
}

// ════════════════════════════════════════════════════════════════════
//  Setup and export
// ════════════════════════════════════════════════════════════════════

export function setupMissionControlPanel(
	pi: ExtensionAPI,
	state: MissionControlState,
	getSessionToolLog: () => ToolEntry[],
	getLoadedSkills: () => Set<string>,
) {
	const myPid = process.pid;

	async function openPanel(ctx: ExtensionContext | ExtensionCommandContext) {
		// Refresh sessions
		let sessions: PiSession[] = [];
		try { sessions = findPiProcesses(myPid); } catch {}
		state.otherSessions = sessions;
		const currentStatus: SessionStatus = state.isRunning ? "working" : "idle";

		await ctx.ui.custom<void>(
			(tui, theme, _kb, done) => {
				return new MissionControlPanel(
					tui, theme, () => done(),
					sessions, ctx.cwd, myPid, currentStatus,
					getSessionToolLog(),
					getLoadedSkills(),
					state, ctx, pi,
				);
			},
			{
				overlay: true,
				overlayOptions: {
					anchor: "center",
					width: "80%",
					minWidth: 60,
					maxHeight: "85%",
					margin: 1,
				},
			},
		);
	}

	return { openPanel };
}
