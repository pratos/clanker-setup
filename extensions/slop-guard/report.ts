/**
 * slop-guard — report formatting
 *
 * Three audiences: the TUI widget (pretty bars), the notify toast (one line),
 * and the LLM reading a blocked tool result (actionable plain text).
 */

import type { SlopGuardConfig } from "./config";
import { topFailing, type SlopReport } from "./checks";

function bar(value: number, width = 10): string {
  const filled = Math.min(width, Math.max(0, Math.round(value * width)));
  return "▓".repeat(filled) + "░".repeat(width - filled);
}

const ICON = { pass: "✓", warn: "⚠", block: "✗" } as const;
const VERDICT = { pass: "PASS", warn: "WARN", block: "BLOCK" } as const;

/** Widget lines: what `/slop <path>` and the last-report view show. */
export function reportLines(report: SlopReport, config: SlopGuardConfig): string[] {
  const lines: string[] = [
    `slop-guard ${ICON[report.verdict]} ${report.index}/100 — ${VERDICT[report.verdict]}` +
      `  (block ≥${config.blockThreshold}, warn ≥${config.warnThreshold})`,
    `${report.path} · ${report.model} · ${report.latencyMs}ms` +
      ` · ${report.usage.input_tokens}→${report.usage.output_tokens} tok` +
      (report.approximatePreview ? " · approx preview" : "") +
      (report.truncated ? " · truncated" : "") +
      (report.lowConfidenceCount > 0 ? ` · ${report.lowConfidenceCount} low-conf excluded` : ""),
    "",
  ];
  for (const line of report.lines) {
    const id = line.id.padEnd(16);
    const val = line.display.padStart(5);
    const flag = line.excluded ? "  (low conf)" : "";
    lines.push(`${id}${val}  ${bar(line.value)}  ${line.description}${flag}`);
  }
  if (report.dominantIssue) {
    const conf = `conf ${report.dominantIssue.confidence.toFixed(2)}`;
    lines.push("", `dominant issue: ${report.dominantIssue.key} (${conf}${report.dominantIssue.lowConfidence ? ", low conf" : ""})`);
  }
  lines.push("", `fix first: ${report.fixFirst}`);
  return lines;
}

/** One-liner for the toast. */
export function notifyLine(report: SlopReport, config: SlopGuardConfig): string {
  const name = report.path.split("/").pop() ?? report.path;
  const head = `slop-guard ${ICON[report.verdict]} ${report.index}/100 — ${name}`;
  if (report.verdict === "pass") return head;
  const issue = report.dominantIssue?.key ?? topFailing(report, 1)[0]?.id ?? "slop";
  const suffix = report.verdict === "warn" && !config.strict ? " (allowed, strict off)" : "";
  return `${head} · ${issue}${suffix}`;
}

/** Plain-text reason returned to the LLM when a write is blocked. */
export function blockReason(report: SlopReport, config: SlopGuardConfig): string {
  const failing = topFailing(report, 3);
  const out = [
    `slop-guard: BLOCKED — "${report.path}" scores ${report.index}/100 on the slop index (block threshold ${config.blockThreshold}).`,
    "",
    "Jev read this content as AI slop. Failing checks:",
  ];
  for (const line of failing) {
    out.push(`- ${line.id} ${line.display} — ${line.description}`);
  }
  if (report.dominantIssue && report.dominantIssue.key !== "none") {
    out.push("", `Dominant problem: ${report.dominantIssue.key}.`);
  }
  out.push("", `Fix first: ${report.fixFirst}`, "");
  out.push(
    "Revise the content, then retry the write. " +
      "You can call the slop_check tool with the revised text to pre-verify it before writing." +
      (report.approximatePreview ? " (Note: the edit preview was approximate — small edits may score differently on the full file.)" : ""),
  );
  return out.join("\n");
}

/** Full text for the slop_check tool result. */
export function toolReport(report: SlopReport, config: SlopGuardConfig): string {
  return reportLines(report, config).join("\n");
}
