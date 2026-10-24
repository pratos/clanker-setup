---
name: btw
description: Side conversations for pi - have a parallel conversation with the LLM while the main agent is working. Use /btw to ask questions, think through ideas, or plan next steps without interrupting the main session.
---

# btw — Side Conversations for pi

A pi extension that lets you have a separate, parallel conversation with the LLM while the main agent is working. Think of it as whispering to an assistant without interrupting the one doing the actual work.

## Why?

When pi is in the middle of a long task, you often want to:
- Ask clarifying questions about what it's doing
- Think through next steps or plan ahead
- Get a quick answer without derailing the main session

`/btw` gives you a side channel for all of this. The main agent never sees your side conversation — it keeps working undisturbed.

## Commands

| Command | Description |
|---------|-------------|
| `/btw <message>` | Send a message in the side conversation. Streams the response in a widget above the editor. Works while the agent is running. |
| `/btw:new [message]` | Start a fresh side thread. Optionally kick it off with a message. Clears the previous thread. |
| `/btw:clear` | Dismiss the widget and clear the current thread. |
| `/btw:inject [instructions]` | Inject the full btw thread into the main agent's context as a user message. Optionally add instructions like "implement this plan". Clears the widget after. |
| `/btw:summarize [instructions]` | Summarize the btw thread via LLM, then inject the summary into the main agent's context. Lighter weight than full inject. Clears the widget after. |

## How it works

### Side conversation

Each `/btw` call builds context from:
1. **Main session messages** — the current branch conversation (user + assistant messages)
2. **Previous btw thread** — all prior btw exchanges in the current thread

The btw agent sees everything the main agent has done, plus your ongoing side conversation. A system prompt tells it this is an aside — it won't try to pick up or continue unfinished work from the main session.

The response streams in a bordered widget above the editor using the active model and thinking level. Multiple `/btw` calls accumulate in the widget, separated by dividers.

### Continuous threads

The btw thread is continuous by default. Each `/btw` call sees all prior btw Q&As, so you can have a multi-turn side conversation. Use `/btw:new` to start fresh.

### Bringing context back

When you've worked something out in the side conversation and want the main agent to act on it:
- `/btw:inject` — sends the full thread verbatim as a user message (delivered as a follow-up after the agent finishes)
- `/btw:summarize` — LLM-summarizes the thread first (using low reasoning), then injects the summary
- Both accept optional instructions: `/btw:inject implement the auth plan we discussed`
- Both clear the widget and reset the thread after injecting

### Persistence

- Btw entries (question, thinking, answer, model) are persisted in the session file
- Thread reset markers are also persisted, so resets survive restarts
- On session restore, the widget reappears with the active thread if one exists

## Examples

### Quick question while agent is working

```
/btw what's the difference between useEffect and useLayoutEffect?
```

### Planning ahead

```
/btw let's think about the next steps after this refactor is done
/btw what about testing? should we add unit tests or integration tests?
/btw:inject implement this testing plan after you finish the current task
```

### Getting context without derailing

```
/btw:new can you explain what the agent is currently doing in simple terms?
```

### Summarize and inject

```
/btw let's discuss the API design
/btw what about authentication?
/btw and rate limiting?
/btw:summarize implement this API design
```

## Widget

The btw widget appears above the editor:
- Bordered box with `╭╰│` left border
- User messages shown with green `›` prefix
- Thinking content shown in dim italic
- Streaming cursor `▍` shown while thinking or answering
- `/btw:clear` to dismiss

## Installation

The btw extension should be installed at `~/.pi/agent/extensions/btw.ts`.

If not present, you can ask pi to create it:
```
Create the btw extension for side conversations
```

## Architecture

```
┌─────────────────────────────────────────────────┐
│ Main pi session                                 │
│  User ↔ Agent (read, bash, edit, write...)      │
│                                                 │
│  /btw fires a separate streamSimple() call      │
│  using the same model, thinking level,          │
│  and conversation context + a system prompt     │
│  that frames it as an aside conversation        │
│                                                 │
│  btw responses stream into a widget             │
│  above the editor — never enter the main        │
│  agent's context                                │
│                                                 │
│  /btw:inject or /btw:summarize sends the        │
│  btw thread to the main agent via               │
│  sendUserMessage (deliverAs: "followUp")        │
│  then resets the thread                         │
└─────────────────────────────────────────────────┘
```
