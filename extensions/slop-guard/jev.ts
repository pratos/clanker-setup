/**
 * slop-guard — TypeSafe Jev client
 *
 * One POST to /v1/systemone evaluates a whole battery of typed questions
 * against the same state, in parallel, in isolation. No text generation,
 * no parsing — that's the whole point of using Jev here.
 *
 * https://docs.typesafe.ai/api
 */

export interface NoulQuestion {
  type: "noul";
  instructions: string;
  criteria?: { true: string; false: string };
}

export interface ChoiceQuestion {
  type: "choice";
  instructions: string;
  criteria: Record<string, string | null>;
}

export interface ScoreQuestion {
  type: "score";
  instructions: string;
  criteria: string[];
}

export type JevQuestion = NoulQuestion | ChoiceQuestion | ScoreQuestion;

export interface NoulAnswer {
  type: "noul";
  noul: number;
}

export interface ChoiceAnswer {
  type: "choice";
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
}

export interface ScoreAnswer {
  type: "score";
  score: number;
  legend?: Record<string, string>;
  probabilities?: Record<string, number>;
  confidence: number;
}

export type JevAnswer = NoulAnswer | ChoiceAnswer | ScoreAnswer;

export type JevAnswers = Record<string, JevAnswer>;

export class JevError extends Error {
  kind: "auth" | "network" | "timeout" | "api";
  constructor(kind: JevError["kind"], message: string) {
    super(message);
    this.kind = kind;
  }
}

export interface JevUsage {
  input_tokens: number;
  output_tokens: number;
}

export interface JevResult {
  answers: JevAnswers;
  usage: JevUsage;
  latencyMs: number;
}

export async function evaluate(args: {
  state: string;
  questions: Record<string, JevQuestion>;
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  signal?: AbortSignal;
}): Promise<JevResult> {
  const signals: AbortSignal[] = [AbortSignal.timeout(args.timeoutMs)];
  if (args.signal) signals.push(args.signal);
  const signal =
    typeof AbortSignal.any === "function" ? AbortSignal.any(signals) : signals[0];

  const started = Date.now();
  let res: Response;
  try {
    res = await fetch(`${args.baseUrl}/v1/systemone`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        state: args.state,
        model: args.model,
        questions: args.questions,
      }),
      signal,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (signal.aborted && args.signal?.aborted) throw new JevError("timeout", "aborted");
    throw new JevError(msg.includes("timeout") || msg.includes("TimeoutError") ? "timeout" : "network", msg);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 401 || res.status === 403) {
      throw new JevError("auth", `invalid API key (${res.status})`);
    }
    throw new JevError("api", `HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  const json = (await res.json()) as { answers?: JevAnswers; usage?: JevUsage };
  if (!json.answers) throw new JevError("api", "response missing answers");
  return {
    answers: json.answers,
    usage: json.usage ?? { input_tokens: 0, output_tokens: 0 },
    latencyMs: Date.now() - started,
  };
}
