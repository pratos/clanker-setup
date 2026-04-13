/**
 * Web Search & Fetch Extension (curl + Exa + Parallel)
 *
 * Provides reliable web tools using:
 *   - curl + markdown.new for page fetching (primary)
 *   - Exa API for semantic search
 *   - Parallel API for agentic search
 *   - Google via curl for free keyword search
 *
 * API keys are read from sops-nix secrets:
 *   - ~/.config/sops-nix/secrets/exa/api-key
 *   - ~/.config/sops-nix/secrets/parallel/api-key
 *
 * Usage:
 *   WebSearch  — Search the web via Exa, Parallel, or Google
 *   WebFetch   — Fetch page content via curl + markdown.new
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { truncateHead } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

/** Shell-escape a string for use inside single quotes */
function shellEscape(s: string): string {
  return s.replace(/'/g, "'\\''");
}

/** Run a bash command and return stdout/stderr/exitCode */
async function runBash(
  pi: ExtensionAPI,
  command: string,
  signal?: AbortSignal,
  timeout = 30000
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const result = await pi.exec("bash", ["-c", command], { signal, timeout });
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    exitCode: result.exitCode ?? 0,
  };
}

/** Read a sops-nix secret file, returns empty string if not found */
async function readSecret(
  pi: ExtensionAPI,
  path: string,
  signal?: AbortSignal
): Promise<string> {
  try {
    const { stdout } = await runBash(pi, `cat '${shellEscape(path)}' 2>/dev/null`, signal, 5000);
    return stdout.trim();
  } catch {
    return "";
  }
}

