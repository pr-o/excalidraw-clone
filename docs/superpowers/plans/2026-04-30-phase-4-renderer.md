# Phase 4: `@excalidraw-clone/renderer` Implementation Plan

> Inline execution. Each task ends with a commit on `develop`. TDD-style: failing test first, then implementation.

**Goal:** Build the canvas rendering pipeline. A single `<canvas>` (plus a second overlay canvas for selection chrome) that subscribes to scene + viewport changes, redraws on rAF when dirty, and draws every element type via rough.js. **Zero React.**

**Spec reference:** `docs/superpowers/specs/2026-04-28-excalidraw-clone-design.md` § 5 (rendering pipeline), § 4 (renderer may import only `geometry` + `scene`), § 11 (Vitest + jsdom for renderer tests, snapshot-style on draw call sequences), § 12 step 4 (build order: rectangles → other shapes → zoom/pan → selection overlay).

**Working branch:** `develop`. Every task ends with a commit.

**New runtime deps:**

- `roughjs@^4.6.6` — hand-drawn path generation. `roughjs/bin/canvas` for the rendering helper.
- `points-on-curve@^1.x` is already a transitive dep of rough; no separate install.

**Testing approach:**

We don't ship a real `<canvas>` in node. Each test uses a hand-rolled `MockCanvas` that returns a recording 2D context (every method call appended to an array, every property assignment recorded). Assertions are over the recorded call list — order, count, key arguments. This is enough to verify:

- Background fill happens before element draws.
- Element draws happen in scene array order (z-order).
- `setTransform` is called with the expected zoom/scroll values.
- Selection overlay draws into the overlay canvas, not the main canvas.

For rough.js: we don't snapshot the exact stroke geometry (it's seeded-random). We assert that for each element, `roughCanvas.draw` was called the expected number of times and that the element's `versionNonce` was used as the cache key.

**Out of scope (deferred):**

- **Image element rendering** — needs file binary plumbing from `persistence` (Phase 6). The renderer will skip `type: "image"` for now (no-op + a console.warn-free path) and gain rendering once Phase 6 lands a `getFileImage(fileId): HTMLImageElement | null` resolver hook. The hook shape is reserved here.
- **Tile cache** for the static layer — only added if Phase 8 perf testing shows pain (per spec § 5).
- **Editing chrome** for text (cursor, IME) — that's the text tool's job in Phase 5.
- **Pointer event wiring** — Phase 5 (`tools`) installs the listeners.
- **Light/dark theme tokens beyond background + foreground stroke**. Full theme palette comes with `ui` in Phase 7.

---

## Task 1: Renderer skeleton — canvas wiring, rAF loop, theme + background

Build `CanvasRenderer` with: ctor, `start` / `stop`, scene subscription, dirty-flagging, rAF batching. No element drawing yet — just clear + background fill.

**Files:**

- Create: `packages/renderer/src/renderer.ts`
- Create: `packages/renderer/src/types.ts`
- Create: `packages/renderer/src/test-utils/mock-canvas.ts`
- Modify: `packages/renderer/src/index.ts`
- Create: `packages/renderer/test/renderer-skeleton.test.ts`
- Modify: `packages/renderer/package.json` (add roughjs)
- Modify: `packages/renderer/vitest.config.ts` (set environment: jsdom)

