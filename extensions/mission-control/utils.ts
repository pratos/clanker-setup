/**
 * Shared formatting utilities for Mission Control.
 */

import type { Theme } from "@mariozechner/pi-coding-agent";
import { execSync } from "node:child_process";

/** Get git diff stats (added/removed lines) and dirty status */
export function getGitStats(cwd: string): { added: number; removed: number; dirty: boolean } {
	try {
		// Diff stats (staged + unstaged vs HEAD)
		const diffOutput = execSync("git diff --shortstat HEAD 2>/dev/null", {
			encoding: "utf-8",
			timeout: 3000,
			cwd,
			stdio: ["pipe", "pipe", "pipe"],
		}).trim();

		let added = 0;
		let removed = 0;
		const addMatch = diffOutput.match(/(\d+) insertion/);
		const delMatch = diffOutput.match(/(\d+) deletion/);
		if (addMatch) added = parseInt(addMatch[1], 10);
		if (delMatch) removed = parseInt(delMatch[1], 10);

		// Also check staged changes
		const stagedOutput = execSync("git diff --shortstat --cached 2>/dev/null", {
			encoding: "utf-8",
			timeout: 3000,
			cwd,
			stdio: ["pipe", "pipe", "pipe"],
		}).trim();
		const sAddMatch = stagedOutput.match(/(\d+) insertion/);
		const sDelMatch = stagedOutput.match(/(\d+) deletion/);
		if (sAddMatch) added += parseInt(sAddMatch[1], 10);
		if (sDelMatch) removed += parseInt(sDelMatch[1], 10);

		// Dirty check (any uncommitted changes or untracked files)
		const statusOutput = execSync("git status --porcelain 2>/dev/null", {
			encoding: "utf-8",
			timeout: 3000,
			cwd,
			stdio: ["pipe", "pipe", "pipe"],
		}).trim();
		const dirty = statusOutput.length > 0;

		return { added, removed, dirty };
	} catch {
		return { added: 0, removed: 0, dirty: false };
	}
}

export function formatDuration(ms: number): string {
	const secs = Math.floor(ms / 1000);
	if (secs < 60) return `${secs}s`;
	const mins = Math.floor(secs / 60);
	if (mins < 60) return `${mins}m`;
	const hours = Math.floor(mins / 60);
	const remainMins = mins % 60;
	return `${hours}h${remainMins > 0 ? `${remainMins}m` : ""}`;
}

export function formatTokens(n: number): string {
	if (n < 1000) return `${n}`;
	if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
	return `${(n / 1_000_000).toFixed(1)}M`;
}

export function formatCost(cost: number): string {
	if (cost < 0.01) return `$${cost.toFixed(4)}`;
	if (cost < 1) return `$${cost.toFixed(3)}`;
	return `$${cost.toFixed(2)}`;
}

export function shortenPath(p: string): string {
	const home = process.env.HOME || process.env.USERPROFILE || "";
	if (home && p.startsWith(home)) return "~" + p.slice(home.length);
	return p;
}

// Spinner frames for tool activity
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
let spinnerIndex = 0;

export function getSpinnerFrame(): string {
	const frame = SPINNER_FRAMES[spinnerIndex % SPINNER_FRAMES.length];
	spinnerIndex++;
	return frame;
}

export function resetSpinner(): void {
	spinnerIndex = 0;
}

/**
 * Render a segmented progress bar.
 * Uses alternating filled/empty segments for a "heat meter" look:
 *   ▐▌▐▌▐▌▐▌▐▌▐▌▐▌▐▌░░░░░░░░░░░░░░░░░░░░
 * Colors shift green → yellow → red based on percent.
 */
export function renderProgressBar(percent: number, width: number, theme: Theme): string {
	const totalSegments = Math.max(1, Math.floor(width / 2));
	const clamped = Math.max(0, Math.min(100, percent));
	const filledCount = Math.round((clamped / 100) * totalSegments);

	let color: "success" | "warning" | "error" = "success";
	if (clamped > 80) color = "error";
	else if (clamped > 60) color = "warning";

	// Build segmented bar: filled segments use ▐▌, empty use ░░
	let bar = "";
	for (let i = 0; i < totalSegments; i++) {
		if (i < filledCount) {
			bar += theme.fg(color, "▐▌");
		} else {
			bar += theme.fg("dim", "░░");
		}
	}

	// If width is odd, pad with one extra char
	if (width % 2 !== 0) {
		if (filledCount * 2 < width) {
			bar += theme.fg("dim", "░");
		}
	}

	return bar;
}
