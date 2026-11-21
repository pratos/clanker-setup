---
name: viz-explainer
description: Explain architecture, state machines, event streams, sequences, decisions between options, and what an agent did, as a small interactive HTML artifact rendered with Pele (Mermaid to SVG) and stepped with anime.js. Use whenever an explanation would be a diagram, a wall of Markdown describing a system or a choice, or a prose question with options the reader has to picture. Output is a self-contained HTML file that Greenhouse embeds as an Artifact block and that the talk shows as a slide.
---

# viz-explainer

The agent writes about 4,500 words a minute. The person reads about 240. An explanation that arrives as prose makes the person pay the cost of being understood. This skill moves that cost to the agent: it builds the picture, and the person looks, clicks and decides.

Three sources set the bar. Maggie Appleton's "Planning with Agents": the plan is a boundary object, something that serves the human's way of seeing as much as the agent's. Chopin: decisions have an owner and a date and stay attached to the thing they changed. show-me: pick the smallest view that makes the one point clear.

## When this fires

- Someone asks how a system, flow, lifecycle or module boundary works.
- You are about to write more than one paragraph describing structure, order or state.
- You are about to ask a question in prose whose answers are options the reader has to picture.
- A plan, PR or review needs "what did the agent touch, and why" attached to it.
- A `just explain`, `just trace` or `just plan` recipe asks for an artifact.
- A plan is being written: `create-plan` embeds diagrams and decision reports built by this skill, so write their specs into the plan JSON rather than separate files.
- The project's architecture document changed: rebuild the one architecture map with `just arch` (a hook usually does this already).

Do not fire for a single fact, a code snippet, or anything a one-line sentence already says. A diagram with two boxes is prose wearing a costume.

## Rules

1. **Never ask in prose what could be a rendered choice.** If the reader must pick, build a decision report and put the options in it as buttons.
2. **Never present an option that has not been tried.** An option in a decision report links to the exploration, snapshot or branch that tried it. Untried options render disabled with the reason.
3. **Every decision carries who and when.** The artifact records the choice and posts it to the host (see `references/protocol.md`). It never pretends a choice was made.
4. **One artifact, one question.** The title is the question. If you need two titles, build two artifacts.
5. **Under a minute to read.** Eight steps at most, captions under twenty words, one diagram on screen at a time.
6. **Motion only for state change.** Steps, focus, edge drawing and the camera animate because they show order and place. Nothing decorative. Load the `animate` skill for curve and duration decisions; do not invent values here.
7. **Readable at the size it ships.** The page owns the SVG's viewBox. A diagram that fits the stage at natural size is shown whole, no camera. A wider one gets a camera that frames what the step highlights, never zooming past 1.1:1 and never framing past the map's edge. It pulls out to include an edge's far end only when that costs little zoom; otherwise the edge leaves the frame pointing where it goes. `f` fits the whole map, `r` returns to step 1, Shift+F or the full screen button takes the whole artifact full screen. If a step's highlight still reads small, it highlights too much; split it.
8. **Craft is someone else's skill.** Layout, type and the "AI-generated look" belong to `impeccable`. Load it for anything the reader will see more than once (product artifacts, talk slides). Do not duplicate its guidance.
9. **Captions are sentences someone would say aloud.** Subject, verb, under twenty words. No colon fragments ("First fact: resolved"), no telegraphic labels ("Same command."). Before building, collect every caption, summary and option label into one text file and run the `slop-guard` skill on it; fix what it names and fix any fragment it does not catch.
10. **Architecture maps are plain language and singular.** One map per project, built from the architecture document, never one per checkpoint. Parts a person names, steps a person works through, no code; folders live in the document's "Where it lives" table. See `references/patterns.md`.
11. **Plans orient, they do not bind.** An artifact that meets a reality it did not predict says so in a step, instead of hiding it.

## Build sequence

1. **Name the question** in one sentence. That is the `<title>` and the header.
2. **Pick the kind** from `references/patterns.md`: architecture map, state explorer, event-stream story, decision report, trace view. One kind per artifact. An architecture map is not hand-built: edit the architecture document and run `just arch`.
3. **Write the Mermaid** for it. Keep node ids short and stable; they become `data-id` hooks. Validate with Pele before you build the page: `bun -e "import('pele').then(p=>p.render(src))"` or the check in `references/pele.md`.
4. **Write the steps**: `{ id, caption, focus: [nodeIds], edges: [edgeIds] }`. Each step changes exactly one thing the reader should notice.
5. **If a decision is needed**, write the options with `tried` evidence and the invariant each risks.
6. **Build it**: write the spec as JSON and run `bun skills/viz-explainer/scripts/build.mjs spec.json out.html`. It validates the Mermaid and every step id against Pele's real output, warns on too many steps or long captions, and fills `assets/template.html`. Do not restructure the template; it already handles theme, keyboard, reduced motion and the host protocol.
7. **Open it** and step through it yourself once. If a step needs the caption to make sense, the diagram is wrong, not the caption.
8. **Hand it over with one line**: the file path, the question it answers, and what the reader is being asked to do. Then stop. The artifact is the explanation.

## Output

A single `.html` file, no build step, Pele and anime.js pinned from CDNs (`pele@1.12.0`, `animejs@4.5.0`). Save next to the thing it explains: `docs/decisions/<ticket>-<slug>.html` for decisions, `docs/architecture/<slug>.html` for maps, or the path the `just` recipe passes. Greenhouse attaches the same file as an Artifact block via `AttachArtifact`.

## Reference

- `references/patterns.md`: the five kinds, their Mermaid starters, interaction, and which Appleton pattern each replaces.
- `references/pele.md`: Pele API, CSS classes and `data-id` hooks, theming variables, validation.
- `references/anime.md`: the only anime.js recipes this skill uses, and the reduced-motion guard.
- `references/protocol.md`: the host protocol so Greenhouse can record the decision as an event.
- `scripts/build.mjs`: spec in, validated artifact out. Other skills (ddd-vocabulary, event-sourcing) call this.
- `assets/template.html`: the shell. Change nothing unless the kind requires it.
- `assets/example-decision-report.html`: "Where should the agent's work run?", a decision report with its own comparison rows (`spec.axes`); the `spec` block inside is the reference for the JSON shape.
