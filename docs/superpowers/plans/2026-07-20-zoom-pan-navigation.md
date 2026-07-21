# Zoom & Pan Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement viewport navigation end-to-end: wheel-pan, Ctrl/Cmd+wheel zoom anchored at the cursor, Space+drag pan, the three zoom keyboard shortcuts already documented (but unwired) in the Help dialog, and a zoom indicator/control widget.

**Architecture:** A pure `zoomToPoint` function in `packages/geometry` solves for the scroll offset that keeps a given viewport anchor point fixed on screen at a new (clamped) zoom level. A pure `applyWheel` helper in `apps/web/src/driver/events.ts` translates a native wheel event into a new `ViewTransform` using `zoomToPoint`. `useDrawingDriver.ts` wires a wheel listener plus Space-held pan-dragging directly against the Zustand store, bypassing the tool-reducer system (same bypass pattern theme/grid changes already use). `shortcuts.ts` gets the three keyboard shortcuts, and `App.tsx` gets a small zoom-percentage widget. No renderer changes — it already reacts to `scrollX`/`scrollY`/`zoom` changes.

**Tech Stack:** TypeScript monorepo (pnpm + turbo), vitest, Playwright, Zustand, react-i18next.

## Global Constraints

- `ZOOM_MIN = 0.1` (10%), `ZOOM_MAX = 5` (500%) — exact values, defined once in `packages/geometry` and reused everywhere (button steps, keyboard shortcuts, wheel).
- Zoom step factor is `1.1` for keyboard shortcuts and UI buttons; wheel zoom factor is `1.04 ** -deltaY` (continuous, matches trackpad/mouse wheel granularity).
- Anchor point for keyboard-shortcut and button zoom actions is the browser viewport center (`window.innerWidth / 2`, `window.innerHeight / 2`) — the canvas fills the full viewport (`h-screen w-screen`), so this is equivalent to canvas-center without needing a canvas ref in `shortcuts.ts`/`App.tsx`.
- `scrollX`/`scrollY`/`zoom` are **not** persisted across reload in this pass — matches current behavior (nothing view-related is saved today).
- RTK: `>/dev/null 2>&1 && echo PASS || echo FAIL`; `rtk proxy` for details. Lint from repo root. Commits: `<package>: <what>` + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- jsdom in this repo's vitest environment defaults to `window.innerWidth = 1024`, `window.innerHeight = 768` — test assertions involving the viewport-center anchor use `(512, 384)`.

---

### Task 1: geometry — `zoomToPoint` + zoom bounds

**Files:**

- Modify: `packages/geometry/src/transform.ts`, `packages/geometry/src/index.ts`
- Test: `packages/geometry/test/transform.test.ts` (extend)

**Interfaces (Tasks 2–5 rely on):**

- `ZOOM_MIN = 0.1`, `ZOOM_MAX = 5` — exported constants.
- `zoomToPoint(view: ViewTransform, anchor: Point, targetZoom: number): ViewTransform` — clamps `targetZoom` to `[ZOOM_MIN, ZOOM_MAX]`, returns a new `ViewTransform` whose `scrollX`/`scrollY` keep the scene point currently under `anchor` (in viewport space) fixed at `anchor` after the zoom change.

- [ ] **Step 1: Write failing tests** — append to `packages/geometry/test/transform.test.ts` (add `zoomToPoint`, `ZOOM_MIN`, `ZOOM_MAX` to the existing top import from `"../src"`):

