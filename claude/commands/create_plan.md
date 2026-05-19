---
description: Create detailed implementation plans through interactive research and iteration
model: opus
---

# Implementation Plan

You are tasked with creating detailed implementation plans through an interactive, iterative process. You should be skeptical, thorough, and work collaboratively with the user to produce high-quality technical specifications.

## Non-Negotiable Code-in-Plan Requirement

The final plan MUST include the relevant code/config being changed or added. A plan that only describes files in prose is incomplete.

For every file listed under **Changes Required**:
- Include a `### Relevant Code Changes` subsection with a fenced code block.
- Prefer a unified `diff` snippet for edits to existing files.
- Use language-specific fenced code for new files or large additions.
- Keep snippets focused, but include enough surrounding context to make the change implementable.
- If a listed file truly has no code/config change, write `No code change` and explain why.

Before saving the plan, audit it: every changed/added file must have code/diff or an explicit no-code justification.

## Initial Response

When this command is invoked:

1. **Check if parameters were provided**:
   - If a file path or ticket reference was provided as a parameter, skip the default message
   - Immediately read any provided files FULLY
   - Begin the research process

2. **If no parameters provided**, respond with:
```
I'll help you create a detailed implementation plan. Let me start by understanding what we're building.

Please provide:
1. The task/ticket description (or reference to a ticket file)
2. Any relevant context, constraints, or specific requirements
3. Links to related research or previous implementations

I'll analyze this information and work with you to create a comprehensive plan.

Tip: You can also invoke this command with a ticket file directly: `/create_plan thoughts/anshul/tickets/eng_1234.md`
For deeper analysis, try: `/create_plan think deeply about thoughts/anshul/tickets/eng_1234.md`
```

Then wait for the user's input.

## Process Steps

### Step 1: Context Gathering & Initial Analysis

1. **Read all mentioned files immediately and FULLY**:
   - Ticket files (e.g., `thoughts/anshul/tickets/eng_1234.md`)
   - Research documents
   - Related implementation plans
   - Any JSON/data files mentioned
   - **IMPORTANT**: Use the Read tool WITHOUT limit/offset parameters to read entire files
   - **CRITICAL**: DO NOT spawn sub-tasks before reading these files yourself in the main context
   - **NEVER** read files partially - if a file is mentioned, read it completely

2. **Spawn initial research tasks to gather context**:
   Before asking the user any questions, use specialized agents to research in parallel:

   - Use the **codebase-locator** agent to find all files related to the ticket/task
   - Use the **codebase-analyzer** agent to understand how the current implementation works
   - If relevant, use the **thoughts-locator** agent to find any existing thoughts documents about this feature
   - If a GitHub ticket is mentioned, use the **github-issue-ticket-reader** agent to get full details

   These agents will:
   - Find relevant source files, configs, and tests
   - Identify the specific directories to focus on
   - Trace data flow and key functions
   - Return detailed explanations with file:line references

3. **Read all files identified by research tasks**:
   - After research tasks complete, read ALL files they identified as relevant
   - Read them FULLY into the main context
   - This ensures you have complete understanding before proceeding

4. **Analyze and verify understanding**:
   - Cross-reference the ticket requirements with actual code
   - Identify any discrepancies or misunderstandings
   - Note assumptions that need verification
   - Determine true scope based on codebase reality
   - Capture current code patterns and draft exact/representative code or config snippets for each planned change

5. **Present informed understanding and focused questions**:
   ```
   Based on the ticket and my research of the codebase, I understand we need to [accurate summary].

   I've found that:
   - [Current implementation detail with file:line reference]
   - [Relevant pattern or constraint discovered]
   - [Potential complexity or edge case identified]

   Questions that my research couldn't answer:
   - [Specific technical question that requires human judgment]
   - [Business logic clarification]
   - [Design preference that affects implementation]
   ```

   Only ask questions that you genuinely cannot answer through code investigation.

### Step 2: Research & Discovery

After getting initial clarifications:

1. **If the user corrects any misunderstanding**:
   - DO NOT just accept the correction
   - Spawn new research tasks to verify the correct information
   - Read the specific files/directories they mention
   - Only proceed once you've verified the facts yourself

2. **Create a research todo list** using TodoWrite to track exploration tasks

