---
description: Debug issues by investigating logs, system state, and git history
---

# Debug

You are tasked with helping debug issues during development or after system changes. This command allows you to investigate problems by examining logs, system state, and git history without editing files. Think of this as a way to bootstrap a debugging session.

## Asking Questions

**CRITICAL**: Whenever you need to ask the user questions or gather information during debugging, you MUST use the `clarify` tool instead of printing questions as plain text. This includes the initial problem description gathering and any follow-up questions during investigation.

The only exception is the final debug report — that should be plain text/markdown.

## Initial Response

When invoked WITH a plan/ticket file, use the `clarify` tool to ask:
- What specific problem are you encountering?
- What were you trying to do? (with common options like "Building/rebuilding", "Switching config", "Running a service", "Other")
- Did you see error messages? (Yes — I'll paste them / No specific errors / Not sure)

When invoked WITHOUT parameters, use the `clarify` tool to gather:
- What are you working on? (with options for common areas like "Nix build", "Home-manager", "Shell/terminal", "Service", "Other")
- What went wrong? (free text)
- When did it last work? (with options like "It was working before my last change", "After a system update", "Never worked", "Not sure")

## Environment Information

You have access to these key locations and tools:

**Nix/Darwin Logs**:
- System build output from `just rebuild` or `just switch`
- Nix evaluation errors from `nix flake check`
- Home-manager activation logs

**System State**:
- Current Nix generation: `darwin-rebuild --list-generations`
- Active system profile: `ls -la /run/current-system`
- Home-manager generation: `home-manager generations`

**Git State**:
- Check current branch, recent commits, uncommitted changes
- Diff against last known-good state

**Service Status**:
- Homebrew services: `brew services list`
- launchd services: `launchctl list | grep -i [service]`
- Nix daemon: `launchctl list | grep nix`

## Process Steps

### Step 1: Understand the Problem

After the user describes the issue:

1. **Read any provided context** (plan or ticket file):
   - Understand what they're implementing/testing
   - Note which phase or step they're on
   - Identify expected vs actual behavior

2. **Quick state check**:
   - Current git branch and recent commits
   - Any uncommitted changes
   - When the issue started occurring

### Step 2: Investigate the Issue

Spawn parallel Task agents for efficient investigation:

```
Task 1 - Check Recent Logs:
Find and analyze recent build/activation logs:
1. Check if `just rebuild` output shows errors
2. Look for Nix evaluation errors
3. Search for home-manager activation issues
4. Check system log for service failures: `log show --predicate 'eventMessage contains "error"' --last 5m`
Return: Key errors/warnings with timestamps
```

```
Task 2 - System State:
Check the current system configuration state:
1. Current darwin generation: `darwin-rebuild --list-generations | tail -5`
2. Home-manager state: `home-manager generations | head -5`
3. Any broken symlinks in home directory
4. Nix store health: `nix-store --verify --check-contents 2>&1 | tail -20`
Return: Relevant system state findings
```

```
Task 3 - Git and File State:
Understand what changed recently:
1. Check git status and current branch
2. Look at recent commits: `git log --oneline -10`
3. Check uncommitted changes: `git diff`
4. Verify expected files exist
5. Look for any file permission issues
Return: Git state and any file issues
```

### Step 3: Present Findings

Based on the investigation, present a focused debug report:

```markdown
## Debug Report

### What's Wrong
[Clear statement of the issue based on evidence]

### Evidence Found

**From Logs**:
- [Error/warning with timestamp]
- [Pattern or repeated issue]

**From System State**:
- [Current generation info]
- [Service status]

**From Git/Files**:
- [Recent changes that might be related]
- [File state issues]

### Root Cause
[Most likely explanation based on evidence]

### Next Steps

1. **Try This First**:
   ```bash
   [Specific command or action]
   ```

2. **If That Doesn't Work**:
   - Roll back to previous generation: `darwin-rebuild switch --rollback`
   - Check flake lock: `nix flake metadata`
   - Run with verbose output: `just rebuild 2>&1 | tee /tmp/rebuild.log`

### Can't Diagnose?
Some issues might be outside my reach:
- GUI application behavior
- Network-dependent service issues
- Hardware-specific problems

Would you like me to investigate something specific further?
```

## Important Notes

- **Focus on Nix/Darwin debugging** - This is a Nix-based system configuration repo
- **Always require problem description** - Can't debug without knowing what's wrong
- **Read files completely** - No limit/offset when reading context
- **No file editing** - Pure investigation only
- **Guide back to user** - Some issues need manual intervention

## Quick Reference

**Build/Check**:
```bash
just rebuild          # Build without switching
just switch           # Switch to new generation
just lint             # Check all formatting
nix flake check       # Validate flake
```

**System Info**:
```bash
darwin-rebuild --list-generations | tail -5
home-manager generations | head -5
nix-info -m            # System info for bug reports
```

**Git State**:
```bash
git status
git log --oneline -10
git diff
```

**Service Debugging**:
```bash
brew services list
launchctl list | grep -i [service]
log show --predicate 'eventMessage contains "[keyword]"' --last 10m
```

Remember: This command helps you investigate without burning the primary context. Perfect for when you hit an issue and need to dig into logs, system state, or git history.