```ts
describe("zoomToPoint", () => {
  it("keeps the anchor's scene point fixed on screen when zooming in", () => {
    const view: ViewTransform = { scrollX: 0, scrollY: 0, zoom: 1 }
    const anchor: Point = { x: 100, y: 50 }
    const scenePointBefore = viewportToScene(anchor, view)
    const next = zoomToPoint(view, anchor, 2)
    expect(next.zoom).toBe(2)
    expectClose(sceneToViewport(scenePointBefore, next), anchor)
  })

  it("keeps the anchor's scene point fixed on screen when zooming out", () => {
    const view: ViewTransform = { scrollX: 7, scrollY: -3, zoom: 2 }
    const anchor: Point = { x: 40, y: 30 }
    const scenePointBefore = viewportToScene(anchor, view)
    const next = zoomToPoint(view, anchor, 0.5)
    expect(next.zoom).toBe(0.5)
    expectClose(sceneToViewport(scenePointBefore, next), anchor)
  })

  it("is a no-op on scroll when targetZoom equals the current zoom", () => {
    const view: ViewTransform = { scrollX: 5, scrollY: 3, zoom: 2 }
    const anchor: Point = { x: 12, y: 8 }
    const next = zoomToPoint(view, anchor, 2)
    expect(next.zoom).toBe(2)
    expectClose({ x: next.scrollX, y: next.scrollY }, { x: view.scrollX, y: view.scrollY })
  })

  it("clamps to ZOOM_MAX and still anchors at the clamped zoom", () => {
    const view: ViewTransform = { scrollX: 0, scrollY: 0, zoom: 1 }
    const anchor: Point = { x: 10, y: 10 }
    const scenePointBefore = viewportToScene(anchor, view)
    const next = zoomToPoint(view, anchor, 999)
    expect(next.zoom).toBe(ZOOM_MAX)
    expectClose(sceneToViewport(scenePointBefore, next), anchor)
  })

  it("clamps to ZOOM_MIN", () => {
    const view: ViewTransform = { scrollX: 0, scrollY: 0, zoom: 1 }
    const anchor: Point = { x: 10, y: 10 }
    const next = zoomToPoint(view, anchor, 0.0001)
    expect(next.zoom).toBe(ZOOM_MIN)
  })
})
```

Update the file's top import to:

```ts
import { sceneToViewport, viewportToScene, zoomToPoint, ZOOM_MIN, ZOOM_MAX } from "../src"
```

- [ ] **Step 2: Run to verify failure**

Run: `cd packages/geometry && pnpm vitest run test/transform.test.ts`
Expected: FAIL — `zoomToPoint`/`ZOOM_MIN`/`ZOOM_MAX` are not exported from `"../src"`.

- [ ] **Step 3: Implement** — append to `packages/geometry/src/transform.ts`:

```ts
export const ZOOM_MIN = 0.1
export const ZOOM_MAX = 5

export const zoomToPoint = (
  view: ViewTransform,
  anchor: Point,
  targetZoom: number,
): ViewTransform => {
  const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, targetZoom))
  const scenePoint = viewportToScene(anchor, view)
  return {
    zoom,
    scrollX: anchor.x / zoom - scenePoint.x,
    scrollY: anchor.y / zoom - scenePoint.y,
  }
}
```

In `packages/geometry/src/index.ts`, change:

```ts
export { sceneToViewport, viewportToScene } from "./transform"
```

to:

```ts
export { sceneToViewport, viewportToScene, zoomToPoint, ZOOM_MIN, ZOOM_MAX } from "./transform"
```

- [ ] **Step 4: Run to verify green**

Run: `cd packages/geometry && pnpm vitest run && pnpm exec tsc --noEmit`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/geometry
git commit -m "geometry: zoomToPoint — cursor-anchored zoom with clamped bounds"
```

---

### Task 2: web driver — `applyWheel` pure helper

**Files:**

- Modify: `apps/web/src/driver/events.ts`
- Test: `apps/web/test/events-wheel.test.ts` (create)

**Interfaces:**

- Consumes: `zoomToPoint` (Task 1), `ViewTransform`/`Point` from `@excalidraw-clone/geometry`.
- Produces: `applyWheel(canvas: HTMLCanvasElement, view: ViewTransform, e: WheelInput): ViewTransform` and the `WheelInput` interface (`{ clientX, clientY, deltaX, deltaY, ctrlKey }`) — Task 3 calls this directly from a real `WheelEvent` (which structurally satisfies `WheelInput`).

- [ ] **Step 1: Write failing tests** — create `apps/web/test/events-wheel.test.ts`:

```ts
import {
  sceneToViewport,
  viewportToScene,
  ZOOM_MAX,
  type ViewTransform,
} from "@excalidraw-clone/geometry"
import { describe, expect, it } from "vitest"
import { applyWheel } from "../src/driver/events"

