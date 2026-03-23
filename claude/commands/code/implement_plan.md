---
description: Implement technical plans from thoughts/_shared/plans with verification
---

# Implement Plan

You are tasked with implementing an approved technical plan from `thoughts/_shared/plans/`. These plans contain phases with specific changes and success criteria.

## Getting Started

When given a plan path:
- Read the plan completely and check for any existing checkmarks (- [x])
- Read the original ticket and all files mentioned in the plan
- **Read files fully** - never use limit/offset parameters, you need complete context
- Think deeply about how the pieces fit together
- Create a todo list to track your progress
- Start implementing if you understand what needs to be done

If no plan path provided, list available plans from `thoughts/_shared/plans/` and use the `clarify` tool to let the user select one.

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
- **Pause for human verification**: After completing all automated verification for a phase, present the results as text, then use the `clarify` tool to ask the user about manual testing status:

  Present as text:
  ```
  Phase [N] Complete - Automated verification passed:
  - [List automated checks that passed]
  ```

  Then use `clarify` to ask about manual verification with options like:
  - "All manual tests pass — proceed to next phase"
  - "Found issues — let me describe them"
  - "Skip manual testing for now — proceed anyway"
  - "Need more time — I'll come back to this"

If instructed to execute multiple phases consecutively, skip the pause until the last phase. Otherwise, assume you are just doing one phase.

Do not check off items in the manual testing steps until confirmed by the user.

## Asking Questions

**CRITICAL**: Whenever you need to ask the user questions, gather preferences, or confirm decisions, you MUST use the `clarify` tool instead of printing questions as plain text. This includes:
- Asking which plan to implement when none is provided
- Presenting mismatches and asking how to proceed
- Pausing for manual verification confirmation
- Any other point where you need user input

The only exception is when presenting implementation status summaries — those can be plain text.

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
