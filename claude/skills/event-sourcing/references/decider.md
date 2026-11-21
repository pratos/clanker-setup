# The decider shape

Small on purpose. Three pure functions per aggregate, one append path, one test format. The kernel is `packages/engine/src/kernel.ts`; domain code imports it through `packages/domain/src/kernel.ts`. Fields are Effect Schema values; the shared ones (`Id`, `ParticipantId`, `Text`, `Email`, `Secret`) live in `packages/schema/src/index.ts`.

```ts
// packages/domain/src/thread/decider.ts
import { Id, ParticipantId, Text } from '@greenhouse/schema';
import { defineCommand, defineEvent, reject, type Decider, type Message } from '../kernel';

export const OpenThread    = defineCommand('OpenThread',    { blockId: Id, by: ParticipantId, body: Text });
export const Reply         = defineCommand('Reply',         { threadId: Id, by: ParticipantId, body: Text });
export const ResolveThread = defineCommand('ResolveThread', { threadId: Id, by: ParticipantId, decision: Text });

export const ThreadOpened     = defineEvent('ThreadOpened',     { threadId: Id, blockId: Id, by: ParticipantId, body: Text });
export const ReplyPosted      = defineEvent('ReplyPosted',      { threadId: Id, by: ParticipantId, body: Text });
export const ThreadResolved   = defineEvent('ThreadResolved',   { threadId: Id, by: ParticipantId });
export const DecisionRecorded = defineEvent('DecisionRecorded', { threadId: Id, blockId: Id, by: ParticipantId, decision: Text });

export type ThreadCommand = ReturnType<typeof OpenThread> | ReturnType<typeof Reply> | ReturnType<typeof ResolveThread>;
export type ThreadEvent = ReturnType<typeof ThreadOpened> | ReturnType<typeof ReplyPosted> | ReturnType<typeof ThreadResolved> | ReturnType<typeof DecisionRecorded>;

// The invariants as a type: none, open on exactly one block, or resolved.
export type ThreadState = { kind: 'none' } | { kind: 'open'; blockId: string } | { kind: 'resolved' };

export const thread: Decider<ThreadState, ThreadCommand, ThreadEvent> = {
  initial: { kind: 'none' },
  evolve(state, event) {
    switch (event.type) {
      case 'ThreadOpened':   return { kind: 'open', blockId: event.data.blockId };
      case 'ThreadResolved': return { kind: 'resolved' };
      default:               return state;
    }
  },
  decide(state, command, ctx) {
    switch (command.type) {
      case 'OpenThread':
        if (state.kind !== 'none') return reject('thread already exists');
        return [ThreadOpened({ ...command.data, threadId: ctx.newId() })];
      case 'Reply':
        if (state.kind !== 'open') return reject('thread is not open');
        return [ReplyPosted(command.data)];
      case 'ResolveThread':
        if (!ctx.flag('resolve-thread')) return reject('resolve-thread is not enabled for this participant');
        if (state.kind !== 'open') return reject('thread is not open');
        return [
          ThreadResolved({ threadId: command.data.threadId, by: command.data.by }),
          DecisionRecorded({ threadId: command.data.threadId, blockId: state.blockId, by: command.data.by, decision: command.data.decision }),
        ];
    }
  },
};
```

- `defineCommand(type, fields)` returns a constructor that decodes with `Schema.Struct(fields)` and gives `{ type, data }`. Rules read `command.data`; `evolve` reads `event.data`. An optional field is `Schema.optional(Text)`, never `.optional()` and never Zod.
- `decide` returns events, `[]` or `reject(reason)`. It is the only function with an `if`. `evolve` never throws.
- `ctx` is `{ newId(), now(), flag(name) }`; `testCtx()` fixes all three (`id1`, `2026-10-28T19:30:00Z`, every flag on).

## Idempotency

- A repeat whose effect already holds returns `[]`: `SignOut` twice (`packages/domain/src/account/decider.ts`). The story prints `then nothing recorded`. Reject only when the person must hear it: resolving twice is `thread is not open`.
- An id for a new thing comes from the caller, in the command, and survives a retry. `ctx.newId()` in `decide` gives each retry a new id. Today `OpenThread` (threadId) and `Ask` (runId) mint in `decide`, and `PlanRoom.sessionCommand` mints `sessionId` for `StartSession`, so a retried request opens a second Thread, Run or Session. A new command takes its id in `data`; a client-chosen id is what makes the retry a repeat.

## Terminal state (optional)

