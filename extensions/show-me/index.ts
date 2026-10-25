import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const AUTO_SHOW_ME_PROMPT = `## Automatic show-me guidance

Proactively apply the loaded show-me skill; do not wait for the user to run /show-me.

- When an explanation would otherwise become a wall of text (roughly 5 prose paragraphs or 500 words), replace some prose with the smallest useful visual.
- Use a fenced Mermaid diagram directly in the Pi response when a sequence, flow, state transition, dependency graph, or component relationship can be explained clearly inline.
- Create and open one focused show-me HTML visual companion when the topic benefits from a richer, interactive, or denser visual than Mermaid can provide.
- When creating or updating a substantive Markdown plan document, include a useful Mermaid diagram in the plan. Also create an HTML companion beside the plan and link to it when the richer view adds meaningful detail.
- Mermaid and HTML may be used together, but each must add distinct value rather than duplicate the same visual.
- Keep the conversational explanation or plan concise. Skip visuals for short answers, simple checklists, or when they would not improve understanding. Honor explicit user requests about format or brevity.`;

export default function showMeExtension(pi: ExtensionAPI) {
  pi.on("before_agent_start", (event) => {
    const hasShowMeSkill = event.systemPromptOptions.skills?.some(
      (skill) => skill.name === "show-me",
    );

    if (!hasShowMeSkill) return;

    return {
      systemPrompt: `${event.systemPrompt}\n\n${AUTO_SHOW_ME_PROMPT}`,
    };
  });

  pi.registerCommand("show-me", {
    description: "Explain the current topic visually with the show-me skill",
    handler: async (args, ctx) => {
      const focus = args.trim();
      const skillCommand = focus ? `/skill:show-me ${focus}` : "/skill:show-me";

      if (ctx.isIdle()) {
        pi.sendUserMessage(skillCommand);
        return;
      }

      pi.sendUserMessage(skillCommand, { deliverAs: "followUp" });
      ctx.ui.notify("Queued /show-me for the current response", "info");
    },
  });
}
