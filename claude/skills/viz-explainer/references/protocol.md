# Host protocol

The artifact runs standalone in a browser tab or inside an iframe in a Greenhouse Block. It talks to the host with `postMessage`; the host is optional. Messages are plain JSON with a `type` prefixed `greenhouse:`.

## Host to artifact

```json
{ "type": "greenhouse:init",
  "artifactId": "art_…", "blockId": "blk_…", "planId": "plan_…",
  "participant": { "id": "p_…", "name": "Pratos", "kind": "person" },
  "theme": { "--pele-accent": "#205ea6", "…": "…" },
  "decision": null }
```

`decision` is non-null when the host already recorded one; the artifact then renders locked with who and when, and ignores clicks on Choose. `theme` entries are applied as CSS variables on `:root`.

## Artifact to host

```json
{ "fullscreen": "expand" }   // browser refused full screen: please fix my frame to the window
{ "fullscreen": "exit" }     // return my frame to the page
{ "frameHeight": 1412 }       // my content height; size my frame to it
```

The host answers an expand or exit with `{ "expanded": true | false }`.


```json
{ "type": "greenhouse:ready", "kind": "decision-report", "question": "…" }
{ "type": "greenhouse:step", "index": 3, "id": "resolve" }
{ "type": "greenhouse:decision",
  "optionId": "two-events", "label": "ThreadResolved then DecisionRecorded",
  "by": { "id": "p_…", "name": "Pratos" }, "at": "2026-10-28T14:35:12.000Z",
  "tried": { "kind": "exploration", "ref": "exp_…" } }
{ "type": "greenhouse:proposal",
  "from": "Resolved", "to": "Open", "command": "ReopenThread", "note": "…" }
```

The host turns `decision` into `ResolveThread` on the block's thread, which records `ThreadResolved` and `DecisionRecorded`. The artifact never writes anywhere itself. Without a host, the artifact logs the same messages to `console.log` and shows the choice locally with the name the reader typed.

Standalone, the artifact must still be useful: every message is also a visible state change in the page.
