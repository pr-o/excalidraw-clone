# Snap-to-Grid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the grid is enabled, pointer positions used by drawing, drag, resize, text, and library-placement tools snap to grid intersections. `Cmd/Ctrl + Shift + G` toggles the grid; holding `Cmd/Ctrl` bypasses snap.

**Architecture:** One pure helper (`snapPointToGrid` in `@excalidraw-clone/geometry`), applied once at the driver boundary (`apps/web/src/driver/events.ts`) before reducers receive `ToolEvent.at`. Reducers stay pure — only selection drag needs a first-move correction to handle off-grid element origins, gated on a new `ToolContext.grid` field.

**Tech Stack:** TypeScript, pnpm workspaces (monorepo), Vitest (unit tests), Playwright (e2e), Zustand (store), React.

**Spec:** `docs/superpowers/specs/2026-06-01-snap-to-grid-design.md`

---

## Conventions

- Run package tests from the package directory: `cd packages/<pkg> && pnpm test -- --run <pattern>`.
- Run web tests from `apps/web`: `cd apps/web && pnpm test -- --run <pattern>`.
- Run e2e from `apps/web`: `cd apps/web && pnpm test:e2e -- <spec-file>`.
- Run typecheck: `pnpm -w typecheck` (workspace-root).
- All commits use `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>` in the footer.

---

## Task 1: Add `snapPointToGrid` to geometry package

**Files:**

- Create: `packages/geometry/src/snap.ts`
- Modify: `packages/geometry/src/index.ts`
- Create: `packages/geometry/test/snap.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/geometry/test/snap.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { snapPointToGrid } from "../src/snap"

const ON: { enabled: true; size: number } = { enabled: true, size: 20 }
const NO_MODS = { ctrl: false, meta: false }

describe("snapPointToGrid", () => {
  it("returns the input unchanged when grid is disabled", () => {
    expect(snapPointToGrid({ x: 13, y: 27 }, { enabled: false, size: 20 }, NO_MODS)).toEqual({
      x: 13,
      y: 27,
    })
  })

  it("returns the input unchanged when size is zero or negative", () => {
    expect(snapPointToGrid({ x: 13, y: 27 }, { enabled: true, size: 0 }, NO_MODS)).toEqual({
      x: 13,
      y: 27,
    })
    expect(snapPointToGrid({ x: 13, y: 27 }, { enabled: true, size: -5 }, NO_MODS)).toEqual({
      x: 13,
      y: 27,
    })
  })

  it("returns the input unchanged when ctrl is held", () => {
    expect(snapPointToGrid({ x: 13, y: 27 }, ON, { ctrl: true, meta: false })).toEqual({
      x: 13,
      y: 27,
    })
  })

  it("returns the input unchanged when meta is held", () => {
    expect(snapPointToGrid({ x: 13, y: 27 }, ON, { ctrl: false, meta: true })).toEqual({
      x: 13,
      y: 27,
    })
  })

  it("rounds positive coords to the nearest grid intersection", () => {
    expect(snapPointToGrid({ x: 9, y: 11 }, ON, NO_MODS)).toEqual({ x: 0, y: 20 })
    expect(snapPointToGrid({ x: 21, y: 29 }, ON, NO_MODS)).toEqual({ x: 20, y: 20 })
  })

  it("rounds negative coords toward positive infinity (Math.round semantics)", () => {
    // -30 / 20 = -1.5; Math.round(-1.5) === -1, so result is -20 (NOT -40).
    expect(snapPointToGrid({ x: -30, y: -50 }, ON, NO_MODS)).toEqual({ x: -20, y: -40 })
  })

  it("rounds half-grid boundary toward positive infinity", () => {
    // 10 / 20 = 0.5; Math.round(0.5) === 1, so 10 → 20.
    expect(snapPointToGrid({ x: 10, y: -10 }, ON, NO_MODS)).toEqual({ x: 20, y: 0 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/geometry && pnpm test -- --run snap`
Expected: FAIL — `Cannot find module '../src/snap'` (or similar).

- [ ] **Step 3: Create the snap helper**

Create `packages/geometry/src/snap.ts`:

```ts
import type { Point } from "./types"

export interface GridSnap {
  enabled: boolean
  size: number
}

export interface SnapModifiers {
  ctrl: boolean
  meta: boolean
}

export const snapPointToGrid = (p: Point, grid: GridSnap, mods: SnapModifiers): Point => {
  if (!grid.enabled || grid.size <= 0 || mods.ctrl || mods.meta) return p
  return {
    x: Math.round(p.x / grid.size) * grid.size,
    y: Math.round(p.y / grid.size) * grid.size,
  }
}
```

