/**
 * Mission Control — Session Tracker
 *
 * Detects other running pi instances via OS process scanning.
 * Shows real status: idle vs working (based on CPU usage and session file activity).
 * Provides /sessions command that opens a floating overlay panel.
 */

import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { Theme } from "@mariozechner/pi-coding-agent";
import { matchesKey, Key, truncateToWidth } from "@mariozechner/pi-tui";
import { execSync } from "node:child_process";
import { basename, join } from "node:path";
import { readdirSync, statSync, readFileSync } from "node:fs";
import type { MissionControlState, PiSession, SessionStatus } from "./state.js";
import { shortenPath } from "./utils.js";

const POLL_INTERVAL_MS = 30_000;
const CPU_WORKING_THRESHOLD = 5.0; // above this % CPU = likely working
const SESSION_ACTIVE_THRESHOLD_MS = 10_000; // session file modified within this = active

/**
 * Map a CWD to the pi sessions directory path for that CWD.
 * Pi stores sessions in ~/.pi/agent/sessions/<encoded-cwd>/
 */
function cwdToSessionDir(cwd: string): string {
	const home = process.env.HOME || process.env.USERPROFILE || "";
	const piDir = process.env.PI_CODING_AGENT_DIR || join(home, ".pi", "agent");
	// Pi encodes the CWD path by replacing / with - and prepending/appending -
	const encoded = "-" + cwd.replace(/\//g, "-") + "-";
	return join(piDir, "sessions", encoded);
}

/**
 * Try to determine what's happening in a session by reading the latest session file.
 * Returns a status detail string like "running bash", "editing file", etc.
 */
function getSessionDetail(cwd: string): string | undefined {
	try {
		const sessionDir = cwdToSessionDir(cwd);
		const files = readdirSync(sessionDir)
			.filter((f) => f.endsWith(".jsonl"))
			.map((f) => ({
				name: f,
				path: join(sessionDir, f),
				mtime: statSync(join(sessionDir, f)).mtimeMs,
			}))
			.sort((a, b) => b.mtime - a.mtime);

		if (files.length === 0) return undefined;

		const latestFile = files[0];
		const timeSinceModified = Date.now() - latestFile.mtime;

		// If the session file hasn't been touched recently, it's likely idle
		if (timeSinceModified > SESSION_ACTIVE_THRESHOLD_MS) {
			const idleSecs = Math.floor(timeSinceModified / 1000);
			if (idleSecs < 60) return `idle ${idleSecs}s`;
			const idleMins = Math.floor(idleSecs / 60);
			if (idleMins < 60) return `idle ${idleMins}m`;
			const idleHours = Math.floor(idleMins / 60);
			return `idle ${idleHours}h`;
		}

		// Read the last few lines to detect what tool is running
		const content = readFileSync(latestFile.path, "utf-8");
		const lines = content.trim().split("\n");

		// Scan from the end for the most recent tool activity
		for (let i = lines.length - 1; i >= Math.max(0, lines.length - 10); i--) {
			try {
				const entry = JSON.parse(lines[i]);
				if (entry.type === "message" && entry.message) {
					const msg = entry.message;
					// Look for tool calls in assistant messages
					if (msg.role === "assistant" && msg.content) {
						for (const block of msg.content) {
							if (block.type === "toolCall" || block.type === "tool_use") {
								return `running ${block.name}`;
							}
						}
					}
					// Look for tool results (means a tool just finished)
					if (msg.role === "toolResult" && msg.toolName) {
						return `ran ${msg.toolName}`;
					}
				}
			} catch {
				// Skip unparseable lines
			}
		}

		return "active";
	} catch {
		return undefined;
	}
}

/**
 * Find other pi processes with CPU usage and status detection.
 */
function findPiProcesses(myPid: number): PiSession[] {
	try {
		// Get pid, command, elapsed time, and CPU usage
		const psOutput = execSync("ps -eo pid,comm,etime,%cpu 2>/dev/null", {
			encoding: "utf-8",
			timeout: 5000,
			stdio: ["pipe", "pipe", "pipe"],
		}).trim();

		if (!psOutput) return [];

		const sessions: PiSession[] = [];

		for (const line of psOutput.split("\n")) {
			// Match: PID  pi  ELAPSED  CPU%
			const match = line.trim().match(/^(\d+)\s+pi\s+(\S+)\s+([\d.]+)$/);
			if (!match) continue;

			const pid = parseInt(match[1], 10);
			if (pid === myPid || isNaN(pid)) continue;

			const elapsed = match[2].trim();
			const cpuPercent = parseFloat(match[3]);

			try {
				const cwdOutput = execSync(`lsof -p ${pid} 2>/dev/null | grep cwd | awk '{print $NF}'`, {
					encoding: "utf-8",
					timeout: 3000,
					stdio: ["pipe", "pipe", "pipe"],
				}).trim();

				if (cwdOutput) {
					// Determine status from CPU usage
					const isWorking = cpuPercent > CPU_WORKING_THRESHOLD;
					const status: SessionStatus = isWorking ? "working" : "idle";

					// Try to get detailed status from session file
					const detail = getSessionDetail(cwdOutput);

					sessions.push({
						pid,
						cwd: cwdOutput,
						cwdShort: basename(cwdOutput),
						isActive: true,
						lastSeen: Date.now(),
						elapsed,
						cpuPercent,
						status,
						statusDetail: detail,
					});
				}
			} catch {
				// Skip processes we can't query
			}
		}

		return sessions;
	} catch {
		return [];
	}
}

/**
 * Format CPU percentage for display
 */
function formatCpu(cpu: number | undefined): string {
	if (cpu === undefined) return "";
	return `${cpu.toFixed(1)}%`;
}

/**
 * Get status indicator icon and color
 */
function renderStatus(
	session: PiSession,
	theme: Theme,
): string {
	switch (session.status) {
		case "working":
			return theme.fg("warning", "⟳ working");
		case "idle":
			return theme.fg("dim", "● idle");
		default:
			return theme.fg("dim", "? unknown");
	}
}

/**
 * Overlay component for the sessions panel
 */
class SessionsPanel {
	private sessions: PiSession[];
	private currentCwd: string;
	private currentPid: number;
	private currentStatus: SessionStatus;
	private selected = 0;
	private theme: Theme;
	private onClose: () => void;
	private cachedWidth?: number;
	private cachedLines?: string[];

	constructor(
		sessions: PiSession[],
		currentCwd: string,
		currentPid: number,
		currentStatus: SessionStatus,
		theme: Theme,
		onClose: () => void,
	) {
		this.sessions = sessions;
		this.currentCwd = currentCwd;
		this.currentPid = currentPid;
		this.currentStatus = currentStatus;
		this.theme = theme;
		this.onClose = onClose;
	}

	handleInput(data: string): void {
		if (matchesKey(data, Key.escape) || matchesKey(data, "q")) {
			this.onClose();
		} else if (matchesKey(data, Key.up) && this.selected > 0) {
			this.selected--;
			this.invalidate();
		} else if (matchesKey(data, Key.down) && this.selected < this.sessions.length) {
			this.selected++;
			this.invalidate();
		}
	}

	render(width: number): string[] {
		if (this.cachedLines && this.cachedWidth === width) {
			return this.cachedLines;
		}

		const t = this.theme;
		const lines: string[] = [];
		const innerW = Math.max(20, width - 4);

		// Title
		lines.push("");
		const totalCount = this.sessions.length + 1; // +1 for current
		const workingCount = this.sessions.filter((s) => s.status === "working").length + (this.currentStatus === "working" ? 1 : 0);
		let titleSuffix = t.fg("dim", ` (${totalCount} session${totalCount !== 1 ? "s" : ""})`);
		if (workingCount > 0) {
			titleSuffix += t.fg("warning", ` · ${workingCount} working`);
		}
		lines.push(truncateToWidth("  " + t.fg("accent", t.bold("⌘ Pi Sessions")) + titleSuffix, width));
		lines.push(truncateToWidth("  " + t.fg("dim", "─".repeat(innerW)), width));

		// Current session (this one)
		const currentMarker = this.selected === 0 ? t.fg("accent", "▸ ") : "  ";
		const currentStatusStr = this.currentStatus === "working"
			? t.fg("warning", "⟳ working")
			: t.fg("success", "● this session");
		const currentLine =
			currentMarker +
			currentStatusStr +
			t.fg("dim", "  PID " + this.currentPid) +
			"  " +
			t.fg("muted", shortenPath(this.currentCwd));
		lines.push(truncateToWidth("  " + currentLine, width));

		// Other sessions
		if (this.sessions.length === 0) {
			lines.push("");
			lines.push(truncateToWidth("  " + t.fg("dim", "  No other pi sessions running"), width));
		} else {
			for (let i = 0; i < this.sessions.length; i++) {
				const s = this.sessions[i];
				const marker = this.selected === i + 1 ? t.fg("accent", "▸ ") : "  ";
				const statusStr = renderStatus(s, t);
				const pidStr = t.fg("dim", "PID " + s.pid);
				const cwdStr = t.fg("muted", shortenPath(s.cwd));
				const elapsedStr = s.elapsed ? t.fg("dim", "  ⏱ " + s.elapsed) : "";
				const cpuStr = s.cpuPercent !== undefined ? t.fg("dim", "  cpu:" + formatCpu(s.cpuPercent)) : "";

				// Main line: marker + status + PID + CWD
				lines.push(truncateToWidth("  " + marker + statusStr + "  " + pidStr + "  " + cwdStr, width));

				// Detail line: elapsed, CPU, and status detail (indented)
				const detailParts: string[] = [];
				if (s.elapsed) detailParts.push("⏱ " + s.elapsed);
				if (s.cpuPercent !== undefined) detailParts.push("cpu: " + formatCpu(s.cpuPercent));
				if (s.statusDetail) detailParts.push(s.statusDetail);

				if (detailParts.length > 0) {
					const indent = "      "; // align under status text
					lines.push(truncateToWidth("  " + indent + t.fg("dim", detailParts.join("  ·  ")), width));
				}
			}
		}

		// Footer hints
		lines.push("");
		lines.push(truncateToWidth("  " + t.fg("dim", "↑↓ navigate  q/esc close"), width));
		lines.push("");

		this.cachedLines = lines;
		this.cachedWidth = width;
		return lines;
	}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}
}

