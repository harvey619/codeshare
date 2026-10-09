# codeshare

Share a link, code together live.

A text/code pad with live multi-user editing, syntax highlighting, and images pasted
straight from the clipboard. Each room gets an edit link and a view-only link, and
rooms expire on their own. Built for sharing code live in small classes.

## Status

Planning. See [the design](docs/design.md) and [the build guide](docs/guide.md).

## Features (planned)

- Live multi-user editing (CRDT-based, via Yjs) with cursors and presence
- Syntax highlighting (CodeMirror 6)
- Paste images from the clipboard into the room
- Edit link + view-only link per room
- Auto-expiring rooms, size limits, and rate limits
- Stretch: "explain this code" with a local model
