/**
 * Mission Control — MCP Server Panel
 *
 * Shows configured MCP servers with their tools in a floating overlay.
 * Also lists registered keyboard shortcuts.
 *
 * Shortcut:
 *   Ctrl+Shift+J — open MCP & shortcuts panel
 */

import type { ExtensionAPI, ExtensionContext, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { matchesKey, truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import type { Theme, TUI } from "@mariozechner/pi-tui";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// ── Types ──────────────────────────────────────────────────────────

interface McpServer {
	name: string;
	type?: string;
	url?: string;
	command?: string;
	lifecycle?: string;
}

interface ShortcutEntry {
	key: string;
	description: string;
}

// ── Data Helpers ───────────────────────────────────────────────────

function getMcpServers(): McpServer[] {
	try {
		const configPath = join(
			process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent"),
			"mcp.json",
		);
		const content = readFileSync(configPath, "utf-8");
		const config = JSON.parse(content);
		const servers = config.mcpServers || config["mcp-servers"] || {};
		return Object.entries(servers).map(([name, cfg]: [string, any]) => ({
			name,
			type: cfg.type,
			url: cfg.url,
			command: cfg.command,
			lifecycle: cfg.lifecycle,
		}));
	} catch {
		return [];
	}
}

function getMcpToolsForServer(serverName: string, allTools: Array<{ name: string; description?: string }>): string[] {
	// MCP tools are typically prefixed with server name: "deepwiki_ask_question"
	const prefix = serverName + "_";
	return allTools
		.filter((t) => t.name.startsWith(prefix))
		.map((t) => t.name.replace(prefix, ""));
}

// ── Panel Component ────────────────────────────────────────────────

class McpShortcutsPanel {
	private scrollOffset = 0;
	private cachedLines?: string[];
	private cachedWidth?: number;

	constructor(
		private tui: TUI,
		private theme: Theme,
		private servers: McpServer[],
		private serverTools: Map<string, string[]>,
		private shortcuts: ShortcutEntry[],
		private done: () => void,
	) {}

	handleInput(data: string): void {
		if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c") || matchesKey(data, "q")) {
			this.done();
		} else if (matchesKey(data, "up") || matchesKey(data, "k")) {
			this.scrollOffset = Math.max(0, this.scrollOffset - 1);
			this.invalidate();
			this.tui.requestRender();
		} else if (matchesKey(data, "down") || matchesKey(data, "j")) {
			this.scrollOffset++;
			this.invalidate();
			this.tui.requestRender();
		} else if (matchesKey(data, "pageup")) {
			this.scrollOffset = Math.max(0, this.scrollOffset - 10);
			this.invalidate();
			this.tui.requestRender();
		} else if (matchesKey(data, "pagedown")) {
			this.scrollOffset += 10;
			this.invalidate();
			this.tui.requestRender();
		}
	}

	render(width: number): string[] {
		if (this.cachedLines && this.cachedWidth === width) {
			return this.cachedLines;
		}

		const th = this.theme;
		const W = Math.max(1, width - 2);
		const pad = (s: string) => truncateToWidth(s, W, "…", true);
		const bdr = (c: string) => th.fg("border", c);

		const allLines: string[] = [];

		// ── Header ──
		const headerTitle = " MCP Servers & Shortcuts ";
		const dashLen = Math.max(0, W - visibleWidth(headerTitle));
		allLines.push(bdr("╭") + th.fg("accent", headerTitle) + bdr("─".repeat(dashLen)) + bdr("╮"));

		// ── MCP Servers ──
		allLines.push(bdr("│") + pad(` ${th.fg("accent", th.bold("MCP Servers"))} ${th.fg("dim", `(${this.servers.length})`)}`) + bdr("│"));
		allLines.push(bdr("├") + bdr("─".repeat(W)) + bdr("┤"));

		if (this.servers.length === 0) {
			allLines.push(bdr("│") + pad(th.fg("dim", "  No MCP servers configured")) + bdr("│"));
		} else {
			for (const server of this.servers) {
				// Server name + type
				const typeStr = server.type === "http"
					? th.fg("dim", ` (${server.url || "http"})`)
					: server.command
						? th.fg("dim", ` (${server.command})`)
						: "";
				const lifecycleStr = server.lifecycle
					? th.fg("dim", ` · ${server.lifecycle}`)
					: "";
				allLines.push(
					bdr("│") +
						pad(`  ${th.fg("success", "●")} ${th.fg("accent", server.name)}${typeStr}${lifecycleStr}`) +
						bdr("│"),
				);

				// Tools for this server
				const tools = this.serverTools.get(server.name) || [];
				if (tools.length > 0) {
					for (const tool of tools) {
						allLines.push(
							bdr("│") + pad(`    ${th.fg("dim", "├")} ${th.fg("muted", tool)}`) + bdr("│"),
						);
					}
				} else {
					allLines.push(
						bdr("│") + pad(`    ${th.fg("dim", "└ no tools loaded")}`) + bdr("│"),
					);
				}
			}
		}

		// ── Shortcuts ──
		allLines.push(bdr("├") + bdr("─".repeat(W)) + bdr("┤"));
		allLines.push(bdr("│") + pad(` ${th.fg("accent", th.bold("Keyboard Shortcuts"))}`) + bdr("│"));
		allLines.push(bdr("├") + bdr("─".repeat(W)) + bdr("┤"));

		for (const sc of this.shortcuts) {
			const keyW = 20;
			const keyStr = th.fg("accent", sc.key.padEnd(keyW));
			const descStr = th.fg("muted", sc.description);
			allLines.push(bdr("│") + pad(`  ${keyStr} ${descStr}`) + bdr("│"));
		}

		// ── Footer ──
		const footerLabel = " ↑↓/jk scroll · q/esc close ";
		const footerDash = Math.max(0, W - visibleWidth(footerLabel));
		allLines.push(bdr("╰") + bdr("─".repeat(footerDash)) + th.fg("dim", footerLabel) + bdr("╯"));

		// Apply scroll
		const maxVisible = 20;
		const contentLines = allLines.slice(1, -1); // exclude header/footer borders
		const maxScroll = Math.max(0, contentLines.length - maxVisible);
		this.scrollOffset = Math.min(this.scrollOffset, maxScroll);

		const visibleContent = contentLines.slice(this.scrollOffset, this.scrollOffset + maxVisible);
		const out = [allLines[0], ...visibleContent, allLines[allLines.length - 1]];

		// Add scroll indicators
		if (this.scrollOffset > 0) {
			out.splice(1, 0, bdr("│") + pad(th.fg("dim", ` ↑ ${this.scrollOffset} more above`)) + bdr("│"));
		}
		if (this.scrollOffset < maxScroll) {
			out.splice(-1, 0, bdr("│") + pad(th.fg("dim", ` ↓ ${maxScroll - this.scrollOffset} more below`)) + bdr("│"));
		}

		this.cachedLines = out;
		this.cachedWidth = width;
		return out;
	}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}
}

