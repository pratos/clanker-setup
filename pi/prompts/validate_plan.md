---
description: Validate implementation against plan, verify success criteria, identify issues
---

Validate the implementation of this plan:

> $@

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
