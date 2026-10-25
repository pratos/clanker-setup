/**
 * Offline smoke test for slop-guard's pure logic (no API key needed).
 * Run: bun run scripts/smoke.ts
 */

import assert from "node:assert/strict";

import { buildQuestions, computeReport, topFailing } from "../checks";
import { DEFAULT_CONFIG } from "../config";
import { globToRegExp, previewEdit, shouldCheckPath } from "../preview";
import { blockReason, notifyLine, reportLines } from "../report";
import type { JevAnswers } from "../jev";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

console.log("glob matching");
test("**/*.md matches nested + root", () => {
  assert.ok(globToRegExp("**/*.md").test("README.md"));
  assert.ok(globToRegExp("**/*.md").test("docs/guides/a.md"));
  assert.ok(!globToRegExp("**/*.md").test("docs/a.mdx"));
});
test("**/node_modules/** excludes", () => {
  assert.ok(globToRegExp("**/node_modules/**").test("node_modules/x/y.js"));
  assert.ok(globToRegExp("**/node_modules/**").test("a/b/node_modules/x"));
  assert.ok(!globToRegExp("**/node_modules/**").test("src/node_modulesX/y"));
});
test("shouldCheckPath include/exclude", () => {
  const cfg = { include: DEFAULT_CONFIG.include, exclude: DEFAULT_CONFIG.exclude };
  assert.ok(shouldCheckPath("posts/hello.md", cfg.include, cfg.exclude, "/proj"));
  assert.ok(shouldCheckPath("/proj/posts/hello.md", cfg.include, cfg.exclude, "/proj"));
  assert.ok(!shouldCheckPath("src/main.ts", cfg.include, cfg.exclude, "/proj"));
  assert.ok(!shouldCheckPath("node_modules/pkg/README.md", cfg.include, cfg.exclude, "/proj"));
  assert.ok(!shouldCheckPath("../outside/x.md", cfg.include, cfg.exclude, "/proj"));
});

console.log("edit preview");
test("single edit splices correctly", () => {
  const { text, approximate } = previewEdit("keep one two keep", [{ oldText: "one two", newText: "ONE" }]);
  assert.equal(text, "keep ONE keep");
  assert.equal(approximate, false);
});
test("multiple disjoint edits, all matched on original", () => {
  const original = "aaa bbb ccc ddd";
  const { text } = previewEdit(original, [
    { oldText: "aaa", newText: "AAA" },
    { oldText: "ccc", newText: "CCC" },
  ]);
  assert.equal(text, "AAA bbb CCC ddd");
});
test("missing oldText falls back to approximate", () => {
  const { text, approximate } = previewEdit("original", [{ oldText: "nope", newText: "NEW" }]);
  assert.equal(text, "NEW");
  assert.equal(approximate, true);
});

console.log("question battery");
test("buildQuestions emits all checks + dominant choice", () => {
  const q = buildQuestions();
  assert.equal(Object.keys(q).length, 7);
  assert.equal(q.specificity.type, "score");
  assert.equal(q.hedging.type, "noul");
  assert.equal(q.dominant_issue.type, "choice");
});

console.log("composite scoring");
function fakeAnswers(over: Partial<Record<string, { score?: number; noul?: number; confidence?: number; choice?: string }>>): JevAnswers {
  const answers: JevAnswers = {};
  const scoreChecks = ["specificity", "cliche_load", "voice", "hollow_structure"] as const;
  for (const id of scoreChecks) {
    const o = over[id] ?? {};
    answers[id] = {
      type: "score",
      score: o.score ?? 0,
      probabilities: {},
      confidence: o.confidence ?? 0.9,
    };
  }
  for (const id of ["hedging", "fake_depth"] as const) {
    const o = over[id] ?? {};
    answers[id] = { type: "noul", noul: o.noul ?? 0 };
  }
  answers.dominant_issue = {
    type: "choice",
    choice: over.dominant_issue?.choice ?? "none",
    probabilities: {},
    confidence: 0.9,
  };
  return answers;
}

test("clean prose passes with low index", () => {
  const r = computeReport({
    answers: fakeAnswers({ hedging: { noul: 0.05 }, fake_depth: { noul: 0.1 } }),
    config: DEFAULT_CONFIG,
    path: "post.md",
    model: "jev-latest",
    approximatePreview: false,
    usage: { input_tokens: 1, output_tokens: 1 },
    latencyMs: 10,
    truncated: false,
  });
  assert.equal(r.verdict, "pass");
  assert.ok(r.index < DEFAULT_CONFIG.warnThreshold);
});

test("sloppy prose blocks with high index", () => {
  const r = computeReport({
    answers: fakeAnswers({
      specificity: { score: 2.8 },
      cliche_load: { score: 3 },
      voice: { score: 2.4 },
      hollow_structure: { score: 2.2 },
      hedging: { noul: 0.85 },
      fake_depth: { noul: 0.7 },
      dominant_issue: { choice: "generic" },
    }),
    config: DEFAULT_CONFIG,
    path: "post.md",
    model: "jev-latest",
    approximatePreview: false,
    usage: { input_tokens: 1, output_tokens: 1 },
    latencyMs: 10,
    truncated: false,
  });
  assert.equal(r.verdict, "block");
  assert.ok(r.index >= DEFAULT_CONFIG.blockThreshold);
  assert.ok(r.fixFirst.includes("Anchor claims"));
  assert.equal(topFailing(r)[0].id, "cliche_load");
});

test("low-confidence scores are excluded from the index", () => {
  const included = computeReport({
    answers: fakeAnswers({ specificity: { score: 3, confidence: 0.9 } }),
    config: DEFAULT_CONFIG,
    path: "x.md",
    model: "jev-latest",
    approximatePreview: false,
    usage: { input_tokens: 1, output_tokens: 1 },
    latencyMs: 10,
    truncated: false,
  });
  const excluded = computeReport({
    answers: fakeAnswers({ specificity: { score: 3, confidence: 0.1 } }),
    config: DEFAULT_CONFIG,
    path: "x.md",
    model: "jev-latest",
    approximatePreview: false,
    usage: { input_tokens: 1, output_tokens: 1 },
    latencyMs: 10,
    truncated: false,
  });
  assert.ok(excluded.index < included.index);
  assert.ok(excluded.lines.find((l) => l.id === "specificity")?.excluded);
  assert.equal(excluded.lowConfidenceCount, 1);
});

console.log("report formatting");
test("block reason is actionable plain text", () => {
  const r = computeReport({
    answers: fakeAnswers({
      specificity: { score: 2.6 },
      cliche_load: { score: 2.9 },
      dominant_issue: { choice: "cliche" },
    }),
    config: DEFAULT_CONFIG,
    path: "post.md",
    model: "jev-latest",
    approximatePreview: false,
    usage: { input_tokens: 1, output_tokens: 1 },
    latencyMs: 10,
    truncated: false,
  });
  const reason = blockReason(r, DEFAULT_CONFIG);
  assert.ok(reason.includes("BLOCKED"));
  assert.ok(reason.includes("slop_check"));
  assert.ok(reason.includes("cliche"));
  const lines = reportLines(r, DEFAULT_CONFIG);
  assert.ok(lines.some((l) => l.includes("▓")));
  assert.ok(notifyLine(r, DEFAULT_CONFIG).includes("/100"));
});

console.log(`\n${passed} tests passed`);
