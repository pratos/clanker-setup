---
description: Iterate on existing implementation plans with thorough research and updates
---

Update an existing implementation plan based on this request:

> $@

## How to proceed

1. **Parse the request above** to identify:
   - Plan file path (e.g., `thoughts/_shared/plans/2026-03-23-feature.md` or `docs/plans/2026-03-22_feature.md`)
   - Requested changes/feedback

2. **If no plan file was identified**, list plans from `thoughts/_shared/plans/` and `docs/plans/`, then use `clarify` to let the user select one.
   **If plan file found but no feedback**, use `clarify` to ask what changes they want (add phase, update criteria, adjust scope, split phase, other).
   **If both plan and feedback are clear**, proceed directly.

3. **Read the existing plan completely** — understand structure, phases, scope, and success criteria.

4. **Research if needed** — only if changes require new technical understanding. Use `grep`, `find`, `read` to investigate relevant code.

5. **Present your understanding** as text with what you plan to change, then use `clarify` to confirm before making edits.

6. **Make focused, precise edits** to the plan using the edit tool:
   - Maintain existing structure unless explicitly changing it
   - Keep file:line references accurate
   - Maintain automated vs manual success criteria separation
   - Use `just` commands for automated verification
   - Update "What We're NOT Doing" if scope changes

7. **Present changes made** and ask if further adjustments are needed.

## Guidelines

- Be surgical — precise edits, not wholesale rewrites
- Be skeptical — question changes that seem problematic
- No open questions — resolve everything before updating the plan
- Use `clarify` for ALL questions (not plain text)
- Read files fully (no limit/offset)
