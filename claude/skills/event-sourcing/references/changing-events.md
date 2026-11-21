# Changing events people already recorded

The log is facts. An event-sourced product evolves by changing how events are read, not what was written. Climb from the bottom; stop at the first rung that works and write its expect test with a real old event as input.

| Rung | When | What changes |
|---|---|---|
| 0 Avoid | The stream is short-lived or the change is cosmetic | Nothing. A Thread lives days; wait for it to resolve |
| 1 Simple mapping | New optional field, new field with a default, renamed field with the old JSON name kept | Schema only |
| 2 Upcast on read | Meaning is the same, shape differs, and a default can be computed | One entry in `upcasters`, keyed on the event's shape, run between the read and `evolve` |
| 3 New event type | The meaning changed | A new fact with a new name; old projections keep working, new ones handle both |
| 4 Transform | Streams must be merged, split or cleaned | A one-off job that emits events, shipped in phases |

## Rung 1, simple mapping

```ts
// packages/domain/src/thread/decider.ts  (needs import { Schema } from 'effect')
export const DecisionRecorded = defineEvent('DecisionRecorded', {
  threadId: Id, blockId: Id, by: ParticipantId, decision: Text,
  rationale: Schema.optional(Text),      // new and optional: old events decode unchanged
});
```

## Rung 2, upcast on read

```ts
// packages/domain/src/upcast/index.ts
const upcasters: Record<string, Upcaster> = {
  DecisionRecorded: (e, stream) => {
    const d = e.data as Record<string, unknown>;
    if (typeof d.rationale === 'string') return e;     // already the new shape
    const lastReply = stream.toReversed().find((x) => x.type === 'ReplyPosted' && x.version < e.version && (x.data as { threadId: string }).threadId === d.threadId);
    return { ...e, data: { ...d, rationale: lastReply ? (lastReply.data as { body: string }).body : '' } } as StoredEvent;
  },
};
export function upcast(stream: readonly StoredEvent[]): StoredEvent[] {
  return stream.map((e) => (upcasters[e.type] ? upcasters[e.type]!(e, stream) : e));
}
```

- **Keyed on shape, not version.** Neither the PlanRoom's `events` table nor `stream_events` stores a schema version, so an upcaster asks "is the new field there?" (a weak schema). If two shapes cannot be told apart by their fields, that is rung 3.
- **Default from the stream, not from thin air.** An upcaster gets the whole stream and may read earlier events; it is pure and never writes.
- **Rung 2 needs rung 1.** The new field goes into the event's schema as `Schema.optional` first. `DecisionRecorded` has no `rationale` yet, so `upcast/index.ts` does not typecheck on its own (TS2353); `just lint` misses it because nothing in `apps/api` imports it.
- **Not wired yet.** `upcast` runs only in `upcast.expect.test.ts`. `PlanRoom.events()` and `EventStore.read` return rows as stored. Wiring it means calling `upcast` in both, before `route`, `project` and `handle` see the events.

The test's input is a verbatim v1 stream as prod recorded it; `__expect__/decision-recorded-v1-to-v2.snap.txt` shows the stream as recorded, then as the domain reads it.

## Rung 3, new event type

`ThreadResolved` used to mean "closed, maybe with a decision". It now means "closed with a decision", and "closed without one" is a different fact: `ThreadAbandoned`. Both stay in the log. `evolve` handles both. The domain vocabulary gets a new entry first (`ddd-vocabulary`).

## Rung 4, transform

Phase one: ship code that reads both old and new streams. Phase two: a job replays old streams into new ones; the metadata migration in `references/engine.md` lands first, so each copied event names its source as its causation instead of a field in `data`. Phase three, a release later: delete the old read path. Never in one release.

## What the agent gets wrong without this

Asked to "add a rationale to decisions", it will edit the schema in place and make the field required, which breaks every replay of every existing plan. Rule 7 and this ladder exist so the expect tests fail before the deploy does.