- [ ] **Step 4: Export from the package index**

Modify `packages/geometry/src/index.ts` — add after the last export line:

```ts
export { snapPointToGrid } from "./snap"
export type { GridSnap, SnapModifiers } from "./snap"
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/geometry && pnpm test -- --run snap`
Expected: PASS — all 7 tests green.

- [ ] **Step 6: Run typecheck**

Run: `pnpm -w typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/geometry/src/snap.ts packages/geometry/src/index.ts packages/geometry/test/snap.test.ts
git commit -m "$(cat <<'EOF'
geometry: snapPointToGrid helper with ctrl/meta bypass

Pure function used by the driver to round pointer positions to grid
intersections. Bypasses on disabled grid, non-positive size, or
ctrl/meta modifier.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Add `grid` field to ToolContext with default in test-utils

**Files:**

- Modify: `packages/tools/src/types.ts`
- Modify: `packages/tools/test/test-utils.ts`

Background: `ToolContext.grid` will be read by `selection/index.ts`'s `reduceDragging` to drive the first-move correction. All other reducers ignore it. Adding it now (before reducer changes) keeps the type stable across subsequent tasks.

- [ ] **Step 1: Extend `ToolContext` in `packages/tools/src/types.ts`**

Find the existing `ToolContext` interface (around line 24):

```ts
export interface ToolContext {
  readElements(): readonly ExcalidrawElement[]
  hitTest(at: Point): ExcalidrawElement | null
  viewTransform: ViewTransform
  modifiers: Modifiers
  selectedIds: readonly string[]
}
```

Add the import at the top (alongside existing imports):

```ts
import type { GridSnap, Point, ViewTransform } from "@excalidraw-clone/geometry"
```

And add the `grid` field to the interface:

```ts
export interface ToolContext {
  readElements(): readonly ExcalidrawElement[]
  hitTest(at: Point): ExcalidrawElement | null
  viewTransform: ViewTransform
  modifiers: Modifiers
  selectedIds: readonly string[]
  grid: GridSnap
}
```

- [ ] **Step 2: Add a default `grid` to the test-utils `makeCtx` builder**

Modify `packages/tools/test/test-utils.ts`. Add a default export and update `makeCtx`:

```ts
import type { GridSnap, Point, ViewTransform } from "@excalidraw-clone/geometry"
import type { ExcalidrawElement } from "@excalidraw-clone/scene"
import type { Modifiers, ToolContext } from "../src"

export const NO_MODIFIERS: Modifiers = {
  shift: false,
  alt: false,
  ctrl: false,
  meta: false,
}

export const IDENTITY_VIEW: ViewTransform = { scrollX: 0, scrollY: 0, zoom: 1 }

export const NO_GRID: GridSnap = { enabled: false, size: 20 }

export const makeCtx = (overrides: Partial<ToolContext> = {}): ToolContext => ({
  readElements: () => [],
  hitTest: () => null,
  viewTransform: IDENTITY_VIEW,
  modifiers: NO_MODIFIERS,
  selectedIds: [],
  grid: NO_GRID,
  ...overrides,
})

export const applyMutation = (
  effects: readonly { kind: string; apply?: (draft: ExcalidrawElement[]) => void }[],
  draft: ExcalidrawElement[],
): void => {
  for (const eff of effects) {
    if (eff.kind === "mutation" && eff.apply) eff.apply(draft)
  }
}

export const point = (x: number, y: number): Point => ({ x, y })

export const withModifiers = (mods: Partial<Modifiers>): Modifiers => ({
  ...NO_MODIFIERS,
  ...mods,
})
```

- [ ] **Step 3: Run all tools tests to verify no fixture breakage**

Run: `cd packages/tools && pnpm test -- --run`
Expected: all existing tests still pass (they get the `NO_GRID` default automatically via `makeCtx`).

- [ ] **Step 4: Run typecheck**

Run: `pnpm -w typecheck`
Expected: no errors. (If tools package has a transitive consumer that constructs `ToolContext` manually, this step will surface it — we resolve it in the failing file before committing.)

- [ ] **Step 5: Commit**

```bash
git add packages/tools/src/types.ts packages/tools/test/test-utils.ts
git commit -m "$(cat <<'EOF'
tools: add grid: GridSnap field to ToolContext

Will be consumed only by selection dragging for the first-move on-grid
correction; other reducers ignore it. test-utils provides a NO_GRID
default so existing fixtures stay one-line.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Selection drag first-move correction

**Files:**

