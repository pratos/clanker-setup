/**
 * Insights — Shared Types
 */

export interface ToolCallRecord {
  name: string;
  duration: number;
  success: boolean;
  errorMsg?: string;
  timestamp: number;
  /** File path from tool args (read/write/edit/grep/find/ls) */
  filePath?: string;
}

export interface SessionRecord {
  sessionId: string;
  startTime: number;
  endTime: number;
  /** Number of user messages */
  userMessages: number;
  /** Number of agent turns */
  agentTurns: number;
  /** Tool call records */
  toolCalls: ToolCallRecord[];
  /** Unique files touched */
  filesTouched: string[];
  /** Languages inferred from file extensions */
  languages: Record<string, number>;
  /** Skills loaded during session */
  skillsLoaded: string[];
  /** User response times in ms (time between agent_end and next input) */
  userResponseTimes: number[];
  /** Working directory */
  cwd: string;
}

export interface AggregatedStats {
  /** Date range */
  startDate: string;
  endDate: string;
  /** Total sessions */
  sessions: number;
  /** Total user messages */
  messages: number;
  /** Total agent turns */
  agentTurns: number;
  /** Total tool calls */
  totalToolCalls: number;
  /** Tool calls by name */
  toolUsage: Record<string, number>;
  /** Tool errors by name */
  toolErrors: Record<string, number>;
  /** Total errors */
  totalErrors: number;
  /** Unique files touched */
  filesTouched: number;
  /** Languages by file count */
  languages: Record<string, number>;
  /** Skills loaded across sessions */
  skillsUsed: Record<string, number>;
  /** Total session time in ms */
  totalSessionTime: number;
  /** Total tool execution time in ms */
  totalToolTime: number;
  /** Average user response time in ms */
  avgResponseTime: number;
  /** Median user response time in ms */
  medianResponseTime: number;
  /** Response time distribution buckets */
  responseTimeBuckets: Record<string, number>;
  /** Messages by hour (0-23) */
  messagesByHour: Record<number, number>;
  /** Average messages per session */
  msgsPerSession: number;
  /** Active days */
  activeDays: number;
  /** Average messages per day */
  msgsPerDay: number;
  /** Session records for per-session breakdown */
  sessionRecords: SessionRecord[];
}

/** Map file extension → language name */
export function extToLanguage(ext: string): string | null {
  const map: Record<string, string> = {
    ".ts": "TypeScript",
    ".tsx": "TypeScript",
    ".js": "JavaScript",
    ".jsx": "JavaScript",
    ".py": "Python",
    ".rs": "Rust",
    ".go": "Go",
    ".rb": "Ruby",
    ".ex": "Elixir",
    ".exs": "Elixir",
    ".nix": "Nix",
    ".sh": "Shell",
    ".bash": "Shell",
    ".fish": "Fish",
    ".zsh": "Shell",
    ".md": "Markdown",
    ".mdx": "Markdown",
    ".json": "JSON",
    ".yaml": "YAML",
    ".yml": "YAML",
    ".toml": "TOML",
    ".html": "HTML",
    ".css": "CSS",
    ".scss": "CSS",
    ".lua": "Lua",
    ".vim": "Vim",
    ".sql": "SQL",
    ".swift": "Swift",
    ".kt": "Kotlin",
    ".java": "Java",
    ".c": "C",
    ".cpp": "C++",
    ".h": "C",
    ".hpp": "C++",
    ".zig": "Zig",
    ".gleam": "Gleam",
    ".erl": "Erlang",
    ".hs": "Haskell",
    ".ml": "OCaml",
    ".tf": "Terraform",
    ".dockerfile": "Docker",
    ".proto": "Protobuf",
    ".graphql": "GraphQL",
    ".svelte": "Svelte",
    ".vue": "Vue",
  };
  return map[ext.toLowerCase()] ?? null;
}
