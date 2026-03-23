/**
 * Mission Control — Pi Status Bar Extension
 *
 * A unified dashboard experience with:
 *   - Header widget (workspace, elapsed time, session count) — always visible above editor
 *   - Activity panel (tool calls, skills) — below header, above editor
 *   - Rich footer (model, thinking level, branch, ctx%, tokens, cost, files)
 *   - Context usage progress bar (below editor, segmented style)
 *   - Session tracker (other running pi instances)
 *   - Dynamic tab title with run status emoji
 *
 * Commands:
 *   /mctl off     — disable Mission Control UI
 *   /mctl on      — re-enable Mission Control UI
 *   /sessions     — show all running pi sessions
 *   /history      — show tool execution history
 *   /shortcuts    — show MCP servers & keyboard shortcuts
 *
 * Shortcuts:
 *   Ctrl+Alt+M      — toggle Mission Control visibility
 *   Ctrl+Shift+A    — toggle activity panel
 *   Ctrl+Shift+M    — open sessions panel
 *   Ctrl+Shift+J    — MCP servers & keyboard shortcuts
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { setupActivityPanel } from "./activity-panel.js";
import { setupContextBar } from "./context-bar.js";
import { setupFooter } from "./footer.js";
import { setupHeader } from "./header.js";
import { setupMcpPanel } from "./mcp-panel.js";
import { setupSessionTracker } from "./sessions.js";
import { createState } from "./state.js";
import { setupTabTitle } from "./tab-title.js";

export default function missionControl(pi: ExtensionAPI) {
	const state = createState();

	// Wire up all modules
	const { applyHeader } = setupHeader(pi, state);
	const { applyFooter } = setupFooter(pi, state);
	const { applyWidget: applyActivity, togglePanel: toggleActivity } = setupActivityPanel(pi, state);
	setupContextBar(pi, state);
	const { openSessionsPanel } = setupSessionTracker(pi, state);
	setupMcpPanel(pi);
	setupTabTitle(pi, state);

	// ── Toggle command ──

	pi.registerCommand("mctl", {
		description: "Mission Control: toggle components (on/off)",
		handler: async (args, ctx) => {
			const arg = (args || "").trim().toLowerCase();

			if (arg === "off") {
				state.enabled = false;
				ctx.ui.setWidget("mctl-header", undefined);
				ctx.ui.setWidget("mctl-activity", undefined);
				ctx.ui.setFooter(undefined);
				ctx.ui.notify("Mission Control disabled. Use /mctl on to re-enable.", "info");
				return;
			}

			if (arg === "on") {
				state.enabled = true;
				applyHeader(ctx);
				applyFooter(ctx);
				if (state.activityPanelVisible) applyActivity(ctx);
				ctx.ui.notify("Mission Control re-enabled.", "info");
				return;
			}

			if (!arg) {
				state.enabled = !state.enabled;
				if (state.enabled) {
					applyHeader(ctx);
					applyFooter(ctx);
					if (state.activityPanelVisible) applyActivity(ctx);
					ctx.ui.notify("Mission Control enabled.", "info");
				} else {
					ctx.ui.setWidget("mctl-header", undefined);
					ctx.ui.setWidget("mctl-activity", undefined);
					ctx.ui.setFooter(undefined);
					ctx.ui.notify("Mission Control disabled.", "info");
				}
				return;
			}

			ctx.ui.notify("Usage: /mctl [on|off]  — or just /mctl to toggle", "info");
		},
	});

	// ── Keyboard shortcuts ──

	pi.registerShortcut("ctrl+alt+m", {
		description: "Toggle Mission Control visibility",
		handler: async (ctx) => {
			state.enabled = !state.enabled;
			if (state.enabled) {
				applyHeader(ctx);
				applyFooter(ctx);
				if (state.activityPanelVisible) applyActivity(ctx);
			} else {
				ctx.ui.setWidget("mctl-header", undefined);
				ctx.ui.setWidget("mctl-activity", undefined);
				ctx.ui.setFooter(undefined);
			}
		},
	});

	pi.registerShortcut("ctrl+shift+a", {
		description: "Toggle activity panel",
		handler: async (ctx) => {
			toggleActivity(ctx);
		},
	});

	pi.registerShortcut("ctrl+shift+m", {
		description: "Open sessions panel",
		handler: async (ctx) => {
			await openSessionsPanel(ctx);
		},
	});
}