const fakeCanvas = (rect: { left: number; top: number }): HTMLCanvasElement =>
  ({
    getBoundingClientRect: () =>
      ({
        left: rect.left,
        top: rect.top,
        right: 0,
        bottom: 0,
        width: 0,
        height: 0,
        x: rect.left,
        y: rect.top,
        toJSON: () => "",
      }) as DOMRect,
  }) as unknown as HTMLCanvasElement

describe("applyWheel", () => {
  it("plain wheel pans without changing zoom", () => {
    const canvas = fakeCanvas({ left: 0, top: 0 })
    const view: ViewTransform = { scrollX: 0, scrollY: 0, zoom: 2 }
    const next = applyWheel(canvas, view, {
      clientX: 0,
      clientY: 0,
      deltaX: 10,
      deltaY: 20,
      ctrlKey: false,
    })
    expect(next).toEqual({ scrollX: -5, scrollY: -10, zoom: 2 })
  })

  it("ctrl+wheel zoom keeps the cursor's scene point fixed, accounting for canvas offset", () => {
    const canvas = fakeCanvas({ left: 100, top: 40 })
    const view: ViewTransform = { scrollX: 3, scrollY: -2, zoom: 1 }
    const anchorLocal = { x: 50, y: 50 } // clientX/Y (150,90) minus the (100,40) canvas offset
    const scenePointBefore = viewportToScene(anchorLocal, view)
    const next = applyWheel(canvas, view, {
      clientX: 150,
      clientY: 90,
      deltaX: 0,
      deltaY: -10,
      ctrlKey: true,
    })
    expect(next.zoom).toBeGreaterThan(1)
    const backToViewport = sceneToViewport(scenePointBefore, next)
    expect(backToViewport.x).toBeCloseTo(anchorLocal.x)
    expect(backToViewport.y).toBeCloseTo(anchorLocal.y)
  })

  it("ctrl+wheel with a positive deltaY zooms out", () => {
    const canvas = fakeCanvas({ left: 0, top: 0 })
    const view: ViewTransform = { scrollX: 0, scrollY: 0, zoom: 1 }
    const next = applyWheel(canvas, view, {
      clientX: 50,
      clientY: 50,
      deltaX: 0,
      deltaY: 10,
      ctrlKey: true,
    })
    expect(next.zoom).toBeLessThan(1)
  })

  it("clamps zoom at ZOOM_MAX for a large negative deltaY", () => {
    const canvas = fakeCanvas({ left: 0, top: 0 })
    const view: ViewTransform = { scrollX: 0, scrollY: 0, zoom: 1 }
    const next = applyWheel(canvas, view, {
      clientX: 0,
      clientY: 0,
      deltaX: 0,
      deltaY: -1000,
      ctrlKey: true,
    })
    expect(next.zoom).toBe(ZOOM_MAX)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/web && pnpm vitest run test/events-wheel.test.ts`
Expected: FAIL — `applyWheel` is not exported from `../src/driver/events`.

- [ ] **Step 3: Implement** — in `apps/web/src/driver/events.ts`, change the top import from `@excalidraw-clone/geometry` to include `zoomToPoint`:

```ts
import {
  snapPointToGrid,
  zoomToPoint,
  type GridSnap,
  type Point,
  type ViewTransform,
} from "@excalidraw-clone/geometry"
```

Append at the end of the file:

```ts
export interface WheelInput {
  clientX: number
  clientY: number
  deltaX: number
  deltaY: number
  ctrlKey: boolean
}

export function applyWheel(
  canvas: HTMLCanvasElement,
  view: ViewTransform,
  e: WheelInput,
): ViewTransform {
  if (e.ctrlKey) {
    const rect = canvas.getBoundingClientRect()
    const anchor: Point = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    const factor = 1.04 ** -e.deltaY
    return zoomToPoint(view, anchor, view.zoom * factor)
  }
  return {
    scrollX: view.scrollX - e.deltaX / view.zoom,
    scrollY: view.scrollY - e.deltaY / view.zoom,
    zoom: view.zoom,
  }
}
```

- [ ] **Step 4: Run to verify green**

Run: `cd apps/web && pnpm vitest run test/events-wheel.test.ts && pnpm exec tsc --noEmit`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/driver/events.ts apps/web/test/events-wheel.test.ts
git commit -m "web: applyWheel — pure wheel-to-viewtransform helper (pan + ctrl-zoom)"
```

---

### Task 3: web driver — wire wheel + Space-drag pan into `useDrawingDriver`

**Files:**

- Modify: `apps/web/src/driver/useDrawingDriver.ts`

**Interfaces:**

- Consumes: `applyWheel` (Task 2), existing `useAppStore` (`scrollX`, `scrollY`, `zoom`, `setView`).
- Produces: behavior only — canvas responds to wheel (pan/ctrl-zoom) and Space+drag (pan). No new exports; Task 6's e2e spec is the only coverage for this task, consistent with how the rest of this file's pointer-dispatch wiring is untested at the unit level (DOM/pointer-capture behavior isn't practically unit-testable here; e2e is where the codebase already covers it — see e.g. `arrow-binding.spec.ts` covering `dispatchPointer` wiring).

- [ ] **Step 1: Add refs** — in `apps/web/src/driver/useDrawingDriver.ts`, right after the existing `const rendererRef = useRef<CanvasRenderer | null>(null)` line, add:

```ts
const spaceHeldRef = useRef(false)
const panDragRef = useRef<{
  startClientX: number
  startClientY: number
  startScrollX: number
  startScrollY: number
} | null>(null)
```

- [ ] **Step 2: Update the `./events` import** to include `applyWheel`:

```ts
import {
  applyWheel,
  clientToScene,
  modifiersOf,
  pointerEventToToolEvent,
  snapScenePoint,
} from "./events"
```

- [ ] **Step 3: Add wheel + Space-hold handlers** — inside the main `useEffect`, immediately before the existing `const onPointerDown = (e: PointerEvent): void => {` line, add:

```ts
const onWheel = (e: WheelEvent): void => {
  e.preventDefault()
  const store = useAppStore.getState()
  const next = applyWheel(
    canvas,
    { scrollX: store.scrollX, scrollY: store.scrollY, zoom: store.zoom },
    e,
  )
  store.setView(next)
}

const isTypingTarget = (t: EventTarget | null): boolean => {
  const el = t as HTMLElement | null
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)
}

const onKeyDown = (e: KeyboardEvent): void => {
  if (e.code !== "Space" || isTypingTarget(e.target) || spaceHeldRef.current) return
  spaceHeldRef.current = true
  if (!panDragRef.current) canvas.style.cursor = "grab"
}

const onKeyUp = (e: KeyboardEvent): void => {
  if (e.code !== "Space") return
  spaceHeldRef.current = false
  panDragRef.current = null
  canvas.style.cursor = ""
}
```

- [ ] **Step 4: Short-circuit pointer handlers for Space-drag panning** — replace the existing `onPointerDown`, `onPointerMove`, `onPointerUp` definitions with these complete versions (new logic is the leading block in each; everything after it is the original body, unchanged):

```ts
const onPointerDown = (e: PointerEvent): void => {
  if (spaceHeldRef.current) {
    canvas.setPointerCapture(e.pointerId)
    const store = useAppStore.getState()
    panDragRef.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      startScrollX: store.scrollX,
      startScrollY: store.scrollY,
    }
    canvas.style.cursor = "grabbing"
    return
  }
  const store = useAppStore.getState()
  const pending = store.pendingItem
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
  canvas.setPointerCapture(e.pointerId)
  dispatchPointer("pointerDown", e)
}
const onPointerMove = (e: PointerEvent): void => {
  const drag = panDragRef.current
  if (drag) {
    const store = useAppStore.getState()
    const dx = (e.clientX - drag.startClientX) / store.zoom
    const dy = (e.clientY - drag.startClientY) / store.zoom
    store.setView({
      scrollX: drag.startScrollX + dx,
      scrollY: drag.startScrollY + dy,
      zoom: store.zoom,
    })
    return
  }
  const store = useAppStore.getState()
  const pending = store.pendingItem
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
  dispatchPointer("pointerMove", e)
}
const onPointerUp = (e: PointerEvent): void => {
  if (panDragRef.current) {
    panDragRef.current = null
    canvas.releasePointerCapture(e.pointerId)
    canvas.style.cursor = spaceHeldRef.current ? "grab" : ""
    return
  }
  if (useAppStore.getState().pendingItem) return
  canvas.releasePointerCapture(e.pointerId)
  dispatchPointer("pointerUp", e)
}
```

- [ ] **Step 5: Register/clean up the new listeners** — add to the existing `canvas.addEventListener(...)` block:

```ts
canvas.addEventListener("pointerdown", onPointerDown)
canvas.addEventListener("pointermove", onPointerMove)
canvas.addEventListener("pointerup", onPointerUp)
canvas.addEventListener("dblclick", onDoubleClick)
canvas.addEventListener("wheel", onWheel, { passive: false })
window.addEventListener("keydown", onKeyDown)
window.addEventListener("keyup", onKeyUp)
```

And to the effect's cleanup function:

```ts
return () => {
  canvas.removeEventListener("pointerdown", onPointerDown)
  canvas.removeEventListener("pointermove", onPointerMove)
  canvas.removeEventListener("pointerup", onPointerUp)
  canvas.removeEventListener("dblclick", onDoubleClick)
  canvas.removeEventListener("wheel", onWheel)
  window.removeEventListener("keydown", onKeyDown)
  window.removeEventListener("keyup", onKeyUp)
  useAppStore.getState().setDispatchToolEvent(null)
  unsubStore()
  renderer.stop()
  rendererRef.current = null
  onTeardown?.()
}
```

- [ ] **Step 6: Typecheck** (no unit test for this task — see Interfaces note above)

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/driver/useDrawingDriver.ts
git commit -m "web: wheel pan/zoom + Space-drag pan wired into the drawing driver"
```

---

### Task 4: web keyboard — Ctrl/Cmd+0/+/- zoom shortcuts

**Files:**

- Modify: `apps/web/src/keyboard/shortcuts.ts`
- Test: `apps/web/test/keyboard-shortcuts.test.ts` (extend)

**Interfaces:**

- Consumes: `zoomToPoint`, `ZOOM_MAX` (Task 1); existing `useAppStore` (`scrollX`, `scrollY`, `zoom`, `setView`).
- Produces: behavior only — `Ctrl/Cmd+0` resets zoom to 100%, `Ctrl/Cmd++`/`Ctrl/Cmd+=` zooms in one step (×1.1), `Ctrl/Cmd+-` zooms out one step, all anchored at the viewport center (`window.innerWidth/2, window.innerHeight/2`).

- [ ] **Step 1: Write failing tests** — append to `apps/web/test/keyboard-shortcuts.test.ts` (add `sceneToViewport`, `viewportToScene`, `ZOOM_MAX` to a new import from `@excalidraw-clone/geometry` at the top of the file):

```ts
import {
  sceneToViewport,
  viewportToScene,
  ZOOM_MAX,
  type ViewTransform,
} from "@excalidraw-clone/geometry"
```

```ts
describe("zoom keyboard shortcuts", () => {
  it("Ctrl+0 resets zoom to 100%, keeping the viewport-center scene point fixed", () => {
    const before: ViewTransform = { scrollX: 40, scrollY: -20, zoom: 2 }
    useAppStore.getState().setView(before)
    const anchor = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
    const scenePointBefore = viewportToScene(anchor, before)
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "0", ctrlKey: true }))
    const after = useAppStore.getState()
    expect(after.zoom).toBe(1)
    const back = sceneToViewport(scenePointBefore, {
      scrollX: after.scrollX,
      scrollY: after.scrollY,
      zoom: after.zoom,
    })
    expect(back.x).toBeCloseTo(anchor.x)
    expect(back.y).toBeCloseTo(anchor.y)
  })

  it("Ctrl++ zooms in by one step", () => {
    useAppStore.getState().setView({ scrollX: 0, scrollY: 0, zoom: 1 })
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "+", ctrlKey: true }))
    expect(useAppStore.getState().zoom).toBeCloseTo(1.1)
  })

  it("Ctrl+- zooms out by one step", () => {
    useAppStore.getState().setView({ scrollX: 0, scrollY: 0, zoom: 1 })
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "-", ctrlKey: true }))
    expect(useAppStore.getState().zoom).toBeCloseTo(1 / 1.1)
  })

  it("Ctrl++ respects ZOOM_MAX", () => {
    useAppStore.getState().setView({ scrollX: 0, scrollY: 0, zoom: ZOOM_MAX })
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "+", ctrlKey: true }))
    expect(useAppStore.getState().zoom).toBe(ZOOM_MAX)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/web && pnpm vitest run test/keyboard-shortcuts.test.ts`
Expected: FAIL — zoom shortcuts not implemented, `useAppStore.getState().zoom` stays `1` (or whatever was set) after each dispatch.

- [ ] **Step 3: Implement** — in `apps/web/src/keyboard/shortcuts.ts`, add `zoomToPoint` to the `@excalidraw-clone/scene` import block's neighboring import (new import line, since `scene` doesn't export it):

```ts
import { zoomToPoint } from "@excalidraw-clone/geometry"
```

Insert right before the existing `if (isMeta && key === "'")` (toggle-grid) block:

```ts
if (isMeta && key === "0") {
  e.preventDefault()
  const s = useAppStore.getState()
  const anchor = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
  s.setView(zoomToPoint({ scrollX: s.scrollX, scrollY: s.scrollY, zoom: s.zoom }, anchor, 1))
  return
}
if (isMeta && (key === "+" || key === "=")) {
  e.preventDefault()
  const s = useAppStore.getState()
  const anchor = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
  s.setView(
    zoomToPoint({ scrollX: s.scrollX, scrollY: s.scrollY, zoom: s.zoom }, anchor, s.zoom * 1.1),
  )
  return
}
if (isMeta && key === "-") {
  e.preventDefault()
  const s = useAppStore.getState()
  const anchor = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
  s.setView(
    zoomToPoint({ scrollX: s.scrollX, scrollY: s.scrollY, zoom: s.zoom }, anchor, s.zoom / 1.1),
  )
  return
}
```

- [ ] **Step 4: Run to verify green**

Run: `cd apps/web && pnpm vitest run test/keyboard-shortcuts.test.ts && pnpm exec tsc --noEmit`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/keyboard/shortcuts.ts apps/web/test/keyboard-shortcuts.test.ts
git commit -m "web: Ctrl/Cmd+0/+/- zoom keyboard shortcuts"
```

