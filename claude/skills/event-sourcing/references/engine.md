# The engine: `packages/engine`

Every write in Greenhouse goes through one small engine on Effect. Read this before adding a stream, a projection, or a test of a workflow.

## The pieces

| Piece | File | What it is |
|---|---|---|
| Decider kernel | `src/kernel.ts` | `defineCommand`, `defineEvent` (Effect Schema at the boundary), `Decider { initial, evolve, decide }`, `handle`, `replay`, and `expectDecider` for one-command expect tests |
| `Sql` | `src/sql.ts` | One Effect service: `query(sql, params)` and `atomically(statements)`. Statements use `?` placeholders in the SQL SQLite and Postgres share. Any unique-key violation becomes a typed `WriteConflict` |
| Adapters | `src/adapters/*.ts` | `bunSqlite(db)` (tests, scripts; synchronous), `durableObject(storage)` (a plan room's own SQLite; synchronous, single writer), `d1(db)` (atomic through `batch`), `postgres(client)` (PGlite, `pg`, postgres.js) |
| `EventStore` | `src/store.ts` | `read(stream)`, `append(stream, expectedVersion, events, meta)`, `execute(decider, stream, command, ctx, by)` (read, decide, append, retry a conflict twice), `setup()`. One `stream_events` table holds every stream |
| Projections | given to `EventStore.layer([...])` | `{ name, tables, on(event) => Statement[] }`: SQL only, no reads, written in the same transaction as the event, so a read model is never behind its log |
| Story harness | `src/story.ts` | `story(layer, dir)`: a workflow test as a story, with `step(said, effect)`, `read(label, sql)`, `note(text)`, `snapshot(name)` |

## Rules

1. **One stream per aggregate instance**, named `<kind>-<id>`: `account-<email>`, `session-<id>`. A uniqueness rule (one account per email) is the stream key, so a race meets at the version.
2. **A projection is statements, never a read.** Upserts, updates and deletes derived from the event alone. If a projection needs state, the event is missing a field.
3. **A projection's unique keys hold by construction.** `conflictOr` turns *any* UNIQUE or primary-key failure into `WriteConflict`, a projection's included, and `execute` retries it as a race. A key an event can legitimately break looks like a busy stream and dies on the third try: two sign-ups racing with one local part (`sam@a.test`, `sam@b.test`) both want `accounts.account_id`, the retry decides the same thing again, and `Accounts.register` turns the third conflict into a defect. Key a projection on what its stream key already makes unique, or check before deciding.
4. **D1 tables come from migrations**, not `setup()`. `apps/api/test/migrations.test.ts` checks the migration holds the same DDL as `EVENTS_TABLE` and the projection's `tables`, so they cannot drift.
5. **Hashing, tokens, the clock and ids come from outside `decide`.** The service hashes the password and passes `passwordMatched` and `tokenHash` in the command; `ctx` gives `now()` and `newId()`; tests fix both. An id for a new thing belongs in the command, from the caller (`references/decider.md`, Idempotency).
6. **Pick the adapter by where the stream lives**: a plan's sessions in its Durable Object (`durableObject`), accounts in D1 (`d1`), tests in memory (`bunSqlite(new Database(':memory:'))`), Postgres through Hyperdrive when it is chosen (`postgres`).

## Consistency boundaries

One decision reads and appends inside one boundary; another aggregate changes later, by its own command. Two shapes are in use:

- **A stream per aggregate** (`account-<email>`, `session-<id>`) in `stream_events`. The version check on `(stream, version)` makes it safe anywhere, D1 and Postgres included.
- **The plan log filtered by `threadId`** (`route` in `packages/domain/src/index.ts`). A Thread is a query over one table with no stream column and no version check; `dispatch` appends at the log's head. That is a tag query in the DCB sense, and it is safe only because a PlanRoom is one Durable Object with one writer and no `await` between read and write.

Filter-by-tag stays inside a Durable Object. Anywhere with concurrent writers, give the aggregate a stream key, or add an append condition (fail if an event matching the same query landed after the read) first. A new stream is right when a rule must hold across its events and nowhere else.

## Projections are inline, and nothing rebuilds them

- Engine projections run in the same `atomically` as their events. The Thread view is `project(events)`, a fold on every read. There are no async projections, no subscriptions, no outbox.
- `just replay <planId>` prints a plan's events through the API; it rebuilds nothing. The D1 `decisions` table (migration 0001) is declared and nothing writes it.
- A rebuild is: drop the projection's tables, `setup()`, `read` every stream, apply `on` per stream in one `atomically`, with writes stopped. Write it as a `just` recipe, with a story, before anything depends on it.

## What a recorded event does not carry

`stream_events` holds `stream, version, type, data, issued_by, recorded_at`; the PlanRoom's `events` holds `version, type, at, by, data`. Neither has an event id, a causation id (the command that caused it), a correlation id (the Session or Run it belongs to), a global position or a schema version. When the agent loop needs "why did this happen", add them as columns in one migration. Until then, do not fake them as fields in `data`.

## Personal data

`account-<email>` puts an email in a stream id, and `AccountOpened` carries the email and the name: the existing exception. Add no new personal data to stream ids or event data. Keep it in a row keyed by `accountId` that can be deleted, and let events carry the id. Encrypting per subject and deleting the key is the option for the day `account-` needs erasing.

## Three test layers

- **One command** (`expectDecider`): given events, when a command, then events or a rejection. One per decider rule and per rejection. Snapshots in `__expect__/` next to the decider. Thread has them (`packages/domain/src/thread/`); Session and Account rules have only stories so far, so a changed Session or Account rule gets its one-command test then.
- **A workflow** (`story`): several steps through the real engine and real SQL, each printing what was asked and exactly the events it appended (found by diffing the log), then read models as rows. For sign-up and sign-in, sessions with several people and the agent, and the agent loop itself. Secrets print as `•••`; the clock and ids are fixed.
- **A projection** (`story` with `append`): given events appended straight to a stream, then `read` the rows, on the real adapter. One per projection, so a view is tested without the decider that feeds it.

```text
when   Sam signs up as sam@greenhouse.test
then   AccountOpened      sam by sam email="sam@greenhouse.test" name="Sam" admin=false passwordHash=•••
when   someone signs up again with SAM@greenhouse.test
then   rejected           an account with this email exists
read   accounts           sam  sam@greenhouse.test  Sam  0
```

Real examples: `packages/domain/src/account/__expect__/`, `packages/domain/src/session/__expect__/`, `packages/agent/test/__expect__/`. `UPDATE_SNAPSHOTS=1 just test` accepts a changed story after you have read it.

## Tests of the engine itself

`packages/engine/test/store.test.ts` runs the same three tests on SQLite and Postgres (PGlite): execute decides and projects in one write; a stale append is a `WriteConflict` and changes nothing; an event whose projection fails is not recorded.
