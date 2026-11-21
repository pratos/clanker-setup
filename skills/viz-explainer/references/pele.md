# Pele cheatsheet (pele@1.12.0)

Pele is Obsidian's Mermaid renderer: synchronous, no runtime dependencies, SVG out, themed with CSS variables. Supports every diagram type in Mermaid 12.1.0. Docs at https://pele.run.

## API

```js
import { render, mount, parse, detectType, supports, enableZoom } from 'pele';
const { svg, width, height, type, mermaidType, links } = render(text, options);
const mounted = mount(element, text, { ...options, onRender, onError, zoom: 'auto' });
mounted.update(newText); mounted.refresh(); mounted.destroy();
```

Browser global (what the template uses):

```html
<script src="https://cdn.jsdelivr.net/npm/pele@1.12.0/dist/pele.global.js"></script>
<script> pele.mount(el, text) </script>
```

Useful options: `responsive: false` (the template does this: lay out at natural size and let the page own the viewBox), `fontSize` (the template uses 17), `idPrefix` (prefix all SVG ids; set it when two diagrams share a page), `fontFamily`, `fontSize` (default 16), `maxWidth`, `responsive` (default true), `padding`, `config` (Mermaid settings).

Errors: `render()` throws `PeleError` with `code` (`unsupported-diagram | syntax | semantic | limit`), `line`, `column`, `snippet`. `mount()` does not throw; it draws the error in the container and calls `onError`.

## Hooks for animation

Every node and edge group carries `data-id` with the source id. Verified on 1.12.0:

| Diagram | Nodes | Edges |
|---|---|---|
| flowchart | `.pele-node[data-id="H"]`, clusters `.pele-cluster[data-id="api"]` | `.pele-edge[data-id="L_H_AUTH_0"]` (L_from_to_index) |
| stateDiagram-v2 | `.pele-node[data-id="Open"]`, `root_start`, `root_end` | `.pele-edge[data-id="edge0"]` in source order |
| sequenceDiagram | actors `.pele-node[data-id="P"]` | messages `.pele-edge[data-id="i0"]` in source order |

Classes: `pele` (root svg), `pele-node`, `pele-edge`, `pele-edge-label`, `pele-label`, `pele-cluster`, `pele-cluster-label`, `pele-marker`, plus per-type (`pele-state`, `pele-transition`, `pele-message`, `pele-lifeline`, `pele-shape-rect`, `pele-shape-cyl`).

Edges are `<g>` groups containing a `<path>`; draw them by animating that path (see anime.md).

## Theming

Set on `.pele` or any parent. Colours change without re-rendering.

```css
.pele {
  --pele-bg; --pele-fg; --pele-muted; --pele-line; --pele-surface; --pele-surface-alt;
  --pele-border; --pele-accent; --pele-critical; --pele-error;
  --pele-series-1 … --pele-series-8;
  --pele-font; --pele-font-mono; --pele-radius;
  --pele-title-weight; --pele-heading-weight; --pele-bold-weight;
}
```

Dark mode: override the variables under `@media (prefers-color-scheme: dark)`. Colours fixed inside the Mermaid source (`style`, `classDef`, `linkStyle`) do not follow the theme, so do not use them; use focus classes from the template instead.

Fonts: `mount()` reads `--pele-font`. Call `refresh()` after a web font loads if you set one.

## Validate before building the page

```sh
cd $(mktemp -d) && bun add pele@1.12.0 >/dev/null && bun -e '
import { render } from "pele";
const src = await Bun.file(process.argv[1]).text();
const r = render(src);
console.log(r.type, r.width + "x" + r.height, [...r.svg.matchAll(/data-id="([^"]+)"/g)].map(m => m[1]));
' /path/to/diagram.mmd
```

The printed `data-id` list is exactly what `focus` and `edges` in the spec may reference. A step that names an id not in this list is a bug.
