# Excalidraw Clone — Design Spec

**Date:** 2026-04-28
**Status:** Draft, pending user review
**Companion docs:**
- [`../exploration/excalidraw-feature-inventory.md`](../exploration/excalidraw-feature-inventory.md) — full upstream inventory
- [`../exploration/v1-scope-decision.md`](../exploration/v1-scope-decision.md) — in / out / deferred lists
- [`../../../README.md`](../../../README.md) — stack and architecture summary

---

## 1. Goal

Build a single-user, hand-drawn-style whiteboard webapp that visually and behaviorally matches `https://excalidraw.com/` for the v1 feature set. File format is interoperable with upstream `.excalidraw` JSON — drawings should round-trip between the two apps.

**Non-goals for v1:** real-time collaboration, accounts, server-stored data, libraries, AI features. See `v1-scope-decision.md` for the explicit deferred list.

## 2. Data model

### 2.1 The element type — mirror upstream

We adopt Excalidraw's element shape so files round-trip. All elements share a base; specific element types extend it.

```ts
// packages/scene/src/types.ts
export interface ExcalidrawElementBase {
  id: string                       // nanoid
  type: ElementType                // discriminator
  x: number; y: number             // top-left in scene coords
  width: number; height: number
  angle: number                    // radians
  strokeColor: string              // CSS color or hex
  backgroundColor: string          // "transparent" | css color
  fillStyle: "hachure" | "cross-hatch" | "solid"
  strokeWidth: 1 | 2 | 4           // thin / bold / extra-bold
  strokeStyle: "solid" | "dashed" | "dotted"
  roughness: 0 | 1 | 2             // architect / artist / cartoonist
  opacity: number                  // 0–100
  groupIds: string[]               // membership in zero or more groups
  frameId: string | null           // membership in a frame
  roundness: { type: 1 | 2 } | null // edge style (rect only)
  seed: number                     // rough.js determinism seed
  versionNonce: number             // for ordering / cheap diff
  isDeleted: boolean               // soft-delete (history-friendly)
  boundElements: { id: string; type: "arrow" | "text" }[] | null
  updated: number                  // ms epoch
  link: string | null
  locked: boolean
}

export type ElementType =
  | "rectangle" | "diamond" | "ellipse"
  | "arrow" | "line"
  | "freedraw"
  | "text"
  | "image"
  | "frame"

// Concrete subtypes add their fields:
export interface ExcalidrawTextElement extends ExcalidrawElementBase {
  type: "text"
  text: string
  fontSize: number
  fontFamily: 1 | 2 | 3            // virgil / helvetica / cascadia (we substitute fonts)
  textAlign: "left" | "center" | "right"
  verticalAlign: "top" | "middle" | "bottom"
  containerId: string | null       // bound to a shape?
  baseline: number
  lineHeight: number
}
// (similar for FreedrawElement, LinearElement, ArrowElement, ImageElement, FrameElement)
```

The full set lives in `packages/scene/src/types.ts`. The shape mirrors `@excalidraw/element/types.ts` enough that we can read/write `.excalidraw` files without a translation layer.

### 2.2 The scene container

```ts
// packages/scene/src/scene.ts
class Scene {
  private elements: ExcalidrawElement[] = []
  private listeners = new Set<() => void>()
  private history: HistoryEntry[] = []
  private historyIndex = -1

  subscribe(fn: () => void): () => void { /* … */ }
  getElements(): readonly ExcalidrawElement[] { /* visible (non-deleted) */ }
  getElementsIncludingDeleted(): readonly ExcalidrawElement[] { /* … */ }

  mutate(mutation: (draft: ExcalidrawElement[]) => void, opts?: { skipHistory?: boolean }): void
  // mutation runs against a structural-shared draft; immutable snapshot replaces internal array

  undo(): void
  redo(): void
  canUndo(): boolean
  canRedo(): boolean

  // file I/O hooks
  loadFromJSON(data: ExcalidrawData): void
  toJSON(): ExcalidrawData
}
```

**History strategy:** structural-shared immutable snapshots. Every `mutate()` produces a new top-level array; unchanged elements are reused by reference. Undo/redo just swaps which snapshot is "current" and notifies subscribers. This is simple, predictable, and avoids a command-object hierarchy.

**Why not Immer?** We don't need MobX-style proxy magic. A plain `(draft) => { draft.push(…) }` API on top of a copied array gives equivalent ergonomics with a fraction of the bundle.

