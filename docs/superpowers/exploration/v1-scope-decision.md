# v1 Scope Decision — Excalidraw Clone

Decided 2026-04-28. Source: `excalidraw-feature-inventory.md`.

## ✅ IN for v1

### Drawing primitives
- **Tools** (12 + 2 from "More tools"): Selection, Hand/Pan, Rectangle, Diamond, Ellipse, Arrow, Line, Draw (freehand), Text, **Image (added back)**, Eraser, **Frame (added back)**
- Hand-drawn aesthetic via **rough.js**
- Selection: single, multi (shift-click), marquee, drag-move, resize via handles, rotate handle
- Properties panel: stroke color, background color, fill style (hachure/cross-hatch/solid), stroke width, stroke style, sloppiness, edges, opacity, layers
- Group / ungroup, duplicate, delete, lock/unlock, flip H/V
- Z-order (send to back/front, send/bring forward)
- Undo/redo
- Zoom (in/out/reset/zoom-to-fit/zoom-to-selection), pan (space-drag, wheel)
- All keyboard shortcuts for above

### Productivity & UX
- **Command palette (added back)** — Ctrl+/ or Ctrl+Shift+P
- **Eyedropper / pick color from canvas (added back)** — I or Shift+S/G
- **Snap-to-objects (added back)** — Alt+S
- **Grid (added back)** — Ctrl+'
- **View mode (added back)** — Alt+R (read-only canvas)
- **Zen mode (added back)** — Alt+Z (hide all chrome)

### Persistence & I/O
- localStorage auto-save (scene + UI state)
- IndexedDB for embedded image binaries (via `idb` lib)
- Manual Save/Open `.excalidraw` JSON files
- Export: PNG, SVG, copy-to-clipboard PNG

### Visual / theming
- Theme: light / dark / system
- Canvas background color (5 presets + custom picker)
- 2 hand-drawn webfonts (no Excalifont licensing)

### Localization
- **i18next** with **English + Korean** only

## ❌ OUT for v1 (explicitly confirmed by user)

- **Live collaboration** — encrypted rooms, presence cursors, CRDT
- **Accounts** / authentication
- **Excalidraw+ integration** — paid SaaS hooks

## ⏸ DEFERRED — could revisit ("might change our minds and put them back in")

These were not explicitly added back during scope discussion but could be reconsidered:

| Feature | Notes when re-evaluating |
|---|---|
| Library panel | UI is small; needs a public-library importer (`.excalidrawlib` JSON format) |
| Public library import (`libraries.excalidraw.com`) | Network-dependent feature |
| Web Embed tool | Iframes for YouTube/Twitter/etc.; sandboxing concerns |
| Laser pointer tool (K) | Mostly useful for collab; lower value when solo |
| Lasso selection | Free-form selection region; nice-to-have |
| Text-to-diagram (AI) | Needs LLM provider integration |
| Flowchart auto-create (Ctrl+Arrow) | New Excalidraw feature; complex auto-layout |
| Flowchart navigation (Alt+Arrow) | Pairs with above |
| Excalifont (signature font) | Requires font licensing; substitute with similar webfont |
| Copy / paste styles (Ctrl+Alt+C/V) | Useful but not core |
| Align commands (Ctrl+Shift+Arrow) | Trivial to add later |
| Find on canvas (Ctrl+F) | Indexes text content; small effort post-MVP |
| Localization beyond EN/KO | i18next infra is in place; only json files needed |

## Notes
- "Defer" ≠ "never". Re-evaluating any of these is just a design-doc amendment + a new task.
- Items marked OUT (collab/accounts/Excalidraw+) require backend infrastructure and are explicitly out for v1.
