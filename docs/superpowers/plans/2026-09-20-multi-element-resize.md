# Multi-Element Resize Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Each task is self-contained: write the failing test first, watch it fail, implement the minimum, watch it pass, commit. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dragging a handle on a multi-element selection's combined bounding box scales the whole group together — position, size, and (for text) font size all scale proportionally — the exact gap the Stats Panel spec (2026-09-18) identified and deferred.

**Architecture:** A new pure function `resizeElements(elements, ids, originBounds, newBounds)` in `packages/scene/src/resize-group.ts` generalizes single-element `computeResize`'s box math to a whole selection, following the same "one transform, applied per-element, repositioned relative to a combined-selection anchor" shape as the existing `flipElements` (`packages/scene/src/flip.ts`). `packages/tools/src/tools/selection/handles.ts` gains a `selectedIds.length >= 2` branch that hit-tests one combined-bbox handle set instead of returning `null`. `packages/tools/src/tools/selection/index.ts` gains a `groupResizing` drag-state phase, parallel to the existing single-element `resizing` phase, wired through a new `packages/tools/src/tools/selection/group-resize.ts` (mirroring `resize.ts`'s move/commit/revert effect builders but reusing the shared `computeResize`). `packages/renderer/src/overlay.ts` stops drawing per-element handles for a 2+ selection and draws one combined-bounds box with 8 handles on top instead.

**Tech Stack:** TypeScript, Vitest (unit), Playwright (`@playwright/test`, e2e), pnpm workspaces + Turbo.

**Spec:** `docs/superpowers/specs/2026-09-19-multi-element-resize-design.md`

## Global Constraints