- Modify: `packages/tools/src/tools/selection/types.ts`
- Modify: `packages/tools/src/tools/selection/index.ts`
- Modify: `packages/tools/test/selection-drag.test.ts`

Background: with snap applied at the driver, `dx = at.x - last.x` is always a grid-multiple. But if the element started off-grid, an on-grid delta keeps it off-grid. Fix: on the first `pointerMove` of a drag, compute a one-time anchor correction that snaps the moved elements' top-left corner onto the grid; subsequent moves use normal delta math.

We use the _first_ moved element as the anchor. Other selected elements translate by the same delta to preserve relative arrangement.

- [ ] **Step 1: Write a failing test for first-move correction**

Add to `packages/tools/test/selection-drag.test.ts` (append a new `describe` block at the end of the file, importing what isn't already imported):

```ts
import type { GridSnap } from "@excalidraw-clone/geometry"

describe("selection — drag with grid snap", () => {
  const GRID: GridSnap = { enabled: true, size: 20 }

  it("first pointerMove snaps off-grid element to grid, then delta math takes over", () => {
    const r = newRectangle({ x: 13, y: 27, width: 50, height: 50 })
    const ctx = makeCtx({
      hitTest: () => r,
      readElements: () => [r],
      grid: GRID,
    })
    // pointerDown at element interior — selection-tool enters dragging.
    const down = selectionTool.reduce(
      selectionTool.initial,
      { type: "pointerDown", at: point(20, 40) },
      ctx,
    )
    expect(down[0].phase).toBe("dragging")

    // First pointerMove — driver has already snapped at to {40, 40}.
    // Expected: element corrects from {13, 27} to nearest grid ({20, 40})
    // AND applies the move delta from down to current (20 → 40 = +20 x, 40 → 40 = 0 y).
    // Net: element top-left goes to {20, 40} + {20, 0} = {40, 40}.
    const draft: ExcalidrawElement[] = [{ ...r }]
    const move1 = selectionTool.reduce(down[0], { type: "pointerMove", at: point(40, 40) }, ctx)
    applyMutation(move1[1], draft)
    expect(draft[0]!.x).toBe(40)
    expect(draft[0]!.y).toBe(40)

    // Second pointerMove — pure delta. at: {60, 40} → +20 x from last {40, 40}.
    const move2 = selectionTool.reduce(move1[0], { type: "pointerMove", at: point(60, 40) }, ctx)
    applyMutation(move2[1], draft)
    expect(draft[0]!.x).toBe(60)
    expect(draft[0]!.y).toBe(40)
  })

  it("when grid is disabled, drag uses pure delta math (no correction)", () => {
    const r = newRectangle({ x: 13, y: 27, width: 50, height: 50 })
    const ctx = makeCtx({
      hitTest: () => r,
      readElements: () => [r],
      // grid defaults to NO_GRID via makeCtx
    })
    const down = selectionTool.reduce(
      selectionTool.initial,
      { type: "pointerDown", at: point(20, 40) },
      ctx,
    )
    const draft: ExcalidrawElement[] = [{ ...r }]
    const move = selectionTool.reduce(down[0], { type: "pointerMove", at: point(30, 40) }, ctx)
    applyMutation(move[1], draft)
    // Element moves by +10 x, +0 y — stays off-grid as before.
    expect(draft[0]!.x).toBe(23)
    expect(draft[0]!.y).toBe(27)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/tools && pnpm test -- --run selection-drag`
Expected: FAIL — the first test asserts `draft[0].x === 40` but the current code produces `33` (13 + 20 delta with no correction).

- [ ] **Step 3: Add `firstMove` flag to the `dragging` phase**

Find `packages/tools/src/tools/selection/types.ts`. Locate the `SelectionState` discriminated union, find the `"dragging"` variant, and add `firstMove: boolean`. The variant currently looks like:

```ts
| { phase: "dragging"; start: Point; last: Point; movedIds: readonly string[] }
```

Change to:

```ts
| {
    phase: "dragging"
    start: Point
    last: Point
    movedIds: readonly string[]
    firstMove: boolean
  }
```

- [ ] **Step 4: Initialize `firstMove: true` when entering dragging**

Modify `packages/tools/src/tools/selection/index.ts`. In `reduceIdle`, find the lines that return the new `dragging` state (around line 86):

```ts
return [{ phase: "dragging", start: event.at, last: event.at, movedIds }, selectionEffects]
```

Change to:

```ts
return [
  { phase: "dragging", start: event.at, last: event.at, movedIds, firstMove: true },
  selectionEffects,
]
```

- [ ] **Step 5: Apply the first-move correction in `reduceDragging`**

Add imports at the top of `packages/tools/src/tools/selection/index.ts` (alongside the existing `@excalidraw-clone/geometry` import — keep the file's existing import style):

```ts
import { snapPointToGrid } from "@excalidraw-clone/geometry"
```

Replace the entire `reduceDragging` function with:

```ts
const reduceDragging = (
  state: Extract<SelectionState, { phase: "dragging" }>,
  event: ToolEvent,
  ctx: ToolContext,
): [SelectionState, readonly ToolEffect[]] => {
  switch (event.type) {
    case "pointerMove": {
      if (state.firstMove && ctx.grid.enabled) {
        // One-time correction: snap the anchor element's top-left onto the grid,
        // translate all moved elements by the same correction + the move delta.
        const elements = ctx.readElements()
        const anchor = elements.find((e) => state.movedIds.includes(e.id))
        if (anchor) {
          const snapped = snapPointToGrid({ x: anchor.x, y: anchor.y }, ctx.grid, {
            ctrl: ctx.modifiers.ctrl,
            meta: ctx.modifiers.meta,
          })
          const correctionX = snapped.x - anchor.x
          const correctionY = snapped.y - anchor.y
          const moveX = event.at.x - state.last.x
          const moveY = event.at.y - state.last.y
          const dx = correctionX + moveX
          const dy = correctionY + moveY
          return [
            { ...state, last: event.at, firstMove: false },
            [buildDragMoveEffect(state.movedIds, dx, dy)],
          ]
        }
      }
      const dx = event.at.x - state.last.x
      const dy = event.at.y - state.last.y
      return [
        { ...state, last: event.at, firstMove: false },
        [buildDragMoveEffect(state.movedIds, dx, dy)],
      ]
    }
    case "pointerUp": {
      return [{ phase: "idle" }, [buildDragCommitEffect(state.movedIds)]]
    }
    case "escape": {
      return [{ phase: "idle" }, [buildDragRevertEffect(state.movedIds, state.start, state.last)]]
    }
    default:
      return [state, []]
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd packages/tools && pnpm test -- --run selection-drag`
Expected: PASS — all selection-drag tests including the two new ones.

- [ ] **Step 7: Run typecheck**

Run: `pnpm -w typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add packages/tools/src/tools/selection/types.ts packages/tools/src/tools/selection/index.ts packages/tools/test/selection-drag.test.ts
git commit -m "$(cat <<'EOF'
tools: selection drag first-move grid correction

When grid snap is on and the moved element starts off-grid, the first
pointerMove snaps the anchor element's top-left to the nearest grid
intersection. Subsequent moves use pure delta math. Multi-selected
elements translate by the same correction to preserve arrangement.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Driver-level snap (events.ts + useDrawingDriver)

**Files:**

- Modify: `apps/web/src/driver/events.ts`
- Modify: `apps/web/src/driver/useDrawingDriver.ts`

Background: this is the single call site that applies `snapPointToGrid` to every pointer position before it enters the reducer pipeline. A `SNAPPABLE_TOOLS` set gates which active tools see snapped input.

- [ ] **Step 1: Update `events.ts` to take grid and apply snap**

Replace `apps/web/src/driver/events.ts` entirely:

```ts
import {
  snapPointToGrid,
  type GridSnap,
  type Point,
  type ViewTransform,
} from "@excalidraw-clone/geometry"
import type { Modifiers, ToolEvent } from "@excalidraw-clone/tools"

export function modifiersOf(e: {
  shiftKey: boolean
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
}): Modifiers {
  return { shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey, meta: e.metaKey }
}

export function clientToScene(
  canvas: HTMLCanvasElement,
  view: ViewTransform,
  e: PointerEvent | MouseEvent,
): Point {
  const rect = canvas.getBoundingClientRect()
  const cx = e.clientX - rect.left
  const cy = e.clientY - rect.top
  return {
    x: cx / view.zoom - view.scrollX,
    y: cy / view.zoom - view.scrollY,
  }
}

export function snapScenePoint(
  raw: Point,
  grid: GridSnap,
  mods: { ctrlKey: boolean; metaKey: boolean },
): Point {
  return snapPointToGrid(raw, grid, { ctrl: mods.ctrlKey, meta: mods.metaKey })
}

export function pointerEventToToolEvent(
  type: "pointerDown" | "pointerMove" | "pointerUp",
  canvas: HTMLCanvasElement,
  view: ViewTransform,
  grid: GridSnap,
  e: PointerEvent,
): ToolEvent {
  const raw = clientToScene(canvas, view, e)
  const at = snapScenePoint(raw, grid, e)
  return { type, at }
}
```

- [ ] **Step 2: Update `useDrawingDriver.ts` to pass grid + maintain SNAPPABLE_TOOLS + thread grid into context**

Modify `apps/web/src/driver/useDrawingDriver.ts`. Apply the following edits:

**(2a)** Update the import line for events:

```ts
import { clientToScene, modifiersOf, pointerEventToToolEvent, snapScenePoint } from "./events"
```

**(2b)** Add `GridSnap` and `ToolName` imports at the top:

```ts
import type { GridSnap } from "@excalidraw-clone/geometry"
```

(`ToolName` is already exported from `@excalidraw-clone/tools` — confirm with the existing import block; if not present, add it.)

**(2c)** Add a `SNAPPABLE_TOOLS` constant near the top of the file (after the imports, before `placeLibraryItem`):

```ts
const SNAPPABLE_TOOLS: ReadonlySet<string> = new Set([
  "selection",
  "rectangle",
  "ellipse",
  "diamond",
  "line",
  "arrow",
  "text",
  "image",
])
```

**(2d)** Add a small helper inside the `useEffect` body (just before the `dispatch` declaration) that resolves the _effective_ grid for a given dispatch:

```ts
const resolveGrid = (): GridSnap => {
  const s = useAppStore.getState()
  return {
    enabled: s.gridEnabled && SNAPPABLE_TOOLS.has(s.activeTool),
    size: s.gridSize,
  }
}
```

**(2e)** Update `dispatch` to put `grid` into the `ToolContext`. Find the `ctx: ToolContext = { ... }` block and add `grid: resolveGrid(),` to it:

```ts
const ctx: ToolContext = {
  readElements: () => scene.getElements(),
  hitTest: (at) => {
    const elements = scene.getElements()
    for (let i = elements.length - 1; i >= 0; i -= 1) {
      const el = elements[i] as ExcalidrawElement
      if (hitTestElement(el, at)) return el
    }
    return null
  },
  viewTransform: { scrollX: store.scrollX, scrollY: store.scrollY, zoom: store.zoom },
  modifiers,
  selectedIds: store.selectedIds,
  grid: resolveGrid(),
}
```

**(2f)** Update `dispatchPointer` to pass the grid into `pointerEventToToolEvent`:

```ts
const dispatchPointer = (
  type: "pointerDown" | "pointerMove" | "pointerUp",
  e: PointerEvent,
): void => {
  const store = useAppStore.getState()
  const event = pointerEventToToolEvent(
    type,
    canvas,
    { scrollX: store.scrollX, scrollY: store.scrollY, zoom: store.zoom },
    resolveGrid(),
    e,
  )
  dispatch(event, modifiersOf(e))
}
```

**(2g)** Update `onPointerDown`'s library-placement path so the placement origin snaps. Replace the existing `if (pending) { ... }` block:

```ts
if (pending) {
  const raw = clientToScene(
    canvas,
    { scrollX: store.scrollX, scrollY: store.scrollY, zoom: store.zoom },
    e,
  )
  const at = snapScenePoint(raw, resolveGrid(), e)
  placeLibraryItem(pending, at.x, at.y, scene)
  store.clearPendingItem()
  overlay.getContext("2d")?.clearRect(0, 0, overlay.width, overlay.height)
  return
}
```

**(2h)** Update `onPointerMove`'s library ghost-preview path so the ghost also snaps (so the preview matches where the click will land):

```ts
if (pending) {
  const raw = clientToScene(
    canvas,
    { scrollX: store.scrollX, scrollY: store.scrollY, zoom: store.zoom },
    e,
  )
  const at = snapScenePoint(raw, resolveGrid(), e)
  drawGhost(overlay, pending, at, {
    scrollX: store.scrollX,
    scrollY: store.scrollY,
    zoom: store.zoom,
  })
  return
}
```

**(2i)** Update `onDoubleClick` so text creation lands on grid:

```ts
const onDoubleClick = (e: MouseEvent): void => {
  const store = useAppStore.getState()
  const raw = clientToScene(
    canvas,
    { scrollX: store.scrollX, scrollY: store.scrollY, zoom: store.zoom },
    e,
  )
  const at = snapScenePoint(raw, resolveGrid(), e)
  dispatch({ type: "doubleClick", at }, modifiersOf(e))
}
```

- [ ] **Step 3: Run typecheck to catch any signature mismatch**

Run: `pnpm -w typecheck`
Expected: no errors.

- [ ] **Step 4: Run all unit tests (tools + geometry + web) to verify nothing regressed**

Run from workspace root:

```bash
cd packages/geometry && pnpm test -- --run
cd ../tools && pnpm test -- --run
cd ../../apps/web && pnpm test -- --run
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/driver/events.ts apps/web/src/driver/useDrawingDriver.ts
git commit -m "$(cat <<'EOF'
web: snap pointer positions at the driver boundary

pointerEventToToolEvent now takes a GridSnap parameter and rounds
scene points to grid intersections. SNAPPABLE_TOOLS gates which active
tools receive snapped input (freedraw/eraser/frame stay raw). Library
placement, library ghost preview, and double-click text creation also
route through the same snap helper.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Keyboard shortcut to toggle grid

**Files:**

- Modify: `apps/web/src/keyboard/shortcuts.ts`

Background: HelpDialog already documents `Cmd/Ctrl+Shift+G` (`packages/ui/src/HelpDialog.tsx:38`) and the i18n key `shortcuts.toggleGrid` already exists in en/ko. The handler is the missing piece.

- [ ] **Step 1: Add the toggleGrid branch in `shortcuts.ts`**

Open `apps/web/src/keyboard/shortcuts.ts`. After the existing `if (isMeta && (key === "y" || ...))` redo block (around line 46) and before the palette block, add:

```ts
if (isMeta && e.shiftKey && key === "g") {
  e.preventDefault()
  useAppStore.getState().toggleGrid()
  return
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm -w typecheck`
Expected: no errors.

- [ ] **Step 3: Smoke-test in the dev server (manual)**

Start the dev server and confirm:

- Press `Cmd/Ctrl+Shift+G`. The grid appears.
- Press again. Grid disappears.

```bash
cd apps/web && pnpm dev
```

(Open `http://localhost:5173` or the configured port. Visual check only — no test scaffold required for this step.)

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/keyboard/shortcuts.ts
git commit -m "$(cat <<'EOF'
web: wire Cmd/Ctrl+Shift+G to toggleGrid

HelpDialog and i18n entries for this shortcut already existed; the
handler was missing. This connects them.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: HelpDialog row for "Bypass snap"

**Files:**

- Modify: `packages/ui/src/HelpDialog.tsx`
- Modify: `apps/web/src/locales/en/shortcuts.json`
- Modify: `apps/web/src/locales/ko/shortcuts.json`

- [ ] **Step 1: Add the "Bypass snap" row to `EDITOR_SHORTCUTS`**

Modify `packages/ui/src/HelpDialog.tsx`. Find the `EDITOR_SHORTCUTS` array and append one entry:

```ts
const EDITOR_SHORTCUTS: readonly Shortcut[] = [
  { keys: "Cmd/Ctrl+Z", label: "shortcuts.undo" },
  { keys: "Cmd/Ctrl+Shift+Z", label: "shortcuts.redo" },
  { keys: "Cmd/Ctrl+C", label: "shortcuts.copy" },
  { keys: "Cmd/Ctrl+V", label: "shortcuts.paste" },
  { keys: "Cmd/Ctrl+D", label: "shortcuts.duplicate" },
  { keys: "Delete", label: "shortcuts.delete" },
  { keys: "Cmd/Ctrl+A", label: "shortcuts.selectAll" },
  { keys: "Esc", label: "shortcuts.deselect" },
  { keys: "Hold Cmd/Ctrl", label: "shortcuts.bypassSnap" },
]
```

- [ ] **Step 2: Add the English translation**

Modify `apps/web/src/locales/en/shortcuts.json`. Add `"bypassSnap": "Bypass snap"` to the object (placement is by convention — fit it near other modifier rows, or append before the closing brace and rely on Prettier to normalize).

- [ ] **Step 3: Add the Korean translation**

Modify `apps/web/src/locales/ko/shortcuts.json`. Add `"bypassSnap": "스냅 해제"`.

- [ ] **Step 4: Run typecheck**

Run: `pnpm -w typecheck`
Expected: no errors.

- [ ] **Step 5: Smoke-test in the dev server (manual)**

```bash
cd apps/web && pnpm dev
```

Open the app, press `?` to open the Help dialog. Confirm "Bypass snap — Hold Cmd/Ctrl" appears in the Editor section.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/HelpDialog.tsx apps/web/src/locales/en/shortcuts.json apps/web/src/locales/ko/shortcuts.json
git commit -m "$(cat <<'EOF'
ui: HelpDialog row for "Bypass snap" with en/ko translations

Documents that holding Cmd/Ctrl during pointer interactions bypasses
grid snap even when the grid is enabled.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Extend shape-tools test for grid-aware draw

**Files:**

- Modify: `packages/tools/test/shape-tools.test.ts`

Background: with snap applied at the driver, the shape reducer simply sees snapped points. This test pins that contract — feeding on-grid points into the rectangle reducer produces on-grid box.

- [ ] **Step 1: Add a `describe` block at the end of the file**

Append to `packages/tools/test/shape-tools.test.ts`:

```ts
describe("shape tool — receives snapped input", () => {
  it("rectangle drawn with on-grid start and end produces on-grid box", () => {
    const ctx = makeCtx()
    const down = rectangleTool.reduce(
      rectangleTool.initial,
      { type: "pointerDown", at: point(20, 40) },
      ctx,
    )
    const draft: ExcalidrawElement[] = []
    applyMutation(down[1], draft)
    const move = rectangleTool.reduce(down[0], { type: "pointerMove", at: point(80, 100) }, ctx)
    applyMutation(move[1], draft)
    const up = rectangleTool.reduce(move[0], { type: "pointerUp", at: point(80, 100) }, ctx)
    applyMutation(up[1], draft)

    const r = draft[0]!
    expect(r.x % 20).toBe(0)
    expect(r.y % 20).toBe(0)
    expect(r.width % 20).toBe(0)
    expect(r.height % 20).toBe(0)
  })
})
```

If `rectangleTool` is not already imported at the top, add it. The existing imports at the top of `shape-tools.test.ts` already cover `applyMutation`, `makeCtx`, `point`, `ExcalidrawElement` — verify and add only what's missing.

- [ ] **Step 2: Run the test to verify it passes**

Run: `cd packages/tools && pnpm test -- --run shape-tools`
Expected: PASS — existing tests + the new case.

- [ ] **Step 3: Commit**

```bash
git add packages/tools/test/shape-tools.test.ts
git commit -m "$(cat <<'EOF'
tools: shape-tool test pins on-grid input → on-grid output

Documents that the shape reducer is a pure pass-through for snapped
points; no reducer-side snap math is required.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Extend linear-tools test for shift + snap interaction

**Files:**

- Modify: `packages/tools/test/linear-tools.test.ts`

Background: when both Shift and grid are on, the spec says Shift's 45° constraint wins — the resulting endpoint may end up off-grid. This test pins that semantics.

- [ ] **Step 1: Add a `describe` block at the end of the file**

Append to `packages/tools/test/linear-tools.test.ts`:

```ts
describe("linear tool — shift wins over grid", () => {
  it("with shift held and on-grid endpoints, the 45° constraint may pull the end off-grid", () => {
    const ctx = makeCtx({ modifiers: withModifiers({ shift: true }) })
    const down = lineTool.reduce(lineTool.initial, { type: "pointerDown", at: point(0, 0) }, ctx)
    const draft: ExcalidrawElement[] = []
    applyMutation(down[1], draft)
    // Pointer at (80, 20) — angle ≈ 14°. Snapped to nearest 45° (0 rad)
    // produces (~82.46, 0): endpoint x is off-grid, y is on-grid.
    const move = lineTool.reduce(down[0], { type: "pointerMove", at: point(80, 20) }, ctx)
    applyMutation(move[1], draft)
    const line = draft[0]!
    // y should be on-grid (0); width should reflect a horizontal line — off-grid OK.
    expect(line.height).toBeCloseTo(0, 5)
    expect(line.width).toBeGreaterThan(0)
  })
})
```

If `lineTool` is not already imported at the top, add it.

- [ ] **Step 2: Run the test**

Run: `cd packages/tools && pnpm test -- --run linear-tools`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/tools/test/linear-tools.test.ts
git commit -m "$(cat <<'EOF'
tools: linear-tool test pins shift wins over grid

When both shift (45° constraint) and grid snap are active, the
constrained endpoint may land off-grid. Documented and tested.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Playwright e2e for snap-to-grid

**Files:**

- Create: `apps/web/e2e/snap-to-grid.spec.ts`

Background: one happy-path test — enable grid via shortcut, draw a rectangle, assert the persisted element's coords are grid-multiples. This catches the full pipeline (shortcut → store → driver → snap → reducer → mutation).

- [ ] **Step 1: Check existing e2e patterns for store inspection**

Inspect the existing `apps/web/e2e/library.spec.ts` to confirm how the e2e tests read scene elements (likely via `page.evaluate(() => window.scene.getElements())` or via a debug global). Use the same pattern below.

Run: `ls apps/web/e2e/`
Then read the most recent `*.spec.ts` to confirm the helper signatures.

- [ ] **Step 2: Write the spec**

Create `apps/web/e2e/snap-to-grid.spec.ts`:

```ts
import { expect, test } from "@playwright/test"

test("rectangle drawn with grid enabled lands on grid multiples", async ({ page }) => {
  await page.goto("/")

  // Wait for the toolbar to be interactive (same readiness gate other specs use).
  await page.getByTestId("toolbar-rectangle").waitFor({ state: "visible" })

  // Toggle grid on with Cmd/Ctrl+Shift+G.
  const isMac = process.platform === "darwin"
  await page.keyboard.press(isMac ? "Meta+Shift+KeyG" : "Control+Shift+KeyG")

  // Activate the rectangle tool.
  await page.getByTestId("toolbar-rectangle").click()

  // Draw a rectangle on the canvas. Coordinates are deliberately off-grid
  // (123, 87) → (251, 213); with size=20 they should round to multiples of 20.
  const canvas = page.locator("canvas").first()
  await canvas.hover({ position: { x: 123, y: 87 } })
  await page.mouse.down()
  await page.mouse.move(251, 213)
  await page.mouse.up()

  // Read the resulting element from the scene via a window-exposed debug accessor.
  // If the project exposes elements differently, replace this evaluator accordingly.
  const elements = await page.evaluate(() => {
    interface DebugWindow extends Window {
      __SCENE__?: {
        getElements: () => readonly {
          x: number
          y: number
          width: number
          height: number
          type: string
        }[]
      }
    }
    return (window as DebugWindow).__SCENE__?.getElements() ?? []
  })

  const rect = elements.find((e) => e.type === "rectangle")
  expect(rect).toBeDefined()
  if (rect) {
    expect(rect.x % 20).toBe(0)
    expect(rect.y % 20).toBe(0)
    expect(rect.width % 20).toBe(0)
    expect(rect.height % 20).toBe(0)
  }
})
```

**Note:** the scene-accessor in `page.evaluate` is approximate. If `apps/web/e2e/library.spec.ts` uses a different pattern (e.g., `window.__APP_STORE__.getState().scene`), copy that pattern exactly.

- [ ] **Step 3: Run the spec**

Run: `cd apps/web && pnpm test:e2e -- snap-to-grid.spec.ts`
Expected: PASS.

If it fails because the scene global isn't exposed under the expected name, inspect what the library spec uses and align — do not invent a new debug surface.

- [ ] **Step 4: Commit**

```bash
git add apps/web/e2e/snap-to-grid.spec.ts
git commit -m "$(cat <<'EOF'
web: playwright e2e for snap-to-grid happy path

Enables grid via shortcut, draws a rectangle from off-grid pointer
positions, asserts the persisted element's bounds are on grid
multiples. Covers shortcut → driver → reducer → scene pipeline.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Final verification gate

**Files:** none (verification only)

- [ ] **Step 1: Run the full unit suite**

```bash
cd packages/geometry && pnpm test -- --run
cd ../tools && pnpm test -- --run
cd ../persistence && pnpm test -- --run
cd ../renderer && pnpm test -- --run
cd ../scene && pnpm test -- --run
cd ../ui && pnpm test -- --run
cd ../../apps/web && pnpm test -- --run
```

Expected: all green.

- [ ] **Step 2: Run typecheck and lint**

```bash
pnpm -w typecheck
pnpm -w lint
```

Expected: no errors.

- [ ] **Step 3: Run all e2e**

```bash
cd apps/web && pnpm test:e2e
```

Expected: all green, including the new `snap-to-grid.spec.ts`.

- [ ] **Step 4: Manual smoke (5 minutes)**

```bash
cd apps/web && pnpm dev
```

Verify in the running app:

1. Press `Cmd/Ctrl+Shift+G` — grid appears.
2. Draw a rectangle — its corners snap to grid intersections during drag.
3. Hold `Cmd/Ctrl` while drawing — snap is bypassed.
4. Select an existing off-grid rectangle, drag it — first move snaps origin to grid, subsequent moves preserve grid alignment.
5. Resize a rectangle by a corner handle — the dragged corner lands on grid lines.
6. Draw a line with Shift held while grid is on — line snaps to 45°, endpoint may be off-grid (expected).
7. Freedraw and eraser — pointer is NOT snapped (verify by switching to freedraw and drawing — stroke should track raw pointer).
8. Press `?` — Help dialog shows the "Bypass snap" row.

- [ ] **Step 5: No commit — this task is a gate.**

If all four sub-steps pass, the feature is complete. If anything fails, return to the failing task, fix, and re-run from step 1.
