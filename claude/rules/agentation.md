# Agentation — Visual Feedback Integration

When the user mentions annotations, visual feedback, agentation, watch mode, critique mode, or self-driving mode, use the Agentation MCP tools.

## Tools

- `agentation_list_sessions` — List active sessions
- `agentation_get_all_pending` — Get all unaddressed annotations
- `agentation_get_pending` — Get pending for a specific session
- `agentation_acknowledge` — Mark as seen (do this first)
- `agentation_resolve` — Mark as fixed (include summary of changes)
- `agentation_dismiss` — Skip with reason
- `agentation_reply` — Ask clarifying questions
- `agentation_watch_annotations` — Block until new annotations arrive

## Processing Annotations

1. `agentation_get_all_pending` to see feedback
2. For each: `acknowledge` → find code via `elementPath`/`reactComponents`/`cssClasses` → fix → `resolve` with summary
3. If unclear: `agentation_reply` to ask

## Watch Mode

When user says "watch mode": loop `agentation_watch_annotations` → process each → loop again. Continue until user says stop.

## Priorities

Process `blocking` annotations first, then `important`, then `suggestion`.

## Tips

- Always acknowledge before working — gives the human immediate feedback
- Write meaningful resolve summaries (e.g., "Fixed button padding: 8px → 16px")
- Annotations disappear from the browser when resolved
- Use `elementPath` and `cssClasses` to grep for the element in codebase
