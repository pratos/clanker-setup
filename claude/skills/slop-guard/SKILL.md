---
name: slop-guard
description: Score prose for AI slop before it is written or shipped, in three layers. First Eric Tramel's slop-guard, a rule-based linter with no key and no network (colon density, triads, bullet runs, em dashes, closing aphorisms). Then the Jev scorer binary for what rules cannot see (voice, specificity, hollow structure), when a TYPESAFE_API_KEY is present. Use on any Markdown, doc, PR body, decision entry, UI copy, artifact captions or talk notes, and whenever a draft reads flat, generic, padded or oddly clipped.
---

# slop-guard

Three checks, because they catch different things. Run them all with one command:

```sh
python3 ~/.claude/skills/slop-guard/scripts/check.py --jev path/to/draft.md
```

Passing is 85 or more on the rules, no smells, and under 40 on Jev. A hook runs the two local layers on prose as it changes. Jev sends the text to TypeSafe, so the hook leaves it out; run it with `--jev` on anything that is going to be published, and not on internal documents unless the person asks.
 The rules caught a set of artifact captions full of "First fact: resolved." fragments at 55 out of 100 while the judge model scored them clean; the judge catches a flat corporate voice the rules cannot see.

## Layer 1, rules (always)

```sh
just slop path/to/draft.md
```

runs `uvx --from slop-guard==0.5.0 sg -v --counts <file>`. Score 0 to 100, higher is cleaner, with a band (`clean`, `light`, `moderate`, …), each violation in context and one line of advice per rule. No key, no network, deterministic, so it also runs in CI and as a pre-commit hook. The same linter is available to the agent as an MCP server from the repo's `.mcp.json`.

## Layer 2, Jev (when a key exists)

The same `just slop` recipe then runs `tools/slop-jev/slop-jev <file>` if `TYPESAFE_API_KEY` is set or in `.dev.vars`. Index 0 to 100, lower is cleaner: under 40 passes, 40 to 61 warns, 62 blocks. Dimensions: specificity, cliche load, voice, hollow structure, hedging, fake depth, plus a dominant-issue diagnosis and a fix-first line.

To add the key, never paste it in chat. Ask the person to run:

```sh
just secret put TYPESAFE_API_KEY
```

It reads without echo into `.dev.vars`, which is gitignored. If the binary is missing, `just build-slop-jev` compiles it from `tools/slop-jev/src`.

## Layer 3, smell (always)

`check.py` also looks for rhetorical habits: mic-drop endings, parallel sentence pairs, staccato pairs, and phrases that perform insight ("the real gift", "here is ours", "that is why"). This layer exists because a draft passed Layer 1 at 73 and Layer 2 at 6/100 ("distinct human voice"), and the person still said it smelled of AI. It failed that same draft on 17 counts. When a reader dislikes something the scorers passed, add the pattern here.

`TERMS_OF_ART` in `check.py` lists correct technical words the rules would penalise, such as "harness".

## When

- Before writing any prose file over about 400 characters: docs, decisions, PR bodies, release notes, README sections.
- On the collected copy of an artifact (captions, option summaries, question) before `viz-explainer` builds it. Concatenate into one text file; both scorers need a few hundred characters to have an opinion.
- When a reviewer or the person says a draft reads weird, flat, generic or clipped.

## Act on it

1. Fix the rule violations first. They are specific and cheap.
2. Then the Jev fix-first line and its lowest two dimensions. Rerun. Stop when both pass and the advice repeats itself.
3. Read it aloud once. No scorer checks that a sentence is true or that it is one a person would say. A pass does not settle it: the reader's judgment outranks every score.

## What it does not do

No layer rewrites, checks facts, or runs on code. A clean score on a wrong sentence is still a wrong sentence.
