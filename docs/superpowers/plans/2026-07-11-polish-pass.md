# Polish Pass Implementation Plan — image rendering, export parity, culling, tool typing

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make image elements actually render (canvas, PNG export, SVG export), add viewport culling to the canvas renderer, and unify the tools registry event type.

**Architecture:** Renderer-first: Task 1 adds the image branch to `drawElement` with an injected image lookup; Task 2 makes `preloadImage` awaitable and wires images through both export paths plus fresh-upload preload; Task 3 adds a pure `isElementVisible` culling module consumed by `render()`; Task 4 is a type-only registry cleanup; Task 5 is the e2e regression guard + full gate.

**Tech Stack:** pnpm + turbo monorepo, TypeScript strict (incl. `exactOptionalPropertyTypes`), vitest (jsdom + mock canvas), Playwright, roughjs.

**Spec:** `docs/superpowers/specs/2026-07-11-polish-pass-design.md`

## Global Constraints

- Branch: `develop`. One commit per task, message verbatim from the task's commit step.
- Packages: `@excalidraw-clone/{geometry,scene,tools,renderer,persistence,ui,web}`.
- `exactOptionalPropertyTypes` is on: never assign a possibly-`undefined` value to an optional property via spread; use conditional assignment.
- jsdom does not load `Image` resources: unit tests must never `await` a `preloadImage` promise; construct "loaded" images as `{ complete: true, naturalWidth: 8, naturalHeight: 8 } as unknown as HTMLImageElement`.
- e2e specs wait **700ms** before reading `localStorage["excalidraw-scene"]` (500ms auto-save debounce).
- Renderer unit tests use fake timers + `vi.advanceTimersByTime(20)` to flush rAF (see `packages/renderer/test/renderer-elements.test.ts`).
- Full gate: `pnpm typecheck && pnpm test && pnpm lint && pnpm build` (13/13 packages, build 7/7) plus `pnpm --filter @excalidraw-clone/web e2e`.

---

### Task 1: Canvas image rendering (bug fix)

**Files:**

- Modify: `packages/renderer/src/draw-element.ts`
- Modify: `packages/renderer/src/renderer.ts:144-147` (render loop)
- Test (create): `packages/renderer/test/draw-image.test.ts`
- Test (modify): `packages/renderer/test/renderer-elements.test.ts:45-56`

**Interfaces:**

- Consumes: `newImage({ x, y, width, height, fileId })` from `@excalidraw-clone/scene`; `createMockCanvas`/`callsOf` from `../src/test-utils/mock-canvas` (mock ctx already records `drawImage`); `ShapeCache` from `../src/shape-cache`.
- Produces: `drawElement(ctx, element, rough, cache, getImage)` — 5th param `getImage: ImageLookup` where `export type ImageLookup = (fileId: string) => HTMLImageElement | undefined`. Task 3 keeps this signature; Task 2 relies on `imageMap` staying the lookup source.

- [ ] **Step 1: Write the failing tests**

Create `packages/renderer/test/draw-image.test.ts`:

