---
description: Create an implementation plan as a formatted HTML page with diagrams, decision reports and live UI components
model: opus
---

# Create Plan

Load the `create-plan` skill and follow it exactly. It holds the process, the rules and the plan schema; this command only starts it.

What changed from the HumanLayer original, so you do not fall back to it:

- **The plan is JSON rendered to one HTML page**, not Markdown: `docs/plans/YYYY-MM-DD-slug.plan.json` (or `thoughts/shared/plans/` in repos that use thoughts), built with the skill's `scripts/build.mjs` (or `just plan <file>` where the repo has the recipe).
- **Show, do not describe.** Flow and state get a viz-explainer diagram, every design choice gets a decision report the person clicks, and UI gets live components with their real states plus a design-language block. Load `viz-explainer`, `impeccable` and `animate` as the skill says.
- **Contracts, not implementations.** Each change is a file and one sentence of what must be true. Code appears only as a contract other code depends on, at most 15 lines. The builder refuses more.
- **Questions go through `AskUserQuestion`** with real options, never a paragraph of prose questions.
- **Research first, in parallel**: `codebase-locator`, `codebase-analyzer`, `codebase-pattern-finder`, and `web-search-researcher` or the DeepWiki MCP for libraries, in one message. Read the files they name before asking anything.

If the user gave a ticket, file or description, start with it now. If not, ask for one in a single sentence.
