/**
 * Mission Control — Tool Tracker & History
 *
 * Tracks tool executions and skill loads for the dashboard and /history
 * command. No persistent widget is rendered.
 *
 *   - Tool execution tracking + result token estimation
 *   - Skill loading detection (SKILL.md reads)
 *   - /history command for full session tool log
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
			let raw = (args.command || "...") as string;

			// Unwrap bash -c '...' / bash -c "..." wrappers to show the inner script
			const bashCMatch = raw.match(/^bash\s+-c\s+['"](.*)$/s);
			if (bashCMatch) {
				// Strip the wrapper, use inner content
				raw = bashCMatch[1].replace(/['"]$/, "");
			}

			const realLines = raw.split("\n").filter((l) => {
				const t = l.trim();
				return t && !t.startsWith("#") && !t.startsWith("set ") && t !== "set" && t !== "'" && t !== '"';
			});
			const firstLine = (realLines[0] || raw.split("\n")[0] || "...").trim();

			// For multi-line scripts, build a brief summary
			let cmd: string;
			if (realLines.length > 3) {
				// Summarize: first meaningful line + line count
				cmd = `${firstLine} (${realLines.length} lines)`;
			} else {
				cmd = firstLine;
			}

			return (
				theme.fg("muted", "$ ") +
				theme.fg("toolOutput", cmd.length > 50 ? cmd.slice(0, 50) + "…" : cmd)
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

// ── Setup ──────────────────────────────────────────────────────────

export function setupActivityPanel(pi: ExtensionAPI, state: MissionControlState) {
	const toolHistory: ToolEntry[] = [];
	const loadedSkills = new Set<string>();
	const sessionToolLog: ToolEntry[] = [];

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

	// ── Tool execution events → status bar ──

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

		// Status bar
		if (ctx.hasUI) {
			const theme = ctx.ui.theme;
			ctx.ui.setStatus(
				"tool-activity",
				theme.fg("accent", "○ ") + fmtTool(event.toolName, event.args ?? {}, theme),
			);
		}
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

		// Persist to session log
		sessionToolLog.push(...toolHistory.map((t) => ({ ...t })));
		if (sessionToolLog.length > 200) sessionToolLog.splice(0, sessionToolLog.length - 200);
		toolHistory.length = 0;
	});

	function getSessionToolLog(): ToolEntry[] {
		return [...sessionToolLog, ...toolHistory.map(t => ({ ...t }))];
	}

	function getLoadedSkills(): Set<string> {
		return new Set(loadedSkills);
	}

	return { getSessionToolLog, getLoadedSkills };
}