```ts
import { newImage } from "@excalidraw-clone/scene"
import { RoughCanvas } from "roughjs/bin/canvas"
import { describe, expect, it } from "vitest"
import { drawElement } from "../src/draw-element"
import { ShapeCache } from "../src/shape-cache"
import { callsOf, createMockCanvas } from "../src/test-utils/mock-canvas"

const loadedImage = (): HTMLImageElement =>
  ({ complete: true, naturalWidth: 8, naturalHeight: 8 }) as unknown as HTMLImageElement

const setup = (): {
  ctx: ReturnType<typeof createMockCanvas>["ctx"]
  draw: (el: Parameters<typeof drawElement>[1], getImage: Parameters<typeof drawElement>[4]) => void
} => {
  const { canvas, ctx } = createMockCanvas()
  const rough = new RoughCanvas(canvas)
  const cache = new ShapeCache()
  return {
    ctx,
    draw: (el, getImage) =>
      drawElement(ctx as unknown as CanvasRenderingContext2D, el, rough, cache, getImage),
  }
}

describe("drawElement image branch", () => {
  it("draws a loaded image at the local origin with element size", () => {
    const { ctx, draw } = setup()
    const img = loadedImage()
    draw(newImage({ x: 30, y: 40, width: 200, height: 100, fileId: "f1" }), () => img)
    const calls = callsOf(ctx, "drawImage")
    expect(calls).toHaveLength(1)
    expect(calls[0]?.args).toEqual([img, 0, 0, 200, 100])
    expect(callsOf(ctx, "translate")[0]?.args).toEqual([30, 40])
  })

  it("rotates around the element center before drawing", () => {
    const { ctx, draw } = setup()
    const el = {
      ...newImage({ x: 0, y: 0, width: 100, height: 50, fileId: "f1" }),
      angle: Math.PI / 2,
    }
    draw(el, () => loadedImage())
    expect(callsOf(ctx, "rotate")[0]?.args).toEqual([Math.PI / 2])
    expect(callsOf(ctx, "drawImage")).toHaveLength(1)
  })

  it("skips when fileId is null", () => {
    const { ctx, draw } = setup()
    draw(newImage({ x: 0, y: 0, width: 100, height: 100 }), () => loadedImage())
    expect(callsOf(ctx, "drawImage")).toHaveLength(0)
  })

  it("skips when the lookup has no image for the fileId", () => {
    const { ctx, draw } = setup()
    draw(newImage({ x: 0, y: 0, width: 100, height: 100, fileId: "f1" }), () => undefined)
    expect(callsOf(ctx, "drawImage")).toHaveLength(0)
  })

  it("skips when the image has not finished loading", () => {
    const { ctx, draw } = setup()
    const pending = { complete: false, naturalWidth: 0 } as unknown as HTMLImageElement
    draw(newImage({ x: 0, y: 0, width: 100, height: 100, fileId: "f1" }), () => pending)
    expect(callsOf(ctx, "drawImage")).toHaveLength(0)
  })

  it("balances save/restore even when the image is skipped", () => {
    const { ctx, draw } = setup()
    draw(newImage({ x: 0, y: 0, width: 100, height: 100, fileId: "f1" }), () => undefined)
    expect(callsOf(ctx, "save")).toHaveLength(1)
    expect(callsOf(ctx, "restore")).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @excalidraw-clone/renderer test -- draw-image`
Expected: FAIL — `drawElement` takes 4 arguments (TS error via vitest transform) or zero `drawImage` calls recorded.

- [ ] **Step 3: Implement**

Replace `packages/renderer/src/draw-element.ts` in full:

```ts
import type { ExcalidrawElement } from "@excalidraw-clone/scene"
import type { RoughCanvas } from "roughjs/bin/canvas"
import type { ShapeCache } from "./shape-cache"
import { drawText } from "./shapes/text"

export type ImageLookup = (fileId: string) => HTMLImageElement | undefined

export const drawElement = (
  ctx: CanvasRenderingContext2D,
  element: ExcalidrawElement,
  rough: RoughCanvas,
  cache: ShapeCache,
  getImage: ImageLookup,
): void => {
  if (element.isDeleted) return
  ctx.save()
  ctx.translate(element.x, element.y)
  if (element.angle !== 0) {
    ctx.translate(element.width / 2, element.height / 2)
    ctx.rotate(element.angle)
    ctx.translate(-element.width / 2, -element.height / 2)
  }
  if (element.type === "image") {
    const img = element.fileId === null ? undefined : getImage(element.fileId)
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, 0, 0, element.width, element.height)
    }
    ctx.restore()
    return
  }
  if (element.type === "text") {
    drawText(ctx, element)
    ctx.restore()
    return
  }
  const drawables = cache.get(element, rough.generator)
  for (const d of drawables) rough.draw(d)
  ctx.restore()
}
```

In `packages/renderer/src/renderer.ts`, update the `render()` loop (lines 144-147):

```ts
const elements = this.scene.getElements()
const getImage = (id: string): HTMLImageElement | undefined => this.imageMap.get(id)
for (const element of elements) {
  drawElement(ctx, element, this.rough, this.shapeCache, getImage)
}
```

