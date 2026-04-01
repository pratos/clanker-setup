/**
 * ColGREP Extension for Pi
 *
 * Integrates semantic code search via ColGREP (lightonai/next-plaid).
 * Provides soft guardrails to guide agents toward semantic search for exploration.
 *
 * @see https://github.com/lightonai/next-plaid/tree/main/colgrep
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { spawn } from "child_process";
import { existsSync } from "fs";
import path from "path";

interface ColgrepSearchArgs {
  query: string;
  path?: string;
  max_results?: number;
  context?: number;
}

interface ColgrepResult {
  file: string;
  line: number;
  content: string;
  score: number;
}

// Track grep/find usage to provide context-aware nudges
let recentGrepFindCount = 0;
let lastNudgeTime = 0;
const NUDGE_COOLDOWN_MS = 60000; // 1 minute between nudges

/**
 * Execute colgrep search and return structured results
 */
async function execColgrep(
  query: string,
  cwd: string,
  maxResults = 20,
  context = 0
): Promise<{ results: ColgrepResult[]; error?: string }> {
  return new Promise((resolve) => {
    const args = ["search", query, "--format", "json", "--max-results", String(maxResults)];
    if (context > 0) {
      args.push("--context", String(context));
    }

    const proc = spawn("colgrep", args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    });

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        resolve({
          results: [],
          error: `colgrep exited with code ${code}: ${stderr || "unknown error"}`,
        });
        return;
      }

      try {
        const results = JSON.parse(stdout) as ColgrepResult[];
        resolve({ results });
      } catch (e) {
        resolve({
          results: [],
          error: `Failed to parse colgrep output: ${e instanceof Error ? e.message : "unknown error"}`,
        });
      }
    });

    proc.on("error", (err) => {
      resolve({ results: [], error: `Failed to spawn colgrep: ${err.message}` });
    });
  });
}

/**
 * Check if colgrep is installed and index exists
 */
function isColgrepAvailable(): boolean {
  const pathEnv = process.env.PATH || "";
  return pathEnv
    .split(path.delimiter)
    .some((dir) => existsSync(path.join(dir, "colgrep")) || existsSync(path.join(dir, "colgrep.exe")));
}

function hasIndex(cwd: string): boolean {
  return existsSync(path.join(cwd, ".colgrep"));
}

/**
 * Generate soft nudge when grep/find used for exploration
 */
function generateNudge(toolName: string, args: unknown): string | null {
  const now = Date.now();
  const pattern = typeof (args as { pattern?: string } | undefined)?.pattern === "string"
    ? (args as { pattern?: string }).pattern
    : "";

  // Only nudge for exploration-like patterns
  const isExploration =
    toolName === "grep" &&
    (pattern.includes("TODO") ||
      pattern.includes("FIXME") ||
      pattern.includes("function") ||
      pattern.includes("class"));

  if (!isExploration) {
    return null;
  }

  recentGrepFindCount++;

  // Nudge after 3+ exploration greps within cooldown period
  if (recentGrepFindCount >= 3 && now - lastNudgeTime > NUDGE_COOLDOWN_MS) {
    lastNudgeTime = now;
    recentGrepFindCount = 0;
    return (
      "💡 Semantic Search Available: Consider using colgrep_search for exploratory queries.\n" +
      "ColGREP provides semantic code search that understands intent (e.g., 'authentication logic', 'error handling').\n" +
      "- Faster than multiple grep calls for broad exploration\n" +
      "- Returns ranked results by relevance\n" +
      "- Works across languages without exact pattern matching\n" +
      "\n" +
      "Example: colgrep_search(\"functions that validate user input\")"
    );
  }

  return null;
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "colgrep_search",
    label: "ColGREP Search",
    description: `Search code semantically using natural language. Understands intent beyond pattern matching.
Use when:
- Exploring unfamiliar codebases ("find auth logic", "error handlers")
- Locating functionality by purpose ("user validation", "API endpoints")
- Searching across languages without syntax knowledge

Returns ranked results with file paths, line numbers, and code snippets.
Requires 'colgrep init' to be run in project root (creates .colgrep index).`,
    parameters: Type.Object({
      query: Type.String({
        description:
          "Natural language search query (e.g., 'functions that validate email addresses', 'JWT token handling')",
      }),
      path: Type.Optional(
        Type.String({
          description: "Optional: directory to search within (default: project root)",
        })
      ),
      max_results: Type.Optional(
        Type.Number({
          description: "Maximum number of results to return (default: 20)",
        })
      ),
      context: Type.Optional(
        Type.Number({
          description: "Number of context lines to show around matches (default: 0)",
        })
      ),
    }),

    async execute(_toolCallId, args: ColgrepSearchArgs, _signal, _onUpdate, ctx) {
      if (!isColgrepAvailable()) {
        return {
          content: [
            {
              type: "text",
              text: "colgrep not found. Install via 'cargo install colgrep' or rebuild your system.",
            },
          ],
          isError: true,
          details: { error: "missing_binary" },
        };
      }

      const searchPath = args.path ? path.resolve(ctx.cwd, args.path) : ctx.cwd;
      const maxResults = args.max_results || 20;
      const context = args.context || 0;

      if (!hasIndex(searchPath)) {
        return {
          content: [
            {
              type: "text",
              text: "ColGREP index not found. Run 'colgrep init' in the project root to create the index first.",
            },
          ],
          isError: true,
          details: { error: "missing_index" },
        };
      }

      const { results, error } = await execColgrep(args.query, searchPath, maxResults, context);

      if (error) {
        return {
          content: [{ type: "text", text: error }],
          isError: true,
          details: { error: "colgrep_failed" },
        };
      }

      if (results.length === 0) {
        return {
          content: [{ type: "text", text: `No results found for query: "${args.query}"` }],
          details: { results: 0 },
        };
      }

      const formatted = results
        .map((result, index) => {
          const scorePercent = Math.round(result.score * 100);
          return `## Result ${index + 1} (${scorePercent}% relevance)
**File**: \`${result.file}:${result.line}\`

\`\`\`
${result.content}
\`\`\`
`;
        })
        .join("\n");

      return {
        content: [
          {
            type: "text",
            text: `Found ${results.length} semantic matches for: "${args.query}"

${formatted}

💡 Tip: Use the file paths above with \`read\` or \`edit\` tools to explore further.`,
          },
        ],
        details: { results: results.length },
      };
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    if (!isColgrepAvailable()) {
      ctx.ui.notify("colgrep not found (install via 'cargo install colgrep' or rebuild system)", "warning");
      return;
    }

    if (!hasIndex(ctx.cwd)) {
      ctx.ui.notify(
        "colgrep index not found. Run 'colgrep init' in project root to enable semantic search.",
        "info"
      );
    }
  });

  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "grep" && event.toolName !== "find") {
      return;
    }

    const nudge = generateNudge(event.toolName, event.input);
    if (nudge && isColgrepAvailable() && hasIndex(ctx.cwd)) {
      ctx.ui.notify(nudge, "info");
    }
  });
}
