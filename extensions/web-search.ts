/**
 * Web Search & Browse Extension (surf-cli native)
 *
 * Provides web tools powered by `surf` CLI for browser automation.
 * Three tools: WebSearch (AI search), WebFetch (page reading), surf (direct commands).
 *
 * Requirements:
 *   - `surf` CLI installed and available in PATH (npm i -g @anthropic/surf)
 *   - An active browser session (surf manages this automatically)
 *
 * Usage:
 *   WebSearch  — AI-powered search via surf perplexity
 *   WebFetch   — Navigate to a URL and read page content
 *   surf       — Run any surf command directly (navigate, click, type, etc.)
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { truncateHead } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

/** Shell-escape a string for use inside single quotes */
function shellEscape(s: string): string {
  return s.replace(/'/g, "'\\''");
}

/** Run a surf command via bash shell (more reliable output capture than direct exec) */
async function runSurf(
  pi: ExtensionAPI,
  command: string,
  signal?: AbortSignal,
  timeout = 60000
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const result = await pi.exec("bash", ["-c", command], { signal, timeout });
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    exitCode: result.exitCode ?? 0,
  };
}

export default function webSearchExtension(pi: ExtensionAPI) {
  // ── WebSearch — AI-powered search via surf perplexity ──
  pi.registerTool({
    name: "WebSearch",
    label: "Web Search",
    description:
      "Search the web for information using AI-powered search (Perplexity). " +
      "Returns synthesized answers with sources. Use for general knowledge, documentation lookups, and research.",
    parameters: Type.Object({
      query: Type.String({ description: "Search query" }),
    }),

    async execute(_toolCallId, params, signal, onUpdate, _ctx) {
      if (signal?.aborted) {
        return { content: [{ type: "text", text: "Cancelled" }] };
      }

      onUpdate?.({
        content: [{ type: "text", text: `Searching: ${params.query}...` }],
        details: {},
      });

      try {
        const escaped = shellEscape(params.query);
        const { stdout, stderr } = await runSurf(
          pi,
          `surf perplexity '${escaped}'`,
          signal,
          90000
        );

        const output = (stdout || stderr || "").trim();
        if (!output) {
          throw new Error("surf perplexity returned empty output");
        }

        const truncated = truncateHead(output, 40000, 500);
        return {
          content: [
            {
              type: "text",
              text: `## Search Results for: ${params.query}\n\n${truncated.text}`,
            },
          ],
          details: { query: params.query, truncated: truncated.truncated },
        };
      } catch (error) {
        // Fallback: DuckDuckGo HTML scrape
        try {
          const encodedQuery = encodeURIComponent(params.query);
          const { stdout } = await runSurf(
            pi,
            `curl -sL "https://html.duckduckgo.com/html/?q=${encodedQuery}" | sed 's/<[^>]*>//g' | sed '/^$/d' | head -100`,
            signal,
            30000
          );

          const output = (stdout || "").trim();
          if (!output) throw new Error("Fallback search also empty");

          const truncated = truncateHead(output, 40000, 500);
          return {
            content: [
              {
                type: "text",
                text: `## Search Results for: ${params.query} (fallback)\n\n${truncated.text}`,
              },
            ],
            details: { query: params.query, fallback: true, truncated: truncated.truncated },
          };
        } catch (_fallbackError) {
          const errMsg = error instanceof Error ? error.message : String(error);
          return {
            content: [
              {
                type: "text",
                text: `Search failed: ${errMsg}\n\nTip: Ensure 'surf' CLI is installed and has an active browser session.`,
              },
            ],
            details: { error: errMsg },
          };
        }
      }
    },
  });

  // ── WebFetch — Navigate to URL and read page content ──
  pi.registerTool({
    name: "WebFetch",
    label: "Web Fetch",
    description:
      "Fetch the content of a web page by URL. Navigates with a real browser, " +
      "waits for the page to load, and returns the accessibility tree and visible text. " +
      "Works with JS-heavy sites (Twitter/X, SPAs, etc.).",
    parameters: Type.Object({
      url: Type.String({ description: "URL to fetch" }),
      selector: Type.Optional(
        Type.String({
          description:
            "Optional CSS selector to focus on specific content (e.g., 'main', 'article', '.content')",
        })
      ),
    }),

    async execute(_toolCallId, params, signal, onUpdate, _ctx) {
      if (signal?.aborted) {
        return { content: [{ type: "text", text: "Cancelled" }] };
      }

      onUpdate?.({
        content: [{ type: "text", text: `Fetching: ${params.url}...` }],
        details: {},
      });

      try {
        const escapedUrl = shellEscape(params.url);

        // Navigate and wait for page load
        await runSurf(pi, `surf go '${escapedUrl}'`, signal, 30000);
        await runSurf(pi, `surf wait 2`, signal, 10000);

        // Read page content
        const { stdout, stderr } = await runSurf(
          pi,
          `surf read --compact`,
          signal,
          30000
        );

        const output = (stdout || stderr || "").trim();
        if (!output) {
          throw new Error("surf read returned empty output");
        }

        const truncated = truncateHead(output, 45000, 1500);
        return {
          content: [
            {
              type: "text",
              text: `## Content from: ${params.url}\n\n${truncated.text}`,
            },
          ],
          details: { url: params.url, truncated: truncated.truncated },
        };
      } catch (error) {
        // Fallback: curl + html stripping
        try {
          const escapedUrl = shellEscape(params.url);
          const { stdout } = await runSurf(
            pi,
            `curl -sL --max-time 15 '${escapedUrl}' | sed 's/<script[^>]*>.*<\\/script>//g' | sed 's/<style[^>]*>.*<\\/style>//g' | sed 's/<[^>]*>//g' | sed '/^[[:space:]]*$/d' | head -500`,
            signal,
            20000
          );

          const output = (stdout || "").trim();
          if (!output) throw new Error("Fallback fetch also empty");

          const truncated = truncateHead(output, 45000, 1500);
          return {
            content: [
              {
                type: "text",
                text: `## Content from: ${params.url} (fallback - plain text)\n\n${truncated.text}`,
              },
            ],
            details: { url: params.url, fallback: true, truncated: truncated.truncated },
          };
        } catch (_fallbackError) {
          const errMsg = error instanceof Error ? error.message : String(error);
          return {
            content: [
              {
                type: "text",
                text: `Fetch failed: ${errMsg}\n\nTip: Ensure 'surf' CLI is installed and has an active browser session.`,
              },
            ],
            details: { error: errMsg, url: params.url },
          };
        }
      }
    },
  });

  // ── surf — Direct surf CLI access for interactive browsing ──
  pi.registerTool({
    name: "surf",
    label: "Surf Browser",
    description:
      "Run any surf CLI command for browser automation. Use for interactive browsing, " +
      "clicking elements, filling forms, taking screenshots, or any operation not covered " +
      "by WebSearch/WebFetch.\n\n" +
      "Common commands:\n" +
      "  go <url>            — Navigate to URL\n" +
      "  read                — Get page accessibility tree + text (use --compact for shorter output)\n" +
      "  click <ref>         — Click element by ref (e.g., e5) or CSS selector\n" +
      "  type <text>         — Type text at cursor (add --submit to press Enter)\n" +
      "  search <text>       — Find text on current page\n" +
      "  screenshot          — Capture screenshot\n" +
      "  scroll              — Scroll page (--direction=down/up)\n" +
      "  wait <seconds>      — Wait N seconds\n" +
      "  perplexity <query>  — AI-powered web search\n" +
      "  grok <query>        — Query Grok AI (real-time X/Twitter data)\n" +
      "  tab.list            — List open tabs\n" +
      "  tab.new <url>       — Open new tab\n" +
      "  tab.switch <id>     — Switch tab\n" +
      "  js <code>           — Execute JavaScript on page\n",
    parameters: Type.Object({
      command: Type.String({
        description:
          "The surf command and arguments (e.g., 'go https://example.com', 'read --compact', 'click e5')",
      }),
    }),

    async execute(_toolCallId, params, signal, onUpdate, _ctx) {
      if (signal?.aborted) {
        return { content: [{ type: "text", text: "Cancelled" }] };
      }

      const cmd = params.command.trim();
      onUpdate?.({
        content: [{ type: "text", text: `surf ${cmd}` }],
        details: {},
      });

      try {
        const { stdout, stderr, exitCode } = await runSurf(
          pi,
          `surf ${cmd}`,
          signal,
          90000
        );

        const output = (stdout || "").trim();
        const errors = (stderr || "").trim();

        if (exitCode !== 0 && !output) {
          return {
            content: [
              {
                type: "text",
                text: `surf ${cmd} failed (exit ${exitCode}):\n${errors || "Unknown error"}`,
              },
            ],
            details: { command: cmd, exitCode, error: errors },
          };
        }

        const combined = [output, errors ? `\n--- stderr ---\n${errors}` : ""]
          .join("")
          .trim();
        const truncated = truncateHead(combined || "OK (no output)", 45000, 1500);

        return {
          content: [{ type: "text", text: truncated.text }],
          details: { command: cmd, truncated: truncated.truncated },
        };
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text",
              text: `surf ${cmd} failed: ${errMsg}`,
            },
          ],
          details: { command: cmd, error: errMsg },
        };
      }
    },
  });
}