---

### Task 5: web UI — zoom percentage widget in `App.tsx`

**Files:**

- Modify: `apps/web/src/components/App.tsx`

**Interfaces:**

- Consumes: `zoomToPoint` (Task 1); existing `useAppStore` (`zoom`, `setView`); existing `shortcuts:zoomIn`/`shortcuts:zoomOut`/`shortcuts:zoomReset` i18n keys (already correct after the HelpDialog i18n fix shipped earlier — reused here for aria-labels, no new locale keys needed).
- Produces: testids `zoom-out`, `zoom-reset`, `zoom-in`. No unit test for this task — App.tsx has no existing unit-test file in this codebase (page-level wiring is e2e-only here); Task 6 covers it.

- [ ] **Step 1: Add the `zoom` selector** — in `apps/web/src/components/App.tsx`, alongside the existing `const zenMode = useAppStore((s) => s.zenMode)` line, add:

```ts
const zoom = useAppStore((s) => s.zoom)
```

- [ ] **Step 2: Add the `zoomToPoint` import** — alongside the existing `@excalidraw-clone/scene` import block, add:

```ts
import { zoomToPoint } from "@excalidraw-clone/geometry"
```

- [ ] **Step 3: Add the widget** — inside the `{!zenMode && (<>...</>)}` block (same visibility as the "unlock all" button), immediately after the `hasLockedElements` unlock-all block and before the closing `</>`:

```tsx
<div className="absolute bottom-3 right-3 z-30 flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-xs shadow">
  <button
    type="button"
    data-testid="zoom-out"
    aria-label={t("shortcuts:zoomOut")}
    onClick={() => {
      const s = useAppStore.getState()
      const anchor = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
      s.setView(
        zoomToPoint({ scrollX: s.scrollX, scrollY: s.scrollY, zoom: s.zoom }, anchor, s.zoom / 1.1),
      )
    }}
    className="rounded px-1.5 py-0.5 hover:bg-gray-100"
  >
    −
  </button>
  <button
    type="button"
    data-testid="zoom-reset"
    aria-label={t("shortcuts:zoomReset")}
    onClick={() => {
      const s = useAppStore.getState()
      const anchor = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
      s.setView(zoomToPoint({ scrollX: s.scrollX, scrollY: s.scrollY, zoom: s.zoom }, anchor, 1))
    }}
    className="min-w-[3.5rem] rounded px-1.5 py-0.5 text-center hover:bg-gray-100"
  >
    {Math.round(zoom * 100)}%
  </button>
  <button
    type="button"
    data-testid="zoom-in"
    aria-label={t("shortcuts:zoomIn")}
    onClick={() => {
      const s = useAppStore.getState()
      const anchor = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
      s.setView(
        zoomToPoint({ scrollX: s.scrollX, scrollY: s.scrollY, zoom: s.zoom }, anchor, s.zoom * 1.1),
      )
    }}
    className="rounded px-1.5 py-0.5 hover:bg-gray-100"
  >
    +
  </button>
</div>
```

