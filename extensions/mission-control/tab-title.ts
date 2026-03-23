/**
 * Mission Control — Tab Title
 *
 * Sets terminal tab title with emoji run status.
 * Replaces @tmustier/pi-tab-status.
 *
 * States: 🆕 new | ⏳ running | ✅ committed | 🚧 done (no commit) | 🛑 error/timeout
 */

import type { AssistantMessage } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { basename } from "node:path";
import type { MissionControlState } from "./state.js";

type RunStatus = "new" | "running" | "done-committed" | "done-clean" | "error";

const STATUS_EMOJI: Record<RunStatus, string> = {
	new: "🆕",
	running: "⏳",
	"done-committed": "✅",
	"done-clean": "🚧",
	error: "🛑",
};

const TIMEOUT_MS = 180_000; // 3 minutes

export function setupTabTitle(pi: ExtensionAPI, state: MissionControlState) {
	let runStatus: RunStatus = "new";
	let timeoutId: ReturnType<typeof setTimeout> | undefined;

	function setTitle(ctx: ExtensionContext) {
		if (!ctx.hasUI) return;
		const dir = basename(ctx.cwd || "pi");
		ctx.ui.setTitle(`${STATUS_EMOJI[runStatus]} pi — ${dir}`);
	}

	function resetTimeout(ctx: ExtensionContext) {
		if (timeoutId) clearTimeout(timeoutId);
		timeoutId = setTimeout(() => {
			if (state.isRunning) {
				runStatus = "error";
				setTitle(ctx);
			}
		}, TIMEOUT_MS);
	}

	pi.on("session_start", async (_event, ctx) => {
		runStatus = "new";
		setTitle(ctx);
	});

	pi.on("session_switch", async (event, ctx) => {
		runStatus = event.reason === "new" ? "new" : "done-clean";
		setTitle(ctx);
	});

	pi.on("agent_start", async (_event, ctx) => {
		runStatus = "running";
		state.isRunning = true;
		setTitle(ctx);
		resetTimeout(ctx);
	});

	pi.on("turn_start", async (_event, ctx) => {
		if (runStatus === "error") {
			runStatus = "running";
			setTitle(ctx);
		}
		resetTimeout(ctx);
	});

	pi.on("agent_end", async (event, ctx) => {
		state.isRunning = false;
		if (timeoutId) clearTimeout(timeoutId);

		// Check for errors in the last assistant message
		const lastMsg = [...event.messages].reverse().find((m) => m.role === "assistant") as
			| AssistantMessage
			| undefined;

		if (lastMsg?.stopReason === "error") {
			runStatus = "error";
		} else {
			runStatus = state.sawCommit ? "done-committed" : "done-clean";
		}
		setTitle(ctx);
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		if (timeoutId) clearTimeout(timeoutId);
		if (ctx.hasUI) {
			ctx.ui.setTitle(`pi — ${basename(ctx.cwd || "pi")}`);
		}
	});
}