- [ ] **Step 4: Update the stale "deferred" test**

In `packages/renderer/test/renderer-elements.test.ts`, the test `"skips image elements (deferred)"` still passes (an unloaded image records no rough draw) but its name and comment are now wrong. Rename it:

```ts
  it("image elements without a loaded file record no rough draw", () => {
```

(body unchanged.)

- [ ] **Step 5: Run the renderer suite**

Run: `pnpm --filter @excalidraw-clone/renderer test`
Expected: PASS — 94 tests (88 existing + 6 new). Also run `pnpm --filter @excalidraw-clone/renderer typecheck`; expected clean.

- [ ] **Step 6: Commit**

```bash
git add packages/renderer/src/draw-element.ts packages/renderer/src/renderer.ts packages/renderer/test/draw-image.test.ts packages/renderer/test/renderer-elements.test.ts
git commit -m "renderer: draw image elements on canvas via imageMap lookup"
```

---

### Task 2: Export parity + fresh-upload preload

**Files:**

- Modify: `packages/renderer/src/renderer.ts:106-117` (`preloadImage`, `unloadImage`)
- Modify: `packages/renderer/src/svg.ts`
- Test (modify): `packages/renderer/test/preload.test.ts`, `packages/renderer/test/svg.test.ts`
- Modify: `apps/web/src/driver/exportPNG.ts`
- Modify: `apps/web/src/components/Dialogs.tsx:70-79`
- Modify: `apps/web/src/components/App.tsx:88-99` (image-tool effect)
- Modify: `apps/web/src/driver/hydration.ts:30-38` (drop obsolete cast)

**Interfaces:**

- Consumes: Task 1's image branch; `getFile(id): Promise<ExcalidrawBinaryFile | undefined>` from `@excalidraw-clone/persistence` (`ExcalidrawBinaryFile` has `id`, `mimeType`, `dataURL`, `created`); `newImage` factory.
- Produces: `CanvasRenderer.preloadImage(fileId: string, dataURL: string): Promise<void>` (resolves on load **or** error; idempotent per fileId); `SVGRenderOptions.files?: ReadonlyMap<string, string>` (fileId → dataURL). Task 5's e2e relies on the App.tsx fresh-upload preload.

- [ ] **Step 1: Write the failing renderer tests**

Replace `packages/renderer/test/preload.test.ts` in full:

```ts
import { Scene } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { CanvasRenderer } from "../src/renderer"
import { createMockCanvas } from "../src/test-utils/mock-canvas"

const DATA = "data:image/png;base64,iVBORw0KGgo="

describe("CanvasRenderer.preloadImage", () => {
  it("returns a promise and is idempotent per fileId", () => {
    const { canvas } = createMockCanvas()
    const renderer = new CanvasRenderer(canvas, new Scene())
    const p1 = renderer.preloadImage("abc", DATA)
    const p2 = renderer.preloadImage("abc", DATA)
    expect(p1).toBeInstanceOf(Promise)
    expect(p2).toBe(p1)
  })

  it("unloadImage forgets the image so preloadImage starts a fresh load", () => {
    const { canvas } = createMockCanvas()
    const renderer = new CanvasRenderer(canvas, new Scene())
    const p1 = renderer.preloadImage("abc", DATA)
    renderer.unloadImage("abc")
    const p2 = renderer.preloadImage("abc", DATA)
    expect(p2).not.toBe(p1)
  })
})
```

(Never `await` these promises — jsdom never fires image `onload`.)

Append to `packages/renderer/test/svg.test.ts` inside the existing `describe` (and extend the imports line to `import { Scene, newImage } from "@excalidraw-clone/scene"`):

