# Domain vocabulary format

`docs/DOMAIN-VOCABULARY.md` is data, so its shape is fixed. One entry per noun or verb, alphabetical within a context. The check script parses the `## Context:` headings, the `Paths:`, `Not:` and `Carried by:` lines, and the `## Verbs` line.

```md
# Domain vocabulary

## Context: Planning
Paths: packages/domain/src/thread, packages/schema

### Decision
How a Thread ended: who decided, when, what was chosen, and the Block it changed.
Example: "The Decision on the retries Block says wrapper, by Pratos, on 28 October."
Carried by: `Decision` schema · Events: `DecisionRecorded` · Commands: `ResolveThread`
Not: outcome, resolution, verdict, choice

### Thread
A comment thread anchored to exactly one Block. Opens, collects Replies, ends in a Decision.
Example: "Open a Thread on the retries Block: client or wrapper?"
Carried by: `Thread` schema · Events: `ThreadOpened`, `ThreadResolved` · Commands: `OpenThread`, `ResolveThread`
Not: discussion, comment chain, conversation

## Context map

- Planning ↔ Agent work: partnership. One PlanRoom, no shared types: a Thread ends in a Decision, a Session decides nothing.

## Verbs

Open, Reply, Resolve. Imperative in a command, past tense in an event. No other verbs name a command.
```

Rules for an entry:

- The definition is one or two sentences a user would nod at. No implementation words.
- `Example:` is one sentence a person in the product would say, with the word in it, in the product's own nouns (a plan, a block, a retry policy), never `foo`.
- `Carried by` names the schema. `Events` and `Commands` list every stem that uses the word; the check script cross-references these.
- `Not:` lists the synonyms this word replaces, comma-separated. A term is kept whole: `comment chain` bans `commentChain`, `CommentChain` and `comment_chain`, not `chain`. A replaced word stays with a note: after the rename, the agent's Thread entry reads `Not: chat, session (was: this entry's word until the rename)`; the check ignores the parenthesis.
- A word with two meanings gets two entries under two contexts. Never one entry with "or".

Rules for a context:

- `Paths:` under the heading lists the path prefixes where its `Not:` words are banned. A context without `Paths:` is global: Working together has none, because Participant is in every context.
- `packages/schema` is the published language every context reads. List it under a context only if that context's `Not:` words hold for the whole file.
- The `## Context map` has one line per relationship: upstream → downstream, the pattern (open host, published language, shared kernel, partnership, customer/supplier, conformist, anticorruption layer, separate ways), what crosses, and why the two stay separate.

## Greenhouse starter domain vocabulary

The seven nouns the Planning context started from. `docs/DOMAIN-VOCABULARY.md` is the current model.

| Word | Definition | Events | Commands |
|---|---|---|---|
| Plan | A document tied to a repo; one stream of events | `PlanForked` | `ForkPlan` |
| Block | A unit of the plan: prose, artifact or research | `BlockEdited`, `ArtifactAttached` | `EditBlock`, `AttachArtifact` |
| Thread | A comment thread anchored to one Block | `ThreadOpened`, `ReplyPosted`, `ThreadResolved` | `OpenThread`, `Reply`, `ResolveThread` |
| Decision | How a Thread ended: who, when, what, which Block | `DecisionRecorded` | (recorded by `ResolveThread`) |
| Exploration | An agent thread implementing one option, reporting back | `ExplorationStarted`, `ExplorationReported` | `RequestExploration` |
| Artifact | An agent-built interactive thing embedded in a Block | `ArtifactAttached` | `AttachArtifact` |
| Participant | A person or an agent; same commands, same rights | | |

Banned synonyms, so the agent never reaches for them: discussion, comment chain, resolution, verdict, outcome, task, note, page, section, widget, bot, assistant, user (say Participant or person).