- [ ] **Step 4: Typecheck**

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/App.tsx
git commit -m "web: zoom percentage widget (−/reset/+) bottom-right of the canvas"
```

---

### Task 6: e2e + full gate

**Files:**

- Create: `apps/web/e2e/zoom-pan.spec.ts`

**Interfaces:** consumes everything above through the running app.

- [ ] **Step 1: Write the spec** — create `apps/web/e2e/zoom-pan.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test"
import { dragOnCanvas } from "./_helpers"

// Brightest channel value in a region — stroke pixels are jittery (roughjs),
// so scan a box instead of a single coordinate (same pattern as theme.spec.ts).
const maxChannelIn = async (
  page: Page,
  x: number,
  y: number,
  w: number,
  h: number,
): Promise<number> =>
  page.evaluate(
    ([rx, ry, rw, rh]) => {
      const c = document.querySelector("canvas")!
      const ctx = c.getContext("2d")!
      const d = ctx.getImageData(rx!, ry!, rw!, rh!).data
      let max = 0
      for (let i = 0; i < d.length; i += 4) max = Math.max(max, d[i]!, d[i + 1]!, d[i + 2]!)
      return max
    },
    [x, y, w, h],
  )

test("zoom widget and Ctrl+0/+/- shortcuts change the displayed zoom percentage", async ({
  page,
}) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-rectangle"]').waitFor({ state: "visible" })

  const readout = page.locator('[data-testid="zoom-reset"]')
  await expect(readout).toHaveText("100%")

  await page.locator('[data-testid="zoom-in"]').click()
  await expect(readout).toHaveText("110%")

  await page.locator('[data-testid="zoom-out"]').click()
  await expect(readout).toHaveText("100%")

  await page.keyboard.down("Control")
  await page.keyboard.press("+")
  await page.keyboard.up("Control")
  await expect(readout).toHaveText("110%")

  await page.keyboard.down("Control")
  await page.keyboard.press("0")
  await page.keyboard.up("Control")
  await expect(readout).toHaveText("100%")

  await page.keyboard.down("Control")
  await page.keyboard.press("-")
  await page.keyboard.up("Control")
  await expect(readout).not.toHaveText("100%")
})