```ts
it("emits <image> with href/width/height when files provides the dataURL", () => {
  const el = newImage({ x: 5, y: 6, width: 80, height: 40, fileId: "f1" })
  const files = new Map([["f1", "data:image/png;base64,AAAA"]])
  const svg = renderToSVG(new Scene([el]), { files })
  expect(svg).toContain("<image")
  expect(svg).toContain('href="data:image/png;base64,AAAA"')
  expect(svg).toContain('width="80"')
  expect(svg).toContain('height="40"')
})

it("omits image elements whose file is not provided", () => {
  const el = newImage({ x: 5, y: 6, width: 80, height: 40, fileId: "f1" })
  const svg = renderToSVG(new Scene([el]))
  expect(svg).not.toContain("<image")
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @excalidraw-clone/renderer test -- preload svg`
Expected: FAIL — `preloadImage` returns `undefined` (`toBeInstanceOf(Promise)` fails); `files` is not a known `SVGRenderOptions` property / no `<image` in output.

- [ ] **Step 3: Implement renderer changes**

In `packages/renderer/src/renderer.ts`, add a field next to `imageMap` (line 29):

```ts
  private readonly imageLoads = new Map<string, Promise<void>>()
```

Replace `preloadImage` and `unloadImage` (lines 106-117):

```ts
  preloadImage(fileId: string, dataURL: string): Promise<void> {
    const pending = this.imageLoads.get(fileId)
    if (pending) return pending
    const img = new Image()
    const load = new Promise<void>((resolve) => {
      img.onload = () => {
        this.requestRedraw()
        resolve()
      }
      img.onerror = () => resolve()
    })
    img.src = dataURL
    this.imageMap.set(fileId, img)
    this.imageLoads.set(fileId, load)
    return load
  }

  unloadImage(fileId: string): void {
    this.imageMap.delete(fileId)
    this.imageLoads.delete(fileId)
    this.requestRedraw()
  }
```

In `packages/renderer/src/svg.ts`:

Add to `SVGRenderOptions`:

```ts
export interface SVGRenderOptions {
  background?: string
  embedScene?: boolean
  padding?: number
  files?: ReadonlyMap<string, string>
}
```

Update the render loop call (line 40): `const node = renderElement(doc, el, rsvg, opts.files)`.

Replace `renderElement` and add a `createGroup` helper (DRYs the transform/opacity setup):

```ts
function renderElement(
  doc: Document,
  el: ExcalidrawElement,
  rsvg: RoughSVG,
  files?: ReadonlyMap<string, string>,
): SVGGElement | null {
  if (el.type === "image") {
    const href = el.fileId === null ? undefined : files?.get(el.fileId)
    if (href === undefined) return null
    const group = createGroup(doc, el)
    const image = doc.createElementNS(SVG_NS, "image")
    image.setAttribute("href", href)
    image.setAttribute("width", String(el.width))
    image.setAttribute("height", String(el.height))
    group.appendChild(image)
    return group
  }
  const group = createGroup(doc, el)

  if (el.type === "text") {
    group.appendChild(textNode(doc, el))
    return group
  }

  const drawables = generateShape(el, rsvg.generator)
  for (const d of drawables) {
    group.appendChild(rsvg.draw(d))
  }
  return group
}

function createGroup(doc: Document, el: ExcalidrawElement): SVGGElement {
  const group = doc.createElementNS(SVG_NS, "g")
  group.setAttribute("transform", elementTransform(el))
  if (el.opacity !== 100) {
    group.setAttribute("opacity", String(el.opacity / 100))
  }
  return group
}
```

- [ ] **Step 4: Run the renderer suite to verify it passes**

Run: `pnpm --filter @excalidraw-clone/renderer test && pnpm --filter @excalidraw-clone/renderer typecheck`
Expected: PASS — 96 tests (94 from Task 1 + 2 new preload semantics + 2 new svg; the two old preload tests were replaced).

- [ ] **Step 5: Wire the web app**

`apps/web/src/driver/exportPNG.ts` — add `getFile` to the existing persistence import:

```ts
import {
  embedTextChunk,
  getFile,
  PNG_EXCALIDRAW_KEYWORD,
  serializeScene,
} from "@excalidraw-clone/persistence"
```

Insert after `const renderer = new CanvasRenderer(...)` (line 31) and before the ctx/background block:

```ts
const fileIds = new Set<string>()
for (const el of elements) {
  if (el.type === "image" && el.fileId !== null) fileIds.add(el.fileId)
}
const loads: Promise<void>[] = []
for (const id of fileIds) {
  const file = await getFile(id)
  if (file) loads.push(renderer.preloadImage(id, file.dataURL))
}
await Promise.all(loads)
```