export function setupSessionTracker(pi: ExtensionAPI, state: MissionControlState) {
	let pollInterval: NodeJS.Timeout | undefined;
	const myPid = process.pid;

	function poll() {
		try {
			state.otherSessions = findPiProcesses(myPid);
		} catch {
			state.otherSessions = [];
		}
	}

	async function openSessionsPanel(ctx: ExtensionContext | ExtensionCommandContext) {
		poll();

		// Determine current session's status
		const currentStatus: SessionStatus = state.isRunning ? "working" : "idle";

		await ctx.ui.custom<void>(
			(_tui, theme, _kb, done) =>
				new SessionsPanel(state.otherSessions, ctx.cwd, myPid, currentStatus, theme, () => done()),
			{
				overlay: true,
				overlayOptions: {
					anchor: "center",
					width: "60%",
					minWidth: 50,
					maxHeight: "60%",
					margin: 2,
				},
			},
		);
	}

	pi.on("session_start", async () => {
		poll();
		if (pollInterval) clearInterval(pollInterval);
		pollInterval = setInterval(poll, POLL_INTERVAL_MS);
		pollInterval.unref?.();
	});

	pi.on("session_shutdown", async () => {
		if (pollInterval) {
			clearInterval(pollInterval);
			pollInterval = undefined;
		}
	});

	// /sessions — floating overlay panel
	pi.registerCommand("sessions", {
		description: "Show all running pi sessions in a floating panel",
		handler: async (_args, ctx: ExtensionCommandContext) => {
			await openSessionsPanel(ctx);
		},
	});

	return { openSessionsPanel };
}
