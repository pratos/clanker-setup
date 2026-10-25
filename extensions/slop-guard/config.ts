/**
 * slop-guard — configuration
 *
 * Defaults merge in order: built-ins ← ~/.pi/agent/slop-guard.json ← <cwd>/.pi/slop-guard.json
 * Values support "$ENV_VAR" expansion (used for the API key).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface SlopGuardConfig {
  /** Bearer key. Plain string or "$TYPESAFE_API_KEY". */
  apiKey: string;
  baseUrl: string;
  model: string;
  /** Files worth guarding (glob, matched against cwd-relative path). */
  include: string[];
  /** Files never guarded. */
  exclude: string[];
  /** Skip auto-checks below this many non-whitespace chars (manual checks always run). */
  minChars: number;
  /** Slop index >= this blocks the write. */
  blockThreshold: number;
  /** Slop index >= this warns (blocks too, when strict). */
  warnThreshold: number;
  /** Score/choice answers with lower confidence are excluded from the index. */
  minConfidence: number;
  /** Block on warn-level content instead of just notifying. */
  strict: boolean;
  enabled: boolean;
  /** Per-request timeout. */
  timeoutMs: number;
  /** Max chars of state sent to Jev (truncates beyond, with a note). */
  maxStateChars: number;
}

export const DEFAULT_CONFIG: SlopGuardConfig = {
  apiKey: "$TYPESAFE_API_KEY",
  baseUrl: "https://api.typesafe.ai",
  model: "jev-latest",
  include: ["**/*.md", "**/*.mdx", "**/*.markdown", "**/*.txt"],
  exclude: [
    "**/node_modules/**",
    "**/.pi/**",
    "**/.visuals/**",
    "**/.git/**",
    "**/CHANGELOG.md",
    "**/bun.lock",
    "**/package-lock.json",
  ],
  minChars: 400,
  blockThreshold: 62,
  warnThreshold: 40,
  minConfidence: 0.35,
  strict: false,
  enabled: true,
  timeoutMs: 20_000,
  maxStateChars: 48_000,
};

export function expandEnv(value: string | undefined): string {
  if (!value) return "";
  if (value.startsWith("$")) return process.env[value.slice(1)] ?? "";
  return value;
}

function readJson(path: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function loadConfig(globalDir: string, cwd: string, isProjectTrusted: boolean): SlopGuardConfig {
  const layers: Record<string, unknown>[] = [readJson(join(globalDir, "slop-guard.json"))];
  if (isProjectTrusted) layers.push(readJson(join(cwd, ".pi", "slop-guard.json")));
  const merged = Object.assign({}, DEFAULT_CONFIG, ...layers) as SlopGuardConfig;
  return merged;
}
