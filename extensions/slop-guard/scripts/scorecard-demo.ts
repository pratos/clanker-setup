/**
 * Headless preview of the TUI scorecard — same renderScorecard() the
 * ctx.ui.custom() overlay component uses, with a plain ANSI palette.
 *
 * Usage: bun run scripts/scorecard-demo.ts [file.md]
 *
 * Uses live Jev when TYPESAFE_API_KEY is set; otherwise falls back to
 * simulated answers (labeled) so the card is always renderable.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { buildQuestions, computeReport, type SlopReport } from "../checks";
import { DEFAULT_CONFIG, expandEnv } from "../config";
import { evaluate, type JevAnswers } from "../jev";
import { ansiPalette, renderScorecard } from "../scorecard";

const file = process.argv[2] ?? "demo/arsenal-slop.md";
const text = readFileSync(resolve(file), "utf8");
const key = expandEnv(DEFAULT_CONFIG.apiKey);
const width = 96;

const SIMULATED: Record<string, JevAnswers> = {
  "demo/arsenal-slop.md": {
    specificity: { type: "score", score: 2.7, probabilities: {}, confidence: 0.81 },
    cliche_load: { type: "score", score: 2.9, probabilities: {}, confidence: 0.93 },
    voice: { type: "score", score: 2.5, probabilities: {}, confidence: 0.77 },
    hollow_structure: { type: "score", score: 2.3, probabilities: {}, confidence: 0.84 },
    hedging: { type: "noul", noul: 0.72 },
    fake_depth: { type: "noul", noul: 0.88 },
    dominant_issue: { type: "choice", choice: "cliche", probabilities: {}, confidence: 0.79 },
  },
  "demo/arsenal-clean.md": {
    specificity: { type: "score", score: 0.2, probabilities: {}, confidence: 0.88 },
    cliche_load: { type: "score", score: 0.1, probabilities: {}, confidence: 0.94 },
    voice: { type: "score", score: 0.4, probabilities: {}, confidence: 0.72 },
    hollow_structure: { type: "score", score: 0.3, probabilities: {}, confidence: 0.83 },
    hedging: { type: "noul", noul: 0.08 },
    fake_depth: { type: "noul", noul: 0.05 },
    dominant_issue: { type: "choice", choice: "none", probabilities: {}, confidence: 0.69 },
  },
};

async function buildReport(): Promise<SlopReport> {
  if (!key) {
    const answers = SIMULATED[file] ?? SIMULATED["demo/arsenal-slop.md"]!;
    return computeReport({
      answers,
      config: DEFAULT_CONFIG,
      path: file,
      model: DEFAULT_CONFIG.model,
      approximatePreview: false,
      usage: { input_tokens: 1240, output_tokens: 60 },
      latencyMs: 640,
      truncated: false,
    });
  }
  const result = await evaluate({
    state: text,
    questions: buildQuestions(),
    apiKey: key,
    baseUrl: DEFAULT_CONFIG.baseUrl,
    model: DEFAULT_CONFIG.model,
    timeoutMs: DEFAULT_CONFIG.timeoutMs,
  });
  return computeReport({
    answers: result.answers,
    config: DEFAULT_CONFIG,
    path: file,
    model: DEFAULT_CONFIG.model,
    approximatePreview: false,
    usage: result.usage,
    latencyMs: result.latencyMs,
    truncated: text.length > DEFAULT_CONFIG.maxStateChars,
  });
}

const report = await buildReport();
const note = key ? undefined : "SIMULATED JEV ANSWERS — set TYPESAFE_API_KEY for live scores";
console.log(renderScorecard(report, DEFAULT_CONFIG, ansiPalette(), width, note).join("\n"));
