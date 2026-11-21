---
name: ddd-vocabulary
description: Keep one vocabulary across the person, the code and the agent. Use before introducing any new noun (type, table, event, command, route, UI label), when a user's phrase has no type behind it, when two words seem to mean the same thing, or when someone asks what a term means or how the domain fits together. Explains with an interactive vocabulary map built by viz-explainer, never with a Markdown write-up.
---

# ddd-vocabulary

Three speakers, one vocabulary. The person says "resolve this thread", the code says `ResolveThread`, and the agent, reading the repo, says the same thing back. The agent learns the domain from identifiers: if Order, Booking and Reservation all mean one thing, it will invent a fourth. This skill is how a new word enters the system, and how an existing one is explained.

## When this fires

- You are about to name something new: a type, table, column, event, command, route, component or UI label.
- A user's sentence contains a noun that has no type in the code. That is a design finding, not a naming chore.
- Two identifiers look like synonyms, or one identifier is used for two things.
- Someone asks "what is a Decision here?" or "how do Plan, Block and Thread relate?"
- A review (`just review`) checks a branch against the domain vocabulary.

## Rules

1. **Domain vocabulary before code.** A noun appears in `docs/DOMAIN-VOCABULARY.md` and in code before it appears anywhere else. `just new` refuses a name the file does not list.
2. **One concept, one word, everywhere.** The domain vocabulary entry lists the banned synonyms. Code, UI copy, events and the agent's replies all use the entry's word.
3. **Events and commands are domain vocabulary words in a tense.** Command: imperative, a verb from `## Verbs` (`ResolveThread`). Event: past tense, what happened (`ThreadResolved`). A command or event whose stem is not a domain vocabulary noun or verb is a defect.
4. **Bounded contexts say where a word stops.** The same word may mean different things in two contexts; then it gets two entries, each naming its context, and the context map says how the two relate. Never share a type across contexts to save typing.
5. **A phrase that does not map is a decision.** Do not pick a name quietly. Open a thread on the block (in Greenhouse) or a decision report (viz-explainer) with the candidate words as options, each tried against the sentences users actually say.
6. **Explain with a picture, not a page.** Any explanation of the vocabulary is a viz-explainer artifact: a vocabulary map for structure, a state explorer for one noun's lifecycle. No Markdown explainer files. The domain vocabulary itself stays a file because it is data.
7. **Agent is a Participant.** Nothing the agent does gets its own noun. If an agent action needs a new word, a person could issue the same command, and the word is theirs.
8. **Never unify two entries because they look alike.** Session and Thread both hold what Participants said and are separate on purpose: a Thread ends in a Decision on one Block, a Session holds Runs and decides nothing. Before merging two entries, find the sentence where they mean the same; when keeping them apart, write the reason in the context map.
9. **A replaced word stays banned.** When a word is replaced, the old one goes under the new entry's `Not:` with `(was: …)`, so the check catches leftovers.

## Build sequence

1. **Read `docs/DOMAIN-VOCABULARY.md`.** If the noun is there, use its word and stop.
2. **If it is not, search before you name, nearest first.** The person's own sentences, then the repo's prose (`docs/PRODUCT.md`, plan JSON in `docs/plans`, Thread and Reply text), then outside: web search and the DeepWiki MCP (`mcp__deepwiki`, ask it about `githubnext/chopin` and two shipped products in the same space). Users' words beat other products' words. Pick the word users say, not the word engineers say, and record the two runners-up under `Not:`.
3. **Draft the entry** in the format in `references/domain-vocabulary-format.md`: definition in the user's words, an `Example:` sentence, context, the type that carries it, the events and commands it appears in, synonyms it replaces, and one line `Seen in:` naming where the search found the word. A new context also gets a `Paths:` line and a context map line.
4. **Declare it in code** in the same change: commands and events in `packages/domain/src/<context>/decider.ts`, views and ids in `packages/schema`. Entry and code land together or not at all.
5. **If the noun touches more than one context**, or replaces an existing word, render the vocabulary map (`references/vocabulary-map.md`) so the change is visible before it is argued about.
6. **Run `just domain-vocabulary-check`** and fix what it names.
7. **Say the sentence.** Read the `Example:` aloud in the user's voice. If it sounds wrong in their mouth, the word is wrong.

## Explain mode

When asked to explain the domain or a term, do not write prose. Load `viz-explainer` and build:

- **Vocabulary map** (architecture-map kind): contexts as subgraphs, nouns as nodes, relationships as labelled edges, one step per noun with its definition as the caption and the domain vocabulary line as evidence. A step about a relationship captions as an actor–verb–work object sentence: "Pratos resolves the Thread on the retries Block". Starter spec in `references/vocabulary-map.md`; worked example in `assets/example-vocabulary-map.html`.
- **Lifecycle** (state-explorer kind) when the question is about one noun that has states.
- **Decision report** when the question is which word to use.

Hand over the file path and one line. The artifact is the explanation.

## Reference

- `references/domain-vocabulary-format.md`: the entry format, `Paths:`, the context map, and the Greenhouse starter domain vocabulary.
- `references/vocabulary-map.md`: how to turn the domain vocabulary into a viz-explainer spec, with the Greenhouse spec.
- `scripts/check-domain-vocabulary.sh` (`just domain-vocabulary-check`): over `packages/domain` and `packages/schema`, fails when a command or event in code has no entry, when a command's verb is not on the Verbs line, or when a `Not:` term (kept whole, scoped by its context's `Paths:`) names a command, event, schema field or export. Notes, without failing, entries no code declares yet and `Carried by` schemas that do not exist. Not checked yet: event stems against nouns, and `apps/` routes and UI copy.