`apps/web/src/components/Dialogs.tsx` — add `import { getFile } from "@excalidraw-clone/persistence"` and replace the SVG branch of `exportScene` (lines 71-76):

```ts
if (opts.format === "svg") {
  const files = new Map<string, string>()
  for (const el of scene.getElements()) {
    if (el.type === "image" && el.fileId !== null && !files.has(el.fileId)) {
      const bin = await getFile(el.fileId)
      if (bin) files.set(el.fileId, bin.dataURL)
    }
  }
  const svg = renderToSVG(scene, { background: BG_FOR_SVG[opts.background], files })
  const blob = new Blob([svg], { type: "image/svg+xml" })
  download(blob, "drawing.svg")
  return
}
```

`apps/web/src/components/App.tsx` — the image-tool effect (lines 88-99) must preload the fresh upload into the on-screen renderer before dispatching (`getFile` is already imported in App.tsx). Replace it, adding `renderer` to the deps:

```ts
useEffect(() => {
  if (activeTool !== "image") return
  let cancelled = false
  void (async () => {
    const event = await pickAndUploadImage({ x: 100, y: 100 })
    if (cancelled || !event) return
    const bin = await getFile(event.fileId)
    if (bin && renderer) void renderer.preloadImage(bin.id, bin.dataURL)
    useAppStore.getState().dispatchToolEvent?.(event)
  })()
  return () => {
    cancelled = true
  }
}, [activeTool, renderer])
```

`apps/web/src/driver/hydration.ts` — `preloadImage` is now properly typed; drop the defensive cast in `preloadFiles` (lines 33-37):

```ts
for (const f of files) {
  void renderer.preloadImage(f.id, f.dataURL)
}
```

- [ ] **Step 6: Verify the web package**

Run: `pnpm --filter @excalidraw-clone/web typecheck && pnpm --filter @excalidraw-clone/web test`
Expected: both PASS (6 files, 20 tests).

- [ ] **Step 7: Commit**

```bash
git add packages/renderer/src/renderer.ts packages/renderer/src/svg.ts packages/renderer/test/preload.test.ts packages/renderer/test/svg.test.ts apps/web/src/driver/exportPNG.ts apps/web/src/components/Dialogs.tsx apps/web/src/components/App.tsx apps/web/src/driver/hydration.ts
git commit -m "renderer+web: image export parity — awaitable preload, SVG <image>, fresh-upload preload"
```

---

### Task 3: Viewport culling

**Files:**

- Create: `packages/renderer/src/culling.ts`
- Modify: `packages/renderer/src/renderer.ts` (render loop from Task 1)
- Test (create): `packages/renderer/test/culling.test.ts`

**Interfaces:**

- Consumes: `Bounds` type and `boundsExpand`, `boundsFromPoints`, `boundsIntersect` from `@excalidraw-clone/geometry` (all exported from the package index); Task 1's render loop shape.
- Produces: `isElementVisible(el: ExcalidrawElement, view: Bounds, margin?: number): boolean` and `CULL_MARGIN = 16`. Nothing downstream consumes these outside the renderer.

- [ ] **Step 1: Write the failing tests**

Create `packages/renderer/test/culling.test.ts`:

```ts
import { Scene, newArrow, newRectangle } from "@excalidraw-clone/scene"
import { RoughCanvas } from "roughjs/bin/canvas"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CanvasRenderer } from "../src"
import { CULL_MARGIN, isElementVisible } from "../src/culling"
import { createMockCanvas } from "../src/test-utils/mock-canvas"

const VIEW = { x: 0, y: 0, width: 800, height: 600 }

describe("isElementVisible", () => {
  it("keeps an element inside the view", () => {
    expect(isElementVisible(newRectangle({ x: 100, y: 100, width: 50, height: 50 }), VIEW)).toBe(
      true,
    )
  })

  it("culls an element fully left of the view", () => {
    expect(isElementVisible(newRectangle({ x: -500, y: 100, width: 100, height: 50 }), VIEW)).toBe(
      false,
    )
  })

  it("keeps an element partially overlapping the view edge", () => {
    expect(isElementVisible(newRectangle({ x: -25, y: 100, width: 50, height: 50 }), VIEW)).toBe(
      true,
    )
  })

  it("honors the margin at the boundary", () => {
    const touching = newRectangle({ x: -100 - CULL_MARGIN, y: 100, width: 100, height: 50 })
    const beyond = newRectangle({ x: -101 - CULL_MARGIN, y: 100, width: 100, height: 50 })
    expect(isElementVisible(touching, VIEW)).toBe(true)
    expect(isElementVisible(beyond, VIEW)).toBe(false)
  })

  it("keeps a rotated element whose rotated bounds reach the view", () => {
    // Unrotated AABB [840,860]×[100,500] is right of the view; rotated 90°
    // about its center (850, 300) it spans x [650,1050] and overlaps.
    const base = newRectangle({ x: 840, y: 100, width: 20, height: 400 })
    expect(isElementVisible(base, VIEW)).toBe(false)
    expect(isElementVisible({ ...base, angle: Math.PI / 2 }, VIEW)).toBe(true)
  })

  it("uses point bounds for linear elements whose points exceed the box", () => {
    const arrow = {
      ...newArrow({ x: 900, y: 300, width: 10, height: 10 }),
      points: [
        { x: 0, y: 0 },
        { x: -300, y: 0 },
      ],
    }
    expect(isElementVisible(arrow, VIEW)).toBe(true)
  })
})

describe("CanvasRenderer culling", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("skips off-screen elements in render()", () => {
    const drawSpy = vi.spyOn(RoughCanvas.prototype, "draw").mockImplementation(() => undefined)
    const { canvas } = createMockCanvas()
    const scene = new Scene([
      newRectangle({ x: 10, y: 10, width: 20, height: 20 }),
      newRectangle({ x: 5000, y: 5000, width: 20, height: 20 }),
    ])
    const r = new CanvasRenderer(canvas, scene)
    r.start()
    vi.advanceTimersByTime(20)
    expect(drawSpy).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @excalidraw-clone/renderer test -- culling`
Expected: FAIL — module `../src/culling` not found.

- [ ] **Step 3: Implement**

Create `packages/renderer/src/culling.ts`:

```ts
import {
  type Bounds,
  boundsExpand,
  boundsFromPoints,
  boundsIntersect,
} from "@excalidraw-clone/geometry"
import type { ExcalidrawElement } from "@excalidraw-clone/scene"

/** World-space slack so stroke width and roughjs overshoot never cause a false cull. */
export const CULL_MARGIN = 16

const elementAABB = (el: ExcalidrawElement): Bounds => {
  // Point bounds cover linear elements whose points may exceed the x/y/w/h box.
  const local: Bounds =
    "points" in el && el.points.length > 0
      ? boundsFromPoints(el.points)
      : { x: 0, y: 0, width: el.width, height: el.height }
  if (el.angle === 0) {
    return { x: el.x + local.x, y: el.y + local.y, width: local.width, height: local.height }
  }
  const cx = el.width / 2
  const cy = el.height / 2
  const cos = Math.cos(el.angle)
  const sin = Math.sin(el.angle)
  const corners = [
    { x: local.x, y: local.y },
    { x: local.x + local.width, y: local.y },
    { x: local.x, y: local.y + local.height },
    { x: local.x + local.width, y: local.y + local.height },
  ].map((p) => {
    const dx = p.x - cx
    const dy = p.y - cy
    return { x: el.x + cx + dx * cos - dy * sin, y: el.y + cy + dx * sin + dy * cos }
  })
  return boundsFromPoints(corners)
}

export const isElementVisible = (
  el: ExcalidrawElement,
  view: Bounds,
  margin: number = CULL_MARGIN,
): boolean => boundsIntersect(boundsExpand(elementAABB(el), margin), view)
```

In `packages/renderer/src/renderer.ts`: extend the geometry type import to `import type { Bounds, ViewTransform } from "@excalidraw-clone/geometry"`, add `import { isElementVisible } from "./culling"`, and update the render loop:

```ts
const elements = this.scene.getElements()
const getImage = (id: string): HTMLImageElement | undefined => this.imageMap.get(id)
const view: Bounds = {
  x: -scrollX,
  y: -scrollY,
  width: canvas.width / zoom,
  height: canvas.height / zoom,
}
for (const element of elements) {
  if (!isElementVisible(element, view)) continue
  drawElement(ctx, element, this.rough, this.shapeCache, getImage)
}
```

- [ ] **Step 4: Run the full renderer suite**

Run: `pnpm --filter @excalidraw-clone/renderer test && pnpm --filter @excalidraw-clone/renderer typecheck`
Expected: PASS — 103 tests (96 + 7 new). All pre-existing tests place elements within the 800×600 mock canvas at identity transform, so culling changes nothing for them.

- [ ] **Step 5: Commit**

```bash
git add packages/renderer/src/culling.ts packages/renderer/src/renderer.ts packages/renderer/test/culling.test.ts
git commit -m "renderer: viewport culling — skip off-screen elements in render()"
```

---

### Task 4: TOOLS event-type unification (type-only)

**Files:**

- Modify: `packages/tools/src/types.ts`
- Modify: `packages/tools/src/tools/image.ts:1-14`
- Modify: `packages/tools/src/registry.ts:13-15`
- Modify: `packages/tools/src/index.ts:23,28+`
- Modify: `apps/web/src/driver/useDrawingDriver.ts:126-129`
- Modify: `apps/web/src/store/slices/dispatch.ts:1-4`

**Interfaces:**

- Consumes: nothing from other tasks (independent).
- Produces: `AnyToolEvent = ToolEvent | ImageReadyEvent` exported from `@excalidraw-clone/tools`; `ImageReadyEvent` now lives in `types.ts` but stays exported from the package root, so `App.tsx` and other importers are unaffected.

- [ ] **Step 1: Move the event types**

In `packages/tools/src/types.ts`, after the `ToolEvent` definition (line 40), add (Point is already imported):

```ts
export type ImageReadyEvent = {
  type: "imageReady"
  fileId: string
  mimeType: string
  width: number
  height: number
  at: Point
}

export type AnyToolEvent = ToolEvent | ImageReadyEvent
```

In `packages/tools/src/tools/image.ts`, delete the local `ImageReadyEvent` definition (lines 5-12) and change lines 3 and 14 to:

```ts
import {
  NO_EFFECTS,
  type AnyToolEvent,
  type Tool,
  type ToolContext,
  type ToolEffect,
} from "../types"

export type ImageEvent = AnyToolEvent
```

(`imageTool: Tool<ImageState, ImageEvent>` stays as-is.)

- [ ] **Step 2: Retype the registry and exports**

`packages/tools/src/registry.ts` line 13 and 15:

```ts
import type { AnyToolEvent, Tool, ToolName } from "./types"

export const TOOLS: Record<ToolName, Tool<unknown, AnyToolEvent>> = {
```

`packages/tools/src/index.ts`: on line 23 change the image export to `export type { ImageEvent, ImageState } from "./tools/image"`, and add `AnyToolEvent` and `ImageReadyEvent` to the `export type { ... } from "./types"` block at line 28.

- [ ] **Step 3: Remove the dispatcher re-annotation**

`apps/web/src/driver/useDrawingDriver.ts`: change the dispatch signature (line 126) to use `AnyToolEvent` and drop the annotation on line 129:

```ts
    const dispatch = (event: AnyToolEvent, modifiers: Modifiers): void => {
      const store = useAppStore.getState()
      const toolName = store.activeTool
      const tool = TOOLS[toolName]
```

Update its `@excalidraw-clone/tools` import: add `AnyToolEvent`, remove `ImageReadyEvent`/`ToolEvent` if now unused (keep whatever the file still references — `Tool` should no longer be needed as a type import here).

`apps/web/src/store/slices/dispatch.ts` lines 1-4:

```ts
import type { AnyToolEvent } from "@excalidraw-clone/tools"
import type { StateCreator } from "zustand"

export type ToolEventDispatcher = (event: AnyToolEvent) => void
```