test("plain wheel pans the canvas; Ctrl+wheel zooms", async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-rectangle"]').click()
  await dragOnCanvas(page, { x: 200, y: 200 }, { x: 260, y: 260 })
  await page.waitForTimeout(200)

  // Rectangle's top border sits near y=200 between x=200..260.
  const before = await maxChannelIn(page, 195, 195, 70, 10)
  expect(before).toBeGreaterThan(50)

  const canvas = page.locator("canvas").first()
  const box = await canvas.boundingBox()
  await page.mouse.move(box!.x + 400, box!.y + 400)
  await page.mouse.wheel(-200, -200)
  await page.waitForTimeout(300)

  const afterPan = await maxChannelIn(page, 195, 195, 70, 10)
  expect(afterPan).toBeLessThan(before)

  await page.keyboard.down("Control")
  await page.mouse.wheel(0, -100)
  await page.keyboard.up("Control")
  await expect(page.locator('[data-testid="zoom-reset"]')).not.toHaveText("100%")
})

test("Space+drag pans the canvas without mutating scene coordinates", async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-rectangle"]').click()
  await dragOnCanvas(page, { x: 200, y: 200 }, { x: 260, y: 260 })
  await page.waitForTimeout(200)

  const before = await maxChannelIn(page, 195, 195, 70, 10)
  expect(before).toBeGreaterThan(50)

  await page.keyboard.down("Space")
  await dragOnCanvas(page, { x: 400, y: 400 }, { x: 300, y: 300 })
  await page.keyboard.up("Space")
  await page.waitForTimeout(300)

  const after = await maxChannelIn(page, 195, 195, 70, 10)
  expect(after).toBeLessThan(before)

  const json = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  const data = JSON.parse(json!) as { elements: { x: number; isDeleted?: boolean }[] }
  const rect = data.elements.find((e) => !e.isDeleted)!
  expect(rect.x).toBe(200) // panning is a viewport transform, not a scene mutation
})
```

- [ ] **Step 2: Run the spec**

Run: `cd apps/web && pnpm exec playwright test e2e/zoom-pan.spec.ts`
Expected: PASS.

- [ ] **Step 3: Full gate**

Run from repo root: `rtk lint`, `pnpm turbo typecheck`, `pnpm turbo test`, then `cd apps/web && pnpm exec playwright test`.
Expected: all PASS (45 e2e: 42 existing + 3 new).

- [ ] **Step 4: Commit**

```bash
git add apps/web/e2e/zoom-pan.spec.ts
git commit -m "web: zoom & pan navigation e2e — wheel, Ctrl+wheel, Space-drag, shortcuts, widget"
```

---

## After all tasks

superpowers:finishing-a-development-branch — FF-merge `develop` → `main`, push both, record memory.
