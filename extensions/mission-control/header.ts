/**
 * Mission Control — Header Widget
 *
 * Persistent bar above the editor (always visible, doesn't scroll away).
 *
 * Row 1: ⌘ Mission Control  ~/laptop                       Time 2h 15m · 3 sessions
 * Row 2: Tools 12/16 active · MCP 2/3 servers · Sessions 3
 *        ──────────────────────────────────────────────────────────────────────────
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import type { MissionControlState } from "./state.js";
import { formatDuration, shortenPath } from "./utils.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

/** Read MCP server count from config file */
function getMcpServerCounts(): { total: number; connected: number } {
	try {
		const configPath = join(
			process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent"),
			"mcp.json",
		);
		const content = readFileSync(configPath, "utf-8");
		const config = JSON.parse(content);
		const servers = config.mcpServers || config["mcp-servers"] || {};
		return { total: Object.keys(servers).length, connected: 0 };
	} catch {
		return { total: 0, connected: 0 };
	}
}

export function setupHeader(pi: ExtensionAPI, state: MissionControlState) {
	let timerInterval: NodeJS.Timeout | undefined;
	let lastCtx: ExtensionContext | undefined;

	function applyHeader(ctx: ExtensionContext) {
		lastCtx = ctx;
		if (!ctx.hasUI || !state.enabled) return;

		ctx.ui.setWidget(
			"mctl-header",
			(_tui, theme) => ({
				render(width: number): string[] {
					const elapsed = formatDuration(Date.now() - state.sessionStartTime);
					const cwd = shortenPath(ctx.cwd);
					const sessionCount = state.otherSessions.length;

					// ── Row 1: Title + workspace + time ──
					const left =
						theme.fg("accent", "⌘") +
						theme.fg("accent", theme.bold(" Mission Control")) +
						"  " +
						theme.fg("muted", cwd);

					const timePart = theme.fg("dim", "Time ") + theme.fg("muted", elapsed);
					const workingCount = state.otherSessions.filter((s) => s.status === "working").length;
					let sessionInfo = `${sessionCount + 1} sessions`;
					if (workingCount > 0) {
						sessionInfo += ` · ${workingCount} working`;
					}
					const sessionPart =
						sessionCount > 0
							? theme.fg("dim", " ◆ ") + theme.fg(workingCount > 0 ? "warning" : "muted", sessionInfo)
							: "";
					const right = timePart + sessionPart;

					const pad1 = " ".repeat(Math.max(1, width - visibleWidth(left) - visibleWidth(right)));
					const row1 = truncateToWidth(left + pad1 + right, width);

					// ── Row 2: Tools · MCP · Sessions ──
					const statusParts: string[] = [];

					// Tools
					const activeTools = pi.getActiveTools();
					const allTools = pi.getAllTools();
					statusParts.push(
						theme.fg("dim", "Tools ") +
							theme.fg("muted", `${activeTools.length}/${allTools.length}`),
					);

					// MCP servers
					const mcp = getMcpServerCounts();
					if (mcp.total > 0) {
						statusParts.push(
							theme.fg("dim", "MCP ") +
								theme.fg("muted", `${mcp.total} servers`),
						);
					}

					const row2 = truncateToWidth(statusParts.join(theme.fg("dim", "  ◆  ")), width);

					return [row1, row2];
				},
				invalidate() {},
			}),
			{ placement: "aboveEditor" },
		);
	}

	pi.on("session_start", async (_event, ctx) => {
		state.sessionStartTime = Date.now();
		applyHeader(ctx);

		if (timerInterval) clearInterval(timerInterval);
		timerInterval = setInterval(() => {
			if (lastCtx && state.enabled) applyHeader(lastCtx);
		}, 30_000);
		timerInterval.unref?.();
	});

	pi.on("session_switch", async (event, ctx) => {
		if (event.reason === "new") state.sessionStartTime = Date.now();
		applyHeader(ctx);
	});

	pi.on("session_shutdown", async () => {
		if (timerInterval) {
			clearInterval(timerInterval);
			timerInterval = undefined;
		}
	});

	return { applyHeader };
}
