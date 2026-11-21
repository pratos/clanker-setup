# UI blocks: design language and components

When a plan changes anything a person sees, the plan shows it. Load `impeccable` for the decisions and `animate` for any motion before writing these blocks. Components render live in the page, inside sandboxed frames, with the design tokens as CSS variables, so the person reviews the actual thing, not a description of it. Each state has a full screen control, so it can be judged at the size it ships; diagrams and decision reports can go full screen too.

## Design block

```jsonc
"design": {
  "notes": "The surface's mode and posture in two sentences: who uses it, how often, what the one accent is for.",
  "tokens": {
    "color":  { "bg": "#fffcf0", "fg": "#100f0f", "muted": "#6f6e69", "line": "#dad8ce", "surface": "#f2f0e5", "accent": "#205ea6", "ok": "#66800b", "warn": "#ad8301" },
    "type":   [{ "name": "title", "size": 28, "weight": 650, "lineHeight": 1.15, "sample": "Plan GH-12" },
               { "name": "body",  "size": 16, "weight": 400, "lineHeight": 1.5,  "sample": "Real copy from the product" }],
    "space":  [4, 8, 12, 16, 24, 32],
    "radius": { "md": 8, "lg": 12 },
    "font":   { "sans": "ui-sans-serif, system-ui, sans-serif", "mono": "ui-monospace, Menlo, monospace" }
  },
  "components": [ /* optional: shared components that belong to the language rather than a phase */ ]
}
```

Tokens become CSS variables inside every component frame: `--bg`, `--accent`, `--radius-md`, `--space-3` (the third value in `space`), `--font`, `--mono`. Take them from the project's existing tokens when it has them; invent nothing that the code does not have or will not get in this plan.

## Component

```jsonc
{
  "name": "Thread, resolving",
  "notes": "What the component is for and the one rule it follows.",
  "height": 190,                               // starting height; the frame then sizes itself to its content
  "css": ".row { display: flex; gap: var(--space-2) }",   // optional, shared by every state
  "states": [
    { "label": "open",    "html": "<article>…</article>" },
    { "label": "refused", "html": "<article>… <p role=\"alert\">Resolving threads is not switched on for you yet.</p></article>" },
    { "label": "decided", "html": "<article>… <p>Decided by pratos · 2026-10-28 19:30 UTC · “wrapper”</p></article>" }
  ]
}
```

Rules:

- **Every state the person will meet**: default, empty, loading, error, done, and the state a feature flag hides. A component with one state is a screenshot of the happy path.
- **Real copy.** The words the product will ship, checked against the domain vocabulary. Errors name the problem and what to do.
- **Static HTML and CSS, styled with the tokens.** Shared styles go in `css` as classes; states carry markup only, so an implementer reads one stylesheet and three short snippets. No inline style soup, no framework code, no scripts. The component shows the target; the phase's changes say where it lives in the code.
- **Small.** One component is one piece of UI. A page is several components in the phase that builds it.
- **Accessible from the start.** Labels on inputs, `role="alert"` on refusals, focus order that matches reading order.
