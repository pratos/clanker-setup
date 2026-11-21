---
description: Implement technical plans from thoughts/_shared/plans with verification
---

# Implement Plan

## Plan format

Plans made by the `create-plan` skill are two files: `docs/plans/YYYY-MM-DD-slug.plan.json`, the source, and the `.plan.html` page built from it. Work on the JSON, never on the HTML:

- A check is done when its `"done"` is `true`. Set it by editing the JSON, then rebuild with `just plan <file>`, or `bun <create-plan skill>/scripts/build.mjs <file>` where the repo has no recipe. A hook may already rebuild on edit.
- `phases[]` each have `changes` (a file and one sentence, sometimes a short contract), `components` for UI, and `verify.automated` / `verify.manual`.
- `status` moves draft, final, implementing, done. Set `implementing` when work starts and `done` only when every check is done.
- Tick a manual check only after the person confirms it.
- A new or changed design choice gets a decision report in `decisions`, as the create-plan skill describes.
- Older Markdown plans with `- [ ]` checkboxes still work the old way.

You are tasked with implementing an approved technical plan from `thoughts/_shared/plans/`. These plans contain phases with specific changes and success criteria.

## Getting Started

When given a plan path:
- Read the plan completely and check for any existing checkmarks (- [x])
- Read the original ticket and all files mentioned in the plan
- **Read files fully** - never use limit/offset parameters, you need complete context
- Think deeply about how the pieces fit together
- Create a todo list to track your progress
- Start implementing if you understand what needs to be done

If no plan path provided, ask for one.

## Implementation Philosophy

Plans are carefully designed, but reality can be messy. Your job is to:
- Follow the plan's intent while adapting to what you find
- Implement each phase fully before moving to the next
- Verify your work makes sense in the broader codebase context
- Update checkboxes in the plan as you complete sections

When things don't match the plan exactly, think about why and communicate clearly. The plan is your guide, but your judgment matters too.

If you encounter a mismatch:
- STOP and think deeply about why the plan can't be followed
- Present the issue clearly:
  ```
  Issue in Phase [N]:
  Expected: [what the plan says]
  Found: [actual situation]
  Why this matters: [explanation]

  How should I proceed?
  ```

## Verification Approach

After implementing a phase:
- Run the success criteria checks (usually `just lint` and `just rebuild` cover the basics)
- Fix any issues before proceeding
- Update your progress in both the plan and your todos
- Check off completed items in the plan file itself using Edit
- **Pause for human verification**: After completing all automated verification for a phase, pause and inform the human that the phase is ready for manual testing. Use this format:
  ```
  Phase [N] Complete - Ready for Manual Verification

  Automated verification passed:
  - [List automated checks that passed]

  Please perform the manual verification steps listed in the plan:
  - [List manual verification items from the plan]

  Let me know when manual testing is complete so I can proceed to Phase [N+1].
  ```

If instructed to execute multiple phases consecutively, skip the pause until the last phase. Otherwise, assume you are just doing one phase.

Do not check off items in the manual testing steps until confirmed by the user.

## If You Get Stuck

When something isn't working as expected:
- First, make sure you've read and understood all the relevant code
- Consider if the codebase has evolved since the plan was written
- Present the mismatch clearly and ask for guidance

Use sub-tasks sparingly - mainly for targeted debugging or exploring unfamiliar territory.

## Resuming Work

If the plan has existing checkmarks:
- Trust that completed work is done
- Pick up from the first unchecked item
- Verify previous work only if something seems off

Remember: You're implementing a solution, not just checking boxes. Keep the end goal in mind and maintain forward momentum.
