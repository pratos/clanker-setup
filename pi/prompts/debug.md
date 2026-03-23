---
description: Debug issues by investigating logs, system state, and git history
---

Debug the following issue:

> $@

## How to proceed

1. **If a description was provided above**, start investigating immediately. Otherwise, use `clarify` to ask:
   - What are you working on? (Nix build / Home-manager / Shell/terminal / Service / Other)
   - What went wrong?
   - When did it last work?

2. **Read any referenced files fully** — plans, tickets, error logs mentioned above.

3. **Investigate in parallel** — run these checks:
   - **Logs**: Check `just rebuild` output, Nix evaluation errors, home-manager activation
   - **System state**: `darwin-rebuild --list-generations | tail -5`, `home-manager generations | head -5`
   - **Git state**: `git status`, `git log --oneline -10`, `git diff`
   - **Services** (if relevant): `brew services list`, `launchctl list | grep -i [service]`

4. **Present a debug report** (plain text):

```markdown
## Debug Report

### What's Wrong
[Clear statement based on evidence]

### Evidence Found
- **Logs**: [errors/warnings with timestamps]
- **System State**: [generation info, service status]
- **Git/Files**: [recent changes that might be related]

### Root Cause
[Most likely explanation]

### Next Steps
1. [Specific command or action to try first]
2. [Fallback if that doesn't work]
```

## Guidelines

- Use `clarify` for ALL questions (not plain text questions)
- Focus on Nix/Darwin debugging — this is a nix-darwin + home-manager system
- **No file editing** — investigation only
- Read files completely (no limit/offset)

## Quick Reference

```bash
# Build/Check
just rebuild          # Build without switching
just switch           # Switch to new generation
just lint             # Check formatting
nix flake check       # Validate flake

# System Info
darwin-rebuild --list-generations | tail -5
home-manager generations | head -5

# Service Debugging
brew services list
launchctl list | grep -i [service]
log show --predicate 'eventMessage contains "[keyword]"' --last 10m
```
