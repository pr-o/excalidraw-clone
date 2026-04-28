# Excalidraw Feature Inventory

Captured from https://excalidraw.com/ on 2026-04-28 via `agent-browser`.
This is the *full* feature set of the upstream app — used to scope an MVP.

## UI Regions

```
┌────────────────────────────────────────────────────────────────────┐
│ [☰]      [Shapes Toolbar — center]                  [+] [👥] [📚] │  ← Top bar
│ Hamburger                                       Excal+ Collab Library│
│ ┌─────────────┐                                                    │
│ │ Properties  │                                                    │
│ │ panel       │            (Drawing canvas)                        │
│ │ (when shape │                                                    │
│ │  selected)  │                                                    │
│ └─────────────┘                                                    │
│                                                                    │
│ [-] [100%] [+]    [↶] [↷]                                  [?]    │  ← Footer
│ Zoom out/in/reset  Undo/Redo                              Help     │
└────────────────────────────────────────────────────────────────────┘
```

- **Top bar**: Hamburger menu (left) — main menu / preferences
- **Top toolbar (centered)**: 12 primary tools + "More tools" dropdown
- **Right-of-toolbar**: Excalidraw+ link, Live collaboration button, Library toggle
- **Properties panel (left side)**: Appears when a tool or shape is active
- **Bottom-left**: Zoom controls, Undo, Redo
- **Bottom-right**: Help (?)
- **Bottom banner (sometimes)**: Storage warning, marketing blurb

## Top Toolbar — Drawing Tools

| Tool | Shortcut | Notes |
|---|---|---|
| Lock (keep tool active) | Q | Toggle: stay in tool after drawing |
| Hand (pan) | H | Pan the canvas without selecting |
| Selection | V or 1 | Default selection tool |
| Rectangle | R or 2 | |
| Diamond | D or 3 | |
| Ellipse | O or 4 | |
| Arrow | A or 5 | Optionally bound between two shapes |
| Line | L or 6 | |
| Draw (freehand) | P or 7 | Pencil/pen freehand |
| Text | T or 8 | |
| Insert image | 9 | |
| Eraser | E or 0 | |
| **More tools ↓** | | dropdown contains: |
| → Frame | F | Container/group region |
| → Web Embed | — | Embed YouTube/Twitter/etc. |
| → Laser pointer | K | Temporary pointer (collab demos) |
| → Lasso selection | — | Free-form selection region |
| → Text-to-diagram (AI) | — | LLM-driven Mermaid diagram input |

## Hamburger Menu Items

- Open
- Save to... (download `.excalidraw` file)
- Export image... (PNG, SVG, copy-to-clipboard)
- Live collaboration...
- Command palette (Ctrl+/, Ctrl+Shift+P)
- Find on canvas (Ctrl+F)
- Help (opens Help dialog)
- Reset the canvas (Ctrl+Delete)
- Excalidraw+ (link to paid product)
- GitHub / X / Discord / Sign up (external links)
- **Preferences** (submenu)
- Theme: Light / Dark / System (Alt+Shift+D)
- Language: 14+ languages
- Canvas background: 5 presets + custom color picker

## Properties Panel (per shape)

For a selected rectangle / diamond / ellipse:

- **Stroke color**: 5 presets (#1e1e1e, #e03131, #2f9e44, #1971c2, #f08c00) + custom picker (hex/HSL)
- **Background color**: transparent + 5 presets + custom picker
- **Fill style** *(when bg ≠ transparent)*: Hachure / Cross-hatch / Solid (verified upstream)
- **Stroke width**: Thin / Bold / Extra bold
- **Stroke style**: Solid / Dashed / Dotted
- **Sloppiness** (rough.js roughness): Architect / Artist / Cartoonist
- **Edges**: Sharp / Round (only on rectangle; diamond/ellipse have no edges)
- **Opacity**: 0–100 slider
- **Layers**: Send to back / Send backward / Bring forward / Bring to front
- **Actions** *(visible only when actually selected)*: Duplicate, Delete, Group, Ungroup, Lock, Add link, Flip H, Flip V

For arrows/lines: arrow head start/end style, edge style, sloppiness.
For text: font family (Excalifont, Nunito, Lilita One, Comic Shanns, Liberation Sans), font size (S/M/L/XL), text align, vertical align.

## Keyboard Shortcuts (Full)

### Tools
Hand=H · Selection=V/1 · Rectangle=R/2 · Diamond=D/3 · Ellipse=O/4 · Arrow=A/5 · Line=L/6 · Draw=P/7 · Text=T/8 · Image=9 · Eraser=E/0 · Frame=F · Laser=K · Pick color=I or Shift+S/Shift+G · Edit line/arrow points=Ctrl+Enter · Edit text/add label=Enter · Curved arrow=A,click,click,click · Curved line=L,click,click,click · Crop image=double-click or Enter · Keep tool active=Q · Prevent arrow binding=Ctrl · Add/Update link=Ctrl+K · Toggle shape type=Tab/Shift+Tab

### View
Zoom in=Ctrl++ · Zoom out=Ctrl+- · Reset zoom=Ctrl+0 · Zoom to fit=Shift+1 · Zoom to selection=Shift+2 · Page nav=PgUp/PgDn · Zen mode=Alt+Z · Snap=Alt+S · Grid=Ctrl+' · View mode=Alt+R · Theme=Alt+Shift+D · Properties focus=Alt+/ · Find=Ctrl+F · Command palette=Ctrl+/ or Ctrl+Shift+P

### Editor
Move canvas=Space+drag or Wheel+drag · Reset canvas=Ctrl+Delete · Delete=Delete · Cut=Ctrl+X · Copy=Ctrl+C · Paste=Ctrl+V · Paste as plaintext=Ctrl+Shift+V · Select all=Ctrl+A · Add to selection=Shift+click · Deep select=Ctrl+click · Copy to clipboard as PNG=Shift+Alt+C · Copy styles=Ctrl+Alt+C · Paste styles=Ctrl+Alt+V · Layer order=Ctrl+[/Ctrl+]/Ctrl+Shift+[/Ctrl+Shift+] · Align=Ctrl+Shift+Arrow · Duplicate=Ctrl+D or Alt+drag · Lock=Ctrl+Shift+L · Undo=Ctrl+Z · Redo=Ctrl+Shift+Z · Group=Ctrl+G · Ungroup=Ctrl+Shift+G · Flip H=Shift+H · Flip V=Shift+V · Stroke picker=S · Bg picker=G · Font picker=Shift+F · Font size up/down=Ctrl+Shift+</>

### Editor — flowchart (newer)
- Create flowchart from generic element: Ctrl+Arrow Key
- Navigate flowchart: Alt+Arrow Key

## Library Panel

- Toggle on right of top bar
- Tabs: "My library" + categories
- Empty state: "Select an item on canvas to add it here, or install a library from the public repository."
- Public library at `libraries.excalidraw.com` — community-shared `.excalidrawlib` files

## Export Dialog (not opened in this pass — known from upstream)
- Export as PNG (configurable scale, background, dark mode preview)
- Export as SVG
- Embed scene in PNG (so PNG round-trips back into the app)
- Copy to clipboard
- (Pro) export to Excalidraw+

## Live Collaboration (out of scope for our v1)
- Encrypted room URL with shared key in URL fragment
- Presence cursors, avatars
- Yjs-like CRDT under the hood

## Visual / Aesthetic
- **Hand-drawn look**: rough.js renders all primitive shapes
- **Default fonts** are hand-drawn-style (Excalifont is the signature one)
- **Dark/light theme** with adapted color palette
