---
name: codebase-research
description: Conducts comprehensive research across a codebase to answer questions by exploring components, connections, and patterns. Generates mermaid diagrams for architecture visualization. Use for deep architectural understanding or investigating specific topics.
---

# Codebase Research

## Activation

**When this skill is triggered, ALWAYS display this banner first:**

```
╭─────────────────────────────────────────────────────────────╮
│  🔬 SKILL ACTIVATED: codebase-research                      │
├─────────────────────────────────────────────────────────────┤
│  Question: [research question/topic]                        │
│  Action: Deep exploration of codebase architecture...       │
│  Output: Research document with code references             │
╰─────────────────────────────────────────────────────────────╯
```

You are tasked with conducting comprehensive research across the codebase to answer questions by exploring relevant components and connections.

## When to Use

This skill activates when:
- "research how X works"
- "investigate the architecture of"
- "understand the codebase structure for"
- "deep dive into"
- Need comprehensive understanding of a topic across the codebase

## Research Process

### Step 1: Read Directly Mentioned Files
- If specific files are mentioned, read them FULLY first
- This ensures you have full context before exploring further

### Step 2: Decompose the Research Question
- Break down the query into composable research areas
- Identify specific components, patterns, or concepts to investigate
- Consider which directories, files, or architectural patterns are relevant

### Step 3: Explore the Codebase
Research different aspects:
- **File locations**: Find WHERE components live
- **Implementation details**: Understand HOW code works
- **Patterns**: Find examples of similar implementations
- **Connections**: Trace how components interact

### Step 4: Synthesize Findings
- Compile all results
- Connect findings across different components
- Include specific file paths and line numbers
- Highlight patterns, connections, and architectural decisions
- Answer the specific questions with concrete evidence

## Gathering Metadata

Run the metadata script to gather info for the research document:
```bash
bash .pi/skills/codebase-research/scripts/spec_metadata.sh
```

This provides: date/time, git commit, branch, repository name, and GitHub username.

## Output Format

**Always save the research to** `docs/research/YYYY-MM-DD_<slug>.md` **and include code snippets plus a checklist/next steps** so execution can be tracked.

Structure your research as:

```markdown
# Research: [Topic/Question]

## Research Question
[The question being addressed]

## Summary
[High-level findings answering the question]

## Architecture Diagrams

### Component Overview
```
┌─────────────────────────────────────────┐
│              System Name                │
├─────────────────────────────────────────┤
│  ┌───────────┐      ┌───────────┐      │
│  │ Component │─────►│ Component │      │
│  │     A     │      │     B     │      │
│  └───────────┘      └─────┬─────┘      │
│                           │            │
│                           ▼            │
│                    ┌───────────┐       │
│                    │ Component │       │
│                    │     C     │       │
│                    └───────────┘       │
└─────────────────────────────────────────┘
```

### Data Flow
```
  ┌──────┐  request  ┌──────┐  query   ┌──────┐
  │ User │ ────────► │ API  │ ───────► │  DB  │
  └──────┘           └──────┘          └──────┘
      ▲                  │                 │
      │    response      │     result      │
      └──────────────────┴─────────────────┘
```

## Detailed Findings

### [Component/Area 1]
[Detailed findings with file:line references]

### [Component/Area 2]
[Detailed findings with file:line references]

## Code References
- `path/to/file.py:123` - Description of what's there
- `another/file.ts:45-67` - Description of the code block

## Architecture Insights
[Patterns, conventions, and design decisions discovered]

## Connections & Data Flow
[How components interact with each other]

## Open Questions
[Any remaining uncertainties or areas for further investigation]
```

## ASCII Diagram Patterns

Use ASCII art for diagrams - they render everywhere (terminal, Zed, GitHub, any editor).

### Box Characters Reference
```
Corners:  ┌ ┐ └ ┘
Lines:    ─ │ 
T-joints: ├ ┤ ┬ ┴ ┼
Arrows:   ► ◄ ▲ ▼ → ← ↑ ↓
Dashed:   ─ ─ ─  or  - - -
```

### Component Box
```
┌─────────────────┐
│   Component     │
│     Name        │
├─────────────────┤
│ • property 1    │
│ • property 2    │
└─────────────────┘
```

### Flow Diagram
```
┌───────┐      ┌───────┐      ┌───────┐
│ Input │─────►│Process│─────►│Output │
└───────┘      └───┬───┘      └───────┘
                   │
                   ▼
              ┌───────┐
              │ Store │
              └───────┘
```

### Sequence Diagram
```
  Client          Server          Database
    │               │                │
    │   request     │                │
    │──────────────►│                │
    │               │    query       │
    │               │───────────────►│
    │               │                │
    │               │    result      │
    │               │◄───────────────│
    │   response    │                │
    │◄──────────────│                │
    │               │                │
```

### Class/Module Hierarchy
```
         ┌──────────────┐
         │  BaseClass   │
         │  <<abstract>>│
         └──────┬───────┘
                │
     ┌──────────┴──────────┐
     │                     │
     ▼                     ▼
┌──────────┐         ┌──────────┐
│ ChildA   │         │ ChildB   │
└──────────┘         └──────────┘
```

### State Machine
```
         ┌─────────┐
         │  START  │
         └────┬────┘
              │
              ▼
         ┌─────────┐  error   ┌─────────┐
    ┌───►│ RUNNING │─────────►│  ERROR  │
    │    └────┬────┘          └────┬────┘
    │         │                    │
    │ retry   │ success            │ retry
    │         ▼                    │
    │    ┌─────────┐               │
    └────│  DONE   │◄──────────────┘
         └─────────┘
```

**Always include at least one ASCII diagram** that visualizes the key findings. ASCII diagrams work everywhere without any tooling.

## Research Tips

1. **Start broad, then narrow**: Get the big picture before diving deep
2. **Follow the data**: Trace how data flows through the system
3. **Look for patterns**: Similar problems often have similar solutions in a codebase
4. **Check tests**: Tests often reveal expected behavior and edge cases
5. **Read configuration**: Config files reveal architectural decisions
6. **Visualize with ASCII diagrams**: Create ASCII diagrams to capture architecture, data flow, and state machines - they work everywhere without tooling

## Important Guidelines

- **Be thorough**: Explore all relevant areas before concluding
- **Cite sources**: Every claim should have a file:line reference
- **Stay objective**: Report what IS, not what SHOULD BE
- **Note uncertainties**: Clearly mark areas of uncertainty
- **Include context**: Explain why findings matter
- **Always include ASCII diagrams**: Every research document should have at least one diagram visualizing the architecture, data flow, or component relationships

## What NOT to Do

- Don't make assumptions without verifying in code
- Don't skip areas that seem complex
- Don't provide findings without file references
- Don't mix research with recommendations (unless asked)
