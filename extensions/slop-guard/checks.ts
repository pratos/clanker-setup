/**
 * slop-guard — the question battery and composite scoring
 *
 * Follows TypeSafe's guidance: every question is atomic ("a gut-check a
 * knowledgeable person could make in a few seconds"), all questions fan out
 * in a single API call, and composition happens in code where you can change
 * a coefficient instead of rewriting a prompt.
 */

import type { JevAnswers, JevQuestion } from "./jev";
import type { SlopGuardConfig } from "./config";

export interface ScoreCheck {
  id: string;
  kind: "score";
  weight: number;
  question: Omit<Extract<JevQuestion, { type: "score" }>, "type">;
}

export interface NoulCheck {
  id: string;
  kind: "noul";
  weight: number;
  /** Short phrases for the report. */
  whenTrue: string;
  whenFalse: string;
  question: Omit<Extract<JevQuestion, { type: "noul" }>, "type">;
}

export type Check = ScoreCheck | NoulCheck;

export interface DominantIssueCheck {
  id: string;
  kind: "choice";
  question: Omit<Extract<JevQuestion, { type: "choice" }>, "type">;
}

/** What to tell the writer to do first, per dominant issue. */
export const FIXES: Record<string, string> = {
  none: "Nothing major — tighten as you like.",
  generic:
    "Anchor claims to named examples, numbers, dates, and real details. Delete any sentence that could describe any other topic.",
  cliche:
    "Hunt down stock AI phrasing ('delve', 'game-changer', 'seamless', 'it's worth noting', …) and rewrite each in plain words.",
  structure:
    "Cut filler: obvious section intros, bullets that restate their heading, and any 'In conclusion' paragraph. Keep only sections that carry information.",
  hedge:
    "Commit. Replace 'arguably', 'it could be said', 'in many ways' with actual claims the reader can agree or disagree with.",
};

export const BATTERY: Check[] = [
  {
    id: "specificity",
    kind: "score",
    weight: 3,
    question: {
      instructions:
        "How generic is the prose? Are statements anchored to concrete specifics (named products, numbers, dates, real examples, firsthand detail), or are they interchangeable with any other piece on the topic?",
      criteria: [
        "Sharp: nearly every claim is anchored to specific names, numbers, or concrete examples",
        "Mixed: mostly specific, but several sentences are generic filler",
        "Largely generic: interchangeable with a thousand other pieces on the topic",
        "Pure boilerplate: no concrete detail anywhere",
      ],
    },
  },
  {
    id: "cliche_load",
    kind: "score",
    weight: 3,
    question: {
      instructions:
        "How saturated is the text with stock AI phrasing — e.g. 'delve into', 'game-changer', 'tapestry', 'in today's fast-paced world', 'unlock the power of', 'seamless', 'robust', 'navigate the landscape of', 'it's worth noting', 'buckle up'?",
      criteria: [
        "Clean: no stock AI phrases",
        "Light: one or two telltale phrases",
        "Heavy: stock phrasing appears in most sections",
        "Saturated: nearly every paragraph carries AI clichés",
      ],
    },
  },
  {
    id: "voice",
    kind: "score",
    weight: 2,
    question: {
      instructions:
        "Does the writing sound like a person with a point of view, or like default model output? Judge stance, rhythm variety, and willingness to be specific over safe, symmetrical, corporate prose.",
      criteria: [
        "Distinct human voice: opinionated, varied rhythm, takes risks",
        "Mostly human, with occasional flat corporate patches",
        "Largely flat model cadence: uniform sentences, hedged safe stance",
        "Textbook AI voice: no personality, symmetry everywhere",
      ],
    },
  },
  {
    id: "hollow_structure",
    kind: "score",
    weight: 2,
    question: {
      instructions:
        "Does each section earn its place with real information, or is it scaffolding — obvious section intros, bullet lists restating the heading, vacuous conclusions like 'In conclusion, X is important'?",
      criteria: [
        "Dense: every section carries substance",
        "Some padding: one or two filler sections or list-crutches",
        "Mostly scaffolding: sections restate the obvious, lists replace thought",
        "Empty: outline filler from start to finish",
      ],
    },
  },
  {
    id: "hedging",
    kind: "noul",
    weight: 1,
    whenTrue: "empty qualifiers soften claims",
    whenFalse: "commits to its claims",
    question: {
      instructions:
        "The text hedges with empty qualifiers ('arguably', 'it could be said', 'in many ways', 'potentially', 'it is worth noting') instead of committing to claims.",
      criteria: {
        true: "Hedging qualifiers repeatedly soften or replace actual claims",
        false: "The text commits to what it says",
      },
    },
  },
  {
    id: "fake_depth",
    kind: "noul",
    weight: 1,
    whenTrue: "performs insight, delivers nothing checkable",
    whenFalse: "claims are concrete and checkable",
    question: {
      instructions:
        "The text performs insight without delivering it: grand framing, rhetorical questions answered vaguely, advice that restates the question, no falsifiable or checkable claims.",
      criteria: {
        true: "Performs depth but says nothing checkable or new",
        false: "Claims are concrete and could be checked or disputed",
      },
    },
  },
];