- [ ] **Step 4: Verify with the type gate**

Run: `pnpm typecheck && pnpm --filter @excalidraw-clone/tools test && pnpm --filter @excalidraw-clone/web test`
Expected: all PASS, 13/13 packages typecheck. No behavior change — this task adds no tests.

- [ ] **Step 5: Commit**

```bash
git add packages/tools/src/types.ts packages/tools/src/tools/image.ts packages/tools/src/registry.ts packages/tools/src/index.ts apps/web/src/driver/useDrawingDriver.ts apps/web/src/store/slices/dispatch.ts
git commit -m "tools: unify registry event type as AnyToolEvent, drop dispatcher re-annotation"
```

---

### Task 5: e2e + full gate

**Files:**

- Create: `apps/web/e2e/image.spec.ts`

**Interfaces:**

- Consumes: Task 1 (canvas drawing), Task 2 (fresh-upload preload — without it the pixel assertion fails); toolbar testid `toolbar-image`; the image tool's placement flow (`pickAndUploadImage` opens a file input programmatically on tool select; `pointerDown` places a 200px-wide image at the click point, then switches to selection).
- Produces: nothing — final task.

- [ ] **Step 1: Write the e2e test**

Create `apps/web/e2e/image.spec.ts`. No fixture file: the test generates a red PNG inside the browser, hands the bytes to Playwright's file chooser, and asserts both persistence and actual canvas pixels:

```ts
import { expect, test, type Page } from "@playwright/test"

type SceneEl = {
  id: string
  type: string
  fileId?: string | null
  isDeleted?: boolean
}

const readScene = async (page: Page): Promise<SceneEl[]> => {
  const json = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  const data = JSON.parse(json!) as { elements: SceneEl[] }
  return data.elements.filter((e) => !e.isDeleted)
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

test("placing an uploaded image renders it and persists its fileId", async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-image"]').waitFor({ state: "visible" })

  const png = await redPngBuffer(page)
  const chooserPromise = page.waitForEvent("filechooser")
  await page.locator('[data-testid="toolbar-image"]').click()
  const chooser = await chooserPromise
  await chooser.setFiles({ name: "red.png", mimeType: "image/png", buffer: png })

  // Upload → IndexedDB → imageReady puts the tool in "placing"; click to place.
  await page.waitForTimeout(300)
  const canvas = page.locator("canvas").first()
  const box = await canvas.boundingBox()
  if (!box) throw new Error("canvas not found")
  await page.mouse.click(box.x + 200, box.y + 150)
  await page.waitForTimeout(700)

  const images = (await readScene(page)).filter((e) => e.type === "image")
  expect(images).toHaveLength(1)
  expect(images[0]!.fileId).toBeTruthy()

  // The 200×200 placement at (200,150) centers on (300,250): assert red pixels
  // on the main canvas — the regression guard the original bug lacked.
  const pixel = await page.evaluate(() => {
    const c = document.querySelector("canvas")!
    const ctx = c.getContext("2d")!
    const d = ctx.getImageData(300, 250, 1, 1).data
    return [d[0], d[1], d[2]]
  })
  expect(pixel[0]!).toBeGreaterThan(150)
  expect(pixel[1]!).toBeLessThan(100)
  expect(pixel[2]!).toBeLessThan(100)
})
```

- [ ] **Step 2: Run the e2e suite**

Run: `pnpm --filter @excalidraw-clone/web e2e`
Expected: PASS — 21 specs (20 existing + 1 new). If the pixel assertion reads background color, first check whether the placement wait needs bumping (300ms → 700ms) before touching implementation; the image draw happens on the preload `onload` redraw.

- [ ] **Step 3: Run the full monorepo gate**

Run: `pnpm typecheck && pnpm test && pnpm lint && pnpm build`
Expected: all four exit 0 — 13/13 packages, build 7/7.

- [ ] **Step 4: Commit**

```bash
git add apps/web/e2e/image.spec.ts
git commit -m "web: e2e — uploaded image renders on canvas and persists fileId"
```