// ── Setup ──────────────────────────────────────────────────────────

export function setupMcpPanel(pi: ExtensionAPI) {
	const SHORTCUTS: ShortcutEntry[] = [
		{ key: "Ctrl+Shift+A", description: "Toggle tool activity panel" },
		{ key: "Ctrl+Shift+M", description: "Open sessions panel" },
		{ key: "Ctrl+Shift+J", description: "MCP servers & shortcuts (this panel)" },
		{ key: "Ctrl+Alt+M", description: "Toggle Mission Control" },
		{ key: "Ctrl+L", description: "Select model" },
		{ key: "Ctrl+P", description: "Cycle model forward" },
		{ key: "Shift+Ctrl+P", description: "Cycle model backward" },
		{ key: "Shift+Tab", description: "Cycle thinking level" },
		{ key: "Ctrl+O", description: "Expand/collapse tool output" },
		{ key: "Ctrl+T", description: "Toggle thinking blocks" },
		{ key: "Ctrl+G", description: "Open in external editor" },
		{ key: "Alt+Enter", description: "Queue follow-up message" },
	];

	async function openMcpPanel(ctx: ExtensionContext | ExtensionCommandContext) {
		const servers = getMcpServers();
		const allTools = pi.getAllTools();

		const serverTools = new Map<string, string[]>();
		for (const server of servers) {
			serverTools.set(server.name, getMcpToolsForServer(server.name, allTools));
		}

		await ctx.ui.custom<void>(
			(_tui, theme, _kb, done) => {
				const tui = _tui;
				return new McpShortcutsPanel(tui, theme, servers, serverTools, SHORTCUTS, () => done());
			},
			{
				overlay: true,
				overlayOptions: {
					anchor: "center",
					width: "50%",
					minWidth: 50,
					maxHeight: "80%",
					margin: 2,
				},
			},
		);
	}

	// ── Shortcut ──
	pi.registerShortcut("ctrl+shift+j", {
		description: "Show MCP servers & keyboard shortcuts",
		handler: async (ctx) => {
			await openMcpPanel(ctx as any);
		},
	});

	// ── Command ──
	pi.registerCommand("shortcuts", {
		description: "Show MCP servers & keyboard shortcuts",
		handler: async (_args, ctx) => {
			await openMcpPanel(ctx);
		},
	});

	return { openMcpPanel };
}
