/**
 * Web Search & Fetch Extension
 *
 * Provides WebSearch and WebFetch tools using the `surf` CLI for browser automation.
 * Enables the LLM to search the web and fetch page content.
 *
 * Requirements:
 *   - `surf` CLI installed and available in PATH (npm i -g @anthropic/surf)
 *
 * Usage:
 *   The LLM can call `WebSearch` to search the web and `WebFetch` to fetch page content.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { truncateHead } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

export default function webSearchExtension(pi: ExtensionAPI) {
  // WebSearch - Search the web using surf's perplexity integration or direct navigation
  pi.registerTool({
    name: "WebSearch",
    label: "Web Search",
    description:
      "Search the web for information. Returns search results with titles, URLs, and snippets. Use this when you need to find information on the internet.",
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
        // Use surf perplexity for AI-powered search
        const result = await pi.exec(
          "surf",
          ["perplexity", params.query],
          { signal, timeout: 60000 }
        );

        const output = result.stdout || result.stderr || "No results found";
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
        // Fallback: try DuckDuckGo HTML search via curl
        try {
          const encodedQuery = encodeURIComponent(params.query);
          const fallbackResult = await pi.exec(
            "bash",
            [
              "-c",
              `curl -sL "https://html.duckduckgo.com/html/?q=${encodedQuery}" | sed 's/<[^>]*>//g' | sed '/^$/d' | head -100`,
            ],
            { signal, timeout: 30000 }
          );

          const output =
            fallbackResult.stdout || "No results found (fallback search)";
          const truncated = truncateHead(output, 40000, 500);

          return {
            content: [
              {
                type: "text",
                text: `## Search Results for: ${params.query} (fallback)\n\n${truncated.text}`,
              },
            ],
            details: {
              query: params.query,
              fallback: true,
              truncated: truncated.truncated,
            },
          };
        } catch (fallbackError) {
          const errMsg =
            error instanceof Error ? error.message : String(error);
          return {
            content: [
              {
                type: "text",
                text: `Search failed: ${errMsg}\n\nTip: Make sure 'surf' CLI is installed and a browser session is available.`,
              },
            ],
            details: { error: errMsg },
          };
        }
      }
    },
  });

  // WebFetch - Fetch and read a specific URL
  pi.registerTool({
    name: "WebFetch",
    label: "Web Fetch",
    description:
      "Fetch the content of a web page by URL. Returns the page text content. Use this to read documentation, blog posts, GitHub pages, etc.",
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
        // Navigate to the URL
        await pi.exec("surf", ["go", params.url], {
          signal,
          timeout: 30000,
        });

        // Wait briefly for page to load
        await pi.exec("surf", ["wait", "2"], { signal, timeout: 10000 });

        // Read the page content
        const readArgs = ["read", "--depth", "4", "--compact"];
        const result = await pi.exec("surf", readArgs, {
          signal,
          timeout: 30000,
        });

        const output = result.stdout || result.stderr || "No content found";
        const truncated = truncateHead(output, 45000, 1500);

        return {
          content: [
            {
              type: "text",
              text: `## Content from: ${params.url}\n\n${truncated.text}`,
            },
          ],
          details: {
            url: params.url,
            truncated: truncated.truncated,
          },
        };
      } catch (error) {
        // Fallback: use curl for simple HTML content
        try {
          const fallbackResult = await pi.exec(
            "bash",
            [
              "-c",
              `curl -sL --max-time 15 "${params.url}" | sed 's/<script[^>]*>.*<\\/script>//g' | sed 's/<style[^>]*>.*<\\/style>//g' | sed 's/<[^>]*>//g' | sed '/^[[:space:]]*$/d' | head -500`,
            ],
            { signal, timeout: 20000 }
          );

          const output =
            fallbackResult.stdout || "No content found (fallback)";
          const truncated = truncateHead(output, 45000, 1500);

          return {
            content: [
              {
                type: "text",
                text: `## Content from: ${params.url} (fallback - plain text)\n\n${truncated.text}`,
              },
            ],
            details: {
              url: params.url,
              fallback: true,
              truncated: truncated.truncated,
            },
          };
        } catch (fallbackError) {
          const errMsg =
            error instanceof Error ? error.message : String(error);
          return {
            content: [
              {
                type: "text",
                text: `Fetch failed: ${errMsg}\n\nTip: Make sure 'surf' CLI is installed and a browser session is available, or try a different URL.`,
              },
            ],
            details: { error: errMsg, url: params.url },
          };
        }
      }
    },
  });
}
