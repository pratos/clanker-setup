/**
 * Mission Control — Tool Activity Panel
 *
 * Persistent widget below the mission control header showing tool calls,
 * skill loads, and execution history. Not a floating window.
 *
 * Features:
 *   - Real-time tool execution tracking with status icons
 *   - Skill loading detection (SKILL.md reads)
 *   - Compact Spindle-style formatting
 *   - Auto-shows on first tool call, auto-hides 3s after agent ends
 *   - /history command for full session tool log
 *
 * Shortcut:
 *   Ctrl+Shift+A — toggle panel visibility
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { isToolCallEventType } from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import * as path from "node:path";
import type { MissionControlState } from "./state.js";
import { formatTokens } from "./utils.js";

// ── Token Estimation ───────────────────────────────────────────────

/** Estimate tokens from tool result content (~4 chars per token for English text) */
function estimateTokensFromResult(result: any): number {
	if (!result) return 0;
	let totalChars = 0;

	// Handle pi tool result format: { content: [{ type: "text", text: "..." }, ...] }
	const content = result.content || result;
	if (Array.isArray(content)) {
		for (const item of content) {
			if (item.type === "text" && typeof item.text === "string") {
				totalChars += item.text.length;
			} else if (item.type === "image") {
				// Images typically use ~85 tokens for low-res, more for high-res
				totalChars += 340; // ~85 tokens * 4 chars
			}
		}
	} else if (typeof content === "string") {
		totalChars = content.length;
	} else if (typeof result === "string") {
		totalChars = result.length;
	}

	// Also count tool call input as context (the args sent to the tool)
	// ~4 chars per token is a reasonable approximation
	return Math.ceil(totalChars / 4);
}

// ── Types ──────────────────────────────────────────────────────────

export interface ToolEntry {
	name: string;
	toolCallId: string;
	args: Record<string, any>;
	startTime: number;
	endTime?: number;
	status: "running" | "done" | "error";
	errorMsg?: string;
	/** Approximate tokens added to context by this tool's result */
	resultTokens?: number;
}

// ── Tool Activity Formatting (Spindle-style) ───────────────────────

