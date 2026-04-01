/**
 * Insights — HTML Report Generator
 *
 * Generates a comprehensive HTML report from aggregated session data
 * and actionable insights.
 */

import type { ActionableInsight } from "./analyzer.js";
import type { AggregatedStats } from "./types.js";

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function barChart(
  title: string,
  data: Record<string, number>,
  color: string,
  maxBars = 8
): string {
  const sorted = Object.entries(data)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxBars);
  if (sorted.length === 0) return "";

  const maxVal = sorted[0][1] || 1;
  const bars = sorted
    .map(
      ([label, val]) =>
        `<div class="bar-row">
        <div class="bar-label">${esc(label)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${(val / maxVal) * 100}%;background:${color}"></div></div>
        <div class="bar-value">${val}</div>
      </div>`
    )
    .join("\n");

  return `<div class="chart-card">
    <div class="chart-title">${esc(title)}</div>
    ${bars}
  </div>`;
}

function statBox(value: string | number, label: string): string {
  return `<div class="stat"><div class="stat-value">${esc(String(value))}</div><div class="stat-label">${esc(label)}</div></div>`;
}

function severityBorder(severity: string): string {
  switch (severity) {
    case "warning": return "#f87171";
    case "suggestion": return "#38bdf8";
    case "info": return "#334155";
    default: return "#334155";
  }
}

function severityBadge(severity: string): string {
  const colors: Record<string, [string, string]> = {
    warning: ["#fef2f2", "#dc2626"],
    suggestion: ["#eff6ff", "#2563eb"],
    info: ["#f8fafc", "#64748b"],
  };
  const [bg, fg] = colors[severity] || colors.info;
  return `<span style="background:${bg};color:${fg};padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;text-transform:uppercase">${esc(severity)}</span>`;
}

function renderInsightsSection(insights: ActionableInsight[]): string {
  if (!insights || insights.length === 0) return "";

  const categories = ["prompting", "skill", "tooling", "efficiency", "workflow"] as const;
  const categoryMeta: Record<string, { title: string; emoji: string; color: string }> = {
    prompting: { title: "Prompting Improvements", emoji: "📝", color: "#8b5cf6" },
    skill: { title: "Skill Improvements", emoji: "🛠️", color: "#f59e0b" },
    tooling: { title: "Tooling Opportunities", emoji: "🔧", color: "#10b981" },
    efficiency: { title: "Efficiency Gains", emoji: "⚡", color: "#38bdf8" },
    workflow: { title: "Workflow Patterns", emoji: "📁", color: "#6366f1" },
  };

  let html = `<h2>💡 Actionable Insights</h2>`;

  for (const cat of categories) {
    const catInsights = insights.filter((i) => i.category === cat);
    if (catInsights.length === 0) continue;

    const meta = categoryMeta[cat];
    html += `
    <div style="margin-top:32px">
      <h3 style="font-size:16px;color:${meta.color};margin-bottom:16px;display:flex;align-items:center;gap:8px">
        <span>${meta.emoji}</span> ${meta.title}
        <span style="background:${meta.color}20;color:${meta.color};padding:2px 8px;border-radius:12px;font-size:12px">${catInsights.length}</span>
      </h3>`;

    for (const insight of catInsights) {
      const borderColor = severityBorder(insight.severity);
      html += `
      <div class="insight-card" style="background:#1e293b;border:1px solid ${borderColor};border-left:4px solid ${borderColor};border-radius:8px;padding:16px;margin-bottom:16px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          <span style="font-size:18px">${insight.emoji}</span>
          ${severityBadge(insight.severity)}
          <strong style="color:#f8fafc;font-size:14px">${esc(insight.title)}</strong>
        </div>
        <p style="color:#94a3b8;font-size:13px;margin-bottom:12px">${esc(insight.description)}</p>`;

      if (insight.evidence.length > 0) {
        html += `<div style="background:#0f172a;border-radius:6px;padding:10px 12px;margin-bottom:12px">`;
        for (const ev of insight.evidence) {
          html += `<div style="color:#64748b;font-size:12px;padding:2px 0;font-family:monospace">· ${esc(ev)}</div>`;
        }
        html += `</div>`;
      }

      html += `
        <div style="display:flex;align-items:flex-start;gap:6px;background:#0f2a1a;border:1px solid #16a34a30;border-radius:6px;padding:10px 12px">
          <span style="color:#16a34a;font-weight:bold;flex-shrink:0">→</span>
          <span style="color:#86efac;font-size:13px">${esc(insight.action)}</span>
        </div>
      </div>`;
    }

    html += `</div>`;
  }

  return html;
}