**Public surface (the renderer's contract for v1):**

```ts
import type { Scene } from "@excalidraw-clone/scene"
import type { ViewTransform } from "@excalidraw-clone/geometry"

export type Theme = "light" | "dark"

export interface GridOptions {
  enabled: boolean
  size: number // in scene units
}

export interface CanvasRendererOptions {
  /** Optional second canvas for selection overlay. If omitted, selection chrome is drawn on the main canvas. */
  overlayCanvas?: HTMLCanvasElement
  /** Initial view transform (default identity). */
  viewTransform?: ViewTransform
  /** Initial theme (default "light"). */
  theme?: Theme
  /** Initial selection ids. */
  selection?: readonly string[]
  /** Initial grid (default disabled). */
  grid?: GridOptions
}

export class CanvasRenderer {
  constructor(canvas: HTMLCanvasElement, scene: Scene, options?: CanvasRendererOptions)
  start(): void
  stop(): void
  setViewTransform(t: ViewTransform): void
  setTheme(theme: Theme): void
  setSelection(ids: readonly string[]): void
  setGrid(opts: GridOptions): void
  /** Force a redraw on the next animation frame. Idempotent within a frame. */
  requestRedraw(): void
}
```

**Internals:**

- `requestRedraw()` sets `this.dirty = true` and, if no frame is pending, calls `requestAnimationFrame(this.render)`.
- `render()` (the rAF callback) clears the canvas, applies the view transform, fills the background per theme, then iterates `scene.getElements()` (deferred to Task 2). After Task 1, the iteration is empty so the canvas is just a solid background.
- `start()` subscribes to scene changes via `scene.subscribe(() => this.requestRedraw())` and triggers an initial redraw. Returns a stored unsubscribe; `stop()` calls it.
- `setViewTransform` / `setTheme` / `setSelection` / `setGrid` each store the new value and call `requestRedraw()`.
- A `seededVersion` counter is bumped on every external setter so listeners can detect "I scheduled but the rAF hasn't fired yet"; this is internal, not exposed.

**MockCanvas test util:**

```ts
// packages/renderer/src/test-utils/mock-canvas.ts
export interface RecordedCall {
  method: string
  args: readonly unknown[]
}

export interface MockCanvasContext extends Partial<CanvasRenderingContext2D> {
  __calls: RecordedCall[]
  __props: Record<string, unknown>
}

export const createMockCanvas = (
  width = 800,
  height = 600,
): { canvas: HTMLCanvasElement; ctx: MockCanvasContext }
```

The mock context records every method invocation and every property assignment. It returns sentinel values for things like `measureText` (a fixed `{ width: 50 }`).

**Tests:**

- Constructor stores the canvas + scene; doesn't paint anything until `start()`.
- `start()` triggers exactly one `requestAnimationFrame` (use `vi.useFakeTimers()` + `vi.advanceTimersByTime` on the polyfill, or stub `requestAnimationFrame` directly).
- After the rAF fires: `clearRect` (or equivalent) is called once and `fillRect` is called for the background; light theme uses `#ffffff`, dark uses `#121212`.
- Two `requestRedraw()` calls before the next frame → still only one rAF callback runs (dirty-flag coalesces).
- `setTheme`, `setViewTransform`, `setSelection`, `setGrid` each schedule a redraw.
- `stop()` unsubscribes from the scene; subsequent `scene.mutate` calls do not schedule a redraw.
- `requestRedraw()` after `stop()` is a no-op.

```bash
git add packages/renderer
git commit -m "Phase 4.1: renderer skeleton (rAF loop, background fill, theme)"
```

---

## Task 2: Shape cache + rectangle rendering

Add the rough.js bridge. Per-element drawables are computed once and cached on a `WeakMap<ExcalidrawElement, ShapeCacheEntry>` keyed by element identity, invalidated via `versionNonce`. Draw rectangles only.

**Files:**

- Create: `packages/renderer/src/shape-cache.ts`
- Create: `packages/renderer/src/shapes/rectangle.ts`
- Create: `packages/renderer/src/shapes/index.ts`
- Modify: `packages/renderer/src/renderer.ts` (call `drawElement` per element)
- Create: `packages/renderer/src/draw-element.ts`
- Create: `packages/renderer/test/shape-cache.test.ts`
- Create: `packages/renderer/test/shapes-rectangle.test.ts`
- Create: `packages/renderer/test/renderer-elements.test.ts`

**ShapeCache contract:**

```ts
import type { ExcalidrawElement } from "@excalidraw-clone/scene"
import type { Drawable } from "roughjs/bin/core"
import type { RoughGenerator } from "roughjs/bin/generator"

interface ShapeCacheEntry {
  versionNonce: number
  drawables: readonly Drawable[]
}

export class ShapeCache {
  private cache = new WeakMap<ExcalidrawElement, ShapeCacheEntry>()
  get(element: ExcalidrawElement, generator: RoughGenerator): readonly Drawable[]
  /** For tests / explicit invalidation. */
  clear(): void
}
```

`get()` checks the cached entry. If `entry.versionNonce === element.versionNonce`, return cached drawables. Otherwise call `getShape(element, generator)`, cache, return. Because elements are immutable (Phase 3.6 structural sharing), a new object identity guarantees a cache miss; the `versionNonce` check is a belt-and-suspenders for in-place edits.

**Per-type shape generator:**

```ts
// shapes/rectangle.ts
export const rectangleShape = (
  e: ExcalidrawRectangleElement,
  gen: RoughGenerator,
): readonly Drawable[] => {
  return [
    gen.rectangle(0, 0, e.width, e.height, {
      stroke: e.strokeColor,
      strokeWidth: e.strokeWidth,
      fill: e.backgroundColor === "transparent" ? undefined : e.backgroundColor,
      fillStyle: e.fillStyle,
      roughness: e.roughness,
      seed: e.seed,
    }),
  ]
}
```

**drawElement contract:**

`drawElement(ctx, element, roughCanvas, cache, gen)` translates to `(element.x, element.y)`, applies rotation around the element center, fetches drawables from the cache, calls `roughCanvas.draw(d)` for each, then restores. Skips `isDeleted`. Skips `type: "image"` (deferred).

**Tests:**

- `ShapeCache.get` returns the same Drawable array for two consecutive calls with the same element identity.
- After mutating `versionNonce` (via a new object), the next `get` produces a fresh entry.
- `rectangleShape` includes the element's `seed`, `strokeColor`, and `strokeWidth` in the rough options (assert via spying on `gen.rectangle`).
- `transparent` background is passed as `undefined` fill (not literally the string).
- Renderer calls `roughCanvas.draw` for each non-deleted rectangle in scene array order.
- Deleted rectangles are skipped.
- Image elements don't throw (silently skipped).

```bash
git commit -m "Phase 4.2: shape cache + rectangle rendering"
```

---

## Task 3: Ellipse / diamond / line / arrow shapes

Add four more shape generators. Diamond uses `gen.polygon` with the four mid-edge points. Line and arrow use `gen.linearPath` (or `gen.curve` if smooth) over the polyline. Arrow additionally renders the end arrowhead glyph.

**Files:**

- Create: `packages/renderer/src/shapes/ellipse.ts`
- Create: `packages/renderer/src/shapes/diamond.ts`
- Create: `packages/renderer/src/shapes/line.ts`
- Create: `packages/renderer/src/shapes/arrow.ts`
- Modify: `packages/renderer/src/shapes/index.ts` (dispatch by `element.type`)
- Create: `packages/renderer/test/shapes-others.test.ts`
- Modify: `packages/renderer/test/renderer-elements.test.ts` (mixed-type scene)

**Arrowhead detail:**

For v1, only end arrowhead (default `"arrow"`) is rendered. Start arrowhead support is plumbed (the call exists, the data is read) but only `"arrow"` style is implemented; other arrowhead literals fall back to "arrow". Full arrowhead variety lands later (it's cosmetic).

Arrow geometry: take the last two polyline points, compute the direction vector, draw two short angled segments off the tip.

**Tests:**

- Ellipse: `gen.ellipse` called with width / height, seed, stroke, fill (transparent → undefined).
- Diamond: `gen.polygon` called with the 4 corner points (centered on AABB).
- Line: `gen.linearPath` called once for the polyline; empty-points line skipped.
- Arrow: same `gen.linearPath` plus 1–2 arrowhead segments at the tip; if `endArrowhead` is null, no arrowhead.
- Each shape passes the element's `seed` (rough determinism).

```bash
git commit -m "Phase 4.3: ellipse / diamond / line / arrow shape generators"
```

---

## Task 4: Freedraw + text rendering

Freedraw is a smoothed polyline via rough's `gen.curve`. Text uses the canvas 2D `fillText` API directly (no rough.js — handwritten fonts come from the loaded `font-family`).

**Files:**

- Create: `packages/renderer/src/shapes/freedraw.ts`
- Create: `packages/renderer/src/shapes/text.ts`
- Create: `packages/renderer/src/text-metrics.ts`
- Modify: `packages/renderer/src/shapes/index.ts`
- Create: `packages/renderer/test/shapes-freedraw.test.ts`
- Create: `packages/renderer/test/shapes-text.test.ts`

**Text rendering:**

Text doesn't go through rough.js. It draws via:

```ts
ctx.font = `${e.fontSize}px ${fontFamilyName(e.fontFamily)}`
ctx.fillStyle = e.strokeColor
ctx.textBaseline = "top"
ctx.textAlign = e.textAlign
for (let i = 0; i < lines.length; i += 1) {
  ctx.fillText(lines[i], xOffset, i * (e.fontSize * e.lineHeight))
}
```

`fontFamilyName(family)`:

| `fontFamily` | Name (CSS family list)                            |
| ------------ | ------------------------------------------------- |
| 1            | `"Caveat", cursive` (proxy for Virgil/Excalifont) |
| 2            | `"Helvetica Neue", Helvetica, Arial, sans-serif`  |
| 3            | `"Cascadia Code", "Courier New", monospace`       |

Multiline text is split on `\n`. Vertical alignment positions the block (`top`/`middle`/`bottom`).

`text-metrics.ts` exports `measureText(ctx, text, fontSpec): { width; height }` — used here and later by the text tool. In tests, a mock metric value is returned via the canvas mock.

**Freedraw:**

Use `gen.curve(points, opts)` with the absolute (origin-relative) point list. If `simulatePressure` is true and `pressures.length === 0`, this is a no-op for v1 — variable-width strokes are deferred. v1 ships uniform-width freedraw.

**Tests:**

- Freedraw with 3+ points calls `gen.curve` with the right point list and seed.
- Freedraw with 0 or 1 point skips drawing.
- Text writes one `fillText` per line.
- `textAlign` is set on the context.
- Empty text is a no-op (no `fillText`).
- Multiline text produces N `fillText` calls.

```bash
git commit -m "Phase 4.4: freedraw + text rendering"
```

---

## Task 5: Viewport transform — zoom + scroll

Wire `viewTransform` into the per-frame `ctx.setTransform`. The matrix per § 3 of the spec: scale `(zoom, zoom)`, translate `(scrollX * zoom, scrollY * zoom)`. After this task, the renderer respects pan and zoom; existing tests adjust to expect the transform call.

**Files:**

- Modify: `packages/renderer/src/renderer.ts`
- Create: `packages/renderer/test/renderer-transform.test.ts`

**Implementation:**

```ts
private applyViewTransform(): void {
  const { scrollX, scrollY, zoom } = this.viewTransform
  this.ctx.setTransform(zoom, 0, 0, zoom, scrollX * zoom, scrollY * zoom)
}
```

`applyViewTransform` is called _after_ clearing and _before_ drawing elements. The background fill is drawn in viewport space (before the transform) so it always covers the canvas regardless of pan/zoom.

**Tests:**

- Identity transform: `setTransform(1, 0, 0, 1, 0, 0)`.
- Zoom 2 + scroll (10, 20): `setTransform(2, 0, 0, 2, 20, 40)`.
- Setting a new transform via `setViewTransform` schedules a redraw and the next frame uses the new matrix.
- `clearRect` is called _before_ `setTransform` (so the background covers regardless of pan/zoom). Asserted via call ordering on the recorded call list.

```bash
git commit -m "Phase 4.5: view transform (zoom + scroll)"
```

---

## Task 6: Selection overlay

Selection chrome (handles, marquee box) draws into the **overlay canvas** if one was provided, or into the main canvas after the elements layer. Overlay is in **viewport coords** so handles don't scale with zoom.

**Files:**

- Create: `packages/renderer/src/overlay.ts`
- Modify: `packages/renderer/src/renderer.ts`
- Create: `packages/renderer/test/overlay.test.ts`

**Overlay contents (v1):**

- One bounding box per selected element (rotated AABB → 4 corner points → polyline).
- 8 resize handles: 4 corners + 4 mid-edge points, drawn as 8x8px filled squares centered on the points.
- 1 rotation handle: positioned 20px above the top-edge midpoint, drawn as a circle.

**Marquee box** (active rectangular selection): drawn when `setMarquee({ start, end })` is called. v1 shape is a 1px dashed border with translucent fill. Setter signature:

```ts
setMarquee(box: { start: Point; end: Point } | null): void
```

**Computation:**

For each `selectedId`, look up the element in `scene.getElements()`, compute its rotated AABB via `getElementBounds`, transform to viewport coords (`sceneToViewport`), and draw.

**Tests:**

- No selection → no overlay draw calls.
- Single rectangle selected → overlay canvas receives one bbox stroke + 8 handle fillRects + 1 rotation handle arc.
- Two selected elements → 2 bboxes + 16 handles + 2 rotation handles.
- Marquee box: dashed `setLineDash([5, 5])` set on context.
- Selection chrome lives on the overlay canvas, not the main canvas. Use two MockCanvases.
- If no overlay canvas was provided in options, the selection chrome draws into the main canvas after element draws (assertion on call ordering).

```bash
git commit -m "Phase 4.6: selection overlay (handles + marquee)"
```

---

## Task 7: Grid layer + final integration

Optional grid drawn between background and elements when `grid.enabled === true`. Grid uses `viewTransform` to compute the spacing of grid lines in viewport space. Plus the final pipeline check.

**Files:**

- Create: `packages/renderer/src/grid.ts`
- Modify: `packages/renderer/src/renderer.ts`
- Create: `packages/renderer/test/grid.test.ts`

**Grid impl:**

Compute the visible scene-coord rect from the canvas size + view transform (inverse). Step by `grid.size` from the rounded floor of the visible rect's `(minX, minY)` to the ceiling of `(maxX, maxY)`. Draw as 1px gray lines (`#dddddd` light, `#2a2a2a` dark).

```ts
private drawGrid(): void {
  if (!this.grid.enabled) return
  const inv = this.invertedTransform()
  const visibleMin = applyMatrix(inv, { x: 0, y: 0 })
  const visibleMax = applyMatrix(inv, { x: this.canvas.width, y: this.canvas.height })
  // ... draw vertical and horizontal lines on this.gridSize step
}
```

**Tests:**

- Grid disabled → no grid stroke calls.
- Grid enabled at zoom 1: number of vertical lines == ceil(canvasWidth / size) + 1.
- Grid lines are 1px and use the theme's grid color.

**Step 2: Final pipeline.**

```bash
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

All exit 0. Renderer adds ~50–80 tests.

**Step 3: Boundary check.**

```bash
pnpm --filter @excalidraw-clone/renderer lint
```

Renderer imports only `@excalidraw-clone/scene`, `@excalidraw-clone/geometry`, and `roughjs`. **No React, no Zustand.**

**Step 4: Push.**

```bash
git push origin develop
```

```bash
git commit -m "Phase 4.7: grid layer + final integration"
```

---

## Done criteria

Phase 4 is complete when:

1. `@excalidraw-clone/renderer` exports `CanvasRenderer`, `Theme`, `GridOptions`, `CanvasRendererOptions`.
2. The renderer subscribes to scene changes and redraws on rAF (dirty-flag coalesced).
3. Shape cache is keyed on element identity + `versionNonce`; per-element shapes are computed once and reused.
4. All v1-relevant element types render: rectangle, ellipse, diamond, line, arrow, freedraw, text, frame. Image type is a documented no-op until Phase 6.
5. View transform (`scrollX`, `scrollY`, `zoom`) is honored; `clearRect` happens before `setTransform`.
6. Selection chrome and marquee draw into the overlay canvas (or main canvas if no overlay was passed) in viewport coords.
7. Grid renders behind elements when enabled.
8. `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` all green.
9. `renderer` only imports `@excalidraw-clone/scene`, `@excalidraw-clone/geometry`, and `roughjs`.
10. All Phase 4 commits land on `origin/develop`.

## Not in Phase 4

- **Image element rendering.** Hooks into Phase 6 once `getFileImage(fileId)` is available.
- **Variable-width freedraw** (pressure-driven). Cosmetic; deferred.
- **Tile cache for the static layer.** Add only if Phase 8 perf testing demands it.
- **Pointer event listeners.** Phase 5 (`tools`).
- **Selection drag/resize/rotate behavior.** Phase 5. The renderer only _draws_ selection chrome based on whatever `selection: string[]` it's told.
- **Theme palette beyond background + grid + foreground stroke.** Phase 7.
- **Frame label rendering** (the small label below a frame). v1 frame is just an outline; label comes with frame tool in Phase 5.