## 3. Coordinate system

Two coordinate spaces:

- **Scene coords**: where elements live. Independent of viewport.
- **Viewport coords**: pixels in the canvas element after zoom and pan.

A single `AppState` value `{ scrollX, scrollY, zoom: { value: number } }` stores the transform. Conversion lives in `packages/geometry`:

```ts
export const sceneToViewport = (p: Point, app: ViewTransform): Point
export const viewportToScene = (p: Point, app: ViewTransform): Point
```

All hit-testing happens in **scene coords** (after converting the pointer event); all rendering happens by setting a single `ctx.setTransform()` per frame and then drawing in scene coords. We never mix the two within a function.

## 4. Package architecture

```
apps/web                       Next.js 16 app shell
└── depends on: ui, persistence, scene, tools, renderer, i18n setup

packages/scene                 Element types, Scene class, history
└── depends on: geometry

packages/geometry              Math: hit-test, transforms, bbox, rotation
└── depends on: nothing (pure)

packages/renderer              Canvas drawing pipeline + rough.js
└── depends on: scene, geometry

packages/tools                 Pointer/keyboard → scene mutations
└── depends on: scene, geometry

packages/ui                    React components (toolbar, props panel, dialogs)
└── depends on: scene (read-only), tools (dispatch), zustand store from web

packages/persistence           localStorage + IndexedDB + .excalidraw I/O
└── depends on: scene
```

**Hard rules:**
- `geometry` imports nothing else (pure helpers).
- `scene` imports only `geometry`.
- `renderer` imports only `scene` + `geometry`. **Zero React.**
- `tools` imports only `scene` + `geometry`. **Zero React.**
- `ui` may read from `scene` and dispatch to `tools` but is the only React-coupled package besides `apps/web`.
- `persistence` is the only place that touches `localStorage` / `IndexedDB`.

A circular import or a violation of these boundaries should fail the build (enforced via ESLint `import/no-cycle` and a hand-written boundary check).

## 5. Rendering pipeline

A single `<canvas>` element, redrawn on every animation frame when dirty.

```ts
// packages/renderer/src/renderer.ts
class CanvasRenderer {
  constructor(canvas: HTMLCanvasElement, scene: Scene)

  // Subscribes to scene + viewport changes; schedules a redraw via rAF.
  // Each frame: clear, apply transform, draw in z-order.
  start(): void
  stop(): void

  setViewTransform(t: ViewTransform): void
  setTheme(theme: "light" | "dark"): void
  setSelection(ids: readonly string[]): void
  setGrid(opts: { enabled: boolean; size: number }): void
}
```

