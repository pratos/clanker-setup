/**
 * Mission Control — MCP Server Panel
 *
 * Interactive panel showing MCP servers, their tools (with toggle), and shortcuts.
 * Press Enter/Space on a tool to enable/disable it.
 * Press 'a' on a server to toggle all its tools at once.
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

// A selectable row in the panel — either a server header or a tool
interface PanelRow {
	kind: "server" | "tool" | "separator" | "shortcut-header" | "shortcut";
	serverName?: string;
	toolName?: string; // full tool name (e.g. "deepwiki_ask_question")
	toolShort?: string; // short name (e.g. "ask_question")
	shortcut?: ShortcutEntry;
	server?: McpServer;
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

function getMcpToolsForServer(serverName: string, allTools: Array<{ name: string; description?: string }>): Array<{ full: string; short: string }> {
	const prefix = serverName + "_";
	return allTools
		.filter((t) => t.name.startsWith(prefix))
		.map((t) => ({ full: t.name, short: t.name.replace(prefix, "") }));
}

export function getMcpServerCounts(): { total: number } {
	return { total: getMcpServers().length };
}

// ── Panel Component ────────────────────────────────────────────────

class McpShortcutsPanel {
	private scrollOffset = 0;
	private selectedIndex = 0;
	private cachedLines?: string[];
	private cachedWidth?: number;
	private rows: PanelRow[] = [];
	private activeTools: Set<string>;
	private notification: string | undefined;
	private notificationTimer: ReturnType<typeof setTimeout> | undefined;

	constructor(
		private tui: TUI,
		private theme: Theme,
		private servers: McpServer[],
		private serverTools: Map<string, Array<{ full: string; short: string }>>,
		private shortcuts: ShortcutEntry[],
		private pi: ExtensionAPI,
		private done: () => void,
	) {
		this.activeTools = new Set(pi.getActiveTools());
		this.buildRows();
	}

	private buildRows(): void {
		this.rows = [];

		// MCP server rows
		for (const server of this.servers) {
			this.rows.push({ kind: "server", serverName: server.name, server });
			const tools = this.serverTools.get(server.name) || [];
			if (tools.length > 0) {
				for (const tool of tools) {
					this.rows.push({
						kind: "tool",
						serverName: server.name,
						toolName: tool.full,
						toolShort: tool.short,
					});
				}
			} else {
				// No tools — still show a placeholder, but not selectable for toggle
			}
		}

		// Separator
		this.rows.push({ kind: "separator" });

		// Shortcuts section
		this.rows.push({ kind: "shortcut-header" });
		for (const sc of this.shortcuts) {
			this.rows.push({ kind: "shortcut", shortcut: sc });
		}
	}

	private isSelectable(row: PanelRow): boolean {
		return row.kind === "server" || row.kind === "tool";
	}

	private moveSelection(dir: -1 | 1): void {
		let next = this.selectedIndex + dir;
		// Skip non-selectable rows
		while (next >= 0 && next < this.rows.length && !this.isSelectable(this.rows[next])) {
			next += dir;
		}
		if (next >= 0 && next < this.rows.length) {
			this.selectedIndex = next;
		}
	}

	private toggleTool(toolName: string): void {
		if (this.activeTools.has(toolName)) {
			this.activeTools.delete(toolName);
		} else {
			this.activeTools.add(toolName);
		}
		this.pi.setActiveTools(Array.from(this.activeTools));
		this.showNotification(`Tools: ${this.activeTools.size} active`);
	}

	private toggleAllServerTools(serverName: string): void {
		const tools = this.serverTools.get(serverName) || [];
		if (tools.length === 0) return;

		const allActive = tools.every((t) => this.activeTools.has(t.full));

		if (allActive) {
			// Disable all tools for this server
			for (const tool of tools) {
				this.activeTools.delete(tool.full);
			}
			this.showNotification(`${serverName}: all tools disabled`);
		} else {
			// Enable all tools for this server
			for (const tool of tools) {
				this.activeTools.add(tool.full);
			}
			this.showNotification(`${serverName}: all tools enabled`);
		}
		this.pi.setActiveTools(Array.from(this.activeTools));
	}

	private showNotification(msg: string): void {
		this.notification = msg;
		if (this.notificationTimer) clearTimeout(this.notificationTimer);
		this.notificationTimer = setTimeout(() => {
			this.notification = undefined;
			this.invalidate();
			this.tui.requestRender();
		}, 2000);
	}

	handleInput(data: string): void {
		if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c") || matchesKey(data, "q")) {
			if (this.notificationTimer) clearTimeout(this.notificationTimer);
			this.done();
			return;
		}

		if (matchesKey(data, "up") || matchesKey(data, "k")) {
			this.moveSelection(-1);
			this.invalidate();
			this.tui.requestRender();
			return;
		}

		if (matchesKey(data, "down") || matchesKey(data, "j")) {
			this.moveSelection(1);
			this.invalidate();
			this.tui.requestRender();
			return;
		}

		if (matchesKey(data, "pageup")) {
			for (let i = 0; i < 5; i++) this.moveSelection(-1);
			this.invalidate();
			this.tui.requestRender();
			return;
		}

		if (matchesKey(data, "pagedown")) {
			for (let i = 0; i < 5; i++) this.moveSelection(1);
			this.invalidate();
			this.tui.requestRender();
			return;
		}

		// Toggle with Enter or Space
		if (matchesKey(data, "enter") || matchesKey(data, "space")) {
			const row = this.rows[this.selectedIndex];
			if (row?.kind === "tool" && row.toolName) {
				this.toggleTool(row.toolName);
				this.invalidate();
				this.tui.requestRender();
			} else if (row?.kind === "server" && row.serverName) {
				this.toggleAllServerTools(row.serverName);
				this.invalidate();
				this.tui.requestRender();
			}
			return;
		}

		// 'a' to toggle all tools for the server of the current row
		if (data === "a" || data === "A") {
			const row = this.rows[this.selectedIndex];
			const serverName = row?.serverName;
			if (serverName) {
				this.toggleAllServerTools(serverName);
				this.invalidate();
				this.tui.requestRender();
			}
			return;
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
		const activeCount = this.pi.getActiveTools().length;
		const totalCount = this.pi.getAllTools().length;
		allLines.push(
			bdr("│") +
				pad(
					` ${th.fg("accent", th.bold("MCP Servers"))} ${th.fg("dim", `(${this.servers.length})`)}` +
						`  ${th.fg("dim", "Tools:")} ${th.fg("muted", `${activeCount}/${totalCount} active`)}`,
				) +
				bdr("│"),
		);
		allLines.push(bdr("├") + bdr("─".repeat(W)) + bdr("┤"));

		if (this.servers.length === 0) {
			allLines.push(bdr("│") + pad(th.fg("dim", "  No MCP servers configured")) + bdr("│"));
		}

		// ── Render rows ──
		for (let i = 0; i < this.rows.length; i++) {
			const row = this.rows[i];
			const isSelected = i === this.selectedIndex;
			const cursor = isSelected ? th.fg("accent", "▸ ") : "  ";

			switch (row.kind) {
				case "server": {
					const server = row.server!;
					const tools = this.serverTools.get(server.name) || [];
					const serverActiveCount = tools.filter((t) => this.activeTools.has(t.full)).length;
					const allOn = tools.length > 0 && serverActiveCount === tools.length;
					const someOn = serverActiveCount > 0 && !allOn;

					const statusIcon = allOn
						? th.fg("success", "●")
						: someOn
							? th.fg("warning", "◐")
							: th.fg("dim", "○");

					const typeStr = server.type === "http"
						? th.fg("dim", ` (${server.url || "http"})`)
						: server.command
							? th.fg("dim", ` (${server.command})`)
							: "";
					const lifecycleStr = server.lifecycle
						? th.fg("dim", ` · ${server.lifecycle}`)
						: "";
					const toolCountStr = tools.length > 0
						? th.fg("dim", ` [${serverActiveCount}/${tools.length}]`)
						: th.fg("dim", " [no tools]");

					const line = `${cursor}${statusIcon} ${th.fg("accent", server.name)}${typeStr}${lifecycleStr}${toolCountStr}`;
					allLines.push(bdr("│") + pad(line) + bdr("│"));
					break;
				}

				case "tool": {
					const isActive = this.activeTools.has(row.toolName!);
					const checkbox = isActive
						? th.fg("success", "☑")
						: th.fg("dim", "☐");
					const toolColor = isActive ? "muted" : "dim";
					const line = `${cursor}  ${checkbox} ${th.fg(toolColor, row.toolShort!)}`;
					allLines.push(bdr("│") + pad(line) + bdr("│"));
					break;
				}

				case "separator":
					allLines.push(bdr("├") + bdr("─".repeat(W)) + bdr("┤"));
					break;

				case "shortcut-header":
					allLines.push(bdr("│") + pad(` ${th.fg("accent", th.bold("Keyboard Shortcuts"))}`) + bdr("│"));
					allLines.push(bdr("├") + bdr("─".repeat(W)) + bdr("┤"));
					break;

				case "shortcut": {
					const sc = row.shortcut!;
					const keyW = 20;
					const keyStr = th.fg("accent", sc.key.padEnd(keyW));
					const descStr = th.fg("muted", sc.description);
					allLines.push(bdr("│") + pad(`  ${keyStr} ${descStr}`) + bdr("│"));
					break;
				}
			}
		}

		// ── Notification ──
		if (this.notification) {
			allLines.push(bdr("├") + bdr("─".repeat(W)) + bdr("┤"));
			allLines.push(bdr("│") + pad(` ${th.fg("success", "✓")} ${th.fg("muted", this.notification)}`) + bdr("│"));
		}

		// ── Footer ──
		const footerLabel = " ↑↓ navigate · enter/space toggle · a toggle all · q close ";
		const footerDash = Math.max(0, W - visibleWidth(footerLabel));
		allLines.push(bdr("╰") + bdr("─".repeat(footerDash)) + th.fg("dim", footerLabel) + bdr("╯"));

		// Apply scroll
		const maxVisible = 24;
		const contentLines = allLines.slice(1, -1);
		const maxScroll = Math.max(0, contentLines.length - maxVisible);

		// Auto-scroll to keep selected row visible
		const selectedContentIndex = this.getSelectedContentLineIndex(allLines);
		if (selectedContentIndex >= 0) {
			if (selectedContentIndex < this.scrollOffset) {
				this.scrollOffset = selectedContentIndex;
			} else if (selectedContentIndex >= this.scrollOffset + maxVisible) {
				this.scrollOffset = selectedContentIndex - maxVisible + 1;
			}
		}
		this.scrollOffset = Math.min(this.scrollOffset, maxScroll);

		const visibleContent = contentLines.slice(this.scrollOffset, this.scrollOffset + maxVisible);
		const out = [allLines[0], ...visibleContent, allLines[allLines.length - 1]];

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

	/** Find the content-line index (0-based, excluding header) for the selected row */
	private getSelectedContentLineIndex(allLines: string[]): number {
		// Count lines before the selected row's rendered line
		let lineIndex = 0; // skip header line
		for (let i = 0; i < this.rows.length; i++) {
			if (i === this.selectedIndex) return lineIndex;
			const row = this.rows[i];
			switch (row.kind) {
				case "server":
				case "tool":
				case "shortcut":
					lineIndex++;
					break;
				case "separator":
					lineIndex++;
					break;
				case "shortcut-header":
					lineIndex += 2; // header line + separator
					break;
			}
		}
		return lineIndex;
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
		{ key: "Ctrl+Shift+M", description: "Open Mission Control dashboard" },
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

		const serverTools = new Map<string, Array<{ full: string; short: string }>>();
		for (const server of servers) {
			serverTools.set(server.name, getMcpToolsForServer(server.name, allTools));
		}

		await ctx.ui.custom<void>(
			(_tui, theme, _kb, done) => {
				const tui = _tui;
				return new McpShortcutsPanel(tui, theme, servers, serverTools, SHORTCUTS, pi, () => done());
			},
			{
				overlay: true,
				overlayOptions: {
					anchor: "center",
					width: "60%",
					minWidth: 55,
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