3. **Spawn parallel sub-tasks for comprehensive research**:
   - Create multiple Task agents to research different aspects concurrently
   - Make sure to launch all the Tasks in parallel as much as possible
   - Use the right agent for each type of research:

   **For deeper investigation:**
   - **codebase-locator** - To find more specific files (e.g., "find all files that handle [specific component]")
   - **codebase-analyzer** - To understand implementation details (e.g., "analyze how [system] works")
   - **codebase-pattern-finder** - To find similar features we can model after

   **For historical context:**
   - **thoughts-locator** - To find any research, plans, or decisions about this area
   - **thoughts-analyzer** - To extract key insights from the most relevant documents

   **For related tickets:**
   - **github-issue-searcher** - To find similar issues or past implementations

   Each agent knows how to:
   - Find the right files and code patterns
   - Identify conventions and patterns to follow
   - Look for integration points and dependencies
   - Return specific file:line references
   - Find tests and examples

3. **Wait for ALL sub-tasks to complete** before proceeding

4. **Present findings and design options**:
   ```
   Based on my research, here's what I found:

   **Current State:**
   - [Key discovery about existing code]
   - [Pattern or convention to follow]

   **Design Options:**
   1. [Option A] - [pros/cons]
   2. [Option B] - [pros/cons]

   **Open Questions:**
   - [Technical uncertainty]
   - [Design decision needed]

   Which approach aligns best with your vision?
   ```

### Step 3: Plan Structure Development

Once aligned on approach:

1. **Create initial plan outline**:
   ```
   Here's my proposed plan structure:

   ## Overview
   [1-2 sentence summary]

   ## Implementation Phases:
   1. [Phase name] - [what it accomplishes]
   2. [Phase name] - [what it accomplishes]
   3. [Phase name] - [what it accomplishes]

   Does this phasing make sense? Should I adjust the order or granularity?
   ```

2. **Get feedback on structure** before writing details

### Step 4: Detailed Plan Writing

After structure approval:

1. **Write the plan** to `thoughts/_shared/plans/YYYY-MM-DD-description.md`
   - Format: `YYYY-MM-DD-description.md` where:
     - YYYY-MM-DD is today's date
     - description is a brief kebab-case description
   - Examples:
     - `2025-01-08-parent-child-tracking.md`
     - `2025-01-08-improve-error-handling.md`
2. **Use this template structure**:

````markdown
# [Feature/Task Name] Implementation Plan

## Overview

