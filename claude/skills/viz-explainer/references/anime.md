# anime.js recipes (animejs@4.5.0)

Only four things animate in a viz-explainer, all of them state changes: which step is current, which nodes are in focus, an edge being drawn in the order it happens, and the camera moving to the step's focus. Everything else is a CSS class toggle. If you want a fourth animation, load the `animate` skill and let it say no.

UMD global on cdnjs: `https://cdnjs.cloudflare.com/ajax/libs/animejs/4.5.0/anime.umd.min.js` exposes `anime.animate`, `anime.createTimeline`, `anime.stagger`, `anime.utils`, `anime.svg`.

## Reduced motion

```js
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const D = reduced ? 0 : 1;   // multiply every duration by D
```

With `D = 0` every step applies instantly. The artifact must read correctly that way; motion is never the only cue.

## Focus a set of nodes

```js
function focus(svg, ids) {
  const all = svg.querySelectorAll('.pele-node, .pele-cluster');
  const on = ids.map(id => svg.querySelector(`[data-id="${id}"]`)).filter(Boolean);
  anime.animate(all, { opacity: ids.length ? 0.35 : 1, duration: 180 * D, ease: 'outQuad' });
  anime.animate(on,  { opacity: 1, duration: 180 * D, ease: 'outQuad' });
  on.forEach(el => el.classList.add('is-focus'));
}
```

`is-focus` is a CSS class in the template that thickens the stroke with `--pele-accent`. Opacity is animated because it is composite-only; stroke changes are left to CSS so they are instant.

## Draw an edge in order

```js
function drawEdge(svg, edgeId, delay = 0) {
  const path = svg.querySelector(`.pele-edge[data-id="${edgeId}"] path`);
  if (!path) return;
  const [drawable] = anime.svg.createDrawable(path);
  return anime.animate(drawable, { draw: ['0 0', '0 1'], duration: 420 * D, delay, ease: 'inOutQuad' });
}
```

## A step as a timeline

```js
function playStep(svg, step) {
  const tl = anime.createTimeline({ defaults: { ease: 'outQuad' } });
  focus(svg, step.focus ?? []);
  (step.edges ?? []).forEach((e, i) => tl.add(drawEdge(svg, e, i * 120 * D)));
  return tl;
}
```

Steps are interruptible: pressing next while a timeline runs calls `tl.complete()` before the next one starts. Never queue.

## The camera

Pele lays out at natural size (`responsive: false`); the page owns the viewBox. Each step frames its highlighted nodes first. It widens the frame to the focused edges and their far endpoint nodes only when the wider frame is less than 1.6 times the tight one (or still fits the closest allowed zoom); a long edge across the map otherwise leaves the frame, so the highlight stays readable. Every frame is padded, matched to the stage's aspect, capped at 1.1:1, and clamped inside the map. Anime does not interpolate a four-number attribute string, so tween a plain object and write the attribute on each frame:

```js
const view = { x: 0, y: 0, w: W, h: H };
const write = () => svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`);
camera?.pause();
camera = anime.animate(view, { x, y, w, h, duration: 480 * D, ease: 'inOutQuart', onUpdate: write });
```

On-screen movement uses ease-in-out, not ease-out; 480 ms because the whole frame moves and the eye has to follow it. Pause the running tween before starting the next so stepping fast retargets instead of queueing. With reduced motion the frame jumps.

Skip the camera entirely when the diagram fits the stage at natural size: moving a picture that is already whole only costs attention.

## Full screen

The full screen button (Shift+F) takes the whole document full screen, not just the drawing, so the caption, steps and controls come with it. On `fullscreenchange` the stage takes every pixel the heading, caption and footer leave, and the camera reframes the current step. Embedded in a plan, the host iframe carries `allow="fullscreen" allowfullscreen`. When the browser refuses full screen (sandboxed embeds, automation, some policies), the artifact asks its host with `postMessage({ fullscreen: 'expand' })`; the host fixes the frame to the window, shows Close · Esc, and answers `{ expanded: true }` so the artifact resizes as if it were full screen.

## What not to do

- No entrance animation for the diagram itself. It is there when the page opens.
- No looping or pulsing. A focused node is a stroke, not a heartbeat.
- No zoom past 1.1:1, and no camera on a diagram that already fits.
- No animating `stroke-width`, `fill` or layout properties; opacity and `draw` only.
- No scale from 0, no bounce, no spring on a diagram. Those are for things people touch.
