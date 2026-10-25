/**
 * slop-guard — TUI scorecard
 *
 * A bordered card rendered via ctx.ui.custom() (overlay mode) showing the
 * full slop report: index gauge with threshold ticks, per-dimension bars,
 * dominant issue, and the fix-first directive. Works headless too — the
 * palette is injectable, so scripts/ can render the same card with plain
 * ANSI colors.
 */

import { Key, matchesKey, truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";

import type { SlopGuardConfig } from "./config";
import type { SlopReport } from "./checks";

type Fg = (s: string) => string;

export interface Palette {
  success: Fg;
  warning: Fg;
  error: Fg;
  accent: Fg;
  dim: Fg;
  text: Fg;
  border: Fg;
  borderAccent: Fg;
  bold: Fg;
}

/** Adapt pi's Theme (fg(color, text) + bold(text)) to the flat palette. */
export function paletteFromTheme(theme: {
  fg(color: string, text: string): string;
  bold(text: string): string;
}): Palette {
  return {
    success: (s) => theme.fg("success", s),
    warning: (s) => theme.fg("warning", s),
    error: (s) => theme.fg("error", s),
    accent: (s) => theme.fg("accent", s),
    dim: (s) => theme.fg("dim", s),
    text: (s) => theme.fg("text", s),
    border: (s) => theme.fg("border", s),
    borderAccent: (s) => theme.fg("borderAccent", s),
    bold: (s) => theme.bold(s),
  };
}

const ANSI: Palette = {
  success: (s) => `\x1b[32m${s}\x1b[0m`,
  warning: (s) => `\x1b[33m${s}\x1b[0m`,
  error: (s) => `\x1b[31m${s}\x1b[0m`,
  accent: (s) => `\x1b[36m${s}\x1b[0m`,
  dim: (s) => `\x1b[90m${s}\x1b[0m`,
  text: (s) => `\x1b[0m${s}\x1b[0m`,
  border: (s) => `\x1b[90m${s}\x1b[0m`,
  borderAccent: (s) => `\x1b[36m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

export function ansiPalette(): Palette {
  return ANSI;
}

function padEnd(s: string, n: number): string {
  return s + " ".repeat(Math.max(0, n - visibleWidth(s)));
}

function padStart(s: string, n: number): string {
  return " ".repeat(Math.max(0, n - visibleWidth(s))) + s;
}

function severityColor(value: number, p: Palette): Fg {
  return value < 0.4 ? p.success : value < 0.67 ? p.warning : p.error;
}

const VERDICT = { pass: "✓ PASS", warn: "⚠ WARN", block: "✗ BLOCK" } as const;
const VERDICT_FG = { pass: "success", warn: "warning", block: "error" } as const;

/** Render the scorecard as plain lines — shared by the component and scripts. */
export function renderScorecard(
  report: SlopReport,
  config: SlopGuardConfig,
  p: Palette,
  width: number,
  note?: string,
): string[] {
  const W = Math.max(64, Math.min(width, 110));
  const inner = W - 2;
  const vFg = p[VERDICT_FG[report.verdict]];
  const lines: string[] = [];

  // ── header: big index + verdict chip ──────────────────────────────
  const left = `  ${p.bold(p.dim("SLOP INDEX"))}  ${vFg(p.bold(String(report.index)))}${p.dim("/100")}`;
  const chip = vFg(p.bold(VERDICT[report.verdict]));
  const gap = Math.max(1, inner - visibleWidth(left) - visibleWidth(chip) - 1);
  lines.push(left + " ".repeat(gap) + chip + " ");

  const metaBits = [report.model, `${report.latencyMs}ms`, `${report.usage.input_tokens}→${report.usage.output_tokens} tok`];
  if (report.approximatePreview) metaBits.push("approx preview");
  if (report.truncated) metaBits.push("truncated");
  if (report.lowConfidenceCount > 0) metaBits.push(`${report.lowConfidenceCount} low-conf excl`);
  const meta = `  ${p.dim(metaBits.join(" · "))}`;
  lines.push(meta);

  // ── gauge with threshold ticks ────────────────────────────────────
  const cells = Math.max(20, inner - 4);
  const filled = Math.round((report.index / 100) * cells);
  const gauge = vFg("▓".repeat(filled)) + p.dim("░".repeat(cells - filled));
  lines.push(`  ▏${gauge}▕`);

  const ticks = new Map<number, { label: string; fg: Fg }>();
  for (const [label, t, fg] of [
    ["⚠" + config.warnThreshold, config.warnThreshold, p.warning],
    ["✗" + config.blockThreshold, config.blockThreshold, p.error],
  ] as const) {
    ticks.set(Math.round((t / 100) * cells), { label, fg: fg as Fg });
  }
  const tickRow: string[] = new Array(cells).fill(" ");
  for (const [pos, { label, fg }] of ticks) {
    if (pos < cells) {
      tickRow[pos] = fg("▲");
      for (let k = 0; k < label.length && pos + 1 + k < cells; k++) {
        tickRow[pos + 1 + k] = fg(label[k] ?? " ");
      }
    }
  }
  lines.push(`  ▕${tickRow.join("")}▏`);
  lines.push("");

  // ── dimensions ────────────────────────────────────────────────────
  lines.push(`  ${p.dim("── dimensions " + "─".repeat(Math.max(0, inner - 15)))}`);
  const idW = 16;
  const valW = 5;
  const barW = 20;
  const descX = 2 + idW + 1 + valW + 1 + barW + 1;
  const descW = inner - descX - 1;
  for (const line of report.lines) {
    const id = p.text(padEnd(line.id, idW));
    const val = p.dim(padStart(line.display, valW));
    const c = line.excluded ? p.dim : severityColor(line.value, p);
    const filledCells = Math.round(line.value * barW);
    const bar = c("▓".repeat(filledCells)) + (line.excluded ? p.dim : p.dim)("░".repeat(barW - filledCells));
    let row = ` ${id} ${val} ${bar} `;
    if (descW >= 10) {
      let desc = truncateToWidth(line.description, descW);
      if (line.excluded) desc += p.warning(" (low conf)");
      row += p.dim(desc);
    }
    lines.push(row);
  }

  // ── diagnosis ─────────────────────────────────────────────────────
  lines.push("");
  if (report.dominantIssue) {
    const label = `  ${p.dim("DOMINANT")}  ${p.accent(report.dominantIssue.key)}`;
    const conf = p.dim(` conf ${report.dominantIssue.confidence.toFixed(2)}${report.dominantIssue.lowConfidence ? " (low)" : ""}`);
    lines.push(label + conf);
  }
  const fixLabel = `  ${p.dim("FIX FIRST")}  `;
  const fixW = inner - visibleWidth(fixLabel) - 1;
  lines.push(fixLabel + p.text(truncateToWidth(report.fixFirst, Math.max(10, fixW))));

  if (note) {
    lines.push("");
    lines.push(`  ${p.warning(truncateToWidth(note, inner - 3))}`);
  }
  lines.push("");
  lines.push(`  ${p.dim("esc · enter · q to close")}`);

  // ── border ────────────────────────────────────────────────────────
  const titleMax = inner - 14;
  const titleSeg = p.borderAccent(" slop-guard ") + p.dim(truncateToWidth(`· ${report.path.split("/").pop() ?? report.path} `, Math.max(1, titleMax)));
  const dashCount = Math.max(0, inner - visibleWidth(titleSeg) - 2);
  const top = p.border(`╭─`) + titleSeg + p.border("─".repeat(dashCount) + `╮`);
  const bottom = p.border(`╰` + "─".repeat(inner) + `╯`);
  const side = p.border("│");

  return [top, ...lines.map((l) => side + padEnd(l, inner) + side), bottom];
}

/** Focusable component for ctx.ui.custom(). */
export class Scorecard implements Component {
  constructor(
    private opts: {
      report: SlopReport;
      config: SlopGuardConfig;
      palette: Palette;
      onClose: () => void;
      note?: string;
    },
  ) {}

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape) || matchesKey(data, Key.enter) || data === "q" || matchesKey(data, Key.ctrl("c"))) {
      this.opts.onClose();
    }
  }

  invalidate(): void {}

  render(width: number): string[] {
    return renderScorecard(this.opts.report, this.opts.config, this.opts.palette, width, this.opts.note);
  }
}
