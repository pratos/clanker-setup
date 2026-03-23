---
name: agentation
description: Visual feedback from UI annotations. Use when the user mentions annotations, visual feedback, agentation, watch mode, critique mode, or self-driving mode. Provides tools to read, acknowledge, resolve, and dismiss UI annotations created via the Agentation browser toolbar.
---

# Agentation — Visual Feedback for AI Agents

## Overview

Agentation lets humans point at UI elements in their browser and leave structured annotations (bug reports, design feedback, change requests). As an AI agent, you receive these annotations via MCP tools and can acknowledge, resolve, dismiss, or reply to them.

## Available MCP Tools

| Tool                           | Description                                      |
| ------------------------------ | ------------------------------------------------ |
| `agentation_list_sessions`     | List all active annotation sessions              |
| `agentation_get_session`       | Get a session with all its annotations           |
| `agentation_get_pending`       | Get pending annotations for a session            |
| `agentation_get_all_pending`   | Get all pending annotations across all sessions  |
| `agentation_acknowledge`       | Mark an annotation as seen                       |
| `agentation_resolve`           | Mark as resolved (with optional summary)         |
| `agentation_dismiss`           | Dismiss with a reason                            |
| `agentation_reply`             | Reply to an annotation thread                    |
| `agentation_watch_annotations` | Block until new annotations appear, return batch |

## Annotation Structure

Each annotation contains:

- `comment` — Human's feedback ("Button is cut off on mobile")
- `element` — HTML tag name
- `elementPath` — CSS selector path (e.g., `body > main > .hero > button.cta`)
- `reactComponents` — React component tree (e.g., `App > Dashboard > Button`)
- `cssClasses` — CSS classes on the element
- `intent` — `fix`, `change`, `question`, or `approve`
- `severity` — `blocking`, `important`, or `suggestion`
- `selectedText` — Text the user highlighted (for text annotations)
- `boundingBox` — Element position on screen

Use `elementPath`, `reactComponents`, and `cssClasses` to locate the element in the codebase via grep.

## Workflow: Processing Annotations

When asked to handle annotations:

1. Call `agentation_get_all_pending` to see unaddressed feedback
2. For each annotation:
   a. Call `agentation_acknowledge` — lets the human know you've seen it
   b. Use `elementPath`, `reactComponents`, and `cssClasses` to find the code
   c. Make the fix or change
   d. Call `agentation_resolve` with a summary of what you did
3. If unclear, call `agentation_reply` to ask a clarifying question

## Workflow: Watch Mode (Hands-Free)

When the user says "watch mode" or "watch for annotations":

1. Call `agentation_watch_annotations` (blocks until annotations appear)
2. When annotations arrive, process each one:
   - `agentation_acknowledge` — mark as seen
   - Find and fix the code
   - `agentation_resolve` — mark as done with a summary
3. Call `agentation_watch_annotations` again (loop)
4. Continue until the user says stop or timeout is reached

Parameters for `agentation_watch_annotations`:

- `batchWindowSeconds` (default: 10, max: 60) — wait time to collect more annotations after first one
- `timeoutSeconds` (default: 120, max: 300) — how long to wait before timing out

## Workflow: Critique Mode

When the user says "critique" or "review the UI":

1. Open a headed browser to the specified URL (requires `browser_automate` tool or `agent-browser` skill)
2. Scroll through the page top-to-bottom
3. For each issue found, click the element and add an annotation via the Agentation toolbar
4. The user reviews annotations in the toolbar and decides what to fix

## Workflow: Self-Driving Mode

When the user says "self-driving mode":

1. Open a headed browser to the specified URL
2. Scroll to an element, add a critique annotation
3. Read the relevant source code and edit it to fix the issue
4. Call `agentation_resolve` — annotation disappears from the browser
5. Verify the fix in the browser (if dev server is running)
6. Move to the next element, repeat

## Annotation Lifecycle

```
pending → acknowledged → resolved
                      → dismissed (with reason)
```

- **pending** — New, unaddressed feedback
- **acknowledged** — Agent has seen it, working on it
- **resolved** — Fixed, annotation disappears from browser
- **dismissed** — Not addressing, with explanation

## Tips

- Always acknowledge before starting work — it gives the human immediate feedback
- Include a meaningful summary when resolving (e.g., "Increased button padding from 8px to 16px and added responsive breakpoint")
- Use `agentation_reply` to have a conversation before making changes if the request is ambiguous
- Process `blocking` severity annotations first
- When resolving, the annotation disappears from the user's browser toolbar automatically
