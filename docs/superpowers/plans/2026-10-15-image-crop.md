# Image Crop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Double-click an image to crop it by dragging edge/corner handles; the crop is non-destructive and honoured by canvas, SVG, PNG and PDF export.

**Architecture:** `ExcalidrawImageElement.crop` (already in the type, unused) becomes a rectangle of _fractions_ of the natural image. Renderer draws/exports the sub-rect. A new pure `crop.ts` in the selection tool computes handle drags; two new selection phases (`cropping`, `cropDragging`) and one new effect (`setCrop`) drive a transient store field `cropElementId` that makes the renderer dim the out-of-crop part of the image.

**Tech Stack:** TypeScript, Vitest (packages), Playwright (apps/web/e2e), zustand store, canvas 2D.

**Spec:** `docs/superpowers/specs/2026-10-15-image-crop-design.md` (amended: fractions instead of natural pixels; no Enter key).

## Global Constraints

- `crop` is `{x, y, width, height}` in fractions 0..1 of the natural image; `null` means uncropped (= `{0,0,1,1}`).
- Element `x/y/width/height` stay the on-canvas box of the visible region; `angle` rotates about the box centre; `mirror` flips about the box centre (draw order: translate, rotate, mirror).
- Minimum cropped box side: 10 scene px (or the current side if smaller).
- Crop-mode state (`cropElementId`) is transient: never persisted, not in Scene.
- One undo step per drag; move effects use `skipHistory: true`, commit effect does not (same pattern as resize).
- Run gate with `pnpm turbo run typecheck lint test`; e2e with `cd apps/web && npx playwright test <spec>`.
- Commits end with `Co-Authored-By: <model that wrote the diff> <noreply@anthropic.com>`.

## Review Focus

- Rotated image cropped from an edge: the opposite edge must stay put in world space (tested in Task 2).
- Mirrored image: dragging the screen-left handle trims the image's _right_ side (tested in Task 2).
- Dragging a handle past the opposite edge / past the image bounds: clamped to min size and to the uncropped image (tested in Task 2).
- Re-cropping an already cropped image can expand back out to the full image but no further (tested in Task 2).
- Escape mid-drag restores box and crop; click-away exits crop mode and still selects/starts the normal gesture (tested in Task 3).
- Cropped image in SVG export has a unique clip id per element (tested in Task 1).

---

## File Structure

- Modify `packages/scene/src/types.ts` — document `crop` semantics.
- Modify `packages/renderer/src/draw-element.ts`, `packages/renderer/src/svg.ts` — honour `crop`.
- Create `packages/renderer/src/crop-overlay.ts` — dim the out-of-crop image area on the overlay canvas.
- Modify `packages/renderer/src/renderer.ts`, `packages/renderer/src/test-utils/mock-canvas.ts` — `setCropElement`, `clip` in mock.
- Create `packages/tools/src/tools/selection/crop.ts` — pure crop math + effects.
- Modify `packages/tools/src/tools/selection/types.ts`, `.../index.ts`, `packages/tools/src/types.ts` — phases, double-click entry, `setCrop` effect.
- Create `apps/web/src/store/slices/crop.ts`; modify `apps/web/src/store/index.ts`, `apps/web/src/driver/effects.ts`, `apps/web/src/driver/useDrawingDriver.ts`.
- Create `apps/web/e2e/image-crop.spec.ts`.

---

### Task 1: Renderer honours `crop` (canvas + SVG)

**Files:**

- Modify: `packages/scene/src/types.ts:169`
- Modify: `packages/renderer/src/draw-element.ts:42-47`
- Modify: `packages/renderer/src/svg.ts:151-157`
- Test: `packages/renderer/test/draw-image.test.ts`, `packages/renderer/test/svg.test.ts`

**Interfaces:**

- Consumes: `ExcalidrawImageElement.crop`.
- Produces: nothing new in the API; later tasks rely on `crop` fractions being rendered.

- [ ] **Step 1: Write the failing tests**

Append inside `describe("drawElement image branch", ...)` in `packages/renderer/test/draw-image.test.ts` (the `loadedImage()` helper has naturalWidth/Height 8):

```ts
it("draws only the cropped sub-rect, scaled to the element box", () => {
  const { ctx, draw } = setup()
  const img = loadedImage()
  const el = {
    ...newImage({ x: 0, y: 0, width: 200, height: 100, fileId: "f1" }),
    crop: { x: 0.25, y: 0.5, width: 0.5, height: 0.5 },
  }
  draw(el, () => img)
  expect(callsOf(ctx, "drawImage")[0]?.args).toEqual([img, 2, 4, 4, 4, 0, 0, 200, 100])
})
```

Append to the `describe` containing the `<image>` tests (near line 25) in `packages/renderer/test/svg.test.ts`:

```ts
it("clips a cropped image and offsets it by the crop fraction", () => {
  const el = {
    ...newImage({ x: 5, y: 6, width: 80, height: 40, fileId: "f1" }),
    crop: { x: 0.25, y: 0.5, width: 0.5, height: 0.5 },
  }
  const files = new Map([["f1", "data:image/png;base64,AAAA"]])
  const svg = renderToSVG(new Scene([el]), { files })
  // kx = 80/0.5 = 160, ky = 40/0.5 = 80 → offset (-40, -40), full size 160x80
  expect(svg).toContain("<clipPath")
  expect(svg).toContain(`clip-path="url(#crop-${el.id})"`)
  expect(svg).toContain('x="-40"')
  expect(svg).toContain('y="-40"')
  expect(svg).toContain('width="160"')
  expect(svg).toContain('height="80"')
})

it("uses a distinct clip id per cropped image", () => {
  const a = {
    ...newImage({ x: 0, y: 0, width: 10, height: 10, fileId: "f1" }),
    crop: { x: 0, y: 0, width: 0.5, height: 0.5 },
  }
  const b = {
    ...newImage({ x: 0, y: 0, width: 10, height: 10, fileId: "f1" }),
    crop: { x: 0, y: 0, width: 0.5, height: 0.5 },
  }
  const files = new Map([["f1", "data:image/png;base64,AAAA"]])
  const svg = renderToSVG(new Scene([a, b]), { files })
  expect(svg).toContain(`id="crop-${a.id}"`)
  expect(svg).toContain(`id="crop-${b.id}"`)
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd packages/renderer && npx vitest run test/draw-image.test.ts test/svg.test.ts`
Expected: the 3 new tests FAIL.

- [ ] **Step 3: Implement**

`packages/scene/src/types.ts` line 169 — replace the field with:

```ts
  /** Visible sub-rect as fractions (0..1) of the natural image; null = uncropped. */
  crop: { x: number; y: number; width: number; height: number } | null
```

`packages/renderer/src/draw-element.ts` — replace the `ctx.drawImage(img, 0, 0, element.width, element.height)` line with:

```ts
const c = element.crop
if (c === null) {
  ctx.drawImage(img, 0, 0, element.width, element.height)
} else {
  const { naturalWidth: nw, naturalHeight: nh } = img
  ctx.drawImage(
    img,
    c.x * nw,
    c.y * nh,
    c.width * nw,
    c.height * nh,
    0,
    0,
    element.width,
    element.height,
  )
}
```

`packages/renderer/src/svg.ts` — replace the image branch body (the single `group.appendChild(svgEl(doc, "image", ...))` line) with:

```ts
const c = el.crop
if (c === null) {
  group.appendChild(svgEl(doc, "image", { href, width: el.width, height: el.height }))
} else {
  const kx = el.width / c.width
  const ky = el.height / c.height
  const clipId = `crop-${el.id}`
  const clip = svgEl(doc, "clipPath", { id: clipId })
  clip.appendChild(svgEl(doc, "rect", { width: el.width, height: el.height }))
  group.appendChild(clip)
  group.appendChild(
    svgEl(doc, "image", {
      href,
      x: -c.x * kx,
      y: -c.y * ky,
      width: kx,
      height: ky,
      preserveAspectRatio: "none",
      "clip-path": `url(#${clipId})`,
    }),
  )
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd packages/renderer && npx vitest run && cd ../.. && pnpm turbo run typecheck lint --filter=@excalidraw-clone/renderer --filter=@excalidraw-clone/scene`
Expected: all PASS, typecheck/lint clean.

- [ ] **Step 5: Commit**

```bash
git add packages/scene/src/types.ts packages/renderer
git commit -m "feat(renderer): honour image crop on canvas and in SVG export"
```

---

### Task 2: Pure crop math and effects

**Files:**

- Create: `packages/tools/src/tools/selection/crop.ts`
- Test: `packages/tools/test/selection-crop.test.ts`

**Interfaces:**

- Consumes: `ResizeHandle` from `./types`, `mirrorOf` and `ExcalidrawImageElement` from `@excalidraw-clone/scene`, `Point` from geometry, `ToolEffect` from `../../types`.
- Produces (exact names later tasks import):
  - `type Crop = { x: number; y: number; width: number; height: number }`, `FULL_CROP: Crop`, `MIN_CROP_SIZE = 10`
  - `interface CropOrigin { x; y; width; height; angle: number; crop: Crop | null; mirror: readonly [number, number] }`
  - `snapshotCrop(e: ExcalidrawImageElement): CropOrigin`
  - `computeCrop(origin: CropOrigin, handle: ResizeHandle, start: Point, at: Point): { x; y; width; height; crop: Crop }`
  - `buildCropMoveEffect(id: string, origin: CropOrigin, handle: ResizeHandle, start: Point, at: Point): ToolEffect`
  - `buildCropCommitEffect(id: string): ToolEffect`
  - `buildCropRevertEffect(id: string, origin: CropOrigin): ToolEffect`

- [ ] **Step 1: Write the failing tests**

Create `packages/tools/test/selection-crop.test.ts`:

```ts
import { newImage } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { computeCrop, type CropOrigin } from "../src/tools/selection/crop"