**Per-frame steps:**
1. Clear canvas, fill background.
2. Apply `setTransform(zoom, 0, 0, zoom, scrollX*zoom, scrollY*zoom)`.
3. Optionally draw grid (when grid mode is on).
4. For each non-deleted element in z-order (= array order from `scene.getElements()`; index 0 = back, last = front): render via per-type renderer.
5. Draw selection overlays (handles, marquee) on a *second* canvas layer in viewport coords (so handles don't scale weirdly with zoom). Selection IDs are pushed into the renderer via `renderer.setSelection(ids)`; the renderer never reads from the UI store directly (preserves the "renderer = zero React, zero Zustand" boundary).

**rough.js integration:** each element type has a `getShape(element, generator)` that returns rough Drawables, cached by `versionNonce` in a `WeakMap` keyed by element identity. Cache invalidates automatically when the element object is replaced (immutable snapshots).

**Performance budget:** at 1000 simple elements at 60fps, we should stay <8ms per frame on a mid-range laptop. If rough.js generation becomes the bottleneck, we'll add an offscreen-canvas tile cache for the static layer (Excalidraw uses this trick).

## 6. Tool state machines

Each tool is a discriminated-union state machine in `packages/tools/src/tools/<name>.ts`:

```ts
// packages/tools/src/tools/rectangle.ts
type RectangleState =
  | { phase: "idle" }
  | { phase: "drawing"; start: Point; current: Point; elementId: string }

type RectangleEvent =
  | { type: "pointerDown"; at: Point }
  | { type: "pointerMove"; at: Point }
  | { type: "pointerUp"; at: Point }
  | { type: "escape" }

interface ToolContext {
  // Read-only views the reducer needs to make decisions.
  // No write access — writes happen via the returned mutation.
  readElements(): readonly ExcalidrawElement[]
  hitTest(at: Point): ExcalidrawElement | null
  viewTransform: ViewTransform   // for snap calculations
  modifiers: { shift: boolean; alt: boolean; ctrl: boolean; meta: boolean }
}

type SceneMutation = (draft: ExcalidrawElement[]) => void

export const rectangleTool: Tool<RectangleState, RectangleEvent> = {
  initial: { phase: "idle" },
  reduce(state, event, ctx: ToolContext): [RectangleState, SceneMutation | null] {
    // pure reducer — returns [nextState, sceneMutation | null]
  }
}
```

**Why this shape:**
- The reducer is pure and unit-testable. `ToolContext` is read-only, so reducers can never sneak a side effect in.
- The driver loop in `apps/web` calls `reduce(state, event, ctx)`, persists the new state in a Zustand `toolStateSlice`, and applies the returned mutation (if any) via `scene.mutate()`.
- Switching tools is just swapping which reducer you're running — UI state owns the active tool.

**The shared "Selection" tool** is the most complex (drag, resize, rotate, marquee, double-click-to-edit-text); it gets its own subdirectory with sub-reducers (`drag.ts`, `resize.ts`, `rotate.ts`).

## 7. UI / chrome state (Zustand)

```ts
// apps/web/src/store/index.ts
import { create } from "zustand"

export const useAppStore = create<AppState>()((set) => ({
  // Slices:
  ...createToolSlice(set),    // active tool, "keep tool active" flag
  ...createThemeSlice(set),   // light / dark / system
  ...createViewSlice(set),    // zoom, pan, view mode, zen mode
  ...createGridSlice(set),    // grid visible, snap on
  ...createDialogSlice(set),  // help / shortcuts / export / canvas-bg
  ...createPaletteSlice(set), // command palette open, query
  ...createI18nSlice(set),    // current locale ("en" | "ko")
  ...createSelectionSlice(set), // selectedElementIds: Set<string>
}))
```

**Selection lives in the UI store, not the scene store.** Selection is by ID, ephemeral, and explicitly does **not** participate in undo/redo — this matches upstream behavior (verified during exploration: undoing a delete brings the element back unselected). Storing it in the UI store also keeps `packages/scene` free of "what is the user looking at" concerns.

The renderer receives selection via `renderer.setSelection(ids)`; the driver in `apps/web` is responsible for that call whenever the selection slice changes.

## 8. Persistence

### 8.1 Auto-save
Subscribe to scene + UI store; on debounced (500ms) change, write `localStorage["excalidraw-scene"] = JSON.stringify(scene.toJSON())` and `localStorage["excalidraw-ui"] = JSON.stringify(uiSnapshot)`.

On boot, hydrate from these keys before mounting the canvas. If parse fails, fall back to empty scene and surface a non-blocking toast.

### 8.2 Image binaries
Image elements reference a `fileId` (sha-256 of the binary). Binaries live in IndexedDB under store `files` (key = fileId, value = `{ mimeType, dataURL, created }`). The renderer warms an in-memory `Map<fileId, HTMLImageElement>` once per session. Why IndexedDB and not localStorage: localStorage is ~5 MB per origin and stringifies everything; IDB handles binary blobs and many MBs.

### 8.3 File I/O
- **Save to file**: `scene.toJSON()` → `{ type: "excalidraw", version: 2, source, elements, appState, files }` → blob → download. `files` field embeds binaries inline (matching upstream).
- **Open**: file picker → `JSON.parse` → migrate (if version mismatch) → `scene.loadFromJSON()`. Embedded `files` get hydrated into IndexedDB.

### 8.4 Migrations
Version field on the file. Each migration is `(data: vN) => vN+1`. Pipeline runs before `loadFromJSON`. v1 ships with version 2 of the format and the Excalidraw v1→v2 migration is included for inbound compatibility.

## 9. Export

PNG: render to an offscreen canvas at scale × dpi, with optional bg/dark, optional embedded scene metadata in the PNG (`tEXt` chunk so the PNG can be re-imported into the app). SVG: a separate code path using `roughjs/bin/svg` against the same scene; no canvas involved. Both go through `packages/renderer` (renderer exports `renderToCanvas(scene, opts)` and `renderToSVG(scene, opts)` — the in-app renderer is thin glue around `renderToCanvas`).

## 10. i18n

`i18next` + `react-i18next` initialized in `apps/web/src/i18n.ts`. Two namespaces: `common` (UI chrome) and `shortcuts` (help dialog). Locale files at `apps/web/src/locales/<lang>/<ns>.json`. Locale persists in the Zustand `i18nSlice`. Language switcher in the hamburger menu mirrors the upstream UX.

Initial languages: `en`, `ko`. JSON keys stay flat and human-readable (e.g. `"toolbar.rectangle": "Rectangle"`).

## 11. Testing strategy

| Layer | Framework | What we test |
|---|---|---|
| `geometry` | Vitest (unit) | hit-test, bbox, rotation: pure math, table-driven |
| `scene` | Vitest | mutation + history correctness, JSON round-trips |
| `tools` | Vitest | reducer fixtures: feed event sequence → assert state + emitted mutation |
| `renderer` | Vitest + jsdom + canvas-mock | snapshot tests on draw call sequences |
| `persistence` | Vitest | localStorage / IDB shimmed via `fake-indexeddb`; migration goldens |
| `ui` | Vitest + RTL | component-level: toolbar selection, properties panel binding |
| `apps/web` | Playwright (e2e) | golden flows: draw rect → resize → undo → export PNG; open `.excalidraw` file; theme toggle; zen mode |

Coverage target is **not** a fixed percentage. Required: every `tools/*` reducer has a fixture file; every persistence migration has a before/after golden; every keyboard shortcut listed in the help dialog has a Playwright test.

## 12. Build sequence (high-level — full plan to follow)

1. **Scaffold** the TurboRepo + pnpm workspace, all 7 package skeletons, shared TS config, ESLint with the import-boundary rule, Prettier, Husky + lint-staged. Tailwind v4 + Next 16 in `apps/web` with one empty page.
2. **`geometry`** + tests — pure math, can be done in a single sitting.
3. **`scene`** — element types, Scene class, history, JSON round-trip.
4. **`renderer`** — minimal: render rectangles only at fixed transform. Then add ellipse, diamond, line, arrow, freedraw, text. Then zoom/pan transform. Last: selection overlay layer.
5. **`tools`** — selection (the hardest: drag/resize/rotate/marquee), then each shape tool, then text, then eraser, then frame. Image tool ties into `persistence` for binary upload.
6. **`persistence`** — localStorage auto-save, IndexedDB for files, .excalidraw load/save with migrations.
7. **`ui`** — toolbar, properties panel, hamburger menu, help dialog, command palette, dialogs (export, canvas bg, reset).
8. **`apps/web`** — wire everything; i18n; theme; deployment target Vercel + static export.

Each numbered phase is a separate plan/PR. Phase 1 unblocks everything else. Phases 2–4 must land before tools become useful. Phase 5 unlocks the actual app.

## 13. Risks & open questions

- **Font licensing**: Excalifont (Virgil successor) ships under OFL but is a custom variant. We will use `Caveat` + `Architects Daughter` + `Comic Neue` from Google Fonts. Visual parity will be close but not identical. (Could be revisited if licensing for Excalifont is clarified.)
- **rough.js performance ceiling**: ~1k–2k elements is the practical limit before we need tile caching. v1 won't ship tile cache; we'll add it if real usage shows the pain.
- **Image paste from clipboard** can produce huge dataURLs; we'll cap at 10 MB and downsize if larger.
- **Hand-drawn arrow binding** (the way arrows snap to and follow shapes) is **deferred to v1.1**. v1 ships arrows as free-floating elements only — they can be drawn between two points but won't track a shape if it moves. The element type still carries `boundElements` / `startBinding` / `endBinding` fields for forward compatibility (so v1 files load cleanly into v1.1), but the binding logic is not implemented in v1.
- **Frame containment semantics**: which elements belong to a frame is determined by spatial overlap on creation/move. Edge cases (an element straddling two frames) need a tie-break rule — proposing: highest z-index wins.
- **Browser support**: target evergreen (last 2 versions of Chrome/Firefox/Safari). No IE, no edge legacy, no mobile Safari acrobatics in v1.

---

## Resolved decisions

Decided 2026-04-28 during brainstorming review:

1. **Element types mirror upstream `.excalidraw`** so files round-trip between this app and the real Excalidraw. (Confirmed.)
2. **Arrow-to-shape binding deferred to v1.1.** v1 ships arrows as free-floating elements only. The element fields needed for binding (`boundElements`, `startBinding`, `endBinding`) are present in the type definitions for forward compatibility — only the binding *logic* is deferred. See section 13.
3. **Build-sequence phases approved as written** (section 12). No further subdivision needed at this stage.
