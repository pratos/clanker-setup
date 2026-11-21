# From a stream to an artifact

Input is either an expect snapshot or `just replay <planId>` output, both of which are one event per line. Output is a viz-explainer spec of the event-stream kind.

Recipe:

1. Events become nodes `e1..eN` in a `flowchart LR`, label is the event type. Chain them with `-->`.
2. Each projection an event touches becomes a cylinder node, linked with a dotted edge `-.->`.
3. One step per event. `focus` is the event node and the projection it touched. `edges` is the chain edge into it (`L_e<n-1>_e<n>_0`) and the dotted edge to the projection.
4. Caption is the event read as prose, under twenty words: who, what, on which block.
5. Evidence is the snapshot line or the replay line, so the reader can match picture to log.
6. More than eight events: collapse runs of the same type ("3 × ReplyPosted") or split by thread.

Build: `just artifact spec.json docs/decisions/<plan>-story.html`. There is no `just explain` recipe yet.

The worked example, built from the GH-12 replay, is `assets/example-replay-story.html`; its `#spec` block is the template to copy.