export function generateHtmlReport(
  stats: AggregatedStats,
  insights?: ActionableInsight[]
): string {
  // Response time distribution
  const responseChart = barChart(
    "User Response Time Distribution",
    stats.responseTimeBuckets,
    "#6366f1"
  );

  // Time of day buckets
  const timeBuckets: Record<string, number> = {
    "Morning (6-12)": 0,
    "Afternoon (12-18)": 0,
    "Evening (18-24)": 0,
    "Night (0-6)": 0,
  };
  for (const [hour, count] of Object.entries(stats.messagesByHour)) {
    const h = Number(hour);
    if (h >= 6 && h < 12) timeBuckets["Morning (6-12)"] += count;
    else if (h >= 12 && h < 18) timeBuckets["Afternoon (12-18)"] += count;
    else if (h >= 18 && h < 24) timeBuckets["Evening (18-24)"] += count;
    else timeBuckets["Night (0-6)"] += count;
  }

  // Insights summary counts
  const warningCount = insights?.filter((i) => i.severity === "warning").length || 0;
  const suggestionCount = insights?.filter((i) => i.severity === "suggestion").length || 0;
  const infoCount = insights?.filter((i) => i.severity === "info").length || 0;

  // Session breakdown
  const sessionRows = stats.sessionRecords
    .map((s) => {
      const duration = fmtDuration(s.endTime - s.startTime);
      const tools = s.toolCalls.length;
      const errors = s.toolCalls.filter((t) => !t.success).length;
      const date = new Date(s.startTime).toLocaleString();
      const topTools = Object.entries(
        s.toolCalls.reduce(
          (acc, t) => {
            acc[t.name] = (acc[t.name] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>
        )
      )
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([n, c]) => `${n}(${c})`)
        .join(", ");
      return `<tr>
        <td>${esc(date)}</td>
        <td>${s.userMessages}</td>
        <td>${tools}</td>
        <td>${errors > 0 ? `<span class="err">${errors}</span>` : "0"}</td>
        <td>${duration}</td>
        <td class="dim">${esc(topTools)}</td>
      </tr>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Pi Insights Report</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', -apple-system, sans-serif; background: #0f172a; color: #e2e8f0; line-height: 1.65; padding: 48px 24px; }
    .container { max-width: 960px; margin: 0 auto; }
    h1 { font-size: 32px; font-weight: 700; color: #f8fafc; margin-bottom: 8px; }
    h2 { font-size: 20px; font-weight: 600; color: #f8fafc; margin-top: 48px; margin-bottom: 16px; border-bottom: 1px solid #1e293b; padding-bottom: 8px; }
    h3 { font-size: 16px; font-weight: 600; color: #f8fafc; }
    .subtitle { color: #94a3b8; font-size: 15px; margin-bottom: 32px; }
    .stats-row { display: flex; gap: 24px; margin-bottom: 24px; padding: 20px 0; border-top: 1px solid #1e293b; border-bottom: 1px solid #1e293b; flex-wrap: wrap; }
    .stat { text-align: center; min-width: 80px; }
    .stat-value { font-size: 24px; font-weight: 700; color: #38bdf8; }
    .stat-label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }
    .insights-summary { display: flex; gap: 16px; margin-bottom: 32px; flex-wrap: wrap; }
    .insights-summary .pill { padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: 600; }
    .pill-warning { background: #fef2f220; color: #f87171; border: 1px solid #f8717130; }
    .pill-suggestion { background: #38bdf820; color: #38bdf8; border: 1px solid #38bdf830; }
    .pill-info { background: #64748b20; color: #94a3b8; border: 1px solid #64748b30; }
    .charts-row { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin: 24px 0; }
    .chart-card { background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 16px; }
    .chart-title { font-size: 12px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px; }
    .bar-row { display: flex; align-items: center; margin-bottom: 6px; }
    .bar-label { width: 120px; font-size: 12px; color: #94a3b8; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .bar-track { flex: 1; height: 6px; background: #0f172a; border-radius: 3px; margin: 0 8px; }
    .bar-fill { height: 100%; border-radius: 3px; transition: width 0.3s; }
    .bar-value { width: 32px; font-size: 12px; font-weight: 500; color: #94a3b8; text-align: right; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { text-align: left; color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 11px; padding: 8px 12px; border-bottom: 1px solid #334155; }
    td { padding: 8px 12px; border-bottom: 1px solid #1e293b; color: #cbd5e1; }
    .err { color: #f87171; font-weight: 600; }
    .dim { color: #64748b; font-size: 12px; }
    .summary-card { background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border: 1px solid #38bdf8; border-radius: 12px; padding: 24px; margin-bottom: 32px; }
    .summary-title { font-size: 16px; font-weight: 700; color: #38bdf8; margin-bottom: 16px; }
    .skills-list { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
    .skill-tag { background: #1e293b; border: 1px solid #334155; border-radius: 6px; padding: 4px 10px; font-size: 12px; color: #38bdf8; }
    .footer { margin-top: 48px; text-align: center; color: #475569; font-size: 12px; }
    @media (max-width: 640px) { .charts-row { grid-template-columns: 1fr; } .stats-row { justify-content: center; } }
  </style>
</head>
<body>
  <div class="container">
    <h1>⚡ Pi Insights Report</h1>
    <p class="subtitle">${stats.messages} messages across ${stats.sessions} sessions | ${stats.startDate} to ${stats.endDate}</p>

    <div class="stats-row">
      ${statBox(stats.messages, "Messages")}
      ${statBox(stats.sessions, "Sessions")}
      ${statBox(stats.totalToolCalls, "Tool Calls")}
      ${statBox(stats.filesTouched, "Files")}
      ${statBox(stats.activeDays, "Active Days")}
      ${statBox(stats.msgsPerDay.toFixed(1), "Msgs/Day")}
      ${statBox(fmtDuration(stats.totalSessionTime), "Total Time")}
      ${statBox(stats.totalErrors, "Errors")}
    </div>

    ${
      insights && insights.length > 0
        ? `<div class="insights-summary">
        ${warningCount > 0 ? `<span class="pill pill-warning">⚠️ ${warningCount} Warnings</span>` : ""}
        ${suggestionCount > 0 ? `<span class="pill pill-suggestion">💡 ${suggestionCount} Suggestions</span>` : ""}
        ${infoCount > 0 ? `<span class="pill pill-info">ℹ️ ${infoCount} Info</span>` : ""}
      </div>`
        : ""
    }

    ${
      Object.keys(stats.skillsUsed).length > 0
        ? `<div class="summary-card">
        <div class="summary-title">📚 Skills Used</div>
        <div class="skills-list">
          ${Object.entries(stats.skillsUsed)
            .sort((a, b) => b[1] - a[1])
            .map(([s, c]) => `<span class="skill-tag">${esc(s)} (${c})</span>`)
            .join("")}
        </div>
      </div>`
        : ""
    }

    ${renderInsightsSection(insights || [])}

    <h2>Tool Usage</h2>
    <div class="charts-row">
      ${barChart("Top Tools", stats.toolUsage, "#38bdf8")}
      ${barChart("Languages", stats.languages, "#10b981")}
    </div>

    ${
      stats.totalErrors > 0
        ? `<div class="charts-row">
        ${barChart("Tool Errors", stats.toolErrors, "#f87171")}
        ${responseChart}
      </div>`
        : `<div class="charts-row">${responseChart}${barChart("Activity by Hour", timeBuckets, "#8b5cf6")}</div>`
    }

    ${
      stats.totalErrors > 0
        ? `<div class="charts-row">
        ${barChart("Activity by Hour", timeBuckets, "#8b5cf6")}
        <div class="chart-card">
          <div class="chart-title">Response Time Stats</div>
          <div style="padding: 8px 0; font-size: 14px; color: #94a3b8;">
            Median: <strong style="color:#e2e8f0">${fmtDuration(stats.medianResponseTime)}</strong> &bull;
            Average: <strong style="color:#e2e8f0">${fmtDuration(stats.avgResponseTime)}</strong>
          </div>
        </div>
      </div>`
        : ""
    }

    <h2>Session Breakdown</h2>
    <table>
      <thead>
        <tr><th>Date</th><th>Msgs</th><th>Tools</th><th>Errors</th><th>Duration</th><th>Top Tools</th></tr>
      </thead>
      <tbody>
        ${sessionRows}
      </tbody>
    </table>

    <div class="footer">
      Generated by Pi Insights · ${new Date().toLocaleDateString()}
    </div>
  </div>
</body>
</html>`;
}
