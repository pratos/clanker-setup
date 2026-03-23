/**
 * Mission Control — Unified 3-Row Footer
 *
 * Layout:
 *   Row 1: pi-sub-bar (API usage from extension status)
 *   Row 2: ● opus-4-6  ⚡high  main  ctx:42%  bash  ↑12.3k ↓5.1k  $0.123  [3 files]
 *   Row 3: ctx ▐▌▐▌▐▌▐▌▐▌░░░░░░░░░░░░░░░░░░░░  42% (84.0k / 200.0k)
 */

import type { AssistantMessage } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import type { MissionControlState } from "./state.js";
import { formatCost, formatTokens, getGitStats, getSpinnerFrame, renderProgressBar } from "./utils.js";

const THINKING_LABELS: Record<string, string> = {
	off: "",
	minimal: "⚡min",
	low: "⚡low",
	medium: "⚡med",
	high: "⚡high",
	xhigh: "⚡xhigh",
};

export function setupFooter(pi: ExtensionAPI, state: MissionControlState) {
	let spinnerInterval: NodeJS.Timeout | undefined;
	let lastCtx: ExtensionContext | undefined;
	let tuiRef: { requestRender: () => void } | undefined;

	function startSpinner() {
		if (spinnerInterval) return;
		spinnerInterval = setInterval(() => {
			tuiRef?.requestRender();
		}, 200);
		spinnerInterval.unref?.();
	}

	function stopSpinner() {
		if (spinnerInterval) {
			clearInterval(spinnerInterval);
			spinnerInterval = undefined;
		}
	}

	function refreshGitStats(ctx: ExtensionContext) {
		const stats = getGitStats(ctx.cwd);
		state.gitAdded = stats.added;
		state.gitRemoved = stats.removed;
		state.gitDirty = stats.dirty;
	}

	function applyFooter(ctx: ExtensionContext) {
		lastCtx = ctx;
		if (!ctx.hasUI || !state.enabled) return;

		ctx.ui.setFooter((tui, theme, footerData) => {
			tuiRef = tui;
			const unsub = footerData.onBranchChange(() => tui.requestRender());

			return {
				dispose: unsub,
				invalidate() {},
				render(width: number): string[] {
					const branch = footerData.getGitBranch();
					const extStatuses = footerData.getExtensionStatuses();
					const lines: string[] = [];
					const divider = theme.fg("dim", "─".repeat(width));

					// ═══ Row 1: pi-sub-bar only ═══
					const subBarStatus = extStatuses.get("sub-bar");
					if (subBarStatus) {
						lines.push(divider);
						lines.push(truncateToWidth(subBarStatus, width));
					}

					// Collect checkpoint count from other statuses
					let checkpointStr = "";
					for (const [key, val] of extStatuses) {
						if (!val) continue;
						if (typeof val === "string" && val.includes("checkpoint")) {
							checkpointStr = val;
						}
					}

					// ═══ Row 2: Main status line ═══
					const segments: string[] = [];

					// Status indicator
					if (state.activeTools.size > 0) {
						segments.push(theme.fg("warning", getSpinnerFrame()));
					} else if (state.isRunning) {
						segments.push(theme.fg("accent", "●"));
					} else {
						segments.push(theme.fg("success", "●"));
					}

					// Model (shortened)
					const modelId = ctx.model?.id || "no-model";
					const shortModel = modelId.replace(/^claude-/, "").replace(/-\d{8}$/, "");
					segments.push(theme.fg("accent", shortModel));

					// Thinking level
					const thinkingLevel = pi.getThinkingLevel();
					const thinkingLabel = THINKING_LABELS[thinkingLevel] || "";
					if (thinkingLabel) {
						segments.push(theme.fg("muted", thinkingLabel));
					}

					// Git branch + diff stats + dirty indicator + modified files
					if (branch) {
						let gitStr = theme.fg("muted", " " + branch);
						const { gitAdded, gitRemoved, gitDirty } = state;
						if (gitAdded > 0 || gitRemoved > 0) {
							gitStr += theme.fg("dim", " | ");
							const parts: string[] = [];
							if (gitAdded > 0) parts.push(theme.fg("success", `+${gitAdded}`));
							if (gitRemoved > 0) parts.push(theme.fg("error", `-${gitRemoved}`));
							gitStr += "(" + parts.join(",") + ")";
						}
						gitStr += " " + (gitDirty ? theme.fg("error", "✗") : theme.fg("success", "✓"));
						if (state.modifiedFiles.size > 0) {
							gitStr += " " + theme.fg("muted", `[${state.modifiedFiles.size} files]`);
						}
						segments.push(gitStr);
					}

					// Update context state (rendered in row 3)
					const usage = ctx.getContextUsage?.();
					if (usage && usage.percent !== null) {
						state.contextPercent = usage.percent;
						state.contextTokens = usage.tokens;
						state.contextWindow = usage.contextWindow;
					}

					// Active tool name(s)
					if (state.activeTools.size > 0) {
						const names = [...new Set(Array.from(state.activeTools.values()).map((t) => t.name))];
						segments.push(theme.fg("warning", names[0]));
						if (names.length > 1) {
							segments.push(theme.fg("dim", `+${names.length - 1}`));
						}
					}

					// Right segments
					const rightParts: string[] = [];

					if (state.totalInputTokens > 0 || state.totalOutputTokens > 0) {
						rightParts.push(
							theme.fg("success", "↑") + theme.fg("muted", formatTokens(state.totalInputTokens)) +
								" " +
								theme.fg("warning", "↓") + theme.fg("muted", formatTokens(state.totalOutputTokens)),
						);
					}

					if (state.totalCost > 0) {
						rightParts.push(theme.fg("accent", formatCost(state.totalCost)));
					}

					const sep = " " + theme.fg("dim", "◆") + " ";
					// Status indicator (●) stays tight with model, rest separated by ◆
					const indicator = segments.shift() || "";
					const left = indicator + " " + segments.join(sep);
					const right = rightParts.join(sep);
					const statusContentWidth = visibleWidth(left) + visibleWidth(right);
					const statusPad = " ".repeat(Math.max(1, width - statusContentWidth));
					lines.push(divider);
					lines.push(truncateToWidth(left + statusPad + right, width));

					// ═══ Row 3: Context bar ═══
					const percent = state.contextPercent ?? 0;
					const tokens = state.contextTokens ?? 0;
					const ctxWindow = state.contextWindow || 0;

					if (ctxWindow > 0) {
						const label = theme.fg("dim", "ctx ");
						const cpSuffix = checkpointStr
							? "  " + theme.fg("dim", "◆") + "  " + theme.fg("dim", checkpointStr)
							: "";
						const stats = theme.fg(
							"dim",
							` ${Math.round(percent)}% (${formatTokens(tokens)} / ${formatTokens(ctxWindow)})`,
						) + cpSuffix;
						const labelW = visibleWidth(label);
						const statsW = visibleWidth(stats);
						const barWidth = Math.max(10, width - labelW - statsW);
						const bar = renderProgressBar(percent, barWidth, theme);
						lines.push(divider);
						lines.push(truncateToWidth(label + bar + stats, width));
						lines.push("");
					}

					return lines;
				},
			};
		});
	}

	// ── Event wiring ──

	pi.on("turn_end", async (event, ctx) => {
		state.turnCount++;
		if (event.message.role === "assistant") {
			const msg = event.message as AssistantMessage;
			state.totalInputTokens += msg.usage.input;
			state.totalOutputTokens += msg.usage.output;
			state.totalCost += msg.usage.cost.total;
		}
		if (state.enabled) applyFooter(ctx);
	});

	pi.on("tool_execution_start", async (event) => {
		state.activeTools.set(event.toolCallId, { name: event.toolName, startedAt: Date.now() });
		state.toolCallCount++;
		startSpinner();
	});

	pi.on("tool_execution_end", async (event, ctx) => {
		state.activeTools.delete(event.toolCallId);
		if (state.activeTools.size === 0) stopSpinner();

		// Refresh git stats after file-modifying tools complete
		if (event.toolName === "write" || event.toolName === "edit" || event.toolName === "bash") {
			refreshGitStats(ctx);
			if (state.enabled) applyFooter(ctx);
		}
	});

	pi.on("tool_call", async (event) => {
		if (event.toolName === "write" || event.toolName === "edit") {
			const path = (event.input as Record<string, unknown>).path;
			if (typeof path === "string") state.modifiedFiles.add(path);
		}
		if (event.toolName === "bash") {
			const cmd = (event.input as Record<string, unknown>).command;
			if (typeof cmd === "string" && /\bgit\b[^\n]*\bcommit\b/.test(cmd)) {
				state.sawCommit = true;
			}
		}
	});

	pi.on("agent_start", async (_event, ctx) => {
		state.isRunning = true;
		if (state.enabled) applyFooter(ctx);
	});

	pi.on("agent_end", async (_event, ctx) => {
		state.isRunning = false;
		state.activeTools.clear();
		stopSpinner();
		refreshGitStats(ctx);
		if (state.enabled) applyFooter(ctx);
	});

	pi.on("session_start", async (_event, ctx) => {
		state.totalInputTokens = 0;
		state.totalOutputTokens = 0;
		state.totalCost = 0;
		state.modifiedFiles.clear();
		state.sawCommit = false;
		state.turnCount = 0;
		state.sessionStartTime = Date.now();

		for (const entry of ctx.sessionManager.getBranch()) {
			if (entry.type === "message" && entry.message.role === "assistant") {
				const msg = entry.message as AssistantMessage;
				state.totalInputTokens += msg.usage.input;
				state.totalOutputTokens += msg.usage.output;
				state.totalCost += msg.usage.cost.total;
				state.turnCount++;
			}
		}

		refreshGitStats(ctx);
		applyFooter(ctx);
	});

	pi.on("session_switch", async (_event, ctx) => {
		state.totalInputTokens = 0;
		state.totalOutputTokens = 0;
		state.totalCost = 0;
		state.modifiedFiles.clear();
		state.sawCommit = false;
		state.turnCount = 0;
		state.sessionStartTime = Date.now();
		applyFooter(ctx);
	});

	pi.on("model_select", async (_event, ctx) => {
		if (state.enabled) applyFooter(ctx);
	});

	return { applyFooter };
}
