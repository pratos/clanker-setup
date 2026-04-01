/**
 * Insights — Terminal Dashboard
 *
 * Renders a compact TUI dashboard with session stats, tool usage, charts,
 * and actionable insights.
 */

import { truncateToWidth } from "@mariozechner/pi-tui";
import type { ActionableInsight } from "./analyzer.js";
import type { AggregatedStats } from "./types.js";

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

function hBar(
  label: string,
  value: number,
  maxValue: number,
  barWidth: number,
  theme: any,
  color: string
): string {
  const pct = maxValue > 0 ? value / maxValue : 0;
  const filled = Math.round(pct * barWidth);
  const bar =
    theme.fg(color, "█".repeat(filled)) +
    theme.fg("dim", "░".repeat(barWidth - filled));
  const lbl = label.padEnd(14).slice(0, 14);
  const val = String(value).padStart(4);
  return `  ${theme.fg("muted", lbl)} ${bar} ${theme.fg("dim", val)}`;
}

function severityColor(severity: string): string {
  switch (severity) {
    case "warning": return "error";
    case "suggestion": return "accent";
    case "info": return "muted";
    default: return "dim";
  }
}

function severityLabel(severity: string, theme: any): string {
  switch (severity) {
    case "warning": return theme.fg("error", "WARNING");
    case "suggestion": return theme.fg("accent", "SUGGEST");
    case "info": return theme.fg("muted", "INFO");
    default: return theme.fg("dim", severity);
  }
}

