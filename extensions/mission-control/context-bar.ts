/**
 * Mission Control — Context Usage State Tracker
 *
 * Updates context state from pi's usage API.
 * Rendering is handled by the unified footer (row 3).
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { MissionControlState } from "./state.js";

export function setupContextBar(pi: ExtensionAPI, state: MissionControlState) {
	function updateContext(ctx: ExtensionContext) {
		const usage = ctx.getContextUsage?.();
		if (!usage || usage.percent === null || usage.tokens === null) return;

		state.contextPercent = usage.percent;
		state.contextTokens = usage.tokens;
		state.contextWindow = usage.contextWindow;
	}

	pi.on("turn_end", async (_event, ctx) => {
		updateContext(ctx);
	});

	pi.on("session_start", async (_event, ctx) => {
		updateContext(ctx);
	});

	pi.on("session_switch", async (_event, ctx) => {
		updateContext(ctx);
	});

	pi.on("session_compact", async (_event, ctx) => {
		updateContext(ctx);
	});

	// Kept for API compatibility with index.ts toggle — now a no-op
	return { updateWidget: (_ctx: ExtensionContext) => {} };
}
