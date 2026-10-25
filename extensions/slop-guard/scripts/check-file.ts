/**
 * CLI driver for slop-guard — runs the exact pipeline the extension uses
 * (buildQuestions -> evaluate -> computeReport -> report/blockReason).
 *
 * Usage:
 *   bun run scripts/check-file.ts <file.md> [--json]
 *
 * Without TYPESAFE_API_KEY it fails open like the guard does, and prints the
 * request payload it would have sent (state truncated for readability).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { buildQuestions, computeReport } from "../checks";
import { DEFAULT_CONFIG, expandEnv } from "../config";
import { evaluate, JevError } from "../jev";
import { blockReason, reportLines } from "../report";

const file = process.argv[2];
if (!file) {
  console.error("usage: bun run scripts/check-file.ts <file.md> [--json]");
  process.exit(1);
}
const asJson = process.argv.includes("--json");

const path = resolve(file);
const text = readFileSync(path, "utf8");
const config = { ...DEFAULT_CONFIG };
const key = expandEnv(config.apiKey);
const questions = buildQuestions();

if (!key) {
  console.error("slop-guard offline: no TYPESAFE_API_KEY — write would be allowed (fail-open).\n");
  console.error("Request that would be sent to Jev:");
  const state = text.length > config.maxStateChars ? text.slice(0, config.maxStateChars) + "\n\n[truncated]" : text;
  const payload = { url: `${config.baseUrl}/v1/systemone`, model: config.model, state: `${state.slice(0, 700)}${state.length > 700 ? " …" : ""}`, questions };
  console.error(JSON.stringify(payload, null, 2));
  process.exit(2);
}

try {
  const result = await evaluate({
    state: text,
    questions,
    apiKey: key,
    baseUrl: config.baseUrl,
    model: config.model,
    timeoutMs: config.timeoutMs,
  });
  const report = computeReport({
    answers: result.answers,
    config,
    path: file,
    model: config.model,
    approximatePreview: false,
    usage: result.usage,
    latencyMs: result.latencyMs,
    truncated: text.length > config.maxStateChars,
  });
  if (asJson) {
    console.log(JSON.stringify({ report, raw: result.answers }, null, 2));
  } else {
    console.log(reportLines(report, config).join("\n"));
    if (report.verdict === "block") {
      console.log("\n--- what the agent would see as its blocked tool result ---\n");
      console.log(blockReason(report, config));
    }
  }
} catch (err) {
  if (err instanceof JevError) console.error(`jev error (${err.kind}): ${err.message}`);
  else console.error(err);
  process.exit(3);
}