export function renderDashboard(
  stats: AggregatedStats,
  width: number,
  theme: any,
  insights?: ActionableInsight[]
): string[] {
  const lines: string[] = [];
  const div = theme.fg("dim", "─".repeat(width));
  const barWidth = Math.max(10, Math.min(30, width - 30));

  // ── Header ──
  lines.push(div);
  const title = theme.fg("accent", theme.bold(" ⚡ Pi Insights "));
  const period =
    stats.startDate && stats.endDate
      ? theme.fg("dim", `${stats.startDate} → ${stats.endDate}`)
      : theme.fg("dim", "no data");
  lines.push(truncateToWidth(`${title}  ${period}`, width));
  lines.push(div);

  if (stats.sessions === 0) {
    lines.push(
      "  " + theme.fg("muted", "No session data yet. Use pi and check back!")
    );
    lines.push(div);
    return lines;
  }

  // ── Stats row ──
  const statsItems = [
    [String(stats.messages), "msgs"],
    [String(stats.sessions), "sessions"],
    [String(stats.totalToolCalls), "tools"],
    [String(stats.filesTouched), "files"],
    [String(stats.activeDays), "days"],
    [`${stats.msgsPerDay.toFixed(1)}`, "msgs/day"],
    [fmtDuration(stats.totalSessionTime), "total"],
    [String(stats.totalErrors), "errors"],
  ];
  const statStr = statsItems
    .map(
      ([v, l]) => theme.fg("accent", v) + theme.fg("dim", ` ${l}`)
    )
    .join("  ");
  lines.push(truncateToWidth(`  ${statStr}`, width));
  lines.push("");

  // ── Top Tools ──
  const sortedTools = Object.entries(stats.toolUsage)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  if (sortedTools.length > 0) {
    lines.push(
      `  ${theme.fg("accent", theme.bold("Top Tools"))}`
    );
    const maxTool = sortedTools[0][1] || 1;
    for (const [name, count] of sortedTools) {
      lines.push(
        truncateToWidth(
          hBar(name, count, maxTool, barWidth, theme, "accent"),
          width
        )
      );
    }
    lines.push("");
  }

  // ── Languages ──
  const sortedLangs = Object.entries(stats.languages)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  if (sortedLangs.length > 0) {
    lines.push(
      `  ${theme.fg("success", theme.bold("Languages"))}`
    );
    const maxLang = sortedLangs[0][1] || 1;
    for (const [name, count] of sortedLangs) {
      lines.push(
        truncateToWidth(
          hBar(name, count, maxLang, barWidth, theme, "success"),
          width
        )
      );
    }
    lines.push("");
  }

  // ── Errors ──
  if (stats.totalErrors > 0) {
    const sortedErrors = Object.entries(stats.toolErrors)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);
    lines.push(
      `  ${theme.fg("error", theme.bold(`Errors (${stats.totalErrors})`))}`
    );
    const maxErr = sortedErrors[0]?.[1] || 1;
    for (const [name, count] of sortedErrors) {
      lines.push(
        truncateToWidth(
          hBar(name, count, maxErr, barWidth, theme, "error"),
          width
        )
      );
    }
    lines.push("");
  }

  // ── Skills ──
  if (Object.keys(stats.skillsUsed).length > 0) {
    const skillList = Object.entries(stats.skillsUsed)
      .sort((a, b) => b[1] - a[1])
      .map(([s, c]) => `${s}(${c})`)
      .join(", ");
    lines.push(
      truncateToWidth(
        `  ${theme.fg("accent", "📚 Skills:")} ${theme.fg("muted", skillList)}`,
        width
      )
    );
    lines.push("");
  }

  // ── Response times ──
  if (stats.avgResponseTime > 0) {
    lines.push(
      truncateToWidth(
        `  ${theme.fg("muted", "Response time:")} ${theme.fg("accent", fmtDuration(stats.medianResponseTime))} ${theme.fg("dim", "median")} · ${theme.fg("accent", fmtDuration(stats.avgResponseTime))} ${theme.fg("dim", "avg")}`,
        width
      )
    );
  }

  // ── Tool time ──
  if (stats.totalToolTime > 0) {
    const pctTool = (
      (stats.totalToolTime / stats.totalSessionTime) *
      100
    ).toFixed(0);
    lines.push(
      truncateToWidth(
        `  ${theme.fg("muted", "Tool time:")} ${theme.fg("accent", fmtDuration(stats.totalToolTime))} ${theme.fg("dim", `(${pctTool}% of session time)`)}`,
        width
      )
    );
  }

  // ── Actionable Insights ──
  if (insights && insights.length > 0) {
    lines.push("");
    lines.push(div);
    lines.push(
      `  ${theme.fg("accent", theme.bold("💡 Actionable Insights"))}`
    );
    lines.push("");

    // Show top insights (warnings + suggestions only in dashboard, max 6)
    const actionable = insights.filter((i) => i.severity !== "info").slice(0, 6);
    const informational = insights.filter((i) => i.severity === "info");

    for (const insight of actionable) {
      const sev = severityLabel(insight.severity, theme);
      lines.push(
        truncateToWidth(
          `  ${insight.emoji} [${sev}] ${theme.bold(insight.title)}`,
          width
        )
      );
      lines.push(
        truncateToWidth(
          `    ${theme.fg("muted", insight.description)}`,
          width
        )
      );

      // Show up to 3 evidence items
      for (const ev of insight.evidence.slice(0, 3)) {
        lines.push(
          truncateToWidth(
            `    ${theme.fg("dim", "·")} ${theme.fg("dim", ev)}`,
            width
          )
        );
      }

      lines.push(
        truncateToWidth(
          `    ${theme.fg("success", "→")} ${theme.fg("success", insight.action.slice(0, width - 10))}`,
          width
        )
      );
      lines.push("");
    }

    if (informational.length > 0) {
      lines.push(
        truncateToWidth(
          `  ${theme.fg("dim", `+ ${informational.length} more insights in /insights report`)}`,
          width
        )
      );
    }
  }

  lines.push(div);
  lines.push(
    truncateToWidth(
      `  ${theme.fg("dim", `/insights report — full HTML report  ·  /insights clear — reset data`)}`,
      width
    )
  );
  lines.push(div);

  return lines;
}
