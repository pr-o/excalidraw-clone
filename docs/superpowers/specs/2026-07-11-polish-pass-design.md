# Design: Polish pass — image rendering, export parity, viewport culling, tool typing

**Date:** 2026-07-11
**Status:** Approved
**Approach:** Single SDD pipeline, image-correctness first (Approach A)

## Background

Scoping the deferred polish/perf backlog surfaced a latent bug: **image elements
never render**. The upload → persistence → `preloadImage` pipeline works, but
`drawElement` (`packages/renderer/src/draw-element.ts:13`) early-returns on
`type === "image"` and nothing in the codebase calls `ctx.drawImage`. The image
tool is user-reachable (toolbar, shortcut 9), and no e2e spec covers image
visibility, which is why this never surfaced.

This pass fixes that bug, brings both export paths to parity, adds viewport
culling, and clears the long-deferred `TOOLS` typing wart. Four work areas, one
branch, one gate.

## 1. Canvas image rendering (bug fix)

`drawElement` gains an image branch replacing the early return. New signature:

```ts
drawElement(ctx, element, rough, cache, getImage)
// getImage: (fileId: string) => HTMLImageElement | undefined
```

`CanvasRenderer.render()` passes a bound lookup over its existing `imageMap`.

Image branch semantics:

- `fileId === null` → skip.
- Image absent from map, or not loaded (`!img.complete || img.naturalWidth === 0`)
  → skip silently; `preloadImage`'s `onload` already requests a redraw, so the
  image appears when ready.
- Otherwise `ctx.drawImage(img, 0, 0, element.width, element.height)` inside the
  existing translate/rotate transform (rotation works for free).

No placeholder box while loading — data-URL loads are near-instant.

## 2. Export parity

### PNG (`apps/web/src/driver/exportPNG.ts`)

`exportToPNG` constructs a fresh `CanvasRenderer` whose `imageMap` is empty and
waits only one animation frame — insufficient for async image decode. Changes:

- `CanvasRenderer.preloadImage(fileId, dataURL)` returns `Promise<void>`,
  resolving on load **or** error (a corrupt file must not hang export). Existing
  callers ignore the return value — non-breaking. The `onload → requestRedraw`
  behavior is preserved.
- `exportToPNG` collects `fileId`s from scene elements, fetches each via
  persistence `getFile(id)`, awaits all `preloadImage` promises, then renders.
  Missing files (id not in store) are skipped.

### Fresh-upload preload (`apps/web/src/components/App.tsx`)

Discovered during planning: `preloadImage` is called only from hydration
(`preloadFiles`) and `openFile.ts` — a **freshly uploaded** image is never
loaded into the on-screen renderer, so it would stay invisible until reload
even with §1 fixed. The image-tool effect in `App.tsx` therefore fetches the
new file (`getFile`) and calls `renderer.preloadImage` before dispatching
`imageReady`.

### SVG (`packages/renderer/src/svg.ts`)

- `SVGRenderOptions` gains `files?: ReadonlyMap<string, string>` (fileId →
  dataURL). `renderToSVG` stays synchronous.
- `renderElement`'s image branch emits
  `<image href="{dataURL}" width="{w}" height="{h}"/>` inside the same
  transform `<g>` (opacity is already applied at the group). `fileId` missing
  from the map → skip, matching canvas behavior.
- The `Dialogs.tsx` SVG export branch becomes async: collect fileIds, `getFile`
  each, build the map, pass it in options.

## 3. Viewport culling

New module `packages/renderer/src/culling.ts`:

```ts
isElementVisible(element: ExcalidrawElement, viewRect: Rect, margin: number): boolean
```

- `CanvasRenderer.render()` computes the visible world rect from canvas size and
  the view transform: `{ x: -scrollX, y: -scrollY, w: canvas.width / zoom,
h: canvas.height / zoom }`, and skips elements for which `isElementVisible`
  is false.
- Rotated elements test against the AABB of their rotated corners —
  conservative, never falsely culls.
- `margin` is a constant (~16 world units) covering stroke width and roughjs
  overshoot.
- Selection chrome and grid rendering are untouched. Export renderers are
  unaffected: their viewport is the full scene bbox by construction.

Verification is unit-tests-only (user decision) — no benchmark harness.

## 4. TOOLS event-type unification

The registry (`packages/tools/src/registry.ts`) is typed
`Record<ToolName, Tool<unknown, ToolEvent>>`, but `imageTool` consumes image
events, forcing a `Tool<unknown, ToolEvent | ImageReadyEvent>` re-annotation at
the dispatch site (`apps/web/src/driver/useDrawingDriver.ts:129`).

Fix inside `packages/tools`: define the event union (e.g. `AnyToolEvent`) in its
types, type the registry against it, and delete the call-site annotation.
Type-only change; the typecheck gate proves it. Exact union membership is pinned
during planning by reading `packages/tools/src/tools/image.ts`.

## 5. Testing

**Unit (renderer):**

- Image branch: draws with correct transform; skips when unloaded / `fileId`
  null (jsdom canvas mocks, matching existing renderer test patterns).
- `isElementVisible`: fully outside → false; partially inside → true; rotated
  element crossing the edge → true; margin honored at the boundary.
- SVG: output contains `<image>` with href/width/height for an image element
  when `files` provides its dataURL; element skipped when it does not.

**e2e (`apps/web/e2e/image.spec.ts`):**

- Playwright `filechooser` intercepts the picker's programmatic `input.click()`
  (`imageUpload.ts`), supplies a small PNG fixture.
- Place the image; assert the persisted scene has an element with
  `type: "image"` and non-null `fileId` (700ms auto-save wait, per house rule).
- Assert canvas pixels at the placement point differ from the background — the
  visibility regression guard this bug lacked.

**Gate:** full monorepo `typecheck && test && lint && build` + e2e, per house
convention.

## Out of scope

- Shape-cache changes — audited: `WeakMap` + `versionNonce` invalidation is
  sound as-is.
- Image loading placeholders.
- Canvas opacity support (pre-existing gap affecting all shapes equally).
- New tools or UI surface.

## Task ordering (for planning)

1. Canvas image rendering fix (renderer + `drawElement` + unit tests).
2. Export parity: PNG preload/await + SVG `<image>` + `Dialogs.tsx` (+ tests).
3. Viewport culling module + `render()` wiring (+ tests).
4. TOOLS event-type unification (type-only).
5. e2e (`image.spec.ts`) + full monorepo gate.

Ordering rationale: task 2 builds on task 1's loaded-image plumbing; task 3
reuses task 1's renderer test scaffolding; task 4 is independent but rides the
same gate.
