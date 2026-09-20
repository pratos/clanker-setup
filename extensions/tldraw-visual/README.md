# tldraw visual

Pi extension for creating native [tldraw Offline](https://offline.tldraw.com/) visual companions for substantive Markdown documents.

## Commands

- `/visualize <file.md>` — synthesize one semantic diagram and open the native app.
- `/visualize-cmux <file.md>` — synthesize a diagram and open it in a cmux browser pane.
- `/visualize-all [directory]` — backfill a selected batch of substantive Markdown documents.
- `/tldraw-open <file.md|file.tldraw>` — open a companion in native tldraw Offline.
- `/tldraw-pane <file.md|file.tldraw>` — open a companion as an embedded cmux canvas.
- `/tldraw-status` — show Canvas API status and open documents.

Companions are generated at:

```text
docs/spec.md
docs/.visuals/spec.tldraw
```

Generation is intentionally on demand. Ordinary Markdown writes do not create or update canvases.

## How it works

The `tldraw_visual` tool packages a native `.tldraw` archive with a durable document script. The script creates stable shapes and bound arrows when the canvas opens. Only the exact generated script digest is added to tldraw Offline's local trust store.

The `tldraw_cmux` tool starts a loopback-only static server and opens a bundled tldraw SDK app with `cmux browser open`. It seeds the same generated specification and persists interactive cmux edits in the browser profile. Those browser-only edits do not rewrite the native `.tldraw` archive; regenerate from Markdown when the canonical visual changes.

A companion is a derived artifact: regenerating it replaces the previous generated canvas. Close the canvas in native tldraw Offline before regenerating it; the desktop app does not merge external changes into open files.

The app is installed declaratively through the `tldraw` Homebrew cask in `nixpkgs/darwin/homebrew.nix`.
