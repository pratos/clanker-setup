---
name: iterate-plan
description: Iterate on existing implementation plans with thorough research and updates. Use when you need to refine, adjust, or extend an existing plan based on feedback or changed requirements.
---

# Iterate Implementation Plan

## Plan format

Plans made by the `create-plan` skill are two files: `docs/plans/YYYY-MM-DD-slug.plan.json`, the source, and the `.plan.html` page built from it. Work on the JSON, never on the HTML:

- A check is done when its `"done"` is `true`. Set it by editing the JSON, then rebuild with `just plan <file>`, or `bun <create-plan skill>/scripts/build.mjs <file>` where the repo has no recipe. A hook may already rebuild on edit.
- `phases[]` each have `changes` (a file and one sentence, sometimes a short contract), `components` for UI, and `verify.automated` / `verify.manual`.
- `status` moves draft, final, implementing, done. Set `implementing` when work starts and `done` only when every check is done.
- Tick a manual check only after the person confirms it.
- A new or changed design choice gets a decision report in `decisions`, as the create-plan skill describes.
- Older Markdown plans with `- [ ]` checkboxes still work the old way.

## Activation

**When this skill is triggered, ALWAYS display this banner first:**

```
╭─────────────────────────────────────────────────────────────╮
│  🔄 SKILL ACTIVATED: iterate-plan                           │
├─────────────────────────────────────────────────────────────┤
│  Plan: [path to plan document]                              │
│  Action: Research → Understand → Update → Review            │
│  Output: Updated plan with refined phases/criteria          │
╰─────────────────────────────────────────────────────────────╯
```

## When to Use

This skill activates when:
- "iterate on the plan"
- "update the implementation plan"
- "refine the plan"
- "adjust phase X of the plan"
- Need to modify an existing plan based on new info or feedback

## Process Steps

### Step 1: Read and Understand Current Plan

1. **Parse the input** to identify:
   - Plan file path
   - Requested changes/feedback

2. **If NO plan file provided**, ask:
   ```
   Which plan would you like to update? Provide the path to the plan file.
   Tip: List recent plans with `ls -lt docs/plans/ | head`
   ```

3. **If plan file provided but NO feedback**, ask:
   ```
   I've found the plan at [path]. What changes would you like to make?
   Examples:
   - "Add a phase for migration handling"
   - "Update the success criteria to include performance tests"
   - "Split Phase 2 into two separate phases"
   ```

4. **If BOTH provided**, proceed immediately.

5. **Read the existing plan file COMPLETELY**

### Step 2: Research If Needed

**Only spawn research tasks if the changes require new technical understanding.**

If the feedback requires understanding new code patterns:

1. **Use specialized agents**:
   - **codebase-locator** - To find relevant files
   - **codebase-analyzer** - To understand implementation details
   - **codebase-pattern-finder** - To find similar patterns

2. **Read any new files identified** fully
3. **Wait for ALL sub-tasks to complete** before proceeding

### Step 3: Present Understanding and Approach

Before making changes, confirm:

```
Based on your feedback, I understand you want to:
- [Change 1 with specific detail]
- [Change 2 with specific detail]

My research found:
- [Relevant code pattern or constraint]
- [Important discovery that affects the change]

I plan to update the plan by:
1. [Specific modification]
2. [Another modification]

Does this align with your intent?
```

Get user confirmation before proceeding.

### Step 4: Update the Plan

1. **Make focused, precise edits**:
   - Use the Edit tool for surgical changes
   - Maintain existing structure unless explicitly changing it
   - Keep all file:line references accurate
   - Update success criteria if needed

2. **Ensure consistency**:
   - New phases follow existing pattern
   - Updated scope reflected in "What We're NOT Doing"
   - Maintain automated vs manual success criteria distinction

3. **Preserve quality standards**:
   - Include specific file paths and line numbers
   - Write measurable success criteria
   - Keep language clear and actionable

### Step 5: Review

Present the changes:
```
I've updated the plan at [path]

Changes made:
- [Specific change 1]
- [Specific change 2]

Would you like any further adjustments?
```

## Important Guidelines

1. **Be Skeptical**: Question vague feedback, verify technical feasibility
2. **Be Surgical**: Precise edits, not wholesale rewrites
3. **Be Thorough**: Read entire plan before making changes
4. **Be Interactive**: Confirm understanding before modifying
5. **No Open Questions**: Resolve all questions before updating

## Success Criteria Format

Always maintain two categories:

```markdown
### Success Criteria:

#### Automated Verification:
- [ ] Tests pass: `make test`
- [ ] Type checking passes: `npm run typecheck`
- [ ] Linting passes: `make lint`

#### Manual Verification:
- [ ] Feature works as expected in UI
- [ ] Performance is acceptable
- [ ] Edge cases handled correctly
```
