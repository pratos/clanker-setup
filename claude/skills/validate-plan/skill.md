---
name: validate-plan
description: Validate implementation against plan, verify success criteria, identify issues. Use after implementing a plan to check that everything was done correctly.
---

# Validate Plan

## Activation

**When this skill is triggered, ALWAYS display this banner first:**

```
╭─────────────────────────────────────────────────────────────╮
│  ✔️  SKILL ACTIVATED: validate-plan                          │
├─────────────────────────────────────────────────────────────┤
│  Plan: [path to plan document]                              │
│  Action: Verify implementation against plan criteria        │
│  Output: Validation report with pass/fail status            │
╰─────────────────────────────────────────────────────────────╯
```

## When to Use

This skill activates when:
- "validate the plan"
- "verify the implementation"
- "check if the plan was implemented correctly"
- "run plan validation"
- After completing implementation, need to verify correctness

## Validation Process

### Step 1: Context Discovery

1. **Read the implementation plan** completely
2. **Identify what should have changed**:
   - List all files that should be modified
   - Note all success criteria (automated and manual)
   - Identify key functionality to verify

3. **Check current state**:
   ```bash
   git log --oneline -20
   git diff HEAD~N..HEAD  # Where N covers implementation commits
   ```

4. **Spawn parallel research tasks** to discover implementation:
   - Verify database/schema changes match plan
   - Find all modified files related to the feature
   - Check if tests were added/modified as specified

### Step 2: Systematic Validation

For each phase in the plan:

1. **Check completion status**:
   - Look for checkmarks in the plan (- [x])
   - Verify the actual code matches claimed completion

2. **Run automated verification**:
   - Execute each command from "Automated Verification"
   - Document pass/fail status
   - If failures, investigate root cause

3. **Assess manual criteria**:
   - List what needs manual testing
   - Provide clear steps for user verification

4. **Think deeply about edge cases**:
   - Were error conditions handled?
   - Are there missing validations?
   - Could the implementation break existing functionality?

### Step 3: Generate Validation Report

```markdown
## Validation Report: [Plan Name]

### Implementation Status
✓ Phase 1: [Name] - Fully implemented
✓ Phase 2: [Name] - Fully implemented
⚠️ Phase 3: [Name] - Partially implemented (see issues)

### Automated Verification Results
✓ Build passes
✓ Tests pass
✗ Linting issues (3 warnings)

### Code Review Findings

#### Matches Plan:
- Database migration correctly adds [table]
- API endpoints implement specified methods

#### Deviations from Plan:
- Used different approach in [file:line] (improvement)
- Added extra validation in [file:line]

#### Potential Issues:
- Missing index on foreign key
- No rollback handling in migration

### Manual Testing Required:
1. [ ] Verify [feature] appears correctly in UI
2. [ ] Test error states with invalid input
3. [ ] Confirm works with existing [component]

### Recommendations:
- Address linting warnings before merge
- Consider adding integration test for [scenario]
```

## Important Guidelines

1. **Be thorough but practical** - Focus on what matters
2. **Run all automated checks** - Don't skip verification commands
3. **Document everything** - Both successes and issues
4. **Think critically** - Question if the implementation truly solves the problem
5. **Consider maintenance** - Will this be maintainable long-term?

## Validation Checklist

Always verify:
- [ ] All phases marked complete are actually done
- [ ] Automated tests pass
- [ ] Code follows existing patterns
- [ ] No regressions introduced
- [ ] Error handling is robust
- [ ] Documentation updated if needed
- [ ] Manual test steps are clear

## Recommended Workflow

1. `/implement-plan` - Execute the implementation
2. `/commit` - Create atomic commits
3. `/validate-plan` - Verify correctness (this skill)
4. `/describe-pr` - Generate PR description
