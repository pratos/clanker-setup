---
name: traces
description: Share agent session traces via the traces CLI. Use when the user asks to share/publish/upload a trace. Always use private visibility.
---

# Traces — Share Sessions (Private Mode)

## When to use

Use this whenever the user asks to:

- “share to traces”
- “publish this trace”
- “share this session”
- “upload this to traces”

## Primary command (Pi)

Always share with **private** visibility:

```bash
traces share --cwd "$PWD" --agent pi --visibility private --json
```

## If no trace is found

List available traces, then share by ID:

```bash
traces share --list --cwd . --agent pi --json
traces share --trace-id <selected-id> --visibility private --json
```

## Auth or namespace issues

- If authentication fails: ask the user to run `traces login`, then retry.
- If private visibility requires an org namespace: ask the user to run `traces namespace use <org>`.

## Output

Return the `sharedUrl` from the JSON response back to the user.

## Rules

- **Private mode only.** Never use `public` or `direct` visibility.
- Use `--agent pi` explicitly to avoid mis-detection.
