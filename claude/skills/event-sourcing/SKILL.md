---
name: event-sourcing
description: "Build and change an event-sourced domain the Greenhouse way: commands validate, events are facts, projections are pure, every decider rule has an expect test. Use for anything under packages/domain, for a new command, event or projection, for \"add a field to an event\", for replaying or debugging a stream, and for explaining what happened or how an aggregate's lifecycle works. Explains with viz-explainer artifacts (event-stream story, state explorer, decision report), never with Markdown."
---

# event-sourcing

Spreadsheets won because the data and its flow are visible. An event log gives a service the same property: the log of what happened is the system of record, and anyone, including the agent, can read it. This skill is the small set of rules that keep that true, and the way the log is explained back to a person.

## When this fires

- Any change under `packages/domain`, or to the append path in `apps/api/src/plan-room.ts`.
- A new command, event or projection. In the Thread context start from `just new command|event Name`; elsewhere copy the context's decider and test, never a blank file.
- "Add a field to", "rename", "change the shape of" anything that is already recorded.
- A bug report with a stream id: `just replay <planId>` for a plan's Thread events (session and account streams have no replay; reproduce them in a story), then the failing expect test, then the fix.
- "What happened in plan X?", "how does a Thread move?", "should this be one event or two?"

## Rules

1. **Commands validate; events are facts.** A command may be rejected. An event is never rejected, edited or deleted. Past tense, domain vocabulary word (load `ddd-vocabulary` for the word).
2. **Decide, evolve, project.** `decide(state, command, ctx) → events, [] or a rejection` is the only place with rules. `evolve(state, event) → state` has none. A projection is pure: a fold (`project`) or statements from one event (`Projection.on`). Shape in `references/decider.md`.
3. **One command, one append.** Every event a command emits is appended in one synchronous block: one `atomically` in the engine, no `await` between writes in a Durable Object. Partial appends do not exist.
4. **Three test layers.** Every decider rule and rejection has a one-command expect test (`expectDecider`); every workflow a story through the real engine; every projection a projection story (given events, then `read` rows on real SQL). In Event Modeling terms: a command slice is an expect test, a view slice a projection story, an automation slice a workflow story (the agent loop). A human reviews each snapshot like a story. No unit tests of `evolve`. `references/engine.md` has the formats and the gaps.
5. **Invariants are types first, checks second.** "A decision references exactly one thread" is a schema. Only what cannot be a type becomes a `decide` check, and the check gets an expect test that shows the rejection.
6. **Flags live in `decide`.** A new command ships behind a flag, default off, checked in one place.
7. **The past is read, not rewritten.** Changing a recorded event climbs the ladder in `references/changing-events.md` from the bottom: avoid, map, upcast on read, new event type, transform. Never edit a schema in place for an event that exists in any store.
8. **Streams are short and end.** A Thread opens and resolves within its Plan in days; a Session ends. No snapshots: split a stream that grows. Frequent event changes mean the model is wrong, not the schema.
9. **Where the log lives.** One Durable Object per Plan holds that plan's Thread log (`events`) and its Session streams (`stream_events`) in its SQLite. D1 holds the account streams and their projections. Projections are inline only, in the same transaction or folded on read; there is no async projection and no rebuild recipe (`just replay` only prints). Never patch a projection by hand.
10. **Retries are repeats.** A repeat whose effect already holds returns `[]`. Ids for new things come from the caller in the command, not `ctx.newId()` in `decide`; today `OpenThread`, `Ask` and `StartSession` mint ids server-side, so a retry duplicates.
11. **One decision, one boundary.** A stream per aggregate, or, inside one PlanRoom only, the plan log filtered by `threadId`. A `WriteConflict` is any unique-key failure, not only a race. Both in `references/engine.md`.
12. **Facts, not people.** No new personal data in stream ids or event data (`account-<email>` is the one exception). No event id, causation, correlation or schema version exists yet: add them in one migration when needed, never as fields in `data`.
13. **Explain with the stream, not a paragraph.** Any explanation is a viz-explainer artifact built from a real snapshot or replay.

## Build sequence

1. **Name it** via `ddd-vocabulary`. Command imperative, events past tense, all in the domain vocabulary.
2. **Scaffold** with `just new command Name` (Thread context). You get the declaration with Effect Schema fields and a commented expect stub; you add it to the command or event union and write the `decide` case.
3. **Write the expect test first.** The starting stream is a list of events; the expectation is the events that come out, `[]`, or the rejection. Read it aloud. If it does not sound like something that happened, the model is wrong.
4. **Fill `decide`**, then `evolve` if state changed, then any projection and its projection story.
5. **Run `just test`.** Expect tests and stories in milliseconds.
6. **If the change touches a recorded event**, stop and pick a rung on the ladder. Write the upcaster's expect test with a real old event from prod as input.
7. **If the change is a modelling choice** (one event or two, where a field lives), do not decide in prose. Build a decision report with both streams side by side. The resolve-thread plan in `docs/plans` shows this case: one record or two when a comment is resolved.
8. **Hand over** the snapshot and, if asked why, the artifact.

## Explain mode

Load `viz-explainer`. Pick one:

- **Event-stream story** for "what happened": one step per event, caption is the event read as prose, focus is the event and the projection it changed. Source: an expect snapshot or `just replay <planId>`. Conversion recipe and the worked example in `references/stream-to-artifact.md` and `assets/example-replay-story.html`.
- **State explorer** for "how does X move": `stateDiagram-v2` with transitions labelled by commands and notes naming the events. The viz-explainer template ships with the Thread lifecycle as its default.
- **Decision report** for "which model": each option's stream side by side, the four axes, the invariant each risks.

No Markdown explainer files. `docs/decisions/` holds the artifacts and a one-line index.

## Reference

- `references/engine.md`: `packages/engine` (Effect): the event store, the `Sql` port and its adapters, projections in the same transaction, consistency boundaries, what an event does not carry, personal data, and the three test layers. Read it before adding a stream or a projection.
- `references/decider.md`: the real Thread decider, idempotency, the optional terminal check, the expect test and its snapshot, the PlanRoom append, what `just new` writes.
- `references/changing-events.md`: the five-rung ladder, with the real upcaster and what is not wired yet.
- `references/stream-to-artifact.md`: snapshot or replay output to viz-explainer spec.
