---
description: Implement technical plans from thoughts/_shared/plans or docs/plans with verification
---

Implement the following plan:

> $@

## Plan format

Plans made by the `create-plan` skill are two files: `docs/plans/YYYY-MM-DD-slug.plan.json`, the source, and the `.plan.html` page built from it. Work on the JSON, never on the HTML:

- A check is done when its `"done"` is `true`. Set it by editing the JSON, then rebuild with `just plan <file>`, or `bun <create-plan skill>/scripts/build.mjs <file>` where the repo has no recipe. A hook may already rebuild on edit.
- `phases[]` each have `changes` (a file and one sentence, sometimes a short contract), `components` for UI, and `verify.automated` / `verify.manual`.
- `status` moves draft, final, implementing, done. Set `implementing` when work starts and `done` only when every check is done.
- Tick a manual check only after the person confirms it.
- A new or changed design choice gets a decision report in `decisions`, as the create-plan skill describes.
- Older Markdown plans with `- [ ]` checkboxes still work the old way.

## How to proceed

1. **If a plan path was provided above**, read it completely. Check for existing checkmarks (`- [x]`) to find where to resume. Also read all files mentioned in the plan.
   **If no plan was provided**, list plans from `thoughts/_shared/plans/` and `docs/plans/`, then use `clarify` to let the user select one.

2. **Implement each phase fully before moving to the next**:
   - Follow the plan's intent while adapting to what you find in the codebase
   - Update checkboxes in the plan file as you complete sections
   - If something doesn't match the plan, STOP and explain the mismatch clearly

3. **After each phase, run automated verification**:
   - Usually `just lint` and `just rebuild`
   - Run any phase-specific success criteria commands
   - Fix issues before proceeding

4. **Pause for manual verification** — present automated results as text, then use `clarify` to ask:
   - "All manual tests pass — proceed to next phase"
   - "Found issues — let me describe them"
   - "Skip manual testing — proceed anyway"

   (If instructed to do multiple phases consecutively, skip pauses until the last phase.)

## When things don't match the plan

```
Issue in Phase [N]:
Expected: [what the plan says]
Found: [actual situation]
Why this matters: [explanation]
```

Then use `clarify` to ask how to proceed.

## Guidelines

- **Read files fully** — never use limit/offset
- Use `clarify` for ALL questions (which plan, mismatches, manual verification)
- You're implementing a solution, not just checking boxes — keep the end goal in mind
- If resuming, trust existing checkmarks unless something seems off
