/**
 * Insights — Pi Usage Analytics Extension
 *
 * Tracks tool usage, session activity, languages, skills, and response times
 * across sessions. Provides terminal and HTML reports with actionable insights.
 *
 * Commands:
 *   /insights          — Show terminal dashboard with key stats + insights
 *   /insights report   — Generate and open HTML report in browser
 *   /insights clear    — Clear all collected session data
 *   /insights <N>d     — Show stats for last N days (e.g., /insights 7d)
 *
 * Data stored in: ~/.pi/insights/sessions/
 * Raw sessions: ~/.pi/agent/sessions/
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { generateInsights } from "./analyzer.js";
import { aggregate, clearSessions, loadAllSessions, setupCollector } from "./collector.js";
import { renderDashboard } from "./dashboard.js";
import { generateHtmlReport } from "./report.js";

export default function insightsExtension(pi: ExtensionAPI) {
  // Wire up data collection
  setupCollector(pi);

  // ── /insights command ──
  pi.registerCommand("insights", {
    description: "Show usage insights (dashboard, report, clear)",
    handler: async (args, ctx) => {
      const arg = (args || "").trim().toLowerCase();

      // /insights clear
      if (arg === "clear") {
        const count = clearSessions();
        ctx.ui.notify(`Cleared ${count} session records.`, "info");
        return;
      }

      // /insights <N>d — filter by days
      let days: number | undefined;
      const dayMatch = arg.match(/^(\d+)d$/);
      if (dayMatch) {
        days = parseInt(dayMatch[1], 10);
      }

      // /insights report — generate HTML and open
      if (arg === "report" || arg.startsWith("report")) {
        const sessions = loadAllSessions();
        const stats = aggregate(sessions);

        if (stats.sessions === 0) {
          ctx.ui.notify(
            "No session data yet. Use pi for a bit and try again!",
            "info"
          );
          return;
        }

        ctx.ui.notify("Analyzing sessions for actionable insights...", "info");

        // Generate actionable insights from raw JSONL files
        const insights = await generateInsights(days);

        const html = generateHtmlReport(stats, insights);
        const reportPath = path.join(os.tmpdir(), "pi-insights-report.html");
        fs.writeFileSync(reportPath, html);

        // Open in browser
        try {
          const openCmd =
            process.platform === "darwin"
              ? "open"
              : process.platform === "win32"
                ? "start"
                : "xdg-open";
          await pi.exec(openCmd, [reportPath], { timeout: 5000 });
        } catch {
          // fallback: just tell user
        }

        ctx.ui.notify(
          `Report with ${insights.length} insights saved to ${reportPath}`,
          "info"
        );
        return;
      }

      // Default: show terminal dashboard with insights
      const sessions = loadAllSessions(days);
      const stats = aggregate(sessions);
      const theme = ctx.ui.theme;

      // Generate actionable insights from raw JSONL files
      const insights = await generateInsights(days);

      const width = 80;
      const dashLines = renderDashboard(stats, width, theme, insights);
      ctx.ui.notify(dashLines.join("\n"), "info");
    },
  });

  // ── Keyboard shortcut ──
  pi.registerShortcut("ctrl+shift+i", {
    description: "Show Pi Insights dashboard",
    handler: async (ctx) => {
      const sessions = loadAllSessions(7);
      const stats = aggregate(sessions);
      const theme = ctx.ui.theme;

      // Quick insights for last 7 days
      const insights = await generateInsights(7);

      const dashLines = renderDashboard(stats, 80, theme, insights);
      ctx.ui.notify(dashLines.join("\n"), "info");
    },
  });
}