export function fmtTool(name: string, args: Record<string, any>, theme: any): string {
	switch (name) {
		case "bash": {
			const raw = (args.command || "...") as string;
			const realLines = raw.split("\n").filter((l) => {
				const t = l.trim();
				return t && !t.startsWith("#") && !t.startsWith("set ") && t !== "set";
			});
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
					`:${args.offset ?? 1}${args.limit ? `-${(args.offset ?? 1) + args.limit - 1}` : ""}`,
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

const MAX_VISIBLE = 8;

// ── Setup ──────────────────────────────────────────────────────────

export function setupActivityPanel(pi: ExtensionAPI, state: MissionControlState) {
	const toolHistory: ToolEntry[] = [];
	const loadedSkills = new Set<string>();
	const sessionToolLog: ToolEntry[] = [];
	let lastCtx: ExtensionContext | undefined;
	let autoHideTimer: ReturnType<typeof setTimeout> | undefined;
	let firstToolOfTurn = true;
	let userToggled = false; // when true, skip auto-show and auto-hide
	let scrollOffset = 0; // 0 = pinned to bottom (latest), >0 = scrolled up
	let userScrolled = false; // when true, don't auto-scroll to bottom on new tools

	// ── Render widget ──

	function applyWidget(ctx: ExtensionContext) {
		lastCtx = ctx;
		if (!ctx.hasUI || !state.enabled) return;

		if (!state.activityPanelVisible) {
			ctx.ui.setWidget("mctl-activity", undefined);
			return;
		}

		ctx.ui.setWidget(
			"mctl-activity",
			(_tui, theme) => ({
				render(width: number): string[] {
					const lines: string[] = [];
					const div = theme.fg("dim", "─".repeat(width));

					// ── Title bar ──
					const running = toolHistory.filter((t) => t.status === "running").length;
					const done = toolHistory.filter((t) => t.status === "done").length;
					const errors = toolHistory.filter((t) => t.status === "error").length;
					const totalMs = toolHistory.reduce(
						(s, t) => s + ((t.endTime ?? Date.now()) - t.startTime),
						0,
					);

					const title = theme.fg("accent", " Tool Activity ");
					const counters = [
						running > 0 ? theme.fg("accent", `○ ${running}`) : "",
						done > 0 ? theme.fg("success", `✓ ${done}`) : "",
						errors > 0 ? theme.fg("error", `✗ ${errors}`) : "",
					]
						.filter(Boolean)
						.join(" ");
					const totalCtxTokens = toolHistory.reduce(
						(s, t) => s + (t.resultTokens ?? 0),
						0,
					);
					const stats = theme.fg("dim", `${toolHistory.length} · ${(totalMs / 1000).toFixed(1)}s`);
					const ctxAdded = totalCtxTokens > 0
						? "  " + theme.fg("muted", `+${formatTokens(totalCtxTokens)} ctx`)
						: "";
					const titleW = visibleWidth(title);
					const rightPart = counters + (counters ? "  " : "") + stats + ctxAdded;
					const rightW = visibleWidth(rightPart);
					const dashLen = Math.max(0, width - titleW - rightW - 2);
					lines.push(
						truncateToWidth(
							theme.fg("dim", "─".repeat(2)) +
								title +
								theme.fg("dim", "─".repeat(dashLen)) +
								" " +
								rightPart +
								" ",
							width,
						),
					);

					// ── Skills ──
					if (loadedSkills.size > 0) {
						const skillList = [...loadedSkills].sort().join(theme.fg("dim", ", "));
						lines.push(
							truncateToWidth(
								"  " +
									theme.fg("accent", "📚") +
									" " +
									theme.fg("muted", "Skills:") +
									" " +
									skillList,
								width,
							),
						);
					}

					// ── Tool entries (scrollable window) ──
					const total = toolHistory.length;
					// scrollOffset 0 = bottom (show latest), clamped to valid range
					const maxOffset = Math.max(0, total - MAX_VISIBLE);
					const clampedOffset = Math.min(Math.max(0, scrollOffset), maxOffset);
					const startIdx = Math.max(0, total - MAX_VISIBLE - clampedOffset);
					const endIdx = Math.min(total, startIdx + MAX_VISIBLE);
					const visible = toolHistory.slice(startIdx, endIdx);
					const hiddenAbove = startIdx;
					const hiddenBelow = total - endIdx;

					if (hiddenAbove > 0) {
						lines.push(
							truncateToWidth(
								"  " + theme.fg("dim", `↑ ${hiddenAbove} more`),
								width,
							),
						);
					}

					for (const t of visible) {
						const icon =
							t.status === "running"
								? theme.fg("accent", "○")
								: t.status === "error"
									? theme.fg("error", "✗")
									: theme.fg("success", "✓");
						const elapsed = t.endTime
							? theme.fg("dim", `${((t.endTime - t.startTime) / 1000).toFixed(1)}s`)
							: theme.fg("accent", "…");
						// Context tokens added by this tool result
						const ctxPart = t.resultTokens != null && t.resultTokens > 0
							? theme.fg("muted", ` +${formatTokens(t.resultTokens)}`)
							: "";
						const toolStr = fmtTool(t.name, t.args, theme);
						const left = `  ${icon} ${toolStr}`;
						const right = ctxPart + "  " + elapsed;
						const leftW = visibleWidth(left);
						const rightW = visibleWidth(right);
						const gap = Math.max(1, width - leftW - rightW);
						lines.push(truncateToWidth(`${left}${" ".repeat(gap)}${right}`, width));

						if (t.status === "error" && t.errorMsg) {
							const errLine = t.errorMsg.split("\n")[0] || "";
							lines.push(
								truncateToWidth(`    ${theme.fg("error", "↳ " + errLine)}`, width),
							);
						}
					}

					if (visible.length === 0) {
						lines.push(truncateToWidth("  " + theme.fg("dim", "No tool calls yet"), width));
					}

					if (hiddenBelow > 0) {
						lines.push(
							truncateToWidth(
								"  " + theme.fg("dim", `↓ ${hiddenBelow} more`),
								width,
							),
						);
					}

					// ── Bottom divider ──
					lines.push(div);

					return lines;
				},
				invalidate() {},
			}),
			{ placement: "aboveEditor" },
		);
	}

	// ── /history command ──

	pi.registerCommand("history", {
		description: "Show tool execution history for this session",
		handler: async (_args, ctx) => {
			if (sessionToolLog.length === 0) {
				ctx.ui.notify("No tool calls recorded yet", "info");
				return;
			}

			const theme = ctx.ui.theme;
			const lines: string[] = [];

			let turnNum = 1;
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
				const prevEnd =
					i > 0
						? (sessionToolLog[i - 1].endTime ?? sessionToolLog[i - 1].startTime)
						: t.startTime;

				if (i > 0 && t.startTime - prevEnd > 5000) {
					lines.push(
						theme.fg(
							"dim",
							`  ─── turn ${turnNum}: ${turnTools} tools, ${(turnTime / 1000).toFixed(1)}s` +
								(turnErrors ? theme.fg("error", `, ${turnErrors} err`) : "") +
								` ───`,
						),
					);
					lines.push("");
					turnNum++;
					turnTools = 0;
					turnTime = 0;
					turnErrors = 0;
				}

				turnTools++;
				const dur = (t.endTime ?? Date.now()) - t.startTime;
				turnTime += dur;
				if (t.status === "error") turnErrors++;

				const icon = t.status === "error" ? theme.fg("error", "✗") : theme.fg("success", "✓");
				const elapsed = theme.fg("dim", `${(dur / 1000).toFixed(1)}s`);
				const ctxInfo = t.resultTokens ? theme.fg("muted", ` +${formatTokens(t.resultTokens)}`) : "";
				const toolStr = fmtTool(t.name, t.args, theme);
				lines.push(`  ${icon} ${toolStr}  ${elapsed}${ctxInfo}`);

				if (t.status === "error" && t.errorMsg) {
					lines.push(`    ${theme.fg("error", "↳ " + t.errorMsg.split("\n")[0])}`);
				}
			}

			lines.push(
				theme.fg(
					"dim",
					`  ─── turn ${turnNum}: ${turnTools} tools, ${(turnTime / 1000).toFixed(1)}s` +
						(turnErrors ? theme.fg("error", `, ${turnErrors} err`) : "") +
						` ───`,
				),
			);
			lines.push("");

			const totalTime = sessionToolLog.reduce(
				(s, t) => s + ((t.endTime ?? Date.now()) - t.startTime),
				0,
			);
			const totalErrors = sessionToolLog.filter((t) => t.status === "error").length;
			lines.push(
				theme.bold(`Total: ${sessionToolLog.length} tools · ${(totalTime / 1000).toFixed(1)}s`) +
					(totalErrors ? theme.fg("error", ` · ${totalErrors} errors`) : ""),
			);

			ctx.ui.notify(lines.join("\n"), "info");
		},
	});

	// ── Detect skill loading via SKILL.md reads ──

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
			pi.appendEntry("skill-tracker", {
				event: "skill_loaded",
				skill: skillName,
				skills: [...loadedSkills],
				timestamp: Date.now(),
			});
		}
	});

	// ── Tool execution events → status bar + widget ──

	pi.on("tool_execution_start", async (event, ctx) => {
		const entry: ToolEntry = {
			name: event.toolName,
			toolCallId: event.toolCallId,
			args: event.args ?? {},
			startTime: Date.now(),
			status: "running",
		};
		toolHistory.push(entry);
		if (toolHistory.length > 50) toolHistory.shift();

		// Auto-scroll to bottom on new tool (unless user scrolled up)
		if (!userScrolled) {
			scrollOffset = 0;
		}

		// Clear auto-hide timer if tools start again
		if (autoHideTimer) {
			clearTimeout(autoHideTimer);
			autoHideTimer = undefined;
		}

		// Auto-show on first tool call of a turn (unless user manually toggled)
		if (firstToolOfTurn && ctx.hasUI && !userToggled) {
			firstToolOfTurn = false;
			state.activityPanelVisible = true;
		}

		// Status bar
		if (ctx.hasUI) {
			const theme = ctx.ui.theme;
			ctx.ui.setStatus(
				"tool-activity",
				theme.fg("accent", "○ ") + fmtTool(event.toolName, event.args ?? {}, theme),
			);
		}

		applyWidget(ctx);
	});

	pi.on("tool_execution_end", async (event, ctx) => {
		const entry = toolHistory.find((t) => t.toolCallId === event.toolCallId);
		if (entry) {
			entry.endTime = Date.now();
			entry.status = event.isError ? "error" : "done";

			// Estimate tokens added to context from result
			if (event.result) {
				entry.resultTokens = estimateTokensFromResult(event.result);
			}

			if (event.isError && event.result) {
				const texts = (event.result.content || [])
					.filter((c: any) => c.type === "text")
					.map((c: any) => c.text);
				entry.errorMsg = texts.join("\n").slice(0, 120);
			}
		}

		if (ctx.hasUI) {
			const theme = ctx.ui.theme;
			const icon = event.isError ? theme.fg("error", "✗ ") : theme.fg("success", "✓ ");
			const elapsed = entry ? ` ${((entry.endTime! - entry.startTime) / 1000).toFixed(1)}s` : "";
			const tokens = entry?.resultTokens ? ` +${formatTokens(entry.resultTokens)}` : "";
			ctx.ui.setStatus("tool-activity", icon + theme.fg("dim", event.toolName + elapsed + tokens));
		}

		applyWidget(ctx);
	});

	// Also capture via tool_result for more accurate content measurement
	pi.on("tool_result", async (event, _ctx) => {
		const entry = toolHistory.find((t) => t.toolCallId === event.toolCallId);
		if (entry && event.content) {
			entry.resultTokens = estimateTokensFromResult({ content: event.content });
		}
	});

	// ── Session lifecycle ──

	pi.on("session_start", async (_event, ctx) => {
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
		applyWidget(ctx);
	});

	pi.on("agent_start", async (_event, _ctx) => {
		firstToolOfTurn = true;
		userToggled = false; // reset manual override each turn
		scrollOffset = 0;
		userScrolled = false;
	});

	pi.on("agent_end", async (_event, ctx) => {
		const total = toolHistory.length;
		const errors = toolHistory.filter((t) => t.status === "error").length;
		const totalTime = toolHistory.reduce(
			(s, t) => s + ((t.endTime ?? Date.now()) - t.startTime),
			0,
		);

		if (ctx.hasUI && total > 0) {
			const theme = ctx.ui.theme;
			ctx.ui.setStatus(
				"tool-activity",
				`${theme.fg("success", "✓")} ${theme.fg("dim", `${total} tools · ${(totalTime / 1000).toFixed(1)}s`)}` +
					(errors ? theme.fg("error", ` · ${errors} err`) : ""),
			);
		}

		// Auto-hide widget 3s after agent completes (unless user manually toggled)
		if (!userToggled) {
			autoHideTimer = setTimeout(() => {
				state.activityPanelVisible = false;
				if (lastCtx) applyWidget(lastCtx);
				autoHideTimer = undefined;
			}, 3000);
		}

		// Persist to session log
		sessionToolLog.push(...toolHistory.map((t) => ({ ...t })));
		if (sessionToolLog.length > 200) sessionToolLog.splice(0, sessionToolLog.length - 200);
		toolHistory.length = 0;
	});

	function togglePanel(ctx: ExtensionContext) {
		userToggled = true;
		state.activityPanelVisible = !state.activityPanelVisible;
		// Cancel any pending auto-hide
		if (autoHideTimer) {
			clearTimeout(autoHideTimer);
			autoHideTimer = undefined;
		}
		applyWidget(ctx);
	}

	function scrollUp(ctx: ExtensionContext) {
		if (!state.activityPanelVisible) return;
		const maxOffset = Math.max(0, toolHistory.length - MAX_VISIBLE);
		scrollOffset = Math.min(scrollOffset + 1, maxOffset);
		userScrolled = scrollOffset > 0;
		applyWidget(ctx);
	}

	function scrollDown(ctx: ExtensionContext) {
		if (!state.activityPanelVisible) return;
		scrollOffset = Math.max(0, scrollOffset - 1);
		userScrolled = scrollOffset > 0;
		applyWidget(ctx);
	}

	return { applyWidget, togglePanel, scrollUp, scrollDown };
}
