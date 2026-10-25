/**
 * slop-guard — a pi extension
 *
 * Guards prose writes (markdown & friends) against AI slop using TypeSafe's
 * Jev System One model. Instead of a slow LLM critique round-trip, one fast
 * Jev call fans out atomic questions (specificity, clichés, voice, structure,
 * hedging, fake depth) and returns calibrated scores your code composes.
 *
 * What you get:
 *   - write/edit tool interception with actionable block reasons
 *   - /slop [path|on|off|strict|loose|status] command
 *   - slop_check tool the agent can call to pre-verify drafts
 *
 * Config: ~/.pi/agent/slop-guard.json and <project>/.pi/slop-guard.json
 * API key: TYPESAFE_API_KEY (https://console.typesafe.ai/settings/keys)
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";

import { isToolCallEventType, type ExtensionAPI, type ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { buildQuestions, computeReport, type SlopReport } from "./checks";
import { expandEnv, loadConfig, type SlopGuardConfig } from "./config";
import { evaluate, JevError } from "./jev";
import { previewTargetContent, shouldCheckPath } from "./preview";
import { blockReason, notifyLine, reportLines, toolReport } from "./report";
import { paletteFromTheme, Scorecard } from "./scorecard";

const GLOBAL_DIR = join(process.env.HOME ?? "~", ".pi", "agent");
const CACHE_LIMIT = 64;

type CheckOutcome =
  | { kind: "ok"; report: SlopReport }
  | { kind: "error"; message: string };

export default function slopGuard(pi: ExtensionAPI) {
  let config: SlopGuardConfig = loadConfig(GLOBAL_DIR, process.cwd(), false);
  const cache = new Map<string, SlopReport>();
  const totals = { calls: 0, inputTokens: 0, outputTokens: 0 };
  let sessionEnabled: boolean | undefined; // /slop on|off (session only)
  let sessionStrict: boolean | undefined; // /slop strict|loose (session only)
  let lastReport: SlopReport | undefined;
  let warnedNoKey = false;

  const apiKey = () => expandEnv(config.apiKey);
  const effectiveEnabled = () => (sessionEnabled ?? config.enabled);
  const effectiveStrict = () => (sessionStrict ?? config.strict);

  pi.on("session_start", async (_event, ctx) => {
    config = loadConfig(GLOBAL_DIR, ctx.cwd, ctx.isProjectTrusted());
    if (effectiveEnabled() && !apiKey() && !warnedNoKey) {
      warnedNoKey = true;
      ctx.ui.notify(
        "slop-guard: TYPESAFE_API_KEY is not set — guarding paused. Get a key at console.typesafe.ai/settings/keys",
        "warning",
      );
    }
  });

  async function runCheck(
    text: string,
    path: string,
    opts: { approximate: boolean; signal?: AbortSignal },
  ): Promise<CheckOutcome> {
    const key = apiKey();
    if (!key) {
      return { kind: "error", message: "no TYPESAFE_API_KEY configured (console.typesafe.ai/settings/keys)" };
    }

    const truncated = text.length > config.maxStateChars;
    const state = truncated ? text.slice(0, config.maxStateChars) + "\n\n[truncated]" : text;

    const hash = createHash("sha256").update(config.model).update("\x00").update(state).digest("hex");
    const cached = cache.get(hash);
    if (cached) return { kind: "ok", report: cached };

    try {
      const result = await evaluate({
        state,
        questions: buildQuestions(),
        apiKey: key,
        baseUrl: config.baseUrl,
        model: config.model,
        timeoutMs: config.timeoutMs,
        signal: opts.signal,
      });
      totals.calls++;
      totals.inputTokens += result.usage.input_tokens;
      totals.outputTokens += result.usage.output_tokens;
      const report = computeReport({
        answers: result.answers,
        config,
        path,
        model: config.model,
        approximatePreview: opts.approximate,
        usage: result.usage,
        latencyMs: result.latencyMs,
        truncated,
      });
      if (cache.size >= CACHE_LIMIT) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
      }
      cache.set(hash, report);
      lastReport = report;
      return { kind: "ok", report };
    } catch (err) {
      if (err instanceof JevError) return { kind: "error", message: `${err.kind}: ${err.message}` };
      return { kind: "error", message: err instanceof Error ? err.message : String(err) };
    }
  }

  /** The guard itself: judge write/edit before execution, block on slop. */
  pi.on("tool_call", async (event, ctx) => {
    if (!effectiveEnabled()) return;

    let tool: "write" | "edit";
    if (isToolCallEventType("write", event)) tool = "write";
    else if (isToolCallEventType("edit", event)) tool = "edit";
    else return;

    const path = event.input.path;
    if (typeof path !== "string" || !shouldCheckPath(path, config.include, config.exclude, ctx.cwd)) return;

    const target = await previewTargetContent(tool, event.input, ctx.cwd);
    if (!target || target.text.trim().length < config.minChars) return;

    ctx.ui.setStatus("slop", "jev…");
    try {
      const outcome = await runCheck(target.text, path, { approximate: target.approximate, signal: ctx.signal });
      if (outcome.kind === "error") {
        ctx.ui.notify(`slop-guard offline (${outcome.message}) — write allowed`, "warning");
        return;
      }
      const report = outcome.report;
      if (report.verdict === "pass") {
        ctx.ui.notify(notifyLine(report, config), "info");
        return;
      }
      if (report.verdict === "warn" && !effectiveStrict()) {
        ctx.ui.notify(notifyLine(report, config), "warning");
        return;
      }
      return { block: true, reason: blockReason(report, config) };
    } finally {
      ctx.ui.setStatus("slop", "");
    }
  });

  /** Manual / pre-flight check the agent can run on text or a file. */
  pi.registerTool({
    name: "slop_check",
    label: "Slop check",
    description:
      "Check prose for AI slop using TypeSafe's Jev model. Returns a 0-100 slop index with per-dimension scores, the dominant problem, and the fix to apply first. " +
      "Call this with draft content (text, or path to a file) before writing markdown/blog/docs files — content scoring above the block threshold will be rejected by slop-guard.",
    parameters: Type.Object({
      text: Type.Optional(Type.String({ description: "Content to check, inline." })),
      path: Type.Optional(Type.String({ description: "Path to a file to check." })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      let text = params.text;
      let path = "inline-text";
      if (typeof text !== "string" && typeof params.path === "string") {
        const abs = isAbsolute(params.path) ? params.path : resolve(ctx.cwd, params.path);
        try {
          text = await readFile(abs, "utf8");
          path = relative(ctx.cwd, abs) || params.path;
        } catch (err) {
          return {
            content: [{ type: "text", text: `slop_check: cannot read ${params.path}: ${err instanceof Error ? err.message : err}` }],
            details: {},
            isError: true,
          };
        }
      }
      if (typeof text !== "string" || text.trim().length === 0) {
        return {
          content: [{ type: "text", text: "slop_check: provide either text or path." }],
          details: {},
          isError: true,
        };
      }
      const outcome = await runCheck(text, path, { approximate: false });
      if (outcome.kind === "error") {
        return {
          content: [{ type: "text", text: `slop_check failed: ${outcome.message}` }],
          details: {},
          isError: true,
        };
      }
      return {
        content: [{ type: "text", text: toolReport(outcome.report, config) }],
        details: { report: outcome.report },
      };
    },
  });

  /** Full-screen scorecard via ctx.ui.custom() overlay; widget fallback otherwise. */
  async function showScorecard(report: SlopReport, note: string | undefined, ctx: ExtensionCommandContext) {
    ctx.ui.notify(notifyLine(report, config), report.verdict === "pass" ? "info" : "warning");
    if (ctx.mode !== "tui") {
      ctx.ui.setWidget("slop", reportLines(report, config));
      return;
    }
    try {
      await ctx.ui.custom<unknown>(
        (_tui, theme, _keybindings, done) =>
          new Scorecard({ report, config, palette: paletteFromTheme(theme), onClose: () => done(undefined), note }),
        { overlay: true },
      );
    } catch {
      ctx.ui.setWidget("slop", reportLines(report, config));
    }
  }

  pi.registerCommand("slop", {
    description: "slop-guard: /slop [path | last | on | off | strict | loose | status]",
    handler: async (args, ctx) => {
      const arg = args.trim();

      if (arg === "on" || arg === "off") {
        sessionEnabled = arg === "on";
        ctx.ui.notify(`slop-guard ${sessionEnabled ? "enabled" : "disabled"} for this session (config file controls the default)`, "info");
        return;
      }
      if (arg === "strict" || arg === "loose") {
        sessionStrict = arg === "strict";
        ctx.ui.notify(`slop-guard ${sessionStrict ? "strict (warn-level blocks)" : "loose (warn-level notifies)"} for this session`, "info");
        return;
      }

      if (arg === "last") {
        if (!lastReport) {
          ctx.ui.notify("slop-guard: no report yet this session — check a path first", "warning");
          return;
        }
        await showScorecard(lastReport, undefined, ctx);
        return;
      }

      if (arg && arg !== "status") {
        // Treat as a path and check it now.
        const abs = isAbsolute(arg) ? arg : resolve(ctx.cwd, arg);
        let text: string;
        try {
          text = await readFile(abs, "utf8");
        } catch (err) {
          ctx.ui.notify(`slop-guard: cannot read ${arg}: ${err instanceof Error ? err.message : err}`, "error");
          return;
        }
        ctx.ui.setStatus("slop", "jev…");
        const outcome = await runCheck(text, relative(ctx.cwd, abs) || arg, { approximate: false });
        ctx.ui.setStatus("slop", "");
        if (outcome.kind === "error") {
          ctx.ui.notify(`slop-guard: ${outcome.message}`, "error");
          return;
        }
        await showScorecard(outcome.report, undefined, ctx);
        return;
      }

      // Status view.
      const keyPresent = Boolean(apiKey());
      const status: string[] = [
        `slop-guard — ${effectiveEnabled() ? "enabled" : "disabled"}${sessionEnabled !== undefined ? " (session override)" : ""}`,
        `model ${config.model} · key ${keyPresent ? "ok" : "MISSING"} · strict ${effectiveStrict()}`,
        `thresholds: block ≥${config.blockThreshold}, warn ≥${config.warnThreshold} · min ${config.minChars} chars · include ${config.include.join(", ")}`,
        `calls ${totals.calls} · tokens ${totals.inputTokens}→${totals.outputTokens} · cache ${cache.size}`,
      ];
      if (lastReport) status.push("", ...reportLines(lastReport, config));
      ctx.ui.setWidget("slop", status);
    },
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    ctx.ui.setStatus("slop", "");
  });
}
