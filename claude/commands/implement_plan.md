---
description: Implement technical plans from thoughts/_shared/plans or docs/plans with verification
---

Implement the following plan:

> $@

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
