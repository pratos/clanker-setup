---
name: codebase-map
description: Generate an interactive, inspectable HTML map of a codebase with architecture nodes, source evidence, runtime/data-flow edges, and animated payload particles. Use when the user asks to visualize, map, explain, explore, or discuss a repository's architecture or execution flow.
---

# Codebase Map

Turn a repository into one focused interactive HTML diagram that the user can inspect and use as shared context in later discussion.

## Principles

- Investigate before drawing. Every architectural claim must be grounded in files you inspected.
- Show the smallest useful model: normally 6–20 nodes and 1–3 important flows.
- Model responsibilities and runtime boundaries, not every directory or symbol.
- Make animation meaningful. A moving particle represents a concrete payload or state transition and exposes that data when selected.
- Distinguish observed facts from inference. Put uncertainty in the node or flow notes.
- Never send repository content to a remote service. The artifact is standalone and offline.

## Workflow

### 1. Establish scope

Infer or ask which question the map should answer, for example:

- How does a request travel through the system?
- Where is state owned and persisted?
- Which modules would a proposed change cross?
- How do processes, packages, or services communicate?

If no question is given, map the primary user-facing execution path and the major ownership boundaries.

### 2. Investigate the repository

Read repository instructions first. Then inspect targeted evidence:

1. manifests and package/workspace definitions
2. entrypoints and command/router registration
3. core domain/state modules
4. persistence and external integration boundaries
5. tests that reveal intended behavior

Prefer targeted search and call-site tracing over reading every file. Ignore generated output, vendored dependencies, caches, and lockfiles unless they answer the scope question.

Keep a small evidence table while investigating:

```text
claim | source path[:line] | confidence | notes
```

Use exact line numbers only when verified. Otherwise cite the file path without inventing a range.

### 3. Build the model

Read [references/model-schema.md](references/model-schema.md), then create a JSON model. Default location:

```text
.pi/visuals/codebase-map.json
```

Requirements:

- stable, short IDs using lowercase letters, digits, and hyphens
- unique nodes with verified source paths
- groups that reflect real ownership/runtime boundaries
- explicit directed flow steps
- concise `responsibility`, `implementation`, and `evidence` text
- concrete payload labels such as `ValidatedCommand`, `{ userId, query }`, or `domain event`
- canvas coordinates that avoid overlap and leave room for edge labels

Use `kind` consistently to communicate boundaries:

- `entry` — user/process entrypoint
- `process` — computation or orchestration
- `state` — in-memory state or queue
- `store` — durable persistence
- `external` — service or system outside the repository
- `output` — user-visible or emitted result

### 4. Render and validate

Resolve paths relative to this skill directory, then run:

```bash
node scripts/render.mjs \
  .pi/visuals/codebase-map.json \
  .pi/visuals/codebase-map.html
```

The renderer validates IDs and flow references before writing the standalone HTML file. Fix all validation errors rather than editing the generated HTML.

Open the result:

```bash
if command -v open >/dev/null 2>&1; then
  open .pi/visuals/codebase-map.html
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open .pi/visuals/codebase-map.html
fi
```

Inspect the artifact yourself before presenting it. Check that:

- nodes do not overlap
- labels fit at the initial zoom
- important edges are understandable
- clicking nodes and flows populates the inspector
- animated particles follow the correct direction
- payload details are useful rather than decorative
- source paths and claims match the code
- the map remains usable at a narrow viewport

### 5. Present it briefly

Tell the user:

- the artifact path
- the question the map answers
- the primary flow shown
- any important uncertainty or omitted subsystem

Do not narrate every node. Let the artifact carry the detail.

## Updating an existing map

When the user asks a follow-up or the code changes:

1. reuse the existing JSON model
2. re-check only the affected evidence
3. update nodes and flow steps
4. rerun `scripts/render.mjs`
5. summarize what changed

Keep the JSON model beside the HTML so the diagram remains cheap to revise.

## Safety and quality boundaries

- Do not include secrets, tokens, personal data, full production payloads, or sensitive configuration values.
- Summarize payload shapes and redact examples.
- Do not embed repository files wholesale.
- Do not use CDNs, analytics, remote fonts, or network requests.
- Do not claim dynamic runtime behavior solely from naming; trace the implementation or mark it inferred.
- Prefer a clear partial map over a comprehensive but speculative one.
