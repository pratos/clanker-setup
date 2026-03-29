# Traces — Share Sessions (Private Mode)

When the user asks to share/publish/upload traces (e.g. "share to traces", "publish this trace", "share this session"), use the traces CLI and **always** use private visibility.

## Primary command (Claude Code)

```bash
traces share --cwd "$PWD" --agent claude-code --visibility private --json
```

## If no trace is found

```bash
traces share --list --cwd . --agent claude-code --json
traces share --trace-id <selected-id> --visibility private --json
```

## Auth or namespace issues

- If authentication fails: ask the user to run `traces login`, then retry.
- If private visibility requires an org namespace: ask the user to run `traces namespace use <org>`.

## Rules

- **Private mode only.** Never use `public` or `direct` visibility.
- Use `--agent claude-code` explicitly.
- Return the `sharedUrl` from the JSON response.