const origin = (over: Partial<CropOrigin> = {}): CropOrigin => ({
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  angle: 0,
  crop: null,
  mirror: [1, 1],
  ...over,
})
const p = (x: number, y: number) => ({ x, y })

describe("computeCrop", () => {
  it("west handle inward trims the left and moves the box", () => {
    const r = computeCrop(origin(), "w", p(0, 50), p(20, 50))
    expect(r).toEqual({
      x: 20,
      y: 0,
      width: 80,
      height: 100,
      crop: { x: 0.2, y: 0, width: 0.8, height: 1 },
    })
  })

  it("east handle inward trims the right", () => {
    const r = computeCrop(origin(), "e", p(100, 50), p(70, 50))
    expect(r.width).toBe(70)
    expect(r.crop).toEqual({ x: 0, y: 0, width: 0.7, height: 1 })
  })

  it("cannot expand past the uncropped image", () => {
    const r = computeCrop(origin(), "e", p(100, 50), p(150, 50))
    expect(r.width).toBe(100)
    expect(r.crop).toEqual({ x: 0, y: 0, width: 1, height: 1 })
  })

  it("re-crop can expand back out to the full image but no further", () => {
    const cropped = origin({ x: 20, width: 80, crop: { x: 0.2, y: 0, width: 0.8, height: 1 } })
    const r = computeCrop(cropped, "w", p(20, 50), p(-50, 50))
    expect(r.x).toBeCloseTo(0)
    expect(r.width).toBeCloseTo(100)
    expect(r.crop.x).toBeCloseTo(0)
    expect(r.crop.width).toBeCloseTo(1)
  })

  it("clamps to the minimum size instead of crossing the opposite edge", () => {
    const r = computeCrop(origin(), "w", p(0, 50), p(500, 50))
    expect(r.width).toBe(10)
    expect(r.x).toBe(90)
  })

  it("corner handle crops both axes", () => {
    const r = computeCrop(origin(), "nw", p(0, 0), p(10, 30))
    expect(r).toMatchObject({ x: 10, y: 30, width: 90, height: 70 })
    expect(r.crop).toEqual({ x: 0.1, y: 0.3, width: 0.9, height: 0.7 })
  })

  it("rotated: the opposite edge stays fixed in world space", () => {
    // 90deg about centre (50,50): local +x points to scene +y.
    const r = computeCrop(origin({ angle: Math.PI / 2 }), "w", p(0, 50), p(0, 70))
    expect(r.width).toBeCloseTo(80)
    expect(r.height).toBeCloseTo(100)
    expect(r.x).toBeCloseTo(20)
    expect(r.y).toBeCloseTo(10)
  })

  it("mirrored: screen-left handle trims the image's right side", () => {
    const r = computeCrop(origin({ mirror: [-1, 1] }), "w", p(0, 50), p(20, 50))
    expect(r.width).toBe(80)
    expect(r.crop.x).toBeCloseTo(0)
    expect(r.crop.width).toBeCloseTo(0.8)
  })

  it("snapshotCrop-compatible origin works for a real image element", () => {
    const el = newImage({ x: 0, y: 0, width: 100, height: 100, fileId: "f" })
    const r = computeCrop({ ...origin(), crop: el.crop }, "s", p(50, 100), p(50, 60))
    expect(r.crop.height).toBeCloseTo(0.6)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/tools && npx vitest run test/selection-crop.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `packages/tools/src/tools/selection/crop.ts`:

```ts
import type { Point } from "@excalidraw-clone/geometry"
import { mirrorOf, type ExcalidrawImageElement } from "@excalidraw-clone/scene"
import type { ToolEffect } from "../../types"
import type { ResizeHandle } from "./types"

export type Crop = NonNullable<ExcalidrawImageElement["crop"]>
export const FULL_CROP: Crop = { x: 0, y: 0, width: 1, height: 1 }
export const MIN_CROP_SIZE = 10

export interface CropOrigin {
  x: number
  y: number
  width: number
  height: number
  angle: number
  crop: Crop | null
  mirror: readonly [number, number]
}

export const snapshotCrop = (e: ExcalidrawImageElement): CropOrigin => ({
  x: e.x,
  y: e.y,
  width: e.width,
  height: e.height,
  angle: e.angle,
  crop: e.crop,
  mirror: mirrorOf(e),
})

/**
 * One axis of a crop drag, in screen-local px along the box. `moveLo` drags the
 * low (left/top) edge, `moveHi` the high edge. `mirrored` swaps which side of
 * the source image each screen edge trims. Returns the new [lo, hi] span of the
 * box (relative to its old low edge) and the matching crop fractions.
 */
const cropAxis = (
  size: number,
  c0: number,
  cs: number,
  mirrored: boolean,
  moveLo: boolean,
  moveHi: boolean,
  delta: number,
): { lo: number; hi: number; start: number; span: number } => {
  const k = size / cs
  const loRoom = (mirrored ? 1 - c0 - cs : c0) * k
  const hiRoom = (mirrored ? c0 : 1 - c0 - cs) * k
  const min = Math.min(MIN_CROP_SIZE, size)
  let lo = 0
  let hi = size
  if (moveLo) lo = Math.min(Math.max(delta, -loRoom), size - min)
  if (moveHi) hi = Math.max(Math.min(size + delta, size + hiRoom), min)
  return {
    lo,
    hi,
    start: c0 + (mirrored ? size - hi : lo) / k,
    span: (hi - lo) / k,
  }
}

export const computeCrop = (
  origin: CropOrigin,
  handle: ResizeHandle,
  start: Point,
  at: Point,
): { x: number; y: number; width: number; height: number; crop: Crop } => {
  const c0 = origin.crop ?? FULL_CROP
  const cos = Math.cos(origin.angle)
  const sin = Math.sin(origin.angle)
  // Pointer travel in the image's local (unrotated) axes.
  const wx = at.x - start.x
  const wy = at.y - start.y
  const dx = wx * cos + wy * sin
  const dy = -wx * sin + wy * cos
  const xa = cropAxis(
    origin.width,
    c0.x,
    c0.width,
    origin.mirror[0] < 0,
    handle.includes("w"),
    handle.includes("e"),
    dx,
  )
  const ya = cropAxis(
    origin.height,
    c0.y,
    c0.height,
    origin.mirror[1] < 0,
    handle.includes("n"),
    handle.includes("s"),
    dy,
  )
  const width = xa.hi - xa.lo
  const height = ya.hi - ya.lo
  // The box rotates about its own centre, so re-seat it from the new centre to
  // keep the surviving pixels fixed in world space.
  const ox = xa.lo + width / 2 - origin.width / 2
  const oy = ya.lo + height / 2 - origin.height / 2
  const cx = origin.x + origin.width / 2 + ox * cos - oy * sin
  const cy = origin.y + origin.height / 2 + ox * sin + oy * cos
  return {
    x: cx - width / 2,
    y: cy - height / 2,
    width,
    height,
    crop: { x: xa.start, y: ya.start, width: xa.span, height: ya.span },
  }
}

const patchImage =
  (id: string, patch: Partial<ExcalidrawImageElement>) =>
  (draft: { id: string; type: string }[]): void => {
    const i = draft.findIndex((e) => e.id === id)
    const e = draft[i]
    if (i < 0 || !e || e.type !== "image") return
    draft[i] = { ...e, ...patch }
  }

export const buildCropMoveEffect = (
  id: string,
  origin: CropOrigin,
  handle: ResizeHandle,
  start: Point,
  at: Point,
): ToolEffect => ({
  kind: "mutation",
  apply: patchImage(id, computeCrop(origin, handle, start, at)) as never,
  skipHistory: true,
})

export const buildCropCommitEffect = (id: string): ToolEffect => ({
  kind: "mutation",
  apply: patchImage(id, {}) as never,
})

export const buildCropRevertEffect = (id: string, origin: CropOrigin): ToolEffect => ({
  kind: "mutation",
  apply: patchImage(id, {
    x: origin.x,
    y: origin.y,
    width: origin.width,
    height: origin.height,
    crop: origin.crop,
  }) as never,
  skipHistory: true,
})
```

Note for the implementer: the `as never` casts exist only because `SceneMutation` is typed on `ExcalidrawElement[]`; if a cleaner typing is available (e.g. typing `patchImage`'s draft as `ExcalidrawElement[]` and narrowing with `e.type !== "image"`), use it and drop the casts.

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/tools && npx vitest run test/selection-crop.test.ts && cd ../.. && pnpm turbo run typecheck lint --filter=@excalidraw-clone/tools`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/tools
git commit -m "feat(tools): pure crop math for image crop handles"
```

---

### Task 3: Selection phases, double-click entry, `setCrop` effect

**Files:**

- Modify: `packages/tools/src/types.ts` (add effect kind)
- Modify: `packages/tools/src/tools/selection/types.ts` (two phases)
- Modify: `packages/tools/src/tools/selection/index.ts` (double-click entry, two reducers, dispatch switch)
- Test: `packages/tools/test/selection-crop-tool.test.ts`

**Interfaces:**

- Consumes (from Task 2): `snapshotCrop`, `CropOrigin`, `buildCropMoveEffect`, `buildCropCommitEffect`, `buildCropRevertEffect`.
- Produces: `ToolEffect` member `{ kind: "setCrop"; elementId: string | null }`; `SelectionState` members `{ phase: "cropping"; elementId: string }` and `{ phase: "cropDragging"; elementId: string; handle: ResizeHandle; origin: CropOrigin; start: Point }`.

- [ ] **Step 1: Write the failing tests**

Create `packages/tools/test/selection-crop-tool.test.ts`:

```ts
import { newImage, newRectangle, type ExcalidrawElement } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { selectionTool, type SelectionState } from "../src"
import { applyMutation, makeCtx, point } from "./test-utils"

const setup = () => {
  const img = newImage({ x: 0, y: 0, width: 100, height: 100, fileId: "f1" })
  const draft: ExcalidrawElement[] = [img]
  const ctx = makeCtx({ readElements: () => draft, hitTest: () => img, selectedIds: [img.id] })
  return { img, draft, ctx }
}
const enter = (ctx: ReturnType<typeof setup>["ctx"]) =>
  selectionTool.reduce(selectionTool.initial, { type: "doubleClick", at: point(50, 50) }, ctx)

describe("selection — image crop mode", () => {
  it("double-click on an image enters cropping, selects it and emits setCrop", () => {
    const { img, ctx } = setup()
    const [state, effects] = enter(ctx)
    expect(state).toEqual({ phase: "cropping", elementId: img.id })
    expect(effects).toContainEqual({ kind: "select", ids: [img.id] })
    expect(effects).toContainEqual({ kind: "setCrop", elementId: img.id })
  })

  it("double-click on an image with no file does not enter crop", () => {
    const img = newImage({ x: 0, y: 0, width: 100, height: 100 })
    const ctx = makeCtx({ readElements: () => [img], hitTest: () => img })
    const [state] = selectionTool.reduce(
      selectionTool.initial,
      { type: "doubleClick", at: point(5, 5) },
      ctx,
    )
    expect(state.phase).toBe("idle")
  })

  it("pressing a handle in crop mode starts cropDragging and a move crops the image", () => {
    const { img, draft, ctx } = setup()
    let [s] = enter(ctx)
    let effects
    ;[s] = selectionTool.reduce(s, { type: "pointerDown", at: point(0, 50) }, ctx) // west handle
    expect(s.phase).toBe("cropDragging")
    ;[s, effects] = selectionTool.reduce(s, { type: "pointerMove", at: point(20, 50) }, ctx)
    applyMutation(effects, draft)
    const e = draft[0] as typeof img
    expect(e.width).toBe(80)
    expect(e.crop).toEqual({ x: 0.2, y: 0, width: 0.8, height: 1 })
    ;[s] = selectionTool.reduce(s, { type: "pointerUp", at: point(20, 50) }, ctx)
    expect(s).toEqual({ phase: "cropping", elementId: img.id })
  })

  it("escape mid-drag restores box and crop and stays in crop mode", () => {
    const { img, draft, ctx } = setup()
    let [s] = enter(ctx)
    let effects
    ;[s] = selectionTool.reduce(s, { type: "pointerDown", at: point(0, 50) }, ctx)
    ;[s, effects] = selectionTool.reduce(s, { type: "pointerMove", at: point(20, 50) }, ctx)
    applyMutation(effects, draft)
    ;[s, effects] = selectionTool.reduce(s, { type: "escape" }, ctx)
    applyMutation(effects, draft)
    const e = draft[0] as typeof img
    expect(e).toMatchObject({ x: 0, width: 100, crop: null })
    expect(s.phase).toBe("cropping")
  })

  it("escape in crop mode exits and keeps the crop", () => {
    const { ctx } = setup()
    const [s] = enter(ctx)
    const [next, effects] = selectionTool.reduce(s, { type: "escape" }, ctx)
    expect(next.phase).toBe("idle")
    expect(effects).toContainEqual({ kind: "setCrop", elementId: null })
  })

  it("clicking elsewhere exits crop mode and runs the normal idle press", () => {
    const { img } = setup()
    const other = newRectangle({ x: 300, y: 0, width: 50, height: 50 })
    const ctx = makeCtx({
      readElements: () => [img, other],
      hitTest: () => other,
      selectedIds: [img.id],
    })
    const crop: SelectionState = { phase: "cropping", elementId: img.id }
    const [next, effects] = selectionTool.reduce(
      crop,
      { type: "pointerDown", at: point(320, 20) },
      ctx,
    )
    expect(effects).toContainEqual({ kind: "setCrop", elementId: null })
    expect(effects).toContainEqual({ kind: "select", ids: [other.id] })
    expect(next.phase).toBe("dragging")
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/tools && npx vitest run test/selection-crop-tool.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`packages/tools/src/types.ts` — add to `ToolEffect`:

```ts
  | { kind: "setCrop"; elementId: string | null }
```

`packages/tools/src/tools/selection/types.ts` — add `import type { CropOrigin } from "./crop"` and two members before `marquee`:

```ts
  | { phase: "cropping"; elementId: string }
  | {
      phase: "cropDragging"
      elementId: string
      handle: ResizeHandle
      origin: CropOrigin
      start: Point
    }
```

`packages/tools/src/tools/selection/index.ts`:

1. Add import: `import { buildCropCommitEffect, buildCropMoveEffect, buildCropRevertEffect, snapshotCrop } from "./crop"`.
2. In `reduceDoubleClick`, directly after the `if (hit.type === "text") {...}` block, add:

```ts
if (hit.type === "image" && hit.fileId !== null) {
  return [
    { phase: "cropping", elementId: hit.id },
    [
      { kind: "select", ids: [hit.id] },
      { kind: "setCrop", elementId: hit.id },
    ],
  ]
}
```

3. Add reducers above `selectionTool` (`reduceIdle` is already defined earlier in the file):

```ts
const EXIT_CROP: ToolEffect = { kind: "setCrop", elementId: null }

const reduceCropping = (
  state: Extract<SelectionState, { phase: "cropping" }>,
  event: ToolEvent,
  ctx: ToolContext,
): Transition => {
  if (event.type === "escape") return [{ phase: "idle" }, [EXIT_CROP]]
  if (event.type === "pointerDown") {
    const elements = ctx.readElements()
    const handle = findHandleAt(event.at, ctx.selectedIds, elements, ctx.viewTransform)
    const e = elements.find((el) => el.id === state.elementId)
    if (handle?.kind === "resize" && handle.elementId === state.elementId && e?.type === "image") {
      return [
        {
          phase: "cropDragging",
          elementId: state.elementId,
          handle: handle.handle,
          origin: snapshotCrop(e),
          start: event.at,
        },
        [],
      ]
    }
  }
  if (event.type === "pointerDown" || event.type === "delete") {
    const [next, effects] = reduceIdle(event, ctx)
    return [next, [EXIT_CROP, ...effects]]
  }
  return [state, []]
}

const reduceCropDragging = (
  state: Extract<SelectionState, { phase: "cropDragging" }>,
  event: ToolEvent,
): Transition => {
  const back: SelectionState = { phase: "cropping", elementId: state.elementId }
  switch (event.type) {
    case "pointerMove":
      return [
        state,
        [buildCropMoveEffect(state.elementId, state.origin, state.handle, state.start, event.at)],
      ]
    case "pointerUp":
      return [back, [buildCropCommitEffect(state.elementId)]]
    case "escape":
      return [back, [buildCropRevertEffect(state.elementId, state.origin)]]
    default:
      return [state, []]
  }
}
```

4. In the `switch (state.phase)` of `selectionTool.reduce`, add:

```ts
      case "cropping":
        return reduceCropping(state, event, ctx)
      case "cropDragging":
        return reduceCropDragging(state, event)
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/tools && npx vitest run && cd ../.. && pnpm turbo run typecheck lint --filter=@excalidraw-clone/tools`
Expected: all PASS. (`apps/web` typecheck will fail until Task 4 adds the `setCrop` case — that is expected; do not run web typecheck yet.)

- [ ] **Step 5: Commit**

```bash
git add packages/tools
git commit -m "feat(tools): selection crop phases entered by double-clicking an image"
```

---

### Task 4: Host wiring and crop-mode overlay

**Files:**

- Create: `apps/web/src/store/slices/crop.ts`
- Modify: `apps/web/src/store/index.ts` (add slice to `AppState` and the store)
- Modify: `apps/web/src/driver/effects.ts` (handle `setCrop`)
- Modify: `apps/web/src/driver/useDrawingDriver.ts` (subscribe: renderer + exit conditions)
- Create: `packages/renderer/src/crop-overlay.ts`
- Modify: `packages/renderer/src/renderer.ts`, `packages/renderer/src/test-utils/mock-canvas.ts`
- Test: `packages/renderer/test/crop-overlay.test.ts`

**Interfaces:**

- Consumes (Task 3): effect `{ kind: "setCrop"; elementId: string | null }`.
- Produces: store `cropElementId: string | null` + `setCropElementId(id)`; `CanvasRenderer.setCropElement(id: string | null)`; `drawCropDim(ctx, el, img, view)`.

- [ ] **Step 1: Write the failing renderer test**

First add `"clip"` to `RECORDABLE_METHODS` in `packages/renderer/src/test-utils/mock-canvas.ts` (after `"stroke"`), and `"globalCompositeOperation"` to `RECORDABLE_PROPS`.

Create `packages/renderer/test/crop-overlay.test.ts`:

```ts
import { newImage } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { drawCropDim } from "../src/crop-overlay"
import { callsOf, createMockCanvas } from "../src/test-utils/mock-canvas"

const img = { complete: true, naturalWidth: 8, naturalHeight: 8 } as unknown as HTMLImageElement

describe("drawCropDim", () => {
  it("draws the full image offset by the crop, clipped to the ring outside the box", () => {
    const { ctx } = createMockCanvas()
    const el = {
      ...newImage({ x: 10, y: 20, width: 80, height: 40, fileId: "f1" }),
      crop: { x: 0.25, y: 0.5, width: 0.5, height: 0.5 },
    }
    drawCropDim(ctx as unknown as CanvasRenderingContext2D, el, img, {
      scrollX: 0,
      scrollY: 0,
      zoom: 1,
    })
    // kx = 160, ky = 80 → full image at (-40,-40) 160x80 in element-local space
    expect(callsOf(ctx, "drawImage")[0]?.args).toEqual([img, -40, -40, 160, 80])
    expect(callsOf(ctx, "clip")).toHaveLength(1)
    expect(callsOf(ctx, "rect").map((c) => c.args)).toEqual([
      [-40, -40, 160, 80],
      [0, 0, 80, 40],
    ])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/renderer && npx vitest run test/crop-overlay.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement renderer side**

Create `packages/renderer/src/crop-overlay.ts`:

```ts
import type { ViewTransform } from "@excalidraw-clone/geometry"
import { mirrorOf, type ExcalidrawImageElement } from "@excalidraw-clone/scene"

const DIM_ALPHA = 0.35

/**
 * Crop mode: ghost the part of the image that the crop hides. Draws *behind*
 * whatever is already on the overlay (the selection handles) and clips to the
 * ring between the full image rect and the visible box.
 */
export const drawCropDim = (
  ctx: CanvasRenderingContext2D,
  el: ExcalidrawImageElement,
  img: HTMLImageElement,
  view: ViewTransform,
): void => {
  const c = el.crop ?? { x: 0, y: 0, width: 1, height: 1 }
  const kx = el.width / c.width
  const ky = el.height / c.height
  const [mx, my] = mirrorOf(el)
  ctx.save()
  ctx.globalCompositeOperation = "destination-over"
  ctx.setTransform(view.zoom, 0, 0, view.zoom, view.scrollX * view.zoom, view.scrollY * view.zoom)
  ctx.translate(el.x, el.y)
  if (el.angle !== 0) {
    ctx.translate(el.width / 2, el.height / 2)
    ctx.rotate(el.angle)
    ctx.translate(-el.width / 2, -el.height / 2)
  }
  if (mx !== 1 || my !== 1) {
    ctx.translate(el.width / 2, el.height / 2)
    ctx.scale(mx, my)
    ctx.translate(-el.width / 2, -el.height / 2)
  }
  ctx.beginPath()
  ctx.rect(-c.x * kx, -c.y * ky, kx, ky)
  ctx.rect(0, 0, el.width, el.height)
  ctx.clip("evenodd")
  ctx.globalAlpha = DIM_ALPHA
  ctx.drawImage(img, -c.x * kx, -c.y * ky, kx, ky)
  ctx.restore()
}
```

`packages/renderer/src/renderer.ts`:

- imports: `import { drawCropDim } from "./crop-overlay"`.
- field: `private cropId: string | null = null` (next to `hiddenId`).
- method (next to `setHiddenElement`):

```ts
  /** Crop mode: ghost the hidden part of this image on the overlay. */
  setCropElement(id: string | null): void {
    this.cropId = id
    this.requestRedraw()
  }
```

- in `renderSelection`, add `this.cropId === null &&` to the early-return condition (alongside the other `length === 0` terms), and after the existing `drawLasso(...)` call at the end of the method add:

```ts
const cropEl = this.cropId === null ? undefined : elements.find((e) => e.id === this.cropId)
if (cropEl?.type === "image" && cropEl.fileId !== null) {
  const img = this.imageMap.get(cropEl.fileId)
  if (img && img.complete && img.naturalWidth > 0) drawCropDim(ctx, cropEl, img, this.viewTransform)
}
```

Export is not needed from `index.ts` (internal).

- [ ] **Step 4: Run renderer tests**

Run: `cd packages/renderer && npx vitest run`
Expected: PASS.

- [ ] **Step 5: Implement web wiring**

Create `apps/web/src/store/slices/crop.ts` (mirror `textEdit.ts`):

```ts
import type { StateCreator } from "zustand"

export interface CropSlice {
  /** Image currently in crop mode; transient, never persisted. */
  cropElementId: string | null
  setCropElementId: (id: string | null) => void
}

export const createCropSlice: StateCreator<CropSlice, [], [], CropSlice> = (set) => ({
  cropElementId: null,
  setCropElementId: (id) => set({ cropElementId: id }),
})
```

`apps/web/src/store/index.ts`: add `import { createCropSlice, type CropSlice } from "./slices/crop"`, append `& CropSlice` to `AppState`, and `...createCropSlice(...a),` in the store object.

`apps/web/src/driver/effects.ts` — add before the `laserMove` case:

```ts
      case "setCrop":
        useAppStore.getState().setCropElementId(eff.elementId)
        break
```

`apps/web/src/driver/useDrawingDriver.ts` — inside `useAppStore.subscribe((s, prev) => {...})`, after the `textEditElementId` block, add:

```ts
if (s.cropElementId !== prev.cropElementId) renderer.setCropElement(s.cropElementId)
// Crop mode lasts only while that one image stays the sole selection on the
// selection tool; page switches, tool switches and clicking away all break it.
if (
  s.cropElementId !== null &&
  (s.activeTool !== "selection" ||
    s.selectedIds.length !== 1 ||
    s.selectedIds[0] !== s.cropElementId)
) {
  s.setCropElementId(null)
  s.resetToolState("selection")
}
```

- [ ] **Step 6: Verify**

Run: `pnpm turbo run typecheck lint test`
Expected: all green (27/27 or more).

- [ ] **Step 7: Commit**

```bash
git add packages/renderer apps/web/src
git commit -m "feat(web): image crop mode wiring and dimmed hidden-area overlay"
```

---

### Task 5: End-to-end test

**Files:**

- Create: `apps/web/e2e/image-crop.spec.ts`

**Interfaces:**

- Consumes: everything above. Reuses `parseStoredScene` from `./_helpers` and the upload flow from `image.spec.ts` (8×8 red PNG, placed 200×200 with top-left at (200,150) canvas px).

- [ ] **Step 1: Write the test**

Create `apps/web/e2e/image-crop.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test"
import { dragOnCanvas, parseStoredScene } from "./_helpers"

type SceneEl = {
  id: string
  type: string
  x: number
  width: number
  isDeleted?: boolean
  crop?: { x: number; y: number; width: number; height: number } | null
}

const readImages = async (page: Page): Promise<SceneEl[]> => {
  const json = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  return parseStoredScene<SceneEl>(json).elements.filter((e) => e.type === "image" && !e.isDeleted)
}

const redPngBuffer = async (page: Page): Promise<Buffer> => {
  const dataURL = await page.evaluate(() => {
    const c = document.createElement("canvas")
    c.width = 8
    c.height = 8
    const ctx = c.getContext("2d")!
    ctx.fillStyle = "#ff0000"
    ctx.fillRect(0, 0, 8, 8)
    return c.toDataURL("image/png")
  })
  return Buffer.from(dataURL.split(",")[1]!, "base64")
}

const pixelAt = (page: Page, x: number, y: number) =>
  page.evaluate(
    ([px, py]) => {
      const d = document
        .querySelector("canvas")!
        .getContext("2d")!
        .getImageData(px!, py!, 1, 1).data
      return [d[0]!, d[1]!, d[2]!]
    },
    [x, y],
  )

test("double-click crops an image from its west handle; persisted and rendered", async ({
  page,
}) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-image"]').waitFor({ state: "visible" })

  const chooserPromise = page.waitForEvent("filechooser")
  await page.locator('[data-testid="toolbar-image"]').click()
  const chooser = await chooserPromise
  await chooser.setFiles({
    name: "red.png",
    mimeType: "image/png",
    buffer: await redPngBuffer(page),
  })
  await page.waitForTimeout(300)
  const box = (await page.locator("canvas").first().boundingBox())!
  await page.mouse.click(box.x + 200, box.y + 150) // image now spans (200,150)-(400,350)
  await page.waitForTimeout(500)

  // Enter crop mode, drag the west handle 60px inward, leave with Escape.
  await page.mouse.dblclick(box.x + 300, box.y + 250)
  await page.waitForTimeout(100)
  await dragOnCanvas(page, { x: 200, y: 250 }, { x: 260, y: 250 })
  await page.keyboard.press("Escape")
  await page.waitForTimeout(700)

  const [img] = await readImages(page)
  expect(img!.x).toBeCloseTo(260, 0)
  expect(img!.width).toBeCloseTo(140, 0)
  expect(img!.crop!.x).toBeCloseTo(0.3, 2)
  expect(img!.crop!.width).toBeCloseTo(0.7, 2)

  // Cropped-away strip is background (white); the kept part is still red.
  const gone = await pixelAt(page, 230, 250)
  const kept = await pixelAt(page, 330, 250)
  expect(gone[1]!).toBeGreaterThan(200)
  expect(kept[0]!).toBeGreaterThan(150)
  expect(kept[1]!).toBeLessThan(100)

  // Survives a reload.
  await page.reload()
  await page.waitForTimeout(500)
  const [after] = await readImages(page)
  expect(after!.crop!.x).toBeCloseTo(0.3, 2)
})
```

- [ ] **Step 2: Run it**

Run: `cd apps/web && npx playwright test image-crop image`
Expected: PASS. If the handle drag misses (the 6px hit zone is at the box's west-edge midpoint, canvas-relative (200,250)), print `await readImages(page)` to see where the image landed and adjust coordinates — do not loosen assertions.

- [ ] **Step 3: Manual export check (PDF/SVG clip support is not unit-tested for PDF)**

Run the app (`pnpm dev` in `apps/web`), crop an image as above, then export SVG, PNG and PDF from the hamburger menu and open each: the exported image must show only the kept region, and the PDF export must not error. If svg2pdf ignores the `clip-path` on the cropped `<image>`, replace the clipPath approach in `svg.ts` with a nested `<svg width height overflow="hidden">` wrapper and re-run Task 1's tests (update the assertions accordingly).

- [ ] **Step 4: Full gate, commit**

Run: `pnpm turbo run typecheck lint test && cd apps/web && npx playwright test`
Expected: all green.

```bash
git add apps/web/e2e/image-crop.spec.ts
git commit -m "test(e2e): crop an image via double-click and west handle"
```