export const DOMINANT: DominantIssueCheck = {
  id: "dominant_issue",
  kind: "choice",
  question: {
    instructions:
      "If an editor flagged this text as AI slop, what is the single dominant problem to fix first? If the text is genuinely fine, pick none.",
    criteria: {
      none: "Reads sharp and human; no real problem",
      generic: "Prose is generic and interchangeable — needs concrete specifics",
      cliche: "Stock AI phrasing dominates — hunt clichés and rewrite",
      structure: "Hollow scaffolding — cut filler sections and list-crutches",
      hedge: "Hedged, non-committal stance — make actual claims",
    },
  },
};

export function buildQuestions(): Record<string, JevQuestion> {
  const questions: Record<string, JevQuestion> = {};
  for (const check of BATTERY) {
    questions[check.id] = { type: check.kind, ...check.question } as JevQuestion;
  }
  questions[DOMINANT.id] = { type: "choice", ...DOMINANT.question };
  return questions;
}

export interface CheckLine {
  id: string;
  kind: "score" | "noul";
  /** Normalized 0..1, 1 = maximum slop. */
  value: number;
  /** Raw display, e.g. "2.1/3" or "0.61". */
  display: string;
  /** Level description / noul verdict phrase. */
  description: string;
  excluded: boolean;
}

export interface SlopReport {
  path: string;
  model: string;
  index: number;
  verdict: "pass" | "warn" | "block";
  lines: CheckLine[];
  dominantIssue?: { key: string; confidence: number; lowConfidence: boolean };
  fixFirst: string;
  approximatePreview: boolean;
  usage: { input_tokens: number; output_tokens: number };
  latencyMs: number;
  lowConfidenceCount: number;
  truncated: boolean;
}

export function computeReport(args: {
  answers: JevAnswers;
  config: SlopGuardConfig;
  path: string;
  model: string;
  approximatePreview: boolean;
  usage: { input_tokens: number; output_tokens: number };
  latencyMs: number;
  truncated: boolean;
}): SlopReport {
  const { answers, config } = args;
  const lines: CheckLine[] = [];
  let weighted = 0;
  let totalWeight = 0;
  let lowConfidenceCount = 0;

  for (const check of BATTERY) {
    const answer = answers[check.id];
    if (!answer) continue;

    if (check.kind === "score" && answer.type === "score") {
      const levels = check.question.criteria.length;
      const normalized = Math.min(1, Math.max(0, answer.score / (levels - 1)));
      const idx = Math.min(levels - 1, Math.max(0, Math.round(answer.score)));
      const description =
        answer.legend?.[String(idx)] ?? check.question.criteria[idx] ?? "";
      const lowConf = answer.confidence < config.minConfidence;
      if (lowConf) lowConfidenceCount++;
      if (!lowConf) {
        weighted += check.weight * normalized;
        totalWeight += check.weight;
      }
      lines.push({
        id: check.id,
        kind: "score",
        value: normalized,
        display: `${answer.score.toFixed(1)}/${levels - 1}`,
        description,
        excluded: lowConf,
      });
    } else if (check.kind === "noul" && answer.type === "noul") {
      const value = Math.min(1, Math.max(0, answer.noul));
      weighted += check.weight * value;
      totalWeight += check.weight;
      lines.push({
        id: check.id,
        kind: "noul",
        value,
        display: value.toFixed(2),
        description: value >= 0.5 ? check.whenTrue : check.whenFalse,
        excluded: false,
      });
    }
  }

  const index = totalWeight > 0 ? Math.round((100 * weighted) / totalWeight) : 0;
  const dominant = answers[DOMINANT.id];
  let dominantIssue: SlopReport["dominantIssue"];
  if (dominant && dominant.type === "choice") {
    const lowConf = dominant.confidence < config.minConfidence;
    if (lowConf) lowConfidenceCount++;
    dominantIssue = { key: dominant.choice, confidence: dominant.confidence, lowConfidence: lowConf };
  }

  const verdict = index >= config.blockThreshold ? "block" : index >= config.warnThreshold ? "warn" : "pass";

  let fixFirst =
    dominantIssue && FIXES[dominantIssue.key] && dominantIssue.key !== "none"
      ? FIXES[dominantIssue.key]
      : FIXES.generic;
  if (dominantIssue?.key === "none" && verdict === "pass") fixFirst = FIXES.none;
  if (!dominantIssue || dominantIssue.key === "none") {
    const worst = [...lines].sort((a, b) => b.value - a.value)[0];
    if (worst && worst.value >= 0.5) fixFirst = fixForCheck(worst.id);
  }

  return {
    path: args.path,
    model: args.model,
    index,
    verdict,
    lines,
    dominantIssue,
    fixFirst,
    approximatePreview: args.approximatePreview,
    usage: args.usage,
    latencyMs: args.latencyMs,
    lowConfidenceCount,
    truncated: args.truncated,
  };
}

function fixForCheck(id: string): string {
  switch (id) {
    case "specificity":
      return FIXES.generic;
    case "cliche_load":
      return FIXES.cliche;
    case "hollow_structure":
      return FIXES.structure;
    case "hedging":
      return FIXES.hedge;
    default:
      return FIXES.generic;
  }
}

/** Top failing checks by weighted contribution — for block reasons. */
export function topFailing(report: SlopReport, count = 3): CheckLine[] {
  return report.lines
    .filter((l) => !l.excluded && l.value >= 0.5)
    .sort((a, b) => b.value - a.value)
    .slice(0, count);
}