A state that ends (a resolved Thread, an ended Session) can be exported as `isTerminal(state)` next to the decider, checked first in `decide` with one rejection, and it defines a stream that is finished and may be archived. The kernel's `Decider` has no such field yet; `session` inlines it as `if (state.kind === 'ended') return reject('the session has ended')`.

## One-command expect test

`packages/domain/src/thread/thread.expect.test.ts`, snapshots in `packages/domain/src/thread/__expect__/<name>.snap.txt`. The harness folds the given events through `evolve`, runs the command through `decide`, and writes the result as text. The snapshot is what a reviewer reads; a missing file is written, a different one fails, `UPDATE_SNAPSHOTS=1 just test` accepts it.

```ts
const expect = expectDecider(thread, import.meta.dir);
const opened = ThreadOpened({ threadId: 't7', blockId: 'b3', by: 'pratos', body: 'retries in the client or the wrapper?' });
const replied = ReplyPosted({ threadId: 't7', by: 'agent', body: 'wrapper: one place to change' });

test('resolve records two facts', () => {
  expect.given(opened, replied).when(ResolveThread({ threadId: 't7', by: 'pratos', decision: 'wrapper' })).snapshot('resolve');
});
test('resolve behind a flag that is off', () => {
  expect.given(opened).when(ResolveThread({ threadId: 't7', by: 'guest', decision: 'wrapper' }), testCtx({ flag: () => false })).snapshot('resolve-flag-off');
});
```

`__expect__/resolve.snap.txt`:

```
given  ThreadOpened       t7 on b3 by pratos "retries in the client or the wrapper?"
       ReplyPosted        t7 by agent "wrapper: one place to change"
when   ResolveThread      t7 by pratos decision "wrapper"
then   ThreadResolved     t7 by pratos
       DecisionRecorded   t7 on b3 by pratos decision "wrapper"
```

The rejection is a test too, `__expect__/resolve-twice.snap.txt`:

```
given  ThreadOpened       t7 on b3 by pratos "retries in the client or the wrapper?"
       ThreadResolved     t7 by pratos
when   ResolveThread      t7 by agent decision "client"
then   rejected           thread is not open
```

If a snapshot is not something you could show the user and get a nod, it is the wrong test. Workflow stories and projection stories are in `references/engine.md`.

## The append, in the Durable Object

Two logs live in one PlanRoom's SQLite (`apps/api/src/plan-room.ts`):

- Thread commands go through `dispatch`: `route` (`packages/domain/src/index.ts`) filters the plan's `events` table to the command's `threadId`, decides, and `dispatch` inserts each event with the next `version`, synchronously, then broadcasts.

```ts
// apps/api/src/plan-room.ts (excerpt)
dispatch(command: Command & { by: string }, enabledFlags: string[]): { events: StoredEvent[] } | Rejection {
  const history = this.events();
  const result = route(history, command, ctx);        // ctx: newId, now, and flag() from enabledFlags
  if ('rejected' in result) return result;
  let v = this.version();
  for (const e of result as DomainEvent[]) {          // synchronous: no await between writes, so all land or none
    const row = { version: ++v, type: e.type, at, by: command.by, data: e.data };
    this.ctx.storage.sql.exec('INSERT INTO events (version, type, at, by, data) VALUES (?,?,?,?,?)', row.version, row.type, row.at, row.by, JSON.stringify(row.data));
    stored.push(row as StoredEvent);
  }
  this.broadcast(stored);                             // WebSocket fan-out to open tabs
  return { events: stored };
}
```

- Session commands go through `sessionCommand`: `EventStore.execute(session, sessionStream(id), …)` on the `durableObject` adapter, into `stream_events`, with `sessionsView` in the same transaction.

The plan view is `project(events)`, a fold run on every read. Nothing writes the D1 `decisions` table yet.

## What `just new command|event Name` produces

`scripts/new.sh` refuses a name that is not backticked in `docs/DOMAIN-VOCABULARY.md`, then, in the Thread context only:

- appends `export const Name = defineCommand('Name', { threadId: Id, by: ParticipantId })` (or `defineEvent`) to `packages/domain/src/thread/decider.ts`;
- for a command, appends a `test('Name: TODO')` to `thread.expect.test.ts` with a commented `given/when/snapshot('name')` and a rejection stub.

You add it to `ThreadCommand` or `ThreadEvent`, write the `decide` case or the `evolve` case, and fill the stub. Another context, or a projection, starts from that context's decider and test by hand.
