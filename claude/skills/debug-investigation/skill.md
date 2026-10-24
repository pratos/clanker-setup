---
name: debug-investigation
description: Debug issues by investigating logs, database state, git history, and process status. Use when you need to diagnose problems without editing files - pure investigation mode.
---

# Debug Investigation

## Activation

**When this skill is triggered, ALWAYS display this banner first:**

```
╭─────────────────────────────────────────────────────────────╮
│  🔍 SKILL ACTIVATED: debug-investigation                    │
├─────────────────────────────────────────────────────────────┤
│  Issue: [problem description]                               │
│  Action: Investigate logs, state, and git history           │
│  Output: Debug report with root cause analysis              │
╰─────────────────────────────────────────────────────────────╯
```

## When to Use

This skill activates when:
- "debug this issue"
- "investigate why X isn't working"
- "help me figure out what's wrong"
- "check the logs for errors"
- Need to diagnose a problem without making changes

## Initial Response

**If invoked WITH context** (plan/ticket file):
```
I'll help debug issues with [context]. Let me understand the current state.

What specific problem are you encountering?
- What were you trying to test/implement?
- What went wrong?
- Any error messages?
```

**If invoked WITHOUT context**:
```
I'll help debug your current issue.

Please describe what's going wrong:
- What are you working on?
- What specific problem occurred?
- When did it last work?

I can investigate logs, database state, and recent changes to help identify the issue.
```

## Investigation Process

### Step 1: Understand the Problem

1. **Read any provided context** (plan or ticket file)
2. **Quick state check**:
   - Current git branch and recent commits
   - Any uncommitted changes
   - When the issue started occurring

### Step 2: Investigate in Parallel

Spawn parallel investigation tasks:

**Task 1 - Check Recent Logs:**
- Find and analyze relevant log files for errors
- Search for stack traces, repeated errors, or warnings
- Note timestamps of issues

**Task 2 - Database/State Check** (if applicable):
- Check database state for anomalies
- Look for stuck states or invalid data
- Query recent records

**Task 3 - Git and File State:**
- Check git status and current branch
- Look at recent commits: `git log --oneline -10`
- Check uncommitted changes: `git diff`
- Verify expected files exist
- Check for file permission issues

**Task 4 - Process/Service Status** (if applicable):
- Check if relevant services are running
- Verify ports and sockets
- Check resource usage

### Step 3: Present Findings

```markdown
## Debug Report

### What's Wrong
[Clear statement of the issue based on evidence]

### Evidence Found

**From Logs:**
- [Error/warning with timestamp]
- [Pattern or repeated issue]

**From Git/Files:**
- [Recent changes that might be related]
- [File state issues]

**From State/DB** (if checked):
- [Relevant finding]

### Root Cause
[Most likely explanation based on evidence]

### Next Steps

1. **Try This First**:
   [Specific command or action]

2. **If That Doesn't Work**:
   - Restart relevant services
   - Check for environment variable issues
   - Run with debug flags enabled

### Can't Access?
Some issues might be outside my reach:
- Browser console errors
- External service state
- System-level issues

Would you like me to investigate something specific further?
```

## Important Guidelines

- **Focus on investigation, not fixing** - Pure debugging only
- **Always require problem description** - Can't debug without knowing what's wrong
- **Read files completely** - No partial reads when reading context
- **Present evidence** - Every conclusion should be backed by findings
- **Guide back to user** - Some issues require human intervention

## Quick Reference

**Log Search Patterns:**
```bash
# Find recent error logs
find . -name "*.log" -mmin -60 2>/dev/null
# Search for errors in logs
grep -r "ERROR\|FATAL\|panic\|exception" logs/ --include="*.log" | tail -20
```

**Git State:**
```bash
git status
git log --oneline -10
git diff
git stash list
```

**Process Check:**
```bash
# Check if a process is running
ps aux | grep [process_name]
# Check port usage
lsof -i :[port] 2>/dev/null
```
