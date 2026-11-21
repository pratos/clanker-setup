---
description: Create an implementation plan as a formatted HTML page with diagrams, decision reports and live UI components
---

Create an implementation plan for:

> $@

Load the `create-plan` skill and follow it exactly. Use `clarify` for every question, with real options.

What changed from the HumanLayer original:

- **The plan is JSON rendered to one HTML page**: `docs/plans/YYYY-MM-DD-slug.plan.json` (or `thoughts/shared/plans/`), built with the skill's `scripts/build.mjs` or `just plan <file>`.
- **Show, do not describe**: viz-explainer diagrams for flow and state, a decision report for every choice, live components and a design-language block for UI.
- **Contracts, not implementations**: a change is a file and one sentence; code only as a contract, at most 15 lines. The builder refuses more.
- **Research first**: read what was given fully, then `rg`, `fd` and `read` the code before asking anything.
