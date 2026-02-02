import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  // /commit - Analyze changes and create a commit
  pi.registerCommand("commit", {
    description: "Analyze git changes and create a commit with proper format",
    handler: async (args, ctx) => {
      ctx.ui.notify("📝 Starting commit workflow...", "info");
      
      const prompt = `Analyze the current git changes and create a commit.

Instructions:
1. Run \`git status\` to see all changed files
2. Run \`git diff --stat\` to see a summary of changes
3. Analyze the changes to determine:
   - Commit type: (feat), (fix), (refactor), (docs), (test), (config), (deps)
   - Brief description of what changed and why
4. Stage all changes with \`git add -A\`
5. Create a commit with conventional format: \`(type) description\`
6. Do NOT include "Co-Authored-By: Claude" per project conventions
7. Do NOT push unless explicitly requested
8. Report the commit hash and summary

If no changes exist, inform the user.${args ? `\n\nAdditional context: ${args}` : ""}`;

      pi.sendUserMessage(prompt);
    },
  });

  // /plan - Create an implementation plan
  pi.registerCommand("plan", {
    description: "Create a detailed implementation plan for a feature/task",
    handler: async (args, ctx) => {
      ctx.ui.notify("📐 Starting planning workflow...", "info");
      
      const prompt = `Create a detailed implementation plan.

╭─────────────────────────────────────────────────────────────╮
│  📐 SKILL ACTIVATED: create-implementation-plan             │
├─────────────────────────────────────────────────────────────┤
│  Action: Research → Design → Plan → Review                  │
│  Output: Phased implementation plan with success criteria   │
╰─────────────────────────────────────────────────────────────╯

Follow the create-implementation-plan skill workflow:
1. Read all mentioned files completely
2. Research the codebase to understand current state
3. Present your understanding and ask clarifying questions
4. Propose plan structure and get feedback
5. Write detailed plan with phases and success criteria

${args ? `Task: ${args}` : "Please provide the task/ticket description or reference to a ticket file."}`;

      pi.sendUserMessage(prompt);
    },
  });

  // /implement - Implement an approved plan
  pi.registerCommand("implement", {
    description: "Implement an approved technical plan phase by phase",
    handler: async (args, ctx) => {
      if (!args) {
        ctx.ui.notify("Please provide a plan path: /implement path/to/plan.md", "warning");
        return;
      }
      
      ctx.ui.notify("🚀 Starting implementation...", "info");
      
      const prompt = `Implement the technical plan.

╭─────────────────────────────────────────────────────────────╮
│  🚀 SKILL ACTIVATED: implement-plan                         │
├─────────────────────────────────────────────────────────────┤
│  Plan: ${args}
│  Action: Implementing changes with verification...          │
╰─────────────────────────────────────────────────────────────╯

Follow the implement-plan skill workflow:
1. Read the plan completely at: ${args}
2. Check for existing checkmarks to find where to resume
3. Implement each phase fully before moving to the next
4. Verify success criteria after each phase
5. Update checkboxes in the plan as you complete items

Start by reading the plan file.`;

      pi.sendUserMessage(prompt);
    },
  });

  // /research - Deep codebase research
  pi.registerCommand("research", {
    description: "Conduct comprehensive codebase research on a topic",
    handler: async (args, ctx) => {
      if (!args) {
        ctx.ui.notify("Please provide a research question: /research how does X work", "warning");
        return;
      }
      
      ctx.ui.notify("🔬 Starting codebase research...", "info");
      
      const prompt = `Conduct comprehensive codebase research.

╭─────────────────────────────────────────────────────────────╮
│  🔬 SKILL ACTIVATED: codebase-research                      │
├─────────────────────────────────────────────────────────────┤
│  Question: ${args}
│  Action: Deep exploration of codebase architecture...       │
│  Output: Research document with code references             │
╰─────────────────────────────────────────────────────────────╯

Follow the codebase-research skill workflow:
1. Decompose the research question into areas to explore
2. Find relevant files and components
3. Analyze implementation details with file:line references
4. Trace data flow and connections
5. Synthesize findings into a structured report

Research question: ${args}`;

      pi.sendUserMessage(prompt);
    },
  });

  // /locate - Find files related to a topic
  pi.registerCommand("locate", {
    description: "Find files and directories related to a feature/topic",
    handler: async (args, ctx) => {
      if (!args) {
        ctx.ui.notify("Please provide a topic: /locate authentication", "warning");
        return;
      }
      
      ctx.ui.notify("📍 Locating files...", "info");
      
      const prompt = `Locate files related to this topic.

╭─────────────────────────────────────────────────────────────╮
│  📍 SKILL ACTIVATED: codebase-locator                       │
├─────────────────────────────────────────────────────────────┤
│  Search: ${args}
│  Action: Finding all relevant files and directories...      │
│  Output: Categorized file locations by purpose              │
╰─────────────────────────────────────────────────────────────╯

Find all files related to: ${args}

Group results by:
- Implementation files
- Test files
- Configuration files
- Documentation
- Type definitions`;

      pi.sendUserMessage(prompt);
    },
  });

  // /analyze - Deep dive into implementation
  pi.registerCommand("analyze", {
    description: "Analyze how specific code works with file:line references",
    handler: async (args, ctx) => {
      if (!args) {
        ctx.ui.notify("Please provide a component: /analyze the auth middleware", "warning");
        return;
      }
      
      ctx.ui.notify("🔬 Analyzing implementation...", "info");
      
      const prompt = `Analyze the implementation details.

╭─────────────────────────────────────────────────────────────╮
│  🔬 SKILL ACTIVATED: codebase-analyzer                      │
├─────────────────────────────────────────────────────────────┤
│  Target: ${args}
│  Action: Deep-diving into implementation details...         │
│  Output: File:line references with data flow analysis       │
╰─────────────────────────────────────────────────────────────╯

Analyze: ${args}

Provide:
- Entry points with file:line references
- Core implementation details
- Data flow through the system
- Key patterns and architectural decisions
- Error handling approach`;

      pi.sendUserMessage(prompt);
    },
  });

  // /patterns - Find similar implementations
  pi.registerCommand("patterns", {
    description: "Find similar implementations and code patterns to model after",
    handler: async (args, ctx) => {
      if (!args) {
        ctx.ui.notify("Please provide a pattern: /patterns pagination", "warning");
        return;
      }
      
      ctx.ui.notify("🎯 Finding patterns...", "info");
      
      const prompt = `Find code patterns and examples.

╭─────────────────────────────────────────────────────────────╮
│  🎯 SKILL ACTIVATED: codebase-pattern-finder                │
├─────────────────────────────────────────────────────────────┤
│  Pattern: ${args}
│  Action: Finding similar implementations to model after...  │
│  Output: Code examples with file:line references            │
╰─────────────────────────────────────────────────────────────╯

Find patterns for: ${args}

Show:
- Multiple implementation examples with code snippets
- File:line references
- Key aspects of each pattern
- Testing patterns
- Which approach is recommended`;

      pi.sendUserMessage(prompt);
    },
  });

  // Startup notification
  pi.on("session_start", async (_event, ctx) => {
    if (ctx.hasUI) {
      ctx.ui.setStatus("commands", "📋 /commit /plan /implement /research /locate /analyze /patterns");
    }
  });
}