- Package manager is **pnpm** (`pnpm@10.32.0`); task runner is **Turbo**. Run turbo as `pnpm turbo run <tasks>` (never `npx turbo`). Full gate: `pnpm turbo run lint typecheck test build --force`. The `--force` matters here specifically for `lint` — this repo has a known stale-cache gotcha where `turbo run lint` alone can show cached output from a different worktree/branch; always use `--force` for the final full-gate lint run.
- Package filter names are the scoped npm names, not the directory names: `@excalidraw-clone/scene`, `@excalidraw-clone/tools`, `@excalidraw-clone/renderer`, `@excalidraw-clone/web`.
- Playwright is invoked as `pnpm exec playwright test` from `apps/web/` (the CLI is not on PATH). Test import is `@playwright/test`.
- Scene localStorage key is `"excalidraw-scene"`. E2E helpers live in `apps/web/e2e/_helpers.ts` (`dragOnCanvas`, `parseStoredScene` — unwraps the v3 `pages[]` document to the active page's `elements`).
- Formatting: no semicolons, double quotes, trailing commas everywhere, 100-char print width (`.prettierrc`) — `format:check` is part of the full gate.
- `resizeElements`'s two box parameters (`originBounds`, `newBounds`) are plain `{ x, y, width, height }` — no `angle`. A group-resize box is always axis-aligned; each member element keeps its own `angle` untouched (no affine shear for mixed-rotation selections — matches the `flipElements` precedent).
- **Out of scope for every task below** (per the design spec's own "Out of scope" section): group rotation (no rotate handle for the combined box), true affine shear, frame-membership recomputation as part of resize, and re-anchoring arrow bindings whose bound element sits outside the resized selection. Do not add speculative handling for any of these.
- Commit after every task with a conventional-commit message. Branch is `feat/multi-element-resize`, created off **`main`** (currently clean at `3e0dd4e`, one commit ahead of `develop` — holding the approved spec doc).
- Final task: full gate + full e2e green, then integrate per **superpowers:finishing-a-development-branch**.

---

### Task 1: `resizeElements` pure function in `packages/scene`

**Context for a fresh implementer (no prior context needed beyond this):** This is the one new piece of math the whole feature depends on. Given the elements array, the ids of the selected members, the selection's original combined bounding box (`originBounds`), and where that box has been dragged to (`newBounds`), `resizeElements` returns full replacement elements scaled and repositioned accordingly. It does not know about mouse handles, drag state, or rendering — those are later tasks. It is deliberately modeled on `flipElements` (`packages/scene/src/flip.ts`, already in the codebase): a `Map`-based id lookup, a `!e.isDeleted && !e.locked` filter, and a passenger-bound-text-label exclusion copied from that file's `isPassengerLabel`.

**Files:**

- Create: `packages/scene/src/resize-group.ts`
- Create: `packages/scene/test/resize-group.test.ts`
- Modify: `packages/scene/src/index.ts` (export `resizeElements` + `ResizeBounds`)

**Interfaces:**

```ts
// packages/scene/src/resize-group.ts
export interface ResizeBounds {
  x: number
  y: number
  width: number
  height: number
}

export function resizeElements(
  elements: readonly ExcalidrawElement[],
  ids: readonly string[],
  originBounds: ResizeBounds,
  newBounds: ResizeBounds,
): ExcalidrawElement[]
```

- Position for every element type: `x' = newBounds.x + (el.x - originBounds.x) * sx`, `y' = newBounds.y + (el.y - originBounds.y) * sy`, where `sx = originBounds.width === 0 ? 1 : newBounds.width / originBounds.width` (same guard for `sy`/`height`).
- Rectangle-like (`rectangle`, `diamond`, `ellipse`, `triangle`, `parallelogram`, `hexagon`, `pentagon`, `octagon`, `image`, `frame`): `width' = el.width * sx`, `height' = el.height * sy`. `angle` untouched.
- `line` / `arrow` / `freedraw`: `points` scaled componentwise by `(sx, sy)`; `width'`/`height'` **recomputed from the scaled points' bbox** (`boundsFromPoints`, from `@excalidraw-clone/geometry`), not multiplied — this is what makes the transform self-correcting even if a stored width/height was already stale. `startBinding`/`endBinding`/`pressures`/etc. untouched (preserved via spread).
- `text`: `fontSize' = Math.max(4, el.fontSize * sy)`. Box scales like rectangle-like.
- A selected `text` whose `containerId` refers to another element also in `ids` is a passenger — dropped from the result entirely (never transformed directly; `reconcileBoundText`, already invoked unconditionally inside `Scene.mutate`, re-lays it out against its container's new box afterward).
- Locked, deleted, and unknown ids are dropped from the result, mirroring `flipElements`.

**Steps:**

1. - [ ] **Step 0 (branch setup):** From a clean tree on `main` (confirm with `git status`), create the working branch: `git switch -c feat/multi-element-resize`. Confirm `git status` is clean.
2. - [ ] Write the failing tests, `packages/scene/test/resize-group.test.ts`:

   ```ts
   import { describe, expect, it } from "vitest"
   import { newFreedraw, newLabelFor, newLine, newRectangle, newText } from "../src/factories"
   import { resizeElements } from "../src/resize-group"
   import type { ExcalidrawElement } from "../src/types"

   interface HandleCase {
     handle: string
     newBounds: { x: number; y: number; width: number; height: number }
     expected: { x: number; y: number; width: number; height: number }
   }

   const HANDLE_CASES: HandleCase[] = [
     {
       handle: "nw",
       newBounds: { x: -10, y: -20, width: 120, height: 130 },
       expected: { x: 14, y: 19, width: 12, height: 19.5 },
     },
     {
       handle: "n",
       newBounds: { x: 0, y: -20, width: 100, height: 120 },
       expected: { x: 20, y: 16, width: 10, height: 18 },
     },
     {
       handle: "ne",
       newBounds: { x: 0, y: -10, width: 150, height: 110 },
       expected: { x: 30, y: 23, width: 15, height: 16.5 },
     },
     {
       handle: "e",
       newBounds: { x: 0, y: 0, width: 150, height: 100 },
       expected: { x: 30, y: 30, width: 15, height: 15 },
     },
     {
       handle: "se",
       newBounds: { x: 0, y: 0, width: 150, height: 130 },
       expected: { x: 30, y: 39, width: 15, height: 19.5 },
     },
     {
       handle: "s",
       newBounds: { x: 0, y: 0, width: 100, height: 130 },
       expected: { x: 20, y: 39, width: 10, height: 19.5 },
     },
     {
       handle: "sw",
       newBounds: { x: -30, y: 0, width: 130, height: 100 },
       expected: { x: -4, y: 30, width: 13, height: 15 },
     },
     {
       handle: "w",
       newBounds: { x: -20, y: 0, width: 120, height: 100 },
       expected: { x: 4, y: 30, width: 12, height: 15 },
     },
   ]

   describe("resizeElements — rectangle-like scaling from each handle direction", () => {
     const origin = { x: 0, y: 0, width: 100, height: 100 }

     it.each(HANDLE_CASES)(
       "$handle handle scales position and size relative to the origin box",
       ({ newBounds, expected }) => {
         const el = newRectangle({ x: 20, y: 30, width: 10, height: 15 })
         const [out] = resizeElements([el], [el.id], origin, newBounds)
         expect(out!.x).toBeCloseTo(expected.x)
         expect(out!.y).toBeCloseTo(expected.y)
         expect(out!.width).toBeCloseTo(expected.width)
         expect(out!.height).toBeCloseTo(expected.height)
         expect(out!.angle).toBe(el.angle)
       },
     )
   })

   describe("resizeElements — line/arrow/freedraw points+bbox invariant", () => {
     it("recomputes width/height from the scaled points' bbox, ignoring a stale stored width/height", () => {
       const el = {
         ...newLine({ x: 0, y: 0, width: 999, height: 999 }),
         points: [
           { x: 0, y: 0 },
           { x: 40, y: 20 },
           { x: 100, y: 10 },
         ],
       }
       const originBounds = { x: 0, y: 0, width: 200, height: 100 }
       const newBounds = { x: 0, y: 0, width: 400, height: 150 } // sx=2, sy=1.5
       const [out] = resizeElements([el], [el.id], originBounds, newBounds)
       expect((out as typeof el).points).toEqual([
         { x: 0, y: 0 },
         { x: 80, y: 30 },
         { x: 200, y: 15 },
       ])
       expect(out!.width).toBe(200) // bbox of scaled points (0..200), NOT the stale 999*2
       expect(out!.height).toBe(30) // bbox of scaled points (0..30), NOT the stale 999*1.5
     })

     it("scales position the same way as rectangle-like elements", () => {
       const el = {
         ...newLine({ x: 10, y: 5, width: 50, height: 20 }),
         points: [
           { x: 0, y: 0 },
           { x: 50, y: 20 },
         ],
       }
       const originBounds = { x: 0, y: 0, width: 200, height: 100 }
       const newBounds = { x: 0, y: 0, width: 400, height: 150 }
       const [out] = resizeElements([el], [el.id], originBounds, newBounds)
       expect(out!.x).toBe(20) // 0 + (10-0)*2
       expect(out!.y).toBe(7.5) // 0 + (5-0)*1.5
     })

     it("freedraw: same points+bbox recompute; other fields (pressures) untouched", () => {
       const el = {
         ...newFreedraw({ x: 0, y: 0, width: 10, height: 10 }),
         points: [
           { x: 0, y: 0 },
           { x: 10, y: 10 },
         ],
         pressures: [0.5, 0.8],
       }
       const originBounds = { x: 0, y: 0, width: 100, height: 100 }
       const newBounds = { x: 0, y: 0, width: 200, height: 50 }
       const [out] = resizeElements([el], [el.id], originBounds, newBounds)
       expect((out as typeof el).points).toEqual([
         { x: 0, y: 0 },
         { x: 20, y: 5 },
       ])
       expect(out!.width).toBe(20)
       expect(out!.height).toBe(5)
       expect((out as typeof el).pressures).toEqual([0.5, 0.8])
     })

     it("leaves startBinding/endBinding untouched", () => {
       const el = {
         ...newLine({ x: 0, y: 0, width: 50, height: 0 }),
         points: [
           { x: 0, y: 0 },
           { x: 50, y: 0 },
         ],
         startBinding: { elementId: "s", focus: 0.3, gap: 4 },
         endBinding: { elementId: "e", focus: -0.1, gap: 4 },
       }
       const originBounds = { x: 0, y: 0, width: 100, height: 100 }
       const newBounds = { x: 0, y: 0, width: 200, height: 100 }
       const [out] = resizeElements([el], [el.id], originBounds, newBounds) as [typeof el]
       expect(out.startBinding).toEqual(el.startBinding)
       expect(out.endBinding).toEqual(el.endBinding)
     })
   })

   describe("resizeElements — text fontSize scaling", () => {
     it("scales fontSize by the y-axis factor", () => {
       const el = newText({ x: 0, y: 0, width: 40, height: 20, fontSize: 20 })
       const originBounds = { x: 0, y: 0, width: 100, height: 100 }
       const newBounds = { x: 0, y: 0, width: 100, height: 200 } // sy = 2
       const [out] = resizeElements([el], [el.id], originBounds, newBounds) as [typeof el]
       expect(out.fontSize).toBe(40)
     })

     it("clamps fontSize to a minimum of 4 when the scale would shrink it below that", () => {
       const el = newText({ x: 0, y: 0, width: 40, height: 20, fontSize: 20 })
       const originBounds = { x: 0, y: 0, width: 100, height: 100 }
       const newBounds = { x: 0, y: 0, width: 100, height: 10 } // sy = 0.1 -> raw fontSize 2
       const [out] = resizeElements([el], [el.id], originBounds, newBounds) as [typeof el]
       expect(out.fontSize).toBe(4)
     })
   })

   describe("resizeElements — bound-text label exclusion", () => {
     const labelledRect = (box: { x: number; y: number; width: number; height: number }) => {
       const container = newRectangle(box)
       const label = newLabelFor(container)
       return {
         container: { ...container, boundElements: [{ id: label.id, type: "text" as const }] },
         label,
       }
     }

     it("excludes a passenger label (its container is also selected) from the result", () => {
       const { container, label } = labelledRect({ x: 0, y: 0, width: 100, height: 100 })
       const originBounds = { x: 0, y: 0, width: 100, height: 100 }
       const newBounds = { x: 0, y: 0, width: 200, height: 200 }
       const out = resizeElements(
         [container, label],
         [container.id, label.id],
         originBounds,
         newBounds,
       )
       const byId = new Map(out.map((e) => [e.id, e]))
       expect(byId.has(label.id)).toBe(false)
       expect(byId.has(container.id)).toBe(true)
     })

     it("still transforms a bound label when it is selected without its container", () => {
       const { label } = labelledRect({ x: 0, y: 0, width: 100, height: 100 })
       const originBounds = { x: 0, y: 0, width: 100, height: 100 }
       const newBounds = { x: 0, y: 0, width: 200, height: 100 }
       const [out] = resizeElements([label], [label.id], originBounds, newBounds) as [typeof label]
       expect(out.fontSize).toBe(label.fontSize) // sy = 1, unchanged, but the transform DID run
       expect(out.width).toBe(label.width * 2)
     })
   })

   describe("resizeElements — locked/deleted filtering", () => {
     it("excludes a locked element from the result", () => {
       const a = newRectangle({ x: 0, y: 0, width: 20, height: 20 })
       const locked = { ...newRectangle({ x: 50, y: 0, width: 20, height: 20 }), locked: true }
       const originBounds = { x: 0, y: 0, width: 70, height: 20 }
       const newBounds = { x: 0, y: 0, width: 140, height: 40 }
       const out = resizeElements([a, locked], [a.id, locked.id], originBounds, newBounds)
       expect(out.map((e) => e.id)).toEqual([a.id])
     })

     it("returns [] when the only selected id is missing or deleted", () => {
       const deleted = { ...newRectangle({ x: 0, y: 0, width: 10, height: 10 }), isDeleted: true }
       const box = { x: 0, y: 0, width: 10, height: 10 }
       expect(resizeElements([deleted], [deleted.id], box, box)).toEqual([])
       expect(resizeElements([deleted], ["ghost"], box, box)).toEqual([])
     })
   })

   describe("resizeElements — zero-width/zero-height origin-axis guard", () => {
     it("forces that axis's scale to 1 instead of dividing by zero", () => {
       const el: ExcalidrawElement = {
         ...newFreedraw({ x: 50, y: 10, width: 0, height: 0 }),
         points: [{ x: 0, y: 0 }],
       }
       const originBounds = { x: 50, y: 10, width: 0, height: 0 }
       const newBounds = { x: 80, y: 40, width: 60, height: 90 }
       const [out] = resizeElements([el], [el.id], originBounds, newBounds) as [typeof el]
       expect(out.x).toBe(80) // 80 + (50-50)*1
       expect(out.y).toBe(40) // 40 + (10-10)*1
       expect(out.points).toEqual([{ x: 0, y: 0 }])
       expect(out.width).toBe(0)
       expect(out.height).toBe(0)
       expect(Number.isFinite(out.x)).toBe(true)
       expect(Number.isFinite(out.y)).toBe(true)
       expect(Number.isFinite(out.width)).toBe(true)
       expect(Number.isFinite(out.height)).toBe(true)
     })
   })
   ```

3. - [ ] Run `pnpm --filter @excalidraw-clone/scene test -- resize-group` — confirm it FAILS (`resize-group` module doesn't exist).
4. - [ ] Create `packages/scene/src/resize-group.ts`:

   ```ts
   import { boundsFromPoints, type Point } from "@excalidraw-clone/geometry"
   import type { ExcalidrawElement } from "./types"

   /** Plain x/y/width/height box — the shape both the pre-drag combined
    *  selection bounds and the post-drag target bounds take. No `angle`: a
    *  group-resize box is always axis-aligned (no rotate handle for the group
    *  box, no affine shear for rotated members). */
   export interface ResizeBounds {
     x: number
     y: number
     width: number
     height: number
   }

   /** A font under this size is unreadable rather than merely small. */
   const MIN_FONT_SIZE = 4

   /** A bound-text label pulled into the set only because its container is
    *  also selected — excluded from direct transform; `reconcileBoundText`
    *  (already invoked unconditionally inside `Scene.mutate`) re-lays it out
    *  against its container's new box afterward. Mirrors `isPassengerLabel`
    *  in `flip.ts`. */
   const isPassengerLabel = (el: ExcalidrawElement, inSet: ReadonlySet<string>): boolean =>
     el.type === "text" && el.containerId !== null && inSet.has(el.containerId)

   const scalePoint = (p: Point, sx: number, sy: number): Point => ({ x: p.x * sx, y: p.y * sy })

   /** Full replacement elements for scaling the closure of `ids` from
    *  `originBounds` to `newBounds`. Position scales relative to
    *  `originBounds`'s top-left for every element type; size then scales
    *  per-type (rectangle-like incl. frame/image: width/height * scale;
    *  line/arrow/freedraw: points scaled componentwise, width/height
    *  recomputed from the scaled points' bbox rather than multiplied; text:
    *  fontSize scales by the y-axis factor, clamped to a minimum of 4).
    *  `angle` is untouched for every type. Locked, deleted, unknown ids, and
    *  passenger bound-text labels are dropped from the result, mirroring
    *  `flipElements`. Returns [] when nothing resizable is selected. */
   export function resizeElements(
     elements: readonly ExcalidrawElement[],
     ids: readonly string[],
     originBounds: ResizeBounds,
     newBounds: ResizeBounds,
   ): ExcalidrawElement[] {
     const byId = new Map(elements.map((e) => [e.id, e]))
     const idSet = new Set(ids)
     const direct = ids
       .map((id) => byId.get(id))
       .filter((e): e is ExcalidrawElement => !!e && !e.isDeleted && !e.locked)
     if (direct.length === 0) return []

     // A zero-extent origin axis (a perfectly flat line, a single-point
     // freedraw stroke, or any other zero-width/zero-height member standing
     // in for the whole selection) would divide by zero; force that axis's
     // scale to 1 instead of propagating Infinity/NaN into every scaled field.
     const sx = originBounds.width === 0 ? 1 : newBounds.width / originBounds.width
     const sy = originBounds.height === 0 ? 1 : newBounds.height / originBounds.height

     return direct
       .filter((el) => !isPassengerLabel(el, idSet))
       .map((el) => {
         const x = newBounds.x + (el.x - originBounds.x) * sx
         const y = newBounds.y + (el.y - originBounds.y) * sy

         switch (el.type) {
           case "line":
           case "arrow":
           case "freedraw": {
             const points = el.points.map((p) => scalePoint(p, sx, sy))
             const bbox = boundsFromPoints(points)
             return { ...el, x, y, points, width: bbox.width, height: bbox.height }
           }
           case "text": {
             const fontSize = Math.max(MIN_FONT_SIZE, el.fontSize * sy)
             return { ...el, x, y, width: el.width * sx, height: el.height * sy, fontSize }
           }
           default:
             return { ...el, x, y, width: el.width * sx, height: el.height * sy }
         }
       })
   }
   ```

5. - [ ] Add the export to `packages/scene/src/index.ts`, immediately after the existing `export { flipElements, mirrorOf } from "./flip"` / `export type { FlipAxis } from "./flip"` lines:

   ```ts
   export { resizeElements } from "./resize-group"
   export type { ResizeBounds } from "./resize-group"
   ```

6. - [ ] Re-run `pnpm --filter @excalidraw-clone/scene test -- resize-group` — confirm ALL tests PASS.
7. - [ ] Run `pnpm --filter @excalidraw-clone/scene test` (full package suite) — confirm nothing else regressed.
8. - [ ] Focused gate: `pnpm turbo run lint typecheck test --filter @excalidraw-clone/scene --force` — green.
9. - [ ] Commit: `feat(scene): add resizeElements for multi-element group resize`.

---

### Task 2: combined-bbox handle hit-testing in `packages/tools`

**Context for a fresh implementer (no prior context needed beyond this):** `findHandleAt` (`packages/tools/src/tools/selection/handles.ts`) currently returns `null` immediately whenever `selectedIds.length !== 1` — today's multi-select resize/rotate chrome is pure decoration with nothing hittable behind it. This task adds a `selectedIds.length >= 2` branch that computes the selection's combined AABB (via the existing `getElementsBounds`, already exported from `@excalidraw-clone/scene`) and hit-tests its 8 corner/edge points, the same `HANDLE_HIT_HALF`-tolerance `within()` check the single-element path already uses. No rotation handle for the group box (out of scope). This task only changes hit-testing — no drag-state, no rendering.

**Files:**

- Modify: `packages/tools/src/tools/selection/handles.ts`
- Modify: `packages/tools/test/selection-handles.test.ts`

**Interfaces:**

- `HandleHit` gains one new union member: `{ kind: "groupResize"; handle: ResizeHandle; ids: readonly string[] }`.
- `findHandleAt(at, selectedIds, elements, view)` signature is unchanged; its behavior for `selectedIds.length === 1` is unchanged (verified by a new regression test).

**Steps:**

1. - [ ] Add failing tests to `packages/tools/test/selection-handles.test.ts`. Add `type ResizeHandle` and `type Point` to the existing top-of-file imports (currently `import { newArrow, newRectangle } from "@excalidraw-clone/scene"` / `import type { ExcalidrawArrowElement, ExcalidrawElement } from "@excalidraw-clone/scene"` / `import { describe, expect, it } from "vitest"` / `import { findHandleAt } from "../src"` / `import { IDENTITY_VIEW } from "./test-utils"`):

   ```ts
   import type { Point } from "@excalidraw-clone/geometry"
   import type { ResizeHandle } from "../src"
   ```

   Then append this new describe block at the end of the file:

   ```ts
   describe("findHandleAt — group resize (2+ selection)", () => {
     const rectA = () => ({ ...newRectangle({ x: 0, y: 0, width: 100, height: 100 }), id: "a" })
     const rectB = () => ({ ...newRectangle({ x: 300, y: 0, width: 100, height: 100 }), id: "b" })

     const HANDLE_POSITIONS: { handle: ResizeHandle; at: Point }[] = [
       { handle: "nw", at: { x: 0, y: 0 } },
       { handle: "ne", at: { x: 400, y: 0 } },
       { handle: "se", at: { x: 400, y: 100 } },
       { handle: "sw", at: { x: 0, y: 100 } },
       { handle: "n", at: { x: 200, y: 0 } },
       { handle: "e", at: { x: 400, y: 50 } },
       { handle: "s", at: { x: 200, y: 100 } },
       { handle: "w", at: { x: 0, y: 50 } },
     ]

     it.each(HANDLE_POSITIONS)("hits the combined-bbox $handle handle", ({ handle, at }) => {
       const a = rectA()
       const b = rectB()
       const hit = findHandleAt(at, [a.id, b.id], [a, b], IDENTITY_VIEW)
       expect(hit).toEqual({ kind: "groupResize", handle, ids: [a.id, b.id] })
     })

     it("misses a point that is not on any combined-bbox handle", () => {
       const a = rectA()
       const b = rectB()
       expect(findHandleAt({ x: 150, y: 50 }, [a.id, b.id], [a, b], IDENTITY_VIEW)).toBeNull()
     })

     it("falls back to null when fewer than 2 non-deleted elements remain in the selection", () => {
       const a = rectA()
       const deletedB = { ...rectB(), isDeleted: true }
       const hit = findHandleAt(
         { x: 100, y: 100 },
         [a.id, deletedB.id],
         [a, deletedB],
         IDENTITY_VIEW,
       )
       expect(hit).toBeNull()
     })

     it("regression: single-selection resize hit-testing is unaffected by the new branch", () => {
       const r = newRectangle({ x: 0, y: 0, width: 100, height: 100 })
       expect(findHandleAt({ x: 100, y: 100 }, [r.id], [r], IDENTITY_VIEW)?.kind).toBe("resize")
     })
   })
   ```

2. - [ ] Run `pnpm --filter @excalidraw-clone/tools test -- selection-handles` — confirm the new cases FAIL (`selectedIds.length >= 2` currently returns `null` unconditionally).
3. - [ ] Implement in `packages/tools/src/tools/selection/handles.ts`. Change the import line `import type { ExcalidrawElement } from "@excalidraw-clone/scene"` to:

   ```ts
   import { type ExcalidrawElement, getElementsBounds } from "@excalidraw-clone/scene"
   ```

   Add the new `HandleHit` union member (in the existing `export type HandleHit = | ... ` block):

   ```ts
   export type HandleHit =
     | { kind: "resize"; elementId: string; handle: ResizeHandle }
     | { kind: "rotate"; elementId: string }
     | { kind: "endpoint"; elementId: string; end: "start" | "end" }
     | { kind: "bend"; elementId: string; index: number }
     | { kind: "bendAdd"; elementId: string; segmentIndex: number; at: Point }
     | { kind: "groupResize"; handle: ResizeHandle; ids: readonly string[] }
   ```

   Insert the new branch at the very top of `findHandleAt`, before the existing `if (selectedIds.length !== 1) return null` line:

   ```ts
   export const findHandleAt = (
     at: Point,
     selectedIds: readonly string[],
     elements: readonly ExcalidrawElement[],
     view: ViewTransform,
   ): HandleHit | null => {
     if (selectedIds.length >= 2) {
       const selected = selectedIds
         .map((id) => elements.find((el) => el.id === id))
         .filter((el): el is ExcalidrawElement => !!el && !el.isDeleted)
       if (selected.length < 2) return null
       const bounds = getElementsBounds(selected)
       if (!bounds) return null
       const atV = sceneToViewport(at, view)
       const nw = sceneToViewport({ x: bounds.x, y: bounds.y }, view)
       const ne = sceneToViewport({ x: bounds.x + bounds.width, y: bounds.y }, view)
       const se = sceneToViewport(
         { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
         view,
       )
       const sw = sceneToViewport({ x: bounds.x, y: bounds.y + bounds.height }, view)
       const handlePoints: { name: ResizeHandle; p: Point }[] = [
         { name: "nw", p: nw },
         { name: "ne", p: ne },
         { name: "se", p: se },
         { name: "sw", p: sw },
         { name: "n", p: midPoint(nw, ne) },
         { name: "e", p: midPoint(ne, se) },
         { name: "s", p: midPoint(se, sw) },
         { name: "w", p: midPoint(sw, nw) },
       ]
       for (const { name, p } of handlePoints) {
         if (within(atV, p)) return { kind: "groupResize", handle: name, ids: selectedIds }
       }
       return null
     }
     if (selectedIds.length !== 1) return null
     const id = selectedIds[0]!
     // ... rest of the function is unchanged
   ```

   (`midPoint` and `within` are the existing private helpers already defined earlier in this file — no new helpers needed.)

4. - [ ] Re-run `pnpm --filter @excalidraw-clone/tools test -- selection-handles` — confirm ALL cases PASS, including every pre-existing case in the file (linear endpoints, bend points, elbowed-arrow suppression).
5. - [ ] Run `pnpm --filter @excalidraw-clone/tools test` (full package suite) — confirm nothing else regressed.
6. - [ ] Focused gate: `pnpm turbo run lint typecheck test --filter @excalidraw-clone/tools --filter @excalidraw-clone/scene --force` — green.
7. - [ ] Commit: `feat(tools): hit-test the combined bounding box for 2+ selections`.

---

### Task 3: group-resize drag/commit/revert wiring in the selection tool

**Context for a fresh implementer (no prior context needed beyond this):** This task makes the `groupResize` handle hit from Task 2 actually draggable. It adds a new `groupResizing` phase to `SelectionState`, parallel to the existing single-element `resizing` phase, plus a new file `packages/tools/src/tools/selection/group-resize.ts` with move/commit/revert `ToolEffect` builders (mirroring `resize.ts`'s `buildResizeMoveEffect`/`buildResizeCommitEffect`/`buildResizeRevertEffect`).

**Important correctness detail a fresh implementer must not skip:** the app's `ctx.readElements()` reflects the _live_ scene, already mutated by any earlier frame's `skipHistory` effect (confirmed by tracing `apps/web/src/driver/effects.ts`: every `"mutation"` effect, `skipHistory` or not, is applied for real via `scene.mutate`). The existing single-element `buildResizeMoveEffect` sidesteps this by fully overwriting `{x, y, width, height}` from `origin` + total pointer displacement every frame — it never reads the live element's _current_ x/y as an input to the math. `resizeElements`, by contrast, computes each member's new box _relative to its own stored x/y_ — so if it were fed the live (already-scaled) draft on frame 2, it would scale an already-scaled element a second time, compounding the wrong result. To keep group-resize just as frame-independent as single-element resize, the `groupResizing` phase snapshots the pristine pre-drag elements (`originalElements`) at `pointerDown` and every subsequent `pointerMove`/`escape` always recomputes from that snapshot plus the frozen `origin` box — never from the live draft. This is why the phase carries `originalElements` in addition to the `origin` box the design spec calls out.

**Files:**

- Modify: `packages/tools/src/tools/selection/types.ts`
- Modify: `packages/tools/src/tools/selection/resize.ts` (export `computeResize`, no logic change)
- Create: `packages/tools/src/tools/selection/group-resize.ts`
- Modify: `packages/tools/src/tools/selection/index.ts`
- Modify: `packages/tools/test/selection-resize.test.ts`

**Interfaces:**

- Consumes: `resizeElements` (Task 1, from `@excalidraw-clone/scene`); the `groupResize` `HandleHit` variant (Task 2).
- Produces: `SelectionState`'s new `groupResizing` phase — `{ phase: "groupResizing"; handle: ResizeHandle; ids: readonly string[]; origin: { x; y; width; height; angle: 0 }; originalElements: readonly ExcalidrawElement[]; start: Point }`. `buildGroupResizeMoveEffect(ids, originalElements, origin, handle, start, at, modifiers)`, `buildGroupResizeCommitEffect(ids)`, `buildGroupResizeRevertEffect(ids, originalElements)` from `group-resize.ts`.

**Steps:**

1. - [ ] Add failing tests to `packages/tools/test/selection-resize.test.ts`. First, **rename** the existing final describe block (it is no longer accurate now that group resize exists) — replace:

   ```ts
   describe("selection — resize: only single-element resize is supported in v1", () => {
     it("with multi-selection, handle hit returns null and click on empty space goes to marquee", () => {
   ```

   with:

   ```ts
   describe("selection — resize: multi-selection click away from any handle falls through to marquee", () => {
     it("point (100,100) is not on the combined bbox's 8 handle positions, so it still starts a marquee", () => {
   ```

   (the test body is unchanged — for `a` at `(0,0,100,100)` and `b` at `(200,0,100,100)`, the combined bbox is `x:0..300, y:0..100`, whose 8 handle positions are `(0,0) (150,0) (300,0) (300,50) (300,100) (150,100) (0,100) (0,50)`; `(100,100)` is none of them, so it still misses and falls through to marquee — this is now a real regression case for Task 2's new branch, not a "not supported yet" placeholder).

   Then append two new describe blocks:

   ```ts
   describe("selection — group resize (2+ selection)", () => {
     const setup = () => {
       const a = newRectangle({ x: 0, y: 0, width: 100, height: 100 })
       const b = newRectangle({ x: 200, y: 0, width: 100, height: 100 })
       const draft: ExcalidrawElement[] = [a, b]
       const ctx = makeCtx({
         readElements: () => draft,
         hitTest: () => null,
         selectedIds: [a.id, b.id],
       })
       return { a, b, draft, ctx }
     }

     it("SE handle drag scales both rectangles proportionally from the combined bounds", () => {
       const { a, b, draft, ctx } = setup()
       let s = selectionTool.reduce(
         selectionTool.initial,
         { type: "pointerDown", at: point(300, 100) },
         ctx,
       )
       expect(s[0].phase).toBe("groupResizing")
       s = selectionTool.reduce(s[0], { type: "pointerMove", at: point(600, 200) }, ctx)
       applyMutation(s[1], draft)
       const outA = draft.find((e) => e.id === a.id)!
       const outB = draft.find((e) => e.id === b.id)!
       expect([outA.x, outA.y, outA.width, outA.height]).toEqual([0, 0, 200, 200])
       expect([outB.x, outB.y, outB.width, outB.height]).toEqual([400, 0, 200, 200])
     })

     it("shift constrains the drag to the combined bounds' own aspect ratio", () => {
       const { a, b, draft, ctx } = setup()
       const shiftCtx = { ...ctx, modifiers: withModifiers({ shift: true }) }
       let s = selectionTool.reduce(
         selectionTool.initial,
         { type: "pointerDown", at: point(300, 100) },
         shiftCtx,
       )
       s = selectionTool.reduce(s[0], { type: "pointerMove", at: point(900, 250) }, shiftCtx)
       applyMutation(s[1], draft)
       const outA = draft.find((e) => e.id === a.id)!
       const outB = draft.find((e) => e.id === b.id)!
       expect([outA.x, outA.y, outA.width, outA.height]).toEqual([0, 0, 300, 300])
       expect([outB.x, outB.y, outB.width, outB.height]).toEqual([600, 0, 300, 300])
     })

     it("pointerUp emits a history-tracked mutation and returns to idle", () => {
       const { ctx } = setup()
       let s = selectionTool.reduce(
         selectionTool.initial,
         { type: "pointerDown", at: point(300, 100) },
         ctx,
       )
       s = selectionTool.reduce(s[0], { type: "pointerMove", at: point(600, 200) }, ctx)
       const up = selectionTool.reduce(s[0], { type: "pointerUp", at: point(600, 200) }, ctx)
       expect(up[0].phase).toBe("idle")
       const mut = up[1].find((e) => e.kind === "mutation")
       if (mut?.kind === "mutation") expect(mut.skipHistory).toBeUndefined()
     })

     it("escape restores both elements to their exact pre-drag geometry", () => {
       const { a, b, draft, ctx } = setup()
       let s = selectionTool.reduce(
         selectionTool.initial,
         { type: "pointerDown", at: point(300, 100) },
         ctx,
       )
       s = selectionTool.reduce(s[0], { type: "pointerMove", at: point(600, 200) }, ctx)
       applyMutation(s[1], draft)
       expect(draft.find((e) => e.id === a.id)?.width).not.toBe(100)
       s = selectionTool.reduce(s[0], { type: "escape" }, ctx)
       applyMutation(s[1], draft)
       const outA = draft.find((e) => e.id === a.id)!
       const outB = draft.find((e) => e.id === b.id)!
       expect([outA.x, outA.y, outA.width, outA.height]).toEqual([0, 0, 100, 100])
       expect([outB.x, outB.y, outB.width, outB.height]).toEqual([200, 0, 100, 100])
     })
   })
   ```

2. - [ ] Run `pnpm --filter @excalidraw-clone/tools test -- selection-resize` — confirm the renamed test still PASSES (no behavior change there) and the new `"selection — group resize"` cases FAIL (`phase` stays `"marquee"` today, since `pointerDown` on a `groupResize` handle hit isn't handled yet — TypeScript will also currently reject the test file once `groupResizing` isn't a valid `SelectionState.phase`, so this step's "FAIL" may be a compile error rather than a runtime assertion failure; either counts as confirming the red state).
3. - [ ] Implement. First, `packages/tools/src/tools/selection/types.ts` — add the `ExcalidrawElement` import and the new phase to the `SelectionState` union (after the existing `resizing` member):

   ```ts
   import type { Point } from "@excalidraw-clone/geometry"
   import type { ExcalidrawElement } from "@excalidraw-clone/scene"
   import type { LinearSnapshot } from "./endpoint"

   export type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w"

   export type SelectionState =
     | { phase: "idle" }
     | {
         phase: "dragging"
         start: Point
         last: Point
         movedIds: readonly string[]
         firstMove: boolean
       }
     | {
         phase: "resizing"
         handle: ResizeHandle
         elementId: string
         origin: { x: number; y: number; width: number; height: number; angle: number }
         start: Point
       }
     | {
         phase: "groupResizing"
         handle: ResizeHandle
         ids: readonly string[]
         origin: { x: number; y: number; width: number; height: number; angle: number }
         originalElements: readonly ExcalidrawElement[]
         start: Point
       }
     | {
         phase: "rotating"
         elementId: string
         origin: { angle: number }
         center: Point
         pointerAngleAtStart: number
       }
     | {
         phase: "endpointDragging"
         elementId: string
         end: "start" | "end"
         origin: LinearSnapshot
         candidateBindId: string | null
       }
     | {
         phase: "bendDragging"
         elementId: string
         index: number
         origin: LinearSnapshot
       }
     | { phase: "marquee"; start: Point; current: Point; baseSelection: readonly string[] }

   export const SELECTION_INITIAL: SelectionState = { phase: "idle" }
   ```

4. - [ ] `packages/tools/src/tools/selection/resize.ts` — change one line, the private `computeResize` becomes exported (no logic change):

   ```ts
   export const computeResize = (
   ```

5. - [ ] Create `packages/tools/src/tools/selection/group-resize.ts`:

   ```ts
   import type { Point } from "@excalidraw-clone/geometry"
   import { type ExcalidrawElement, resizeElements } from "@excalidraw-clone/scene"
   import type { Modifiers, ToolEffect } from "../../types"
   import { computeResize, type ResizeOrigin } from "./resize"
   import type { ResizeHandle } from "./types"

   /** Overwrite each draft element that appears in `next` with its
    *  replacement, matched by id. Elements not present in `next` (locked,
    *  deleted, or passenger labels — see `resizeElements`) are left
    *  untouched. */
   const applyReplacements = (
     draft: ExcalidrawElement[],
     next: readonly ExcalidrawElement[],
   ): void => {
     const byId = new Map(next.map((e) => [e.id, e]))
     for (let i = 0; i < draft.length; i += 1) {
       const replacement = byId.get(draft[i]!.id)
       if (replacement) draft[i] = replacement
     }
   }

   /** Absolute, path-independent per-frame move effect: always scales from the
    *  pristine `originalElements` snapshot captured at pointerDown, relative
    *  to the frozen `origin` box — never from the live (possibly
    *  already-mutated) draft. This mirrors how the existing single-element
    *  `buildResizeMoveEffect` always recomputes the whole box from `origin` +
    *  total pointer displacement rather than accumulating incremental deltas,
    *  so repeated pointerMove events (and an eventual escape/revert) stay
    *  exact regardless of path or of the text fontSize floor clamp in
    *  `resizeElements`. */
   export const buildGroupResizeMoveEffect = (
     ids: readonly string[],
     originalElements: readonly ExcalidrawElement[],
     origin: ResizeOrigin,
     handle: ResizeHandle,
     start: Point,
     at: Point,
     modifiers: Modifiers,
   ): ToolEffect => {
     const box = computeResize(origin, handle, start, at, modifiers)
     return {
       kind: "mutation",
       apply: (draft) =>
         applyReplacements(draft, resizeElements(originalElements, ids, origin, box)),
       skipHistory: true,
     }
   }

   export const buildGroupResizeCommitEffect = (ids: readonly string[]): ToolEffect => ({
     kind: "mutation",
     apply: (draft) => {
       // No-op replace: re-emit each resized element to push a fresh history snapshot.
       for (let i = 0; i < draft.length; i += 1) {
         const e = draft[i]!
         if (!ids.includes(e.id)) continue
         draft[i] = { ...e }
       }
     },
   })

   export const buildGroupResizeRevertEffect = (
     ids: readonly string[],
     originalElements: readonly ExcalidrawElement[],
   ): ToolEffect => ({
     kind: "mutation",
     apply: (draft) => applyReplacements(draft, originalElements),
     skipHistory: true,
   })
   ```

6. - [ ] `packages/tools/src/tools/selection/index.ts` — four edits:

   a. Change the top import block from:

   ```ts
   import {
     bindingTargetAt,
     expandIdsToFrameMembers,
     expandIdsToGroups,
     LABELABLE_TYPES,
     newLabelFor,
     newLabelForLinear,
   } from "@excalidraw-clone/scene"
   ```

   to:

   ```ts
   import {
     type ExcalidrawElement,
     bindingTargetAt,
     expandIdsToFrameMembers,
     expandIdsToGroups,
     getElementsBounds,
     LABELABLE_TYPES,
     newLabelFor,
     newLabelForLinear,
   } from "@excalidraw-clone/scene"
   ```

   b. Add a new import immediately after the existing `import { findHandleAt } from "./handles"` line:

   ```ts
   import {
     buildGroupResizeCommitEffect,
     buildGroupResizeMoveEffect,
     buildGroupResizeRevertEffect,
   } from "./group-resize"
   ```

   c. In `reduceIdle`'s `pointerDown` handling, insert a `groupResize` branch right after `const elements = ctx.readElements()` and before `const e = elements.find((el) => el.id === handle.elementId)`:

   ```ts
     if (event.type === "pointerDown") {
       // Prefer handle hits if they occur on a single-selected element.
       const handle = findHandleAt(event.at, ctx.selectedIds, ctx.readElements(), ctx.viewTransform)
       if (handle) {
         const elements = ctx.readElements()
         if (handle.kind === "groupResize") {
           const selected = handle.ids
             .map((id) => elements.find((el) => el.id === id))
             .filter((el): el is ExcalidrawElement => !!el && !el.isDeleted)
           const bounds = getElementsBounds(selected)
           // Defensive: findHandleAt already required 2+ non-deleted members to
           // produce this hit from this same `elements` snapshot, so `bounds`
           // is never actually null here — kept for the same reason similar
           // guards are kept elsewhere in this codebase (cheap insurance).
           if (!bounds) return [{ phase: "idle" }, []]
           return [
             {
               phase: "groupResizing",
               handle: handle.handle,
               ids: handle.ids,
               origin: {
                 x: bounds.x,
                 y: bounds.y,
                 width: bounds.width,
                 height: bounds.height,
                 angle: 0,
               },
               originalElements: selected,
               start: event.at,
             },
             [],
           ]
         }
         const e = elements.find((el) => el.id === handle.elementId)
         if (e && handle.kind === "resize") {
   ```

   (everything from `const e = elements.find(...)` onward is the existing code, unchanged — TypeScript now narrows `handle` to exclude `"groupResize"` past the new block since every path in it returns.)

   d. Add a new `reduceGroupResizing` function, placed immediately after the existing `reduceResizing` function and before `reduceRotating`:

   ```ts
   const reduceGroupResizing = (
     state: Extract<SelectionState, { phase: "groupResizing" }>,
     event: ToolEvent,
     ctx: ToolContext,
   ): [SelectionState, readonly ToolEffect[]] => {
     switch (event.type) {
       case "pointerMove": {
         return [
           state,
           [
             buildGroupResizeMoveEffect(
               state.ids,
               state.originalElements,
               state.origin,
               state.handle,
               state.start,
               event.at,
               ctx.modifiers,
             ),
           ],
         ]
       }
       case "pointerUp":
         return [{ phase: "idle" }, [buildGroupResizeCommitEffect(state.ids)]]
       case "escape":
         return [
           { phase: "idle" },
           [buildGroupResizeRevertEffect(state.ids, state.originalElements)],
         ]
       default:
         return [state, []]
     }
   }
   ```

   Then add its case to the main `reduce` switch, immediately after `case "resizing": return reduceResizing(state, event, ctx)`:

   ```ts
       case "resizing":
         return reduceResizing(state, event, ctx)
       case "groupResizing":
         return reduceGroupResizing(state, event, ctx)
       case "rotating":
   ```

7. - [ ] Re-run `pnpm --filter @excalidraw-clone/tools test -- selection-resize` — confirm ALL cases PASS, including every pre-existing case in the file (corner/edge handles, shift aspect lock, single-element commit/escape).
8. - [ ] Run `pnpm --filter @excalidraw-clone/tools test` (full package suite) — confirm nothing else regressed (in particular `selection-handles.test.ts` from Task 2, `selection-drag.test.ts`, `selection-marquee.test.ts`).
9. - [ ] Focused gate: `pnpm turbo run lint typecheck test --filter @excalidraw-clone/tools --filter @excalidraw-clone/scene --force` — green.
10. - [ ] Commit: `feat(tools): wire group-resize drag/commit/revert into the selection tool`.

---

### Task 4: combined-bounds resize chrome in `packages/renderer`

**Context for a fresh implementer (no prior context needed beyond this):** `drawSelectionChrome` (`packages/renderer/src/overlay.ts`) currently loops every selected element and calls `drawElementChrome`, which draws that element's own outline **plus its own 8 handles plus a rotation handle** — for a 2+ selection, none of that per-element chrome is hittable anymore after Tasks 2–3 (the real hittable target is the one combined-bbox handle set). This task splits `drawElementChrome`'s outline-drawing into a reusable `drawElementOutline`, keeps drawing per-element _outlines only_ for a 2+ selection (so users still see each member's extent), and adds one combined-bounds box with 8 handles on top — computed the same way as Task 2's `findHandleAt` branch. For a single-element (or empty) selection, nothing changes at all. No new rotation handle is drawn for the group box (out of scope). There is no dedicated renderer unit test suite in this codebase — canvas drawing is verified via the Task 5 e2e spec, per existing precedent (`overlay.ts` has no unit tests today).

**Files:**

- Modify: `packages/renderer/src/overlay.ts`

**Interfaces:**

- Consumes: `getElementsBounds` (already exported from `@excalidraw-clone/scene`, used by Task 2's `findHandleAt` branch too).
- Produces: nothing new consumed by later tasks — this is the final piece needed for the feature to be visually complete; only e2e coverage remains.

**Steps:**

1. - [ ] Change the scene import at the top of `packages/renderer/src/overlay.ts` from:

   ```ts
   import { type ExcalidrawElement, getElementBounds } from "@excalidraw-clone/scene"
   ```

   to:

   ```ts
   import {
     type ExcalidrawElement,
     getElementBounds,
     getElementsBounds,
   } from "@excalidraw-clone/scene"
   ```

2. - [ ] Extract the outline-drawing portion of `drawElementChrome` into a new `drawElementOutline` function, placed immediately before `drawElementChrome`, and have `drawElementChrome` call it instead of duplicating the drawing code. Replace the existing `drawElementChrome` function body with:

   ```ts
   const drawElementOutline = (
     ctx: CanvasRenderingContext2D,
     e: ExcalidrawElement,
     view: ViewTransform,
     theme: Theme,
   ): void => {
     if (isLinear(e)) {
       const pts = (e as { points: readonly Point[] }).points
       const absV = pts.map((p) => sceneToViewport({ x: e.x + p.x, y: e.y + p.y }, view))
       ctx.strokeStyle = SELECTION_STROKE[theme]
       ctx.lineWidth = 1
       ctx.beginPath()
       ctx.moveTo(absV[0]!.x, absV[0]!.y)
       for (let i = 1; i < absV.length; i += 1) ctx.lineTo(absV[i]!.x, absV[i]!.y)
       ctx.stroke()
       return
     }
     const corners = elementCorners(e).map((p) => sceneToViewport(p, view))
     ctx.strokeStyle = SELECTION_STROKE[theme]
     ctx.lineWidth = 1
     ctx.beginPath()
     ctx.moveTo(corners[0]!.x, corners[0]!.y)
     for (let i = 1; i < corners.length; i += 1) {
       ctx.lineTo(corners[i]!.x, corners[i]!.y)
     }
     ctx.closePath()
     ctx.stroke()
   }

   const drawElementChrome = (
     ctx: CanvasRenderingContext2D,
     e: ExcalidrawElement,
     view: ViewTransform,
     theme: Theme,
   ): void => {
     drawElementOutline(ctx, e, view, theme)
     if (isLinear(e)) {
       const pts = (e as { points: readonly Point[] }).points
       const absV = pts.map((p) => sceneToViewport({ x: e.x + p.x, y: e.y + p.y }, view))
       // Ghost midpoints first so solid handles paint on top.
       for (let k = 0; k < absV.length - 1; k += 1) {
         drawGhostHandle(ctx, midPoint(absV[k]!, absV[k + 1]!), theme)
       }
       for (const p of absV) drawHandle(ctx, p, theme)
       return
     }
     const corners = elementCorners(e).map((p) => sceneToViewport(p, view))
     const c0 = corners[0]!
     const c1 = corners[1]!
     const c2 = corners[2]!
     const c3 = corners[3]!
     const handles: Point[] = [
       c0,
       c1,
       c2,
       c3,
       midPoint(c0, c1),
       midPoint(c1, c2),
       midPoint(c2, c3),
       midPoint(c3, c0),
     ]
     for (const h of handles) drawHandle(ctx, h, theme)

     const topMid = midPoint(c0, c1)
     const dx = c1.x - c0.x
     const dy = c1.y - c0.y
     const len = Math.hypot(dx, dy) || 1
     const nx = -dy / len
     const ny = dx / len
     const rotPoint: Point = {
       x: topMid.x + nx * -ROTATION_HANDLE_OFFSET,
       y: topMid.y + ny * -ROTATION_HANDLE_OFFSET,
     }
     ctx.fillStyle = SELECTION_FILL[theme]
     ctx.strokeStyle = SELECTION_STROKE[theme]
     ctx.beginPath()
     ctx.arc(rotPoint.x, rotPoint.y, ROTATION_HANDLE_RADIUS, 0, Math.PI * 2)
     ctx.fill()
     ctx.stroke()
   }
   ```

   (This draws the outline once via the shared helper, then the same handles/rotation-handle code as before — behavior for a single-element selection is byte-for-byte identical to today.)

3. - [ ] Add a new `drawGroupResizeChrome` function, placed immediately after `drawElementChrome` and before `export interface DrawSelectionChromeOptions`:

   ```ts
   const drawGroupResizeChrome = (
     ctx: CanvasRenderingContext2D,
     elements: readonly ExcalidrawElement[],
     view: ViewTransform,
     theme: Theme,
   ): void => {
     const bounds = getElementsBounds(elements)
     if (!bounds) return
     const nw = sceneToViewport({ x: bounds.x, y: bounds.y }, view)
     const ne = sceneToViewport({ x: bounds.x + bounds.width, y: bounds.y }, view)
     const se = sceneToViewport({ x: bounds.x + bounds.width, y: bounds.y + bounds.height }, view)
     const sw = sceneToViewport({ x: bounds.x, y: bounds.y + bounds.height }, view)
     ctx.strokeStyle = SELECTION_STROKE[theme]
     ctx.lineWidth = 1
     ctx.beginPath()
     ctx.moveTo(nw.x, nw.y)
     ctx.lineTo(ne.x, ne.y)
     ctx.lineTo(se.x, se.y)
     ctx.lineTo(sw.x, sw.y)
     ctx.closePath()
     ctx.stroke()
     const handles: Point[] = [
       nw,
       ne,
       se,
       sw,
       midPoint(nw, ne),
       midPoint(ne, se),
       midPoint(se, sw),
       midPoint(sw, nw),
     ]
     for (const h of handles) drawHandle(ctx, h, theme)
   }
   ```

4. - [ ] In `drawSelectionChrome`, replace the existing selection-drawing block:

   ```ts
   if (selection.length > 0) {
     const byId = new Map(elements.map((e) => [e.id, e]))
     for (const id of selection) {
       const e = byId.get(id)
       if (!e) continue
       void getElementBounds(e)
       drawElementChrome(ctx, e, view, theme)
     }
   }
   ```

   with:

   ```ts
   if (selection.length > 0) {
     const byId = new Map(elements.map((e) => [e.id, e]))
     const selectedElements = selection
       .map((id) => byId.get(id))
       .filter((e): e is ExcalidrawElement => !!e)
     if (selectedElements.length >= 2) {
       for (const e of selectedElements) drawElementOutline(ctx, e, view, theme)
       drawGroupResizeChrome(ctx, selectedElements, view, theme)
     } else {
       for (const e of selectedElements) {
         void getElementBounds(e)
         drawElementChrome(ctx, e, view, theme)
       }
     }
   }
   ```

   (the `void getElementBounds(e)` call is pre-existing, unrelated dead code — left untouched in the single-element branch to keep this diff minimal.)

5. - [ ] Run `pnpm --filter @excalidraw-clone/renderer test` (full package suite) — confirm nothing regressed (this package has no tests specific to this change, per the design spec's Testing section; this run just confirms the file still compiles and any adjacent renderer tests still pass).
6. - [ ] Focused gate: `pnpm turbo run lint typecheck test --filter @excalidraw-clone/renderer --filter @excalidraw-clone/scene --force` — green.
7. - [ ] Commit: `feat(renderer): draw one combined-bounds handle box for multi-selection`.

---

### Task 5: E2E coverage + full gate + integrate

**Context for a fresh implementer (no prior context needed beyond this):** Tasks 1–4 land the full feature. This task adds browser-level proof via Playwright, covering the two scenarios the design spec's Testing section calls for: two rectangles multi-selected and drag-scaled together, and a rectangle+line pair multi-selected and drag-scaled, with the line's `width`/`height` checked against a **fresh bounds computation over its own persisted, scaled `points`** (not a value derived from assumptions about the drag math) — this is the direct regression guard for the exact invariant Task 1 protects, and the same class of bug the Stats Panel final review caught for direct width/height edits on line/arrow/freedraw elements. It follows the existing `apps/web/e2e/stats-panel.spec.ts` / `apps/web/e2e/flip.spec.ts` conventions (`dragOnCanvas`/`parseStoredScene` from `_helpers.ts`, `[data-testid="toolbar-rectangle"]`/`[data-testid="toolbar-line"]`/`[data-testid="toolbar-selection"]`, marquee-drag for multi-select from empty canvas space).

**Files:**

- Create: `apps/web/e2e/multi-resize.spec.ts`
- (verification only) full monorepo gate + full e2e suite

**Steps:**

1. - [ ] Write `apps/web/e2e/multi-resize.spec.ts`:

   ```ts
   import { expect, test, type Page } from "@playwright/test"
   import { dragOnCanvas, parseStoredScene } from "./_helpers"

   interface SceneEl {
     id: string
     type: string
     x: number
     y: number
     width: number
     height: number
     points?: { x: number; y: number }[]
     isDeleted?: boolean
   }

   const readScene = async (page: Page): Promise<SceneEl[]> => {
     const json = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
     return parseStoredScene<SceneEl>(json).elements.filter((e) => !e.isDeleted)
   }

   const freshCanvas = async (page: Page): Promise<void> => {
     await page.goto("/")
     await page.evaluate(() => localStorage.clear())
     await page.reload()
     await page.locator('[data-testid="toolbar-rectangle"]').waitFor({ state: "visible" })
   }

   const draw = async (
     page: Page,
     toolTestId: string,
     from: { x: number; y: number },
     to: { x: number; y: number },
   ): Promise<void> => {
     await page.locator(`[data-testid="${toolTestId}"]`).click()
     await dragOnCanvas(page, from, to)
     await page.waitForTimeout(120)
   }

   test("multi-select two rectangles, drag a corner handle: both scale proportionally and persist", async ({
     page,
   }) => {
     await freshCanvas(page)
     await draw(page, "toolbar-rectangle", { x: 100, y: 100 }, { x: 200, y: 200 })
     await draw(page, "toolbar-rectangle", { x: 300, y: 100 }, { x: 400, y: 200 })

     // Marquee-select both from empty canvas space.
     await page.locator('[data-testid="toolbar-selection"]').click()
     await dragOnCanvas(page, { x: 60, y: 60 }, { x: 440, y: 220 })
     await page.waitForTimeout(150)

     // Combined bbox is x:100..400, y:100..200 — drag its SE handle outward.
     await dragOnCanvas(page, { x: 400, y: 200 }, { x: 700, y: 300 })
     await page.waitForTimeout(900) // autosave debounce

     const rects = (await readScene(page)).filter((e) => e.type === "rectangle")
     expect(rects).toHaveLength(2)
     const [first, second] = rects.sort((a, b) => a.x - b.x)
     // sx = sy = 2 from the combined bounds (300x100 -> 600x200)
     expect(first!.x).toBeCloseTo(100)
     expect(first!.y).toBeCloseTo(100)
     expect(first!.width).toBeCloseTo(200)
     expect(first!.height).toBeCloseTo(200)
     expect(second!.x).toBeCloseTo(500)
     expect(second!.y).toBeCloseTo(100)
     expect(second!.width).toBeCloseTo(200)
     expect(second!.height).toBeCloseTo(200)
   })

   test("multi-select a rectangle and a line, drag a handle: the line's width/height stay consistent with its scaled points", async ({
     page,
   }) => {
     await freshCanvas(page)
     await draw(page, "toolbar-rectangle", { x: 100, y: 100 }, { x: 200, y: 200 })
     await draw(page, "toolbar-line", { x: 300, y: 100 }, { x: 380, y: 180 })

     await page.locator('[data-testid="toolbar-selection"]').click()
     await dragOnCanvas(page, { x: 60, y: 60 }, { x: 420, y: 220 })
     await page.waitForTimeout(150)

     // Combined bbox is x:100..380, y:100..200 — drag its SE handle outward.
     await dragOnCanvas(page, { x: 380, y: 200 }, { x: 680, y: 300 })
     await page.waitForTimeout(900)

     const scene = await readScene(page)
     const line = scene.find((e) => e.type === "line")!
     expect(line.points).toBeDefined()
     const xs = line.points!.map((p) => p.x)
     const ys = line.points!.map((p) => p.y)
     const freshWidth = Math.max(...xs) - Math.min(...xs)
     const freshHeight = Math.max(...ys) - Math.min(...ys)
     expect(line.width).toBeCloseTo(freshWidth, 5)
     expect(line.height).toBeCloseTo(freshHeight, 5)
     // Sanity: the line actually scaled up, not left at its original 80x80 box.
     expect(line.width).toBeGreaterThan(80)
   })
   ```

2. - [ ] From `apps/web/`, run `pnpm exec playwright test multi-resize` — confirm both tests PASS. If the marquee-select or handle-drag coordinates miss (e.g. due to toolbar chrome offsetting the canvas origin in a way that shifts these fixed pixel coordinates), adjust the coordinates to match this repo's actual canvas layout — do not weaken the assertions themselves. If a coordinate needs adjusting, keep the combined-bbox handle position and the drawn shapes' coordinates consistent with each other (the SE handle of the combined bbox is always `(max(shape1.right, shape2.right), max(shape1.bottom, shape2.bottom))` in canvas-relative pixels).
3. - [ ] Commit: `test(web): e2e coverage for multi-element group resize`.
4. - [ ] **Full gate:** from the repo root, run `pnpm turbo run lint typecheck test build --force` — confirm every package is green. Fix any fallout on this branch and re-run until clean.
5. - [ ] **Full e2e:** from `apps/web/`, run `pnpm exec playwright test` — confirm the **entire** suite passes, not just `multi-resize.spec.ts`. Pay particular attention to `flip.spec.ts`, `rotate.spec.ts`, `layers-panel.spec.ts`, and any other spec that multi-selects elements or exercises the selection tool's resize/rotate handles, since Tasks 2–4 changed shared hit-testing and rendering code paths.
6. - [ ] **Integrate** — this branch was created off `main` (Task 1, Step 0), which is currently one commit ahead of `develop` (the approved spec doc). Fast-forward `main` to this branch's tip first, then bring `develop` up to the same point:
   - `git switch main && git merge --ff-only feat/multi-element-resize`
   - `git switch develop && git merge --ff-only main`
   - `git push origin main develop`
   - `git branch -d feat/multi-element-resize` (and delete the remote branch if one was pushed)
   - Update `/home/sung/.claude/projects/-home-sung-excalidraw-clone/memory/MEMORY.md` with a one-line "Multi-element resize SHIPPED" entry (final commit SHA, all refs aligned, full gate green).

---

## Self-Review — spec scope → task mapping

| Spec scope item                                                                                                                         | Task   | Notes                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `resizeElements(elements, ids, originBounds, newBounds)` in `packages/scene/src/resize-group.ts`, modeled on `flipElements`             | Task 1 | `Map`-based lookup, `!isDeleted && !locked` filter, mirrors `flip.ts` structure                                                  |
| Zero-width/zero-height origin-axis guard (force scale to 1)                                                                             | Task 1 | Dedicated test with a single-point freedraw and `Number.isFinite` assertions                                                     |
| Rectangle-like (rectangle/diamond/ellipse/triangle/parallelogram/hexagon/pentagon/octagon/image/frame): position + width\*sx/height\*sy | Task 1 | 8-handle-direction parametrized test table; `angle` untouched assertion                                                          |
| line/arrow/freedraw: points scaled componentwise, width/height **recomputed from scaled points' bbox**, not multiplied                  | Task 1 | Test deliberately stores a stale width/height (999) to prove recompute wins over multiply; separate freedraw + position tests    |
| Existing bindings (startBinding/endBinding) left untouched on line/arrow                                                                | Task 1 | Dedicated test                                                                                                                   |
| text: fontSize scales by sy, clamped to a minimum of 4                                                                                  | Task 1 | Two tests: normal scale, and the clamp firing                                                                                    |
| Bound text labels excluded when their container is also selected (passenger); still transformed when selected alone                     | Task 1 | Both cases tested via a `labelledRect` helper mirroring `flip.test.ts`'s `labelledTriangle`                                      |
| Rotated elements keep their own `angle`; no affine shear                                                                                | Task 1 | Asserted directly in the handle-direction test table                                                                             |
| Frames treated as plain boxes (no membership recomputation here)                                                                        | Task 1 | Covered by the `default:` branch (frame falls into rectangle-like); no frame-membership logic added anywhere in this plan        |
| `handles.ts`: `selectedIds.length >= 2` branch, combined AABB via `getElementsBounds`, 8-point hit-test, new `groupResize` `HandleHit`  | Task 2 | 8-handle-position parametrized test + miss case + deleted-member fallback + single-selection regression case                     |
| No rotation handle for the group box                                                                                                    | Task 2 | The new branch never checks a rotation point; the group-resize e2e specs never expect one                                        |
| `selection/index.ts`: new `groupResizing` drag-state phase, `ids` + `originBounds`, reuses `computeResize` unchanged                    | Task 3 | `computeResize` only gains an `export` keyword; no logic change (verified by all pre-existing single-resize tests staying green) |
| Commit/revert generalized to a list of ids, same shape as single-element                                                                | Task 3 | `buildGroupResizeCommitEffect`/`buildGroupResizeRevertEffect` mirror `buildResizeCommitEffect`/`buildResizeRevertEffect`'s shape |
| Shift-drag aspect lock "falls out for free" from shared `computeResize`                                                                 | Task 3 | Dedicated shift-drag test asserting uniform `sx === sy` scaling across both group members                                        |
| `overlay.ts`: stop drawing per-element handles/rotation handle for 2+ selection; draw one combined box with 8 handles on top            | Task 4 | `drawElementOutline` extraction + `drawGroupResizeChrome`; single-selection path is byte-for-byte unchanged                      |
| No renderer unit test (matches existing precedent — `overlay.ts` has none today)                                                        | Task 4 | Explicitly called out in the task; verified via Task 5 e2e instead                                                               |
| E2E: two rectangles multi-select-drag-scale                                                                                             | Task 5 | First spec in `multi-resize.spec.ts`                                                                                             |
| E2E: rectangle + line multi-select-drag-scale, line width/height vs. fresh bounds-over-scaled-points                                    | Task 5 | Second spec; computes the fresh bbox from the line's own persisted `points` rather than hardcoding a predicted value             |
| Full gate + full e2e before merge, `lint --force` called out for the stale-cache gotcha                                                 | Task 5 | Global Constraints section + Task 5 Steps 4–5                                                                                    |

**Out-of-scope confirmation (per spec):** no group rotation or rotate handle for the combined box is added anywhere in this plan (Task 2's branch and Task 4's `drawGroupResizeChrome` both omit one entirely); no affine shear is computed — every element keeps its own `angle` (Task 1's switch never touches `angle`); no frame-membership recomputation is added — a frame resizes as a plain box via the `default:` branch in Task 1, and containment is left to existing post-mutation logic; no re-anchoring of arrow bindings whose bound element is outside the resized selection is attempted (Task 1 leaves `startBinding`/`endBinding` untouched unconditionally).

**No-change confirmation:** no i18n strings are needed (this feature adds no new UI text — it's a mouse-drag interaction plus canvas chrome); no toolbar button or menu entry is added (discovery is via the existing multi-select + drag interaction, matching how single-element resize is already discovered); `computeResize`'s internal math is not modified anywhere in this plan, only its export visibility (Task 3, Step 4) — every pre-existing single-element resize test must stay green as proof.