export default function webSearchExtension(pi: ExtensionAPI) {
  // ── WebSearch — Search via Exa, Parallel, or Google ──
  pi.registerTool({
    name: "WebSearch",
    label: "Web Search",
    description:
      "Search the web for information. Uses Exa (semantic search), " +
      "Parallel (agentic search), or Google (free keyword search). " +
      "Returns search results with titles, URLs, and descriptions/highlights.",
    parameters: Type.Object({
      query: Type.String({ description: "Search query" }),
      engine: Type.Optional(
        Type.Union(
          [
            Type.Literal("exa"),
            Type.Literal("parallel"),
            Type.Literal("google"),
          ],
          { description: "Search engine (default: exa). Use 'google' for free keyword search, 'exa' for semantic search, 'parallel' for agentic/deep search." }
        )
      ),
    }),

    async execute(_toolCallId, params, signal, onUpdate, _ctx) {
      if (signal?.aborted) {
        return { content: [{ type: "text", text: "Cancelled" }] };
      }

      const engine = params.engine ?? "exa";

      onUpdate?.({
        content: [{ type: "text", text: `Searching (${engine}): ${params.query}...` }],
        details: {},
      });

      try {
        const query = params.query;
        let output = "";
        let usedEngine = engine;

        if (engine === "exa") {
          const apiKey = await readSecret(pi, `${process.env.HOME}/.config/sops-nix/secrets/exa/api-key`, signal);
          if (!apiKey) {
            throw new Error("Exa API key not found at ~/.config/sops-nix/secrets/exa/api-key");
          }

          const escapedKey = shellEscape(apiKey);
          const { stdout, stderr, exitCode } = await runBash(
            pi,
            `curl -s --max-time 20 "https://api.exa.ai/search" ` +
              `-H "x-api-key: ${escapedKey}" ` +
              `-H "Content-Type: application/json" ` +
              `-d '${shellEscape(JSON.stringify({
                query,
                numResults: 8,
                type: "auto",
                contents: { highlights: true },
              }))}'`,
            signal,
            25000
          );

          if (exitCode !== 0 || !stdout.trim()) {
            throw new Error(`Exa search failed: ${stderr || "empty response"}`);
          }

          // Parse and format results
          try {
            const data = JSON.parse(stdout);
            const results = (data.results || []).map((r: any, i: number) => {
              const highlights = (r.highlights || []).join("\n  ");
              return `${i + 1}. **${r.title || "Untitled"}**\n   ${r.url}\n  ${highlights}`;
            });
            output = results.join("\n\n") || "No results found.";
          } catch {
            output = stdout; // Return raw JSON if parsing fails
          }
          usedEngine = "exa";

        } else if (engine === "parallel") {
          const apiKey = await readSecret(pi, `${process.env.HOME}/.config/sops-nix/secrets/parallel/api-key`, signal);
          if (!apiKey) {
            throw new Error("Parallel API key not found at ~/.config/sops-nix/secrets/parallel/api-key");
          }

          const escapedKey = shellEscape(apiKey);
          const { stdout, stderr, exitCode } = await runBash(
            pi,
            `curl -s --max-time 30 "https://api.parallel.ai/v1/beta/search" ` +
              `-H "Authorization: Bearer ${escapedKey}" ` +
              `-H "Content-Type: application/json" ` +
              `-d '${shellEscape(JSON.stringify({
                search_queries: [query],
                objective: query,
                mode: "agentic",
                max_results: 8,
              }))}'`,
            signal,
            35000
          );

          if (exitCode !== 0 || !stdout.trim()) {
            throw new Error(`Parallel search failed: ${stderr || "empty response"}`);
          }

          try {
            const data = JSON.parse(stdout);
            const results = (data.results || []).map((r: any, i: number) => {
              const excerpts = (r.excerpts || []).join("\n  ");
              return `${i + 1}. **${r.title || "Untitled"}**\n   ${r.url}\n  ${excerpts}`;
            });
            output = results.join("\n\n") || "No results found.";
          } catch {
            output = stdout;
          }
          usedEngine = "parallel";

        } else {
          // Google via curl + markdown.new
          const encodedQuery = encodeURIComponent(query);
          const { stdout, stderr } = await runBash(
            pi,
            `curl -sL --max-time 15 ` +
              `-H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" ` +
              `"https://markdown.new/https://www.google.com/search?q=${encodedQuery}"`,
            signal,
            20000
          );

          output = (stdout || stderr || "").trim();
          if (!output) {
            throw new Error("Google search returned empty output");
          }
          usedEngine = "google";
        }

        const truncated = truncateHead(output, 40000, 500);
        return {
          content: [
            {
              type: "text",
              text: `## Search Results (${usedEngine}) for: ${params.query}\n\n${truncated.text}`,
            },
          ],
          details: { query: params.query, engine: usedEngine, truncated: truncated.truncated },
        };
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text",
              text: `Search failed (${engine}): ${errMsg}`,
            },
          ],
          details: { error: errMsg, query: params.query, engine },
        };
      }
    },
  });

  // ── WebFetch — Fetch URL content via curl + markdown.new ──
  pi.registerTool({
    name: "WebFetch",
    label: "Web Fetch",
    description:
      "Fetch the content of a web page by URL. Uses curl + markdown.new for clean " +
      "markdown text. Works reliably for most pages including documentation, blogs, " +
      "and articles. For JSON APIs, fetches raw JSON directly.",
    parameters: Type.Object({
      url: Type.String({ description: "URL to fetch" }),
      selector: Type.Optional(
        Type.String({
          description:
            "Optional CSS selector to focus on specific content (e.g., 'main', 'article', '.content'). " +
            "Note: selector filtering is best-effort with markdown.new.",
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
        const url = params.url;
        let output = "";
        let method = "curl-markdown";

        // Check if this is a JSON API (skip markdown.new)
        const isJsonApi = /\.(json)$/i.test(url) ||
          url.includes("api.github.com") ||
          url.includes("pypi.org/pypi/") ||
          url.includes("registry.npmjs.org");

        if (isJsonApi) {
          const escapedUrl = shellEscape(url);
          const { stdout, stderr } = await runBash(
            pi,
            `curl -sL --max-time 20 '${escapedUrl}'`,
            signal,
            25000
          );
          output = (stdout || stderr || "").trim();
          method = "curl-json";
        } else {
          // Primary: curl + markdown.new
          const markdownUrl = `https://markdown.new/${url}`;
          const escapedMarkdownUrl = shellEscape(markdownUrl);
          const { stdout, stderr } = await runBash(
            pi,
            `curl -sL --max-time 20 '${escapedMarkdownUrl}'`,
            signal,
            25000
          );
          output = (stdout || stderr || "").trim();
          method = "curl-markdown";
        }

        if (!output) {
          throw new Error("curl returned empty output — page may require JavaScript rendering");
        }

        const truncated = truncateHead(output, 45000, 1500);
        return {
          content: [
            {
              type: "text",
              text: `## Content from: ${params.url}\n\n${truncated.text}`,
            },
          ],
          details: { url: params.url, truncated: truncated.truncated, method },
        };
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text",
              text: `Fetch failed: ${errMsg}\n\nTip: If the page requires JavaScript, use bash with camoufox (if CAMOFOX_URL is set) or try Exa/Parallel extract APIs.`,
            },
          ],
          details: { error: errMsg, url: params.url },
        };
      }
    },
  });
}
