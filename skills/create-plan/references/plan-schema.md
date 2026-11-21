# Plan schema

One JSON object. Prose fields are Markdown and are rendered; keep them to short paragraphs. `assets/example.plan.json` is a complete plan that uses every field.

```jsonc
{
  "title": "Resolve a comment thread into a decision",   // what the plan delivers, as a plain phrase
  "ticket": "GH-12",                                     // optional
  "date": "2026-10-28",
  "status": "draft",                                     // draft | final | implementing | done
  "author": "pratos with Claude Code",                   // optional
  "summary": "Two or three sentences: what changes for whom, and why now.",
  "current": "Where things are today.",
  "discoveries": ["One finding per item, with a file:line reference when it helps."],
  "endState": "What is true when the plan is done, and how someone would see it.",
  "notDoing": ["Out of scope, with the reason in the same sentence."],
  "approach": "Why the phases are in this order.",
  "approachDiagram": "lifecycle",                        // optional: id from diagrams

  "contexts": [                                          // one line per vocabulary context: what it covers (20 words)
    { "name": "Planning", "about": "The words people write and decide with." }
  ],
  "vocabulary": [                                        // required when the plan adds, renames or redefines a word
    { "term": "Comment", "context": "Planning", "status": "renamed", "from": "the comment Thread",
      "meaning": "A comment on one Block. Collects Replies, ends in a Decision.", "not": ["discussion", "issue"] },
    { "term": "Run", "context": "Agent work", "status": "adopted", "from": "pi-durable", "meaning": "The Turns from one input to its final answer." }
  ],

  "diagrams": [
    { "id": "lifecycle", "spec": { /* a viz-explainer spec: state-explorer, event-stream or architecture-map */ } }
  ],

  "decisions": [
    {
      "id": "events",
      "question": "Is a decision its own fact, or part of ThreadResolved?",
      "options": [{ "id": "two-events", "label": "Two events" }, { "id": "one-event", "label": "One event" }],
      "chosen": "two-events",                            // required unless status is draft
      "by": "pratos", "at": "2026-10-27",
      "why": "One paragraph.",
      "viz": { /* a viz-explainer decision-report spec; it renders locked on the chosen option */ }
    }
  ],

  "design": { /* see ui-blocks.md; required in practice when the plan changes UI */ },

  "phases": [
    {
      "id": "domain",
      "name": "Domain: resolve records two facts",
      "goal": "What is true when this phase is done.",
      "diagram": "lifecycle",                            // optional
      "changes": [
        { "file": "packages/domain/src/thread/decider.ts",
          "intent": "Add the command, the two events, and the resolve case in decide.",
          "contract": { "lang": "ts", "code": "ResolveThread = defineCommand('ResolveThread', { threadId, by, decision })" } },
        { "file": "docs/DOMAIN-VOCABULARY.md",
          "intent": "Add the Decision entry.",
          "contract": { "lang": "md", "code": "### Decision\nHow a Thread ended.\nNot: verdict, outcome" } }   // md renders as Markdown
      ],
      "components": [ /* see ui-blocks.md */ ],
      "verify": {
        "automated": [{ "cmd": "just test", "text": "optional note", "done": false }],
        "manual": [{ "text": "Read resolve.snap.txt aloud; it should sound like something that happened.", "done": false }]
      },
      "notes": "optional"
    }
  ],

  "references": ["`docs/ARCHITECTURE.md`", "`docs/decisions/agent-loop.html`"],

  "change": { "intent": "One sentence: why this edit." }   // set in the same edit as any change; recorded on its version
}
```

## What the builder enforces

| Rule | Why |
|---|---|
| `title`, `summary`, `notDoing`, at least one phase | A plan without scope or a reason is a wish |
| every change has `file` and `intent` | The intent is the instruction; the file is where |
| a `contract` is at most 15 lines | Plans carry contracts, not implementations |
| status other than `draft` ⇒ every decision has `chosen` | No open questions in a plan someone will implement |
| every phase has `verify.automated` and `verify.manual` | Done must be checkable |
| `diagram` and `approachDiagram` refer to real ids | A broken reference is a silent gap |
| each `vocabulary` word has term, context, meaning and a known status, once; a `renamed` word says `from` | A word without its old name or meaning cannot be checked |

Warnings: an intent longer than two sentences, more than 40 contract lines in a phase, UI files changed without a component or without a design block, and every field over its word budget.

## Word budgets

| Field | Words |
|---|---|
| summary, current | 50 |
| endState | 40 |
| approach | 35 |
| discoveries | 5 items, 25 each |
| notDoing item, change intent, manual check, caption, option summary | 15 |
| vocabulary meaning (the list itself is outside the page budget) | 20 |
| phase goal | 25 |
| decision why | 35 |
| component notes | 20 |
| whole page, decided reports closed | about 1,000 |

The build line prints the visible word count and reading time; the page shows the reading time in its byline. A decided decision's report renders collapsed, so its option text does not count.

## Code and Markdown

A contract's `lang` decides how it shows. `md` renders as Markdown: headings, tables, lists, inline code and fenced code blocks, with line breaks kept as written. Every other `lang` is a code block with the language in a bar and colours from the page palette: `ts`, `tsx`, `js`, `json`, `sql`, `sh`, `css`, `html`, `yaml`, `toml`, `diff`, `text`. Fenced blocks in prose fields render the same way. Nothing shows as raw source.

## Versions

`<slug>.plan.versions.jsonl` sits beside the plan and is committed with it. One line per change:

```json
{ "v": 4, "at": "2026-10-28T06:50:00Z", "hash": "sha256:…", "by": "pratos", "via": "claude-code",
  "intent": "Replace the GH-12 report with where the agent's work runs.",
  "prompt": "gh-12 decision report is a farce, …", "session": { "id": "17cb8246-…", "transcript": "~/.claude/projects/…/17cb8246-….jsonl" },
  "changes": ["references: 3 → 2 items", "decision events edited"], "plan": { "…": "the whole plan at v4" } }
```

| Field | Comes from |
|---|---|
| `by` | `PLAN_BY`, else `git config user.name` |
| `via` | `PLAN_VIA`: `claude-code` (set by the hook), `pi`, else `manual` |
| `intent` | `PLAN_INTENT` (`just plan FILE "why"`), else the plan's `change.intent` when it is new |
| `prompt` | `PLAN_PROMPT`, else the last prompt in `PLAN_TRANSCRIPT`; queued prompts and requests relayed from another session count |
| `session` | `PLAN_SESSION` and `PLAN_TRANSCRIPT`; the Claude Code hook passes both |
| `changes` | computed: status, rewritten fields with word counts, decisions chosen, phases added or edited, checks done |

A build records only when the plan differs from the last version; `change` is not part of the plan, so an edit that only writes the note fills in the latest version's missing intent instead. `PLAN_NO_RECORD=1` builds without recording.
