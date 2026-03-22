---
description: Investigate and debug an issue with systematic root cause analysis
---

# Debug Issue

## Activation

```
╭─────────────────────────────────────────────────────────────╮
│  🐛 COMMAND: debug                                          │
├─────────────────────────────────────────────────────────────┤
│  Issue: [description of the problem]                        │
│  Action: Investigate → Hypothesize → Verify → Fix           │
╰─────────────────────────────────────────────────────────────╯
```

## Process

### Step 1: Understand the Problem
1. Read any error messages, logs, or stack traces provided
2. Reproduce the issue if possible (run the failing command/test)
3. Identify the scope: which files, modules, or systems are involved

### Step 2: Gather Evidence
1. Read the relevant source files completely
2. Check recent git changes that might have introduced the bug:
   ```bash
   git log --oneline -20
   git diff HEAD~5 -- <relevant-files>
   ```
3. Look for related test failures or error patterns
4. Check configuration files and environment variables

### Step 3: Form Hypotheses
Based on the evidence, propose possible root causes:

```
Based on my investigation:

**Hypothesis 1**: [Most likely cause]
- Evidence: [what points to this]
- How to verify: [specific check]

**Hypothesis 2**: [Alternative cause]
- Evidence: [what points to this]
- How to verify: [specific check]
```

### Step 4: Verify and Fix
1. Test the most likely hypothesis first
2. Make the minimal fix needed
3. Verify the fix resolves the issue
4. Check for regressions (run related tests)

### Step 5: Report
```
## Fix Summary

**Root Cause**: [what was actually wrong]
**Fix**: [what was changed and why]
**Files Modified**: [list of changed files]
**Verification**: [how the fix was confirmed]
**Regressions Checked**: [what else was tested]
```

## Red Flags

❌ Guessing at fixes without understanding the root cause
❌ Making large changes to fix a small bug
❌ Not verifying the fix works
❌ Not checking for regressions
❌ Ignoring related error messages or warnings

## Success Criteria

✅ Root cause identified with evidence
✅ Minimal fix applied
✅ Fix verified to resolve the issue
✅ No regressions introduced
✅ Clear summary of what was wrong and what was fixed