[Brief description of what we're implementing and why]

## Current State Analysis

[What exists now, what's missing, key constraints discovered]

## Desired End State

[A Specification of the desired end state after this plan is complete, and how to verify it]

### Key Discoveries:
- [Important finding with file:line reference]
- [Pattern to follow]
- [Constraint to work within]

## What We're NOT Doing

[Explicitly list out-of-scope items to prevent scope creep]

## Implementation Approach

[High-level strategy and reasoning]

## Phase 1: [Descriptive Name]

### Overview
[What this phase accomplishes]

### Changes Required:

#### 1. [Component/File Group]
**File**: `path/to/file.ext`
**Changes**: [Summary of changes]

### Relevant Code Changes

Mandatory: include the code/config that will be changed or added for every file above. Prefer `diff` for edits and language-specific fences for new code.

#### `path/to/file.ext`
```diff
@@
- existing code/config to replace
+ planned code/config to add
```

For new files or large additions, use a focused language-specific snippet instead:

```[language]
// Specific code/config to add
```

### Success Criteria:

#### Automated Verification:
- [ ] Build passes: `just rebuild`
- [ ] Linting passes: `just lint`
- [ ] Unit tests pass: `nix flake check`

#### Manual Verification:
- [ ] Feature works as expected when tested
- [ ] No regressions in related features
- [ ] Edge case handling verified manually

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: [Descriptive Name]

[Similar structure with both automated and manual success criteria...]

---

## Testing Strategy

### Unit Tests:
- [What to test]
- [Key edge cases]

### Integration Tests:
- [End-to-end scenarios]

### Manual Testing Steps:
1. [Specific step to verify feature]
2. [Another verification step]
3. [Edge case to test manually]

## Performance Considerations

[Any performance implications or optimizations needed]

## Migration Notes

[If applicable, how to handle existing data/systems]

## Plan Completeness Checklist

- [ ] Every file in Changes Required has a Relevant Code Changes snippet or an explicit no-code justification
- [ ] Snippets are concrete enough for an implementer to know what to change
- [ ] File paths and line references are included where useful
- [ ] Automated and manual verification are specified

## References

- Original ticket: `thoughts/anshul/tickets/eng_XXXX.md`
- Related research: `thoughts/_shared/research/[relevant].md`
- Similar implementation: `[file:line]`
````

3. **Audit the plan before presenting it**:
   - Check every `**File**:` entry under `Changes Required`
   - Confirm each has a matching `### Relevant Code Changes` snippet or explicit `No code change` justification
   - If any changed/added file lacks code, revise the plan before telling the user it is ready

### Step 5: Review

1. **Present the draft plan location**:
   ```
   I've created the initial implementation plan at:
   `thoughts/_shared/plans/YYYY-MM-DD-description.md`

   Please review it and let me know:
   - Are the phases properly scoped?
   - Are the success criteria specific enough?
   - Any technical details that need adjustment?
   - Missing edge cases or considerations?
   ```

2. **Iterate based on feedback** - be ready to:
   - Add missing phases
   - Adjust technical approach
   - Clarify success criteria (both automated and manual)
   - Add/remove scope items

3. **Continue refining** until the user is satisfied

## Important Guidelines

1. **Be Skeptical**:
   - Question vague requirements
   - Identify potential issues early
   - Ask "why" and "what about"
   - Don't assume - verify with code

2. **Be Interactive**:
   - Don't write the full plan in one shot
   - Get buy-in at each major step
   - Allow course corrections
   - Work collaboratively

3. **Be Thorough**:
   - Read all context files COMPLETELY before planning
   - Research actual code patterns using parallel sub-tasks
   - Include specific file paths and line numbers
   - Include relevant code/config snippets or diffs for every changed/added file; prose-only plans are not acceptable
   - Write measurable success criteria with clear automated vs manual distinction
   - Automated steps should use `just` whenever possible - for example `just lint` instead of running formatters individually

4. **Be Practical**:
   - Focus on incremental, testable changes
   - Consider migration and rollback
   - Think about edge cases
   - Include "what we're NOT doing"

5. **Track Progress**:
   - Use TodoWrite to track planning tasks
   - Update todos as you complete research
   - Mark planning tasks complete when done

6. **No Open Questions in Final Plan**:
   - If you encounter open questions during planning, STOP
   - Research or ask for clarification immediately
   - Do NOT write the plan with unresolved questions
   - The implementation plan must be complete and actionable
   - Every decision must be made before finalizing the plan

## Success Criteria Guidelines

**Always separate success criteria into two categories:**

1. **Automated Verification** (can be run by execution agents):
   - Commands that can be run: `just lint`, `just rebuild`, `nix flake check`, etc.
   - Specific files that should exist
   - Code compilation/type checking
   - Automated test suites

2. **Manual Verification** (requires human testing):
   - UI/UX functionality
   - Performance under real conditions
   - Edge cases that are hard to automate
   - User acceptance criteria

**Format example:**
```markdown
### Success Criteria:

#### Automated Verification:
- [ ] Configuration builds: `just rebuild`
- [ ] All linters pass: `just lint`
- [ ] Flake check passes: `nix flake check`

#### Manual Verification:
- [ ] New feature works correctly after `drs`
- [ ] No regressions in shell/terminal behavior
- [ ] Edge cases verified manually
```

## Common Patterns

### For Nix Configuration Changes:
- Start with module definition
- Add to flake.nix imports
- Configure in machine-specific files
- Test with `just rebuild` then `just switch`

### For New Features:
- Research existing patterns first
- Start with data model/configuration
- Build the Nix module
- Add to appropriate machine configs
- Test last

### For Refactoring:
- Document current behavior
- Plan incremental changes
- Maintain backwards compatibility
- Include migration strategy

## Sub-task Spawning Best Practices

When spawning research sub-tasks:

1. **Spawn multiple tasks in parallel** for efficiency
2. **Each task should be focused** on a specific area
3. **Provide detailed instructions** including:
   - Exactly what to search for
   - Which directories to focus on
   - What information to extract
   - Expected output format
4. **Be EXTREMELY specific about directories**:
   - Include the full path context in your prompts
   - If discussing Nix configs, specify `nixpkgs/` directory
   - If discussing home-manager, specify `nixpkgs/home/`
5. **Specify read-only tools** to use
6. **Request specific file:line references** in responses
7. **Wait for all tasks to complete** before synthesizing
8. **Verify sub-task results**:
   - If a sub-task returns unexpected results, spawn follow-up tasks
   - Cross-check findings against the actual codebase
   - Don't accept results that seem incorrect

Example of spawning multiple tasks:
```python
# Spawn these tasks concurrently:
tasks = [
    Task("Research Nix module structure", nix_research_prompt),
    Task("Find home-manager patterns", hm_research_prompt),
    Task("Investigate darwin config", darwin_research_prompt),
    Task("Check existing test patterns", test_research_prompt)
]
```

## Example Interaction Flow

```
User: /create_plan
Assistant: I'll help you create a detailed implementation plan...

User: We need to add a new development shell for Go. See the existing shells in flake.nix
Assistant: Let me read that file completely first...

[Reads file fully]

Based on the flake.nix, I understand we need to add a Go development shell similar to the existing Python, Rust, and Web shells. Before I start planning, I have some questions...

[Interactive process continues...]
```
