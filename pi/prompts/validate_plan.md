---
description: Validate implementation against plan, verify success criteria, identify issues
---

Validate the implementation of this plan:

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

1. **If a plan path was provided above**, read it completely.
   **If no plan was provided**, check recent commits (`git log --oneline -20`) for plan references, or use `clarify` to ask which plan to validate.

2. **Gather implementation evidence**:
   ```bash
   git log --oneline -n 20
   just lint
   just rebuild
   ```

3. **For each phase in the plan**:
   - Check completion status (look for `- [x]` checkmarks)
   - Verify actual code matches claimed completion
   - Run automated verification commands
   - List what needs manual testing

4. **Generate a validation report** (plain text):

```markdown
## Validation Report: [Plan Name]

### Implementation Status
✓ Phase 1: [Name] - Fully implemented
✓ Phase 2: [Name] - Fully implemented
⚠️ Phase 3: [Name] - Partially implemented (see issues)

### Automated Verification Results
✓ Build passes: `just rebuild`
✓ Lint passes: `just lint`
✗ Flake check: `nix flake check` (1 failure)

### Code Review Findings
#### Matches Plan:
- [What was correctly implemented]

#### Deviations from Plan:
- [Differences found with file:line refs]

#### Potential Issues:
- [Edge cases, missing handling]

### Manual Testing Required:
- [ ] Verify [feature] works after `drs`
- [ ] Confirm no regressions in [component]

### Recommendations:
- [Actionable next steps]
```

## Guidelines

- Run ALL automated checks — don't skip verification commands
- Use `clarify` for ALL questions (which plan, manual verification results, next steps)
- Read files fully (no limit/offset)
- Be constructive but thorough in identifying gaps

## Recommended workflow

1. `/implement_plan` → Execute the implementation
2. `/commit` → Create atomic commits
3. `/validate_plan` → Verify correctness (you are here)
4. `/commit-push-pr` → Push and create PR
