---
description: Implement an approved technical plan phase by phase with verification at each step
---

# Implement Plan

## Activation

```
╭─────────────────────────────────────────────────────────────╮
│  🚀 COMMAND: implement                                      │
├─────────────────────────────────────────────────────────────┤
│  Plan: [path to plan document]                              │
│  Phase: [current phase number/name]                         │
│  Action: Implementing changes with verification...          │
╰─────────────────────────────────────────────────────────────╯
```

You are tasked with implementing an approved technical plan. Plans contain phases with specific changes and success criteria.

## Getting Started

When given a plan path:
1. Read the plan completely and check for any existing checkmarks (- [x])
2. Read the original ticket and all files mentioned in the plan
3. **Read files fully** - never use limit/offset, you need complete context
4. Think deeply about how the pieces fit together
5. Create a todo list to track your progress
6. Start implementing if you understand what needs to be done

If no plan path provided, ask for one.

## Implementation Philosophy

Plans are carefully designed, but reality can be messy. Your job is to:
- Follow the plan's intent while adapting to what you find
- Implement each phase fully before moving to the next
- Verify your work makes sense in the broader codebase context
- Update checkboxes in the plan as you complete sections

## Handling Mismatches

When things don't match the plan exactly, think about why and communicate clearly:

```
⚠️ Issue in Phase [N]:
Expected: [what the plan says]
Found: [actual situation]
Why this matters: [explanation]

How should I proceed?
```

## Verification Approach

After implementing a phase:
1. Run the success criteria checks
2. Fix any issues before proceeding
3. Update your progress in both the plan markdown file and your todos
4. Check off completed items in the plan markdown file itself
5. Run lint and make sure it passes

Don't let verification interrupt your flow - batch it at natural stopping points.

## Progress Updates

After completing each major step, display:

```
╭─────────────────────────────────────────────────────────────╮
│  ✅ Phase [N] Complete: [phase name]                        │
├─────────────────────────────────────────────────────────────┤
│  Changes: [summary of what was done]                        │
│  Verified: [which checks passed]                            │
│  Next: [what's coming up]                                   │
╰─────────────────────────────────────────────────────────────╯
```

## If You Get Stuck

When something isn't working as expected:
1. First, make sure you've read and understood all the relevant code
2. Consider if the codebase has evolved since the plan was written
3. Present the mismatch clearly and ask for guidance

## Resuming Work

If the plan has existing checkmarks:
- Trust that completed work is done
- Pick up from the first unchecked item
- Verify previous work only if something seems off

## Red Flags

❌ Implementing without reading the full plan first
❌ Skipping verification steps
❌ Not updating checkboxes as you complete items
❌ Moving to next phase before current phase is verified
❌ Making changes not specified in the plan without asking

## Success Criteria

✅ Each phase implemented fully before moving on
✅ Success criteria verified after each phase
✅ Plan checkboxes updated as items complete
✅ Mismatches communicated clearly
✅ Final lint/test passes

Remember: You're implementing a solution, not just checking boxes. Keep the end goal in mind and maintain forward momentum.
