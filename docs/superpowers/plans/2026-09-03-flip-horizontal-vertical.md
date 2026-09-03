# Flip Horizontal / Vertical Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mirror the selected element(s) across a horizontal or vertical axis, reachable by keyboard (`Shift+H` / `Shift+V`), the PropertiesPanel, and the element context menu, persisting through a document reload.

**Architecture:** A new optional `mirror?: readonly [1 | -1, 1 | -1]` field on `ExcalidrawElementBase` (no format bump — optional, like `PointBinding.fixedPoint?`). Closed polygon shapes carry the flip as a `mirror` sign + negated `angle` and are drawn / hit-tested from a single new geometry helper `mirroredShapeVertices`. `rectangle`/`ellipse`/`diamond`/`frame` toggle `mirror` too but are symmetric (visual no-op). `image`/`text` get a render-time `ctx.scale` / SVG `scale(...)` transform. `line`/`arrow`/`freedraw` bake the flip into `points` (+ negated `angle`, + negated binding `focus`); `mirror` is never set on them. A new pure function `flipElements(elements, ids, axis)` in `packages/scene/src/flip.ts` returns whole replacement elements (single-element or multi-selection behaviour keyed on `ids.length`). Every UI surface routes through `flipElements` + `patchScene` / `scene.mutate`, which **already** runs `reconcileBindings` on every mutation — so bound arrows and elbow routing re-settle for free.

**Tech Stack:** TypeScript (strict), pnpm + Turborepo monorepo, per-package Vitest, ESLint, Playwright e2e. React 19 + Zustand for the web app. rough.js for canvas/SVG shape generation. i18next (namespaced JSON locales, `en` + `ko`).

**Spec:** `docs/superpowers/specs/2026-09-03-flip-horizontal-vertical-design.md` — read it in full before starting. This plan implements its § "File touch list", §2/§3 semantics, §4 pure-function contract, §5 geometry helper, §6 rendering, §7 hit-test/bounds/bindings, §8 surfaces, §9 tests.

## Global Constraints

- **No `SCENE_FORMAT_VERSION` bump, no migration.** `mirror` is optional; absent ⟺ `[1, 1]`. Do not touch factories, default fixtures, or existing test data.
- **`mirror` normalization:** `flipElements` is the sole owner. When both signs return to `1`, the `mirror` key is **omitted** (deleted), not stored as `[1,1]`.
- **`mirror` is never set on `line` / `arrow` / `freedraw`** — those bake the flip into `points`.
- **`image.scale` stays unread** — flipping images goes through `mirror` like everything else.
- **Reflection is always across the axis through the element's own bbox centre** (single-element) or the selection's combined-bounds mid-axis (multi). `angle → -angle` on every flipped element. Normalize `-0` to `0`.
- **`scene.mutate()` already calls `reconcileBindings` + `reconcileFrameMembership` + `reconcileBoundText`** after every mutation (verified in `packages/scene/src/scene.ts:51-59`). No task adds a manual reconcile pass; routing through `patchScene` / `scene.mutate` is sufficient.
- **Do NOT bump `versionNonce`** in `flipElements` — consistent with `groupElements` / `alignElements`; a fresh element object is already a `ShapeCache` (WeakMap) miss.
- Test filter for the web app is `@excalidraw-clone/web`. Package tests: `pnpm --filter @excalidraw-clone/<pkg> test`.
- Full gate: `pnpm turbo run typecheck lint test` then `pnpm --filter @excalidraw-clone/web exec playwright test`. If `turbo` lint output cites paths from another worktree, re-run `pnpm turbo run lint --force` (known repo cache gotcha).
- Every commit message ends with these two trailers:
  ```
  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01NLmmoyjnqw1sdLJnf49R22
  ```
- Diff scope must stay within the spec's File touch list plus the test files named in this plan. The final task verifies this.

---

### Task 1: Data model — `mirror` field, `mirrorOf`, and geometry `mirroredShapeVertices`

Adds the optional `mirror` field, a `mirrorOf` accessor + `FlipAxis` type in a new `packages/scene/src/flip.ts`, and the single source of truth for mirrored polygon geometry in `@excalidraw-clone/geometry`. No behaviour is wired yet — this is the foundation the renderer, hit-test, and `flipElements` all build on.

**Files:**

- Modify: `packages/scene/src/types.ts` (add `mirror?` to `ExcalidrawElementBase`, ~line 79, after `locked: boolean`)
- Create: `packages/scene/src/flip.ts` (`FlipAxis` type + `mirrorOf`)
- Modify: `packages/scene/src/index.ts` (export `mirrorOf`, `type FlipAxis`)
- Modify: `packages/geometry/src/polygon.ts` (add `mirroredShapeVertices`)
- Modify: `packages/geometry/src/index.ts` (export `mirroredShapeVertices`, line 39)
- Test: `packages/geometry/test/polygon.test.ts` (new `describe("mirroredShapeVertices")`)
- Test: `packages/scene/test/types.test.ts` (new case: `mirror` round-trips + `mirrorOf` default)

**Interfaces:**

- Consumes: `shapeVertices(kind: PolygonShapeKind, b: Bounds): Point[]`, `boundsCenter(b: Bounds): Point`, `type Bounds`, `type Point` (all existing in `@excalidraw-clone/geometry`).
- Produces:
  - `ExcalidrawElementBase.mirror?: readonly [1 | -1, 1 | -1]`.
  - `mirrorOf(el: { mirror?: readonly [number, number] }): readonly [number, number]` → `el.mirror ?? [1, 1]`, exported from `@excalidraw-clone/scene`.
  - `type FlipAxis = "x" | "y"`, exported from `@excalidraw-clone/scene`.
  - `mirroredShapeVertices(kind: PolygonShapeKind, b: Bounds, mirror: readonly [number, number]): Point[]` — `shapeVertices(kind, b)` with each vertex reflected around `boundsCenter(b)` on every axis whose sign is `-1`; identity (same array contents as `shapeVertices`) when `mirror` is `[1, 1]`. Exported from `@excalidraw-clone/geometry`.

- [ ] **Step 1: Write the failing geometry tests**

Append to `packages/geometry/test/polygon.test.ts`. Extend the existing import on line 3 to add `mirroredShapeVertices`:

```ts
import {
  mirroredShapeVertices,
  pointInConvexPolygon,
  polygonEdgePointToward,
  shapeVertices,
} from "../src/polygon"
```

Then add:

```ts
describe("mirroredShapeVertices", () => {
  const b: Bounds = { x: 0, y: 0, width: 100, height: 60 }

  it("[1,1] returns the same vertices as shapeVertices", () => {
    expect(mirroredShapeVertices("triangle", b, [1, 1])).toEqual(shapeVertices("triangle", b))
  })

  it("[-1,1] reflects x around the bounds centre", () => {
    // parallelogram top edge: (25,0),(100,0) -> (75,0),(0,0)
    expect(mirroredShapeVertices("parallelogram", b, [-1, 1])).toEqual([
      { x: 75, y: 0 },
      { x: 0, y: 0 },
      { x: 25, y: 60 },
      { x: 100, y: 60 },
    ])
  })

  it("[1,-1] reflects y — triangle apex moves top -> bottom", () => {
    expect(mirroredShapeVertices("triangle", b, [1, -1])).toEqual([
      { x: 50, y: 60 },
      { x: 100, y: 0 },
      { x: 0, y: 0 },
    ])
  })

  it("[-1,-1] reflects both axes", () => {
    expect(mirroredShapeVertices("triangle", b, [-1, -1])).toEqual([
      { x: 50, y: 60 },
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ])
  })

  it("is an involution — mirroring twice on the same axis restores the vertices", () => {
    const once = mirroredShapeVertices("hexagon", b, [-1, 1])
    const twice = once.map((v) => ({ x: 2 * 50 - v.x, y: v.y }))
    expect(twice).toEqual(shapeVertices("hexagon", b))
  })
})
```

- [ ] **Step 2: Run the geometry tests to verify they fail**

Run: `pnpm --filter @excalidraw-clone/geometry test -- polygon.test.ts`
Expected: FAIL — `mirroredShapeVertices is not exported` / import error.

- [ ] **Step 3: Implement `mirroredShapeVertices`**

In `packages/geometry/src/polygon.ts`, after `shapeVertices` (before `pointInConvexPolygon`):

```ts
/** `shapeVertices(kind, b)` reflected around `boundsCenter(b)` on each axis
 *  whose `mirror` sign is -1. `[1, 1]` is the identity (cheap fast path). The
 *  single source of truth for mirrored polygon geometry — renderer, hit-test,
 *  and binding-edge math all read from here. */
export const mirroredShapeVertices = (
  kind: PolygonShapeKind,
  b: Bounds,
  mirror: readonly [number, number],
): Point[] => {
  const verts = shapeVertices(kind, b)
  if (mirror[0] === 1 && mirror[1] === 1) return verts
  const c = boundsCenter(b)
  return verts.map((v) => ({
    x: mirror[0] === -1 ? 2 * c.x - v.x : v.x,
    y: mirror[1] === -1 ? 2 * c.y - v.y : v.y,
  }))
}
```

In `packages/geometry/src/index.ts` line 39, add `mirroredShapeVertices` to the `./polygon` re-export:

```ts
export {
  mirroredShapeVertices,
  pointInConvexPolygon,
  polygonEdgePointToward,
  shapeVertices,
} from "./polygon"
```

- [ ] **Step 4: Run the geometry tests to verify they pass**

Run: `pnpm --filter @excalidraw-clone/geometry test -- polygon.test.ts`
Expected: PASS (new suite + all pre-existing `polygon.test.ts` suites).

- [ ] **Step 5: Write the failing scene test**

Append to `packages/scene/test/types.test.ts` a new suite. Extend the value import list — the file currently only imports types; add a real import line at the top:

```ts
import { mirrorOf } from "../src"
```

Then:

```ts
describe("mirror field + mirrorOf", () => {
  it("mirrorOf defaults to [1, 1] when the field is absent", () => {
    const el = { ...baseFields(), type: "triangle" } as ExcalidrawElement
    expect(mirrorOf(el)).toEqual([1, 1])
  })

  it("mirrorOf returns the stored sign pair", () => {
    const el = { ...baseFields(), type: "triangle", mirror: [-1, 1] as const } as ExcalidrawElement
    expect(mirrorOf(el)).toEqual([-1, 1])
  })
})
```

- [ ] **Step 6: Run the scene test to verify it fails**

Run: `pnpm --filter @excalidraw-clone/scene test -- types.test.ts`
Expected: FAIL — `mirrorOf is not exported` and/or `mirror` is not assignable to `ExcalidrawElement`.

- [ ] **Step 7: Add the `mirror` field and create `flip.ts`**

In `packages/scene/src/types.ts`, inside `ExcalidrawElementBase`, immediately after `locked: boolean` (line 79):

```ts
  /** Per-axis mirror sign; absent ⟺ [1, 1] (unflipped). Set only on closed
   *  shapes (polygons toggle it visibly; rect/ellipse/diamond/frame toggle it
   *  for uniformity but render symmetric). Never set on line/arrow/freedraw —
   *  those bake the flip into `points`. */
  mirror?: readonly [1 | -1, 1 | -1]
```

Create `packages/scene/src/flip.ts`:

```ts
import type { ExcalidrawElement } from "./types"

export type FlipAxis = "x" | "y"

/** Per-axis mirror sign for an element; `[1, 1]` when unflipped. */
export const mirrorOf = (el: Pick<ExcalidrawElement, "mirror">): readonly [number, number] =>
  el.mirror ?? [1, 1]
```

In `packages/scene/src/index.ts`, add next to the other `./` re-exports (e.g. after line 60, the `./locking` export):

```ts
export { mirrorOf } from "./flip"
export type { FlipAxis } from "./flip"
```

- [ ] **Step 8: Run the scene test to verify it passes**

Run: `pnpm --filter @excalidraw-clone/scene test -- types.test.ts`
Expected: PASS.

- [ ] **Step 9: Typecheck + lint the two packages**

Run: `pnpm turbo run typecheck lint --filter @excalidraw-clone/geometry --filter @excalidraw-clone/scene`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add packages/scene/src/types.ts packages/scene/src/flip.ts packages/scene/src/index.ts \
  packages/geometry/src/polygon.ts packages/geometry/src/index.ts \
  packages/geometry/test/polygon.test.ts packages/scene/test/types.test.ts
git commit -m "scene+geometry: add mirror field, mirrorOf, mirroredShapeVertices"
```

---

### Task 2: `flipElements` — single-element flip

Adds the `flipElements` pure function covering the single-element case: `ids.length === 1`. Closed shapes toggle `mirror` + negate `angle`; linear/freedraw bake the flip into `points` + negate `angle` + negate binding `focus`. `x/y/width/height` never change for a single-element flip.

**Files:**

- Modify: `packages/scene/src/flip.ts` (add `flipElements`)
- Modify: `packages/scene/src/index.ts` (export `flipElements`)
- Test: `packages/scene/test/flip.test.ts` (new file)

**Interfaces:**

- Consumes: `mirrorOf` (Task 1), `type ExcalidrawElement`, `type FlipAxis`.
- Produces:
  - `flipElements(elements: readonly ExcalidrawElement[], ids: readonly string[], axis: FlipAxis): ExcalidrawElement[]` — exported from `@excalidraw-clone/scene`. Returns whole replacement elements (not patches). Single-element path (this task) when `ids.length === 1`. Returns `[]` when no non-locked, non-deleted element in `ids` exists.
  - Single-element flip rules by class:
    - polygon (`triangle`/`parallelogram`/`hexagon`/`pentagon`/`octagon`), `image`, `text`, `rectangle`, `ellipse`, `diamond`, `frame`: toggle the axis sign in `mirror`, `angle → -angle` (normalized so `-0` becomes `0`), omit `mirror` when it returns to `[1, 1]`.
    - `line`/`arrow`/`freedraw`: `points[i].{x|y} → {width|height} - points[i].{x|y}` on the flip axis, `angle → -angle`, `startBinding.focus → -focus` and `endBinding.focus → -focus` (arrow/line only), **no** `mirror` key, start/end not swapped.

- [ ] **Step 1: Write the failing single-element tests**

Create `packages/scene/test/flip.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { newArrow, newFreedraw, newParallelogram, newTriangle } from "../src/factories"
import { flipElements } from "../src/flip"

describe("flipElements — single element", () => {
  it("triangle, x-axis: mirror becomes [-1,1], angle negated, box unchanged", () => {
    const t = { ...newTriangle({ x: 10, y: 20, width: 40, height: 30, angle: 0.5 }) }
    const [out] = flipElements([t], [t.id], "x")
    expect(out!.mirror).toEqual([-1, 1])
    expect(out!.angle).toBe(-0.5)
    expect([out!.x, out!.y, out!.width, out!.height]).toEqual([10, 20, 40, 30])
  })

  it("triangle, y-axis: mirror becomes [1,-1]", () => {
    const t = { ...newTriangle({ x: 0, y: 0, width: 40, height: 30 }) }
    const [out] = flipElements([t], [t.id], "y")
    expect(out!.mirror).toEqual([1, -1])
    expect(out!.angle).toBe(0) // -0 normalized
  })

  it("flip∘flip on the same axis restores the original element exactly", () => {
    const t = { ...newTriangle({ x: 5, y: 6, width: 40, height: 30, angle: 0.25 }) }
    const [once] = flipElements([t], [t.id], "x")
    const [twice] = flipElements([once!], [once!.id], "x")
    expect(twice).toEqual(t) // mirror key omitted again
  })

  it("parallelogram x-flip toggles the sign", () => {
    const p = {
      ...newParallelogram({ x: 0, y: 0, width: 40, height: 30 }),
      mirror: [-1, 1] as const,
    }
    const [out] = flipElements([p], [p.id], "x")
    expect(out!.mirror).toBeUndefined()
  })

  it("freedraw: points mirrored across the local centre, bbox unchanged", () => {
    const f = {
      ...newFreedraw({ x: 0, y: 0, width: 100, height: 40 }),
      points: [
        { x: 0, y: 0 },
        { x: 30, y: 10 },
        { x: 100, y: 40 },
      ],
    }
    const [out] = flipElements([f], [f.id], "x")
    expect((out as typeof f).points).toEqual([
      { x: 100, y: 0 },
      { x: 70, y: 10 },
      { x: 0, y: 40 },
    ])
    expect((out as typeof f).mirror).toBeUndefined()
    expect([out!.x, out!.y, out!.width, out!.height]).toEqual([0, 0, 100, 40])
  })

  it("arrow with startBinding.focus 0.3 becomes -0.3", () => {
    const a = {
      ...newArrow({ x: 0, y: 0, width: 50, height: 0 }),
      points: [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
      ],
      startBinding: { elementId: "s", focus: 0.3, gap: 4 },
      endBinding: { elementId: "e", focus: -0.1, gap: 4 },
    }
    const [out] = flipElements([a], [a.id], "x") as [typeof a]
    expect(out.startBinding!.focus).toBe(-0.3)
    expect(out.endBinding!.focus).toBe(0.1)
  })

  it("returns [] when the only selected id is missing or deleted", () => {
    const t = { ...newTriangle({ x: 0, y: 0, width: 10, height: 10 }), isDeleted: true }
    expect(flipElements([t], [t.id], "x")).toEqual([])
    expect(flipElements([t], ["ghost"], "x")).toEqual([])
  })

  it("returns [] for an empty id list", () => {
    const t = newTriangle({ x: 0, y: 0, width: 10, height: 10 })
    expect(flipElements([t], [], "x")).toEqual([])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @excalidraw-clone/scene test -- flip.test.ts`
Expected: FAIL — `flipElements is not exported`.

- [ ] **Step 3: Implement `flipElements` (single-element path)**

Append to `packages/scene/src/flip.ts`:

```ts
const LINEAR_TYPES = new Set(["line", "arrow", "freedraw"])

const negateAngle = (a: number): number => (a === 0 ? 0 : -a)

const negateFocus = (b: ExcalidrawElement["startBinding"]): ExcalidrawElement["startBinding"] =>
  b ? { ...b, focus: b.focus === 0 ? 0 : -b.focus } : b

/** Single-element flip: reflect across the element's own bbox centre on `axis`.
 *  x/y/width/height are preserved (a centred reflection keeps the AABB). */
const flipOne = (el: ExcalidrawElement, axis: FlipAxis): ExcalidrawElement => {
  if (LINEAR_TYPES.has(el.type)) {
    const linear = el as ExcalidrawElement & {
      points: readonly { x: number; y: number }[]
      startBinding?: ExcalidrawElement["startBinding"]
      endBinding?: ExcalidrawElement["endBinding"]
    }
    const points = linear.points.map((p) =>
      axis === "x" ? { x: el.width - p.x, y: p.y } : { x: p.x, y: el.height - p.y },
    )
    const next: ExcalidrawElement = {
      ...el,
      angle: negateAngle(el.angle),
      ...(("points" in linear ? { points } : {}) as object),
    } as ExcalidrawElement
    if ("startBinding" in linear) {
      ;(next as { startBinding?: unknown }).startBinding = negateFocus(linear.startBinding ?? null)
      ;(next as { endBinding?: unknown }).endBinding = negateFocus(linear.endBinding ?? null)
    }
    return next
  }
  const [mx, my] = mirrorOf(el)
  const nextMirror: readonly [number, number] =
    axis === "x" ? [mx === 1 ? -1 : 1, my] : [mx, my === 1 ? -1 : 1]
  const { mirror: _drop, ...rest } = el as ExcalidrawElement & { mirror?: unknown }
  const base = { ...rest, angle: negateAngle(el.angle) } as ExcalidrawElement
  if (nextMirror[0] === 1 && nextMirror[1] === 1) return base
  return { ...base, mirror: nextMirror as readonly [1 | -1, 1 | -1] }
}

/** Full replacement elements for a flip of `ids` across `axis`. Single vs.
 *  group behaviour is chosen by `ids.length`. Locked / deleted / unknown ids
 *  are dropped. Returns [] when nothing flippable is selected. */
export function flipElements(
  elements: readonly ExcalidrawElement[],
  ids: readonly string[],
  axis: FlipAxis,
): ExcalidrawElement[] {
  const byId = new Map(elements.map((e) => [e.id, e]))
  const direct = ids
    .map((id) => byId.get(id))
    .filter((e): e is ExcalidrawElement => !!e && !e.isDeleted && !e.locked)
  if (direct.length === 0) return []

  const soloNonFrame = ids.length === 1 && direct[0]!.type !== "frame"
  if (soloNonFrame) {
    return [flipOne(direct[0]!, axis)]
  }

  // group path (also taken for a lone selected frame, so its members reflect)
  // — implemented in Task 3
  return []
}
```

> **Decision (resolves open question #1):** a lone selected `frame` takes the
> group path so its members reflect — a frame rectangle is symmetric, so
> flipping it in isolation would otherwise be a no-op. Task 3 adds a test.

> Implementation notes for the executor: the `points`/`startBinding`/`endBinding` spread juggling above is one valid approach around the `ExcalidrawElement` discriminated union — you may instead narrow with a `switch (el.type)` and cast per-branch. What matters: `freedraw` gets `points` + `angle` only (no bindings), `line`/`arrow` get `points` + `angle` + negated `startBinding`/`endBinding`, and `mirror` is never present on the result. Keep `-0` out of `angle` and `focus`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @excalidraw-clone/scene test -- flip.test.ts`
Expected: PASS.

- [ ] **Step 5: REFACTOR**

If the union-narrowing is awkward, rewrite `flipOne`'s linear branch as an explicit `switch`/`if (el.type === "freedraw")` split. Keep `flip.test.ts` green.

- [ ] **Step 6: Export `flipElements` and run the full scene suite**

In `packages/scene/src/index.ts`, extend the `./flip` export:

```ts
export { flipElements, mirrorOf } from "./flip"
export type { FlipAxis } from "./flip"
```

Run: `pnpm --filter @excalidraw-clone/scene test`
Expected: PASS (no regression — `flip.ts` is not yet consumed anywhere).

- [ ] **Step 7: Typecheck + lint**

Run: `pnpm turbo run typecheck lint --filter @excalidraw-clone/scene`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/scene/src/flip.ts packages/scene/src/index.ts packages/scene/test/flip.test.ts
git commit -m "scene: flipElements — single-element flip"
```

---

### Task 3: `flipElements` — multi-selection

Adds the group path (`ids.length >= 2`): expand `ids` to the frame-member closure (`expandIdsToFrameMembers`, same as nudge), compute the closure's combined bounds `B` via `getElementsBounds`, then for each closure element reflect its own centre across `B`'s mid-axis **and** apply the single-element flip in place. `groupIds` unchanged. Locked closure members are excluded.

**Files:**

- Modify: `packages/scene/src/flip.ts` (replace the group-path stub)
- Test: `packages/scene/test/flip.test.ts` (new `describe("flipElements — multi-selection")`)

**Interfaces:**

- Consumes: `expandIdsToFrameMembers(ids, elements): string[]` (`./frames`), `getElementsBounds(elements): Bounds | null` (`./bounds`), `flipOne` (Task 2).
- Produces: `flipElements` group behaviour — for the closure `C` (frame members of `ids`, minus locked/deleted) and `B = getElementsBounds(C)`:
  1. `newCenter = 2 * Bcenter - oldCenter` on the flip axis, where `oldCenter = el.{x|y} + el.{width|height} / 2`; derive `{x|y} = newCenter - {width|height} / 2`.
  2. Apply `flipOne(el, axis)` (which keeps `x/y/width/height`), then override `{x|y}` with the value from step 1.
     Returned array is in scene order, one entry per non-locked closure member.

- [ ] **Step 1: Write the failing multi-selection tests**

Append to `packages/scene/test/flip.test.ts`. Extend the factory import to add `newFrame`, `newRectangle`:

```ts
import {
  newArrow,
  newFrame,
  newFreedraw,
  newParallelogram,
  newRectangle,
  newTriangle,
} from "../src/factories"
```

Then:

```ts
describe("flipElements — multi-selection", () => {
  it("two rects: centres reflected across the combined-bounds mid-axis, x-axis", () => {
    const a = newRectangle({ x: 0, y: 0, width: 20, height: 20 }) // centre x 10
    const b = newRectangle({ x: 100, y: 0, width: 40, height: 20 }) // centre x 120
    // combined bounds x 0..140 -> centre 70
    const out = flipElements([a, b], [a.id, b.id], "x")
    const byId = new Map(out.map((e) => [e.id, e]))
    expect(byId.get(a.id)!.x).toBe(2 * 70 - 10 - 10) // 120
    expect(byId.get(b.id)!.x).toBe(2 * 70 - 120 - 20) // 0
    expect(byId.get(a.id)!.y).toBe(0)
  })

  it("mixed shapes: each is repositioned AND individually flipped", () => {
    const tri = newTriangle({ x: 0, y: 0, width: 20, height: 20 })
    const par = { ...newParallelogram({ x: 60, y: 0, width: 20, height: 20 }) }
    const out = flipElements([tri, par], [tri.id, par.id], "x")
    const byId = new Map(out.map((e) => [e.id, e]))
    expect(byId.get(tri.id)!.mirror).toEqual([-1, 1])
    expect(byId.get(par.id)!.mirror).toEqual([-1, 1])
    // combined bounds x 0..80 -> centre 40; tri centre 10 -> 70 -> x 60
    expect(byId.get(tri.id)!.x).toBe(60)
    expect(byId.get(par.id)!.x).toBe(0)
  })

  it("excludes a locked element from the result", () => {
    const a = newRectangle({ x: 0, y: 0, width: 20, height: 20 })
    const locked = { ...newRectangle({ x: 100, y: 0, width: 20, height: 20 }), locked: true }
    const out = flipElements([a, locked], [a.id, locked.id], "x")
    expect(out.map((e) => e.id)).toEqual([a.id])
  })

  it("expands to frame members: flipping a frame + one loose rect reflects the frame's member too", () => {
    const frame = newFrame({ x: 0, y: 0, width: 100, height: 100 })
    const member = { ...newRectangle({ x: 10, y: 10, width: 20, height: 20 }), frameId: frame.id }
    const loose = newRectangle({ x: 200, y: 0, width: 20, height: 20 })
    const out = flipElements([frame, member, loose], [frame.id, loose.id], "x")
    expect(out.map((e) => e.id).sort()).toEqual([frame.id, loose.id, member.id].sort())
  })

  it("a lone selected frame takes the group path and reflects its members", () => {
    const frame = newFrame({ x: 0, y: 0, width: 100, height: 100 })
    const member = { ...newRectangle({ x: 10, y: 10, width: 20, height: 20 }), frameId: frame.id }
    const out = flipElements([frame, member], [frame.id], "x")
    const byId = new Map(out.map((e) => [e.id, e]))
    // member centre 20 -> reflected across frame-closure combined-bounds centre 50 -> 80 -> x 70
    expect(byId.get(member.id)!.x).toBe(70)
    expect(byId.has(frame.id)).toBe(true)
  })

  it("multi-flip is an involution for closed shapes", () => {
    const a = newRectangle({ x: 0, y: 0, width: 20, height: 20 })
    const b = newTriangle({ x: 100, y: 40, width: 40, height: 20 })
    const once = flipElements([a, b], [a.id, b.id], "y")
    const twice = flipElements(once, [a.id, b.id], "y")
    const byId = new Map(twice.map((e) => [e.id, e]))
    expect(byId.get(a.id)!.x).toBe(a.x)
    expect(byId.get(a.id)!.y).toBe(a.y)
    expect(byId.get(b.id)!.mirror).toBeUndefined()
    expect(byId.get(b.id)!.y).toBe(b.y)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @excalidraw-clone/scene test -- flip.test.ts`
Expected: FAIL — the group cases (`two rects…`, `mixed shapes…`, `expands to frame members…`) fail; the stub returns `[]`.

- [ ] **Step 3: Implement the group path**

In `packages/scene/src/flip.ts`, add the imports at the top:

```ts
import { getElementsBounds } from "./bounds"
import { expandIdsToFrameMembers } from "./frames"
```

Replace the `// group path — implemented in Task 3` block with:

```ts
const closureIds = new Set(expandIdsToFrameMembers(ids, elements))
const closure = elements.filter((e) => closureIds.has(e.id) && !e.isDeleted && !e.locked)
if (closure.length === 0) return []
const b = getElementsBounds(closure)
if (!b) return []
const bCenter = axis === "x" ? b.x + b.width / 2 : b.y + b.height / 2

return closure.map((el) => {
  const oldCenter = axis === "x" ? el.x + el.width / 2 : el.y + el.height / 2
  const newCoord = 2 * bCenter - oldCenter - (axis === "x" ? el.width : el.height) / 2
  const flipped = flipOne(el, axis)
  return axis === "x" ? { ...flipped, x: newCoord } : { ...flipped, y: newCoord }
})
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @excalidraw-clone/scene test -- flip.test.ts`
Expected: PASS (single + multi suites).

- [ ] **Step 5: REFACTOR + full scene suite**

Extract the `axis === "x" ? … : …` centre/coord arithmetic into a small local helper if it reads cleaner. Then:

Run: `pnpm --filter @excalidraw-clone/scene test`
Expected: PASS.

- [ ] **Step 6: Typecheck + lint**

Run: `pnpm turbo run typecheck lint --filter @excalidraw-clone/scene`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/scene/src/flip.ts packages/scene/test/flip.test.ts
git commit -m "scene: flipElements — multi-selection reposition + per-element flip"
```

---

### Task 4: Renderer — mirrored polygons, canvas + SVG mirror transform

Wires `mirror` into rendering: polygons build their rough drawable from `mirroredShapeVertices`; `image`/`text` get a centre-anchored mirror transform on the canvas (`ctx.scale`) and in the SVG (`scale(mx my)`); `rectangle`/`ellipse`/`diamond`/`frame` do nothing. Verifies the `ShapeCache` key does not collide.

**Files:**

- Modify: `packages/renderer/src/shapes/polygon.ts` (build from `mirroredShapeVertices`)
- Modify: `packages/renderer/src/draw-element.ts` (mirror step for `image`/`text`, after the rotate block ~line 32)
- Modify: `packages/renderer/src/svg.ts` (`elementTransform`, lines 174-182 — add `scale` term for `image`/`text`)
- Modify: `packages/renderer/src/shape-cache.ts` — **only if** Step 8 shows a collision (it should not; see notes)
- Test: `packages/renderer/test/shapes-others.test.ts` (`polygonShape` mirrored-triangle case)
- Test: `packages/renderer/test/draw-image.test.ts` (canvas mirror `scale` calls for image)
- Test: `packages/renderer/test/svg.test.ts` (SVG `scale` term for image; none for rect)
- Test: `packages/renderer/test/shape-cache.test.ts` (flipped vs unflipped polygon → distinct drawables)

**Interfaces:**

- Consumes: `mirroredShapeVertices` (Task 1), `mirrorOf` (Task 1, from `@excalidraw-clone/scene` — `svg.ts` already value-imports from that package).
- Produces:
  - `polygonShape(e, gen)` builds `gen.polygon` from `mirroredShapeVertices(e.type, { x: 0, y: 0, width: e.width, height: e.height }, mirrorOf(e))`.
  - `drawElement` emits, for `image`/`text` only, after the rotate block: `ctx.translate(w/2, h/2); ctx.scale(mx, my); ctx.translate(-w/2, -h/2)` when `mx !== 1 || my !== 1`.
  - `elementTransform(el)` appends `translate(cx cy) scale(mx my) translate(-cx -cy)` (after `rotate`), for `image`/`text` only, when `mx !== 1 || my !== 1`.

- [ ] **Step 1: Write the failing renderer tests**

In `packages/renderer/test/shapes-others.test.ts`, inside `describe("polygonShape")`, add:

```ts
it("triangle with mirror [1,-1]: vertices reflected on y around the local centre", () => {
  const gen = new RoughGenerator()
  const spy = vi.spyOn(gen, "polygon")
  const t = { ...newTriangle({ x: 0, y: 0, width: 40, height: 30 }), mirror: [1, -1] as const }
  polygonShape(t, gen)
  const [points] = spy.mock.calls[0]!
  // shapeVertices: (20,0),(40,30),(0,30) -> y around 15 -> (20,30),(40,0),(0,0)
  expect(points).toEqual([
    [20, 30],
    [40, 0],
    [0, 0],
  ])
})

it("unflipped triangle is unchanged (identity path)", () => {
  const gen = new RoughGenerator()
  const spy = vi.spyOn(gen, "polygon")
  polygonShape(newTriangle({ x: 0, y: 0, width: 40, height: 30 }), gen)
  expect(spy.mock.calls[0]![0]).toEqual([
    [20, 0],
    [40, 30],
    [0, 30],
  ])
})
```

In `packages/renderer/test/draw-image.test.ts`, inside `describe("drawElement image branch")`, add (the file already imports `callsOf`, `createMockCanvas`, `newImage`):

```ts
it("applies a centre-anchored scale for a mirrored image", () => {
  const { ctx, draw } = setup()
  const el = {
    ...newImage({ x: 0, y: 0, width: 100, height: 50, fileId: "f1" }),
    mirror: [-1, 1] as const,
  }
  draw(el, () => loadedImage())
  expect(callsOf(ctx, "scale").map((c) => c.args)).toContainEqual([-1, 1])
  expect(callsOf(ctx, "drawImage")).toHaveLength(1)
})

it("no scale call for an unflipped image", () => {
  const { ctx, draw } = setup()
  draw(newImage({ x: 0, y: 0, width: 100, height: 50, fileId: "f1" }), () => loadedImage())
  expect(callsOf(ctx, "scale")).toHaveLength(0)
})
```

In `packages/renderer/test/svg.test.ts`, add a new `describe`:

```ts
describe("renderToSVG mirror transform", () => {
  it("emits a scale term for a mirrored image", () => {
    const el = {
      ...newImage({ x: 5, y: 6, width: 80, height: 40, fileId: "f1" }),
      mirror: [-1, 1] as const,
    }
    const files = new Map([["f1", "data:image/png;base64,AAAA"]])
    const svg = renderToSVG(new Scene([el]), { files })
    expect(svg).toContain("scale(-1 1)")
  })

  it("emits no scale term for a mirrored rectangle (symmetric)", () => {
    const el = { ...newRectangle({ x: 0, y: 0, width: 10, height: 10 }), mirror: [-1, 1] as const }
    const svg = renderToSVG(new Scene([el]))
    expect(svg).not.toContain("scale(")
  })
})
```

Extend `svg.test.ts`'s import (line 1-10) to include `newRectangle` if not already present — it is (line 7). `newImage` is imported (line 5).

In `packages/renderer/test/shape-cache.test.ts`, add a case to `describe("ShapeCache")`:

```ts
it("a flipped polygon and its unflipped twin produce different drawables", () => {
  const cache = new ShapeCache()
  const gen = new RoughGenerator()
  const base = { ...newTriangle({ x: 0, y: 0, width: 40, height: 30 }) }
  const flipped = { ...base, mirror: [1, -1] as const, versionNonce: base.versionNonce + 1 }
  const [d1] = cache.get(base, gen) as [{ sets: unknown }]
  const [d2] = cache.get(flipped, gen) as [{ sets: unknown }]
  expect(JSON.stringify(d1.sets)).not.toBe(JSON.stringify(d2.sets))
})
```

Extend `shape-cache.test.ts` import (line 1) to add `newTriangle`:

```ts
import { newRectangle, newTriangle } from "@excalidraw-clone/scene"
```

- [ ] **Step 2: Run the renderer tests to verify they fail**

Run: `pnpm --filter @excalidraw-clone/renderer test -- shapes-others.test.ts draw-image.test.ts svg.test.ts shape-cache.test.ts`
Expected: FAIL — mirrored polygon points equal the unflipped points; no `scale` call / term is emitted; flipped-twin drawables are identical.

- [ ] **Step 3: Implement the polygon change**

Replace `packages/renderer/src/shapes/polygon.ts` lines 1 + 34-42:

Line 1:

```ts
import { mirroredShapeVertices } from "@excalidraw-clone/geometry"
```

`polygonShape` body:

```ts
export const polygonShape = (e: PolygonElement, gen: RoughGenerator): readonly Drawable[] => {
  const points: RoughPoint[] = mirroredShapeVertices(
    e.type,
    { x: 0, y: 0, width: e.width, height: e.height },
    e.mirror ?? [1, 1],
  ).map((p) => [p.x, p.y])
  return [gen.polygon(points, polygonOptions(e))]
}
```

> Uses `e.mirror ?? [1, 1]` inline rather than a value import of `mirrorOf` into the shapes layer — `mirroredShapeVertices` already fast-paths `[1, 1]`.

- [ ] **Step 4: Implement the canvas mirror step**

In `packages/renderer/src/draw-element.ts`, extend the scene import (line 1) to a value import:

```ts
import { mirrorOf } from "@excalidraw-clone/scene"
import type { ExcalidrawElement } from "@excalidraw-clone/scene"
```

After the rotate block (right after line 32's closing `}`), before the `if (element.type === "image")` block:

```ts
if (element.type === "image" || element.type === "text") {
  const [mx, my] = mirrorOf(element)
  if (mx !== 1 || my !== 1) {
    ctx.translate(element.width / 2, element.height / 2)
    ctx.scale(mx, my)
    ctx.translate(-element.width / 2, -element.height / 2)
  }
}
```

- [ ] **Step 5: Implement the SVG `scale` term**

In `packages/renderer/src/svg.ts`, extend the scene value import (line 1) with `mirrorOf`:

```ts
import { LABELABLE_TYPES, LINEAR_LABELABLE_TYPES, mirrorOf } from "@excalidraw-clone/scene"
```

Replace `elementTransform` (lines 174-182):

```ts
function elementTransform(el: ExcalidrawElement): string {
  const cx = el.width / 2
  const cy = el.height / 2
  const parts = [`translate(${el.x} ${el.y})`]
  if (el.angle !== 0) {
    parts.push(`rotate(${(el.angle * 180) / Math.PI} ${cx} ${cy})`)
  }
  if (el.type === "image" || el.type === "text") {
    const [mx, my] = mirrorOf(el)
    if (mx !== 1 || my !== 1) {
      parts.push(`translate(${cx} ${cy}) scale(${mx} ${my}) translate(${-cx} ${-cy})`)
    }
  }
  return parts.join(" ")
}
```

> The `angle === 0` fast path (`return \`translate(...)\``) is gone but the output is byte-identical for the no-rotation / no-mirror case (`translate(3 4)`), so the existing `svg.test.ts` flowchart/frame exact-match assertions still hold.

- [ ] **Step 6: Run the renderer tests to verify they pass**

Run: `pnpm --filter @excalidraw-clone/renderer test -- shapes-others.test.ts draw-image.test.ts svg.test.ts shape-cache.test.ts`
Expected: PASS.

- [ ] **Step 7: Run the full renderer suite**

Run: `pnpm --filter @excalidraw-clone/renderer test`
Expected: PASS — no regression in `renderer-elements`, `renderer-transform`, `culling`, `shapes-text`, etc.

- [ ] **Step 8: Verify the `ShapeCache` key (risk check)**

Confirm `packages/renderer/src/shape-cache.ts` still keys only on `(element identity via WeakMap, versionNonce, theme)` and the Step 1 `shape-cache.test.ts` case passes. Because polygon drawables are generated from vertex coordinates and a flipped element is always a fresh object (WeakMap miss), **no key change is expected**. Only if the new test fails: add `mirror` to `ShapeCacheEntry` and the cache-hit guard, and note it in the commit body.

- [ ] **Step 9: Typecheck + lint**

Run: `pnpm turbo run typecheck lint --filter @excalidraw-clone/renderer`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add packages/renderer/src/shapes/polygon.ts packages/renderer/src/draw-element.ts \
  packages/renderer/src/svg.ts packages/renderer/test/shapes-others.test.ts \
  packages/renderer/test/draw-image.test.ts packages/renderer/test/svg.test.ts \
  packages/renderer/test/shape-cache.test.ts
git commit -m "renderer: mirrored polygon vertices + image/text mirror transform (canvas + SVG)"
```

---

### Task 5: Hit-test + bindings honour `mirror`

Polygon hit-testing and polygon binding-edge math read `mirroredShapeVertices` instead of `shapeVertices`. `rectangle`/`ellipse`/`diamond`/`image`/`text`/`frame` and all linear elements are unchanged (symmetric or baked). `bounds.ts` needs no change (a centred reflection preserves the AABB; linear bounds recompute from the already-mirrored points).

**Files:**

- Modify: `packages/scene/src/hit-test.ts` (polygon branch, lines 79-84)
- Modify: `packages/scene/src/bindings.ts` (`computeBoundEndpoint`, lines 72-75; swap the `shapeVertices` import)
- Test: `packages/scene/test/hit-test.test.ts` (mirrored polygon cases)
- Test: `packages/scene/test/bindings.test.ts` (bound endpoint against a mirrored polygon)

**Interfaces:**

- Consumes: `mirroredShapeVertices` (`@excalidraw-clone/geometry`), `mirrorOf` (`./flip`).
- Produces:
  - `hitTestElement` polygon branch calls `pointInConvexPolygon(point, mirroredShapeVertices(element.type, b, mirrorOf(element)), boundsCenter(b), element.angle)`.
  - `computeBoundEndpoint` polygon branch calls `polygonEdgePointToward(mirroredShapeVertices(polyKind, bounds, mirrorOf(target)), bounds, toward)`.

- [ ] **Step 1: Write the failing hit-test tests**

In `packages/scene/test/hit-test.test.ts`, inside `describe("polygon shapes")`, add. Extend the import (lines 2-15) to add `newParallelogram`:

```ts
it("parallelogram x-flip: the region emptied by the flip now misses", () => {
  const base = newParallelogram({ x: 0, y: 0, width: 100, height: 60 })
  // unflipped top-left inset (25,0) is filled at (30,5); after x-flip that inset is at the top-right
  const flipped = { ...base, mirror: [-1, 1] as const }
  expect(hitTestElement(base, { x: 30, y: 5 })).toBe(true)
  expect(hitTestElement(flipped, { x: 30, y: 5 })).toBe(false)
  expect(hitTestElement(flipped, { x: 90, y: 5 })).toBe(true)
})

it("triangle y-flip: apex region moves top -> bottom", () => {
  const base = newTriangle({ x: 0, y: 0, width: 100, height: 60 })
  const flipped = { ...base, mirror: [1, -1] as const }
  expect(hitTestElement(flipped, { x: 50, y: 5 })).toBe(true) // now filled near the top
  expect(hitTestElement(flipped, { x: 5, y: 55 })).toBe(false) // bottom-left now empty
})
```

- [ ] **Step 2: Write the failing bindings test**

In `packages/scene/test/bindings.test.ts`, add a focused case (match the file's existing style — it already imports `computeBoundEndpoint` and shape factories; add `newParallelogram` to the import if absent):

```ts
describe("computeBoundEndpoint — mirrored polygon", () => {
  it("retracts to the mirrored edge of an x-flipped parallelogram", () => {
    const base = newParallelogram({ x: 0, y: 0, width: 100, height: 60 })
    const flipped = { ...base, mirror: [-1, 1] as const }
    const toward = { x: 50, y: -100 } // straight up from the centre
    const unflippedPt = computeBoundEndpoint(base, toward, 0)
    const flippedPt = computeBoundEndpoint(flipped, toward, 0)
    // the top edge of a parallelogram is slanted; mirroring x moves where the
    // upward ray crosses it, so the endpoints must differ in x
    expect(flippedPt.x).not.toBeCloseTo(unflippedPt.x)
  })
})
```

- [ ] **Step 3: Run both suites to verify they fail**

Run: `pnpm --filter @excalidraw-clone/scene test -- hit-test.test.ts bindings.test.ts`
Expected: FAIL — flipped and unflipped give identical results.

- [ ] **Step 4: Implement the hit-test change**

In `packages/scene/src/hit-test.ts`:

Line 1-12 import block — swap `shapeVertices` for `mirroredShapeVertices`:

```ts
import {
  type Bounds,
  type Point,
  boundsCenter,
  distancePointToSegment,
  mirroredShapeVertices,
  pointInConvexPolygon,
  pointInDiamond,
  pointInEllipse,
  pointInRectangle,
  rotatePoint,
} from "@excalidraw-clone/geometry"
import { mirrorOf } from "./flip"
import type { ExcalidrawElement } from "./types"
```

Polygon branch (lines 79-84):

```ts
return pointInConvexPolygon(
  point,
  mirroredShapeVertices(element.type, b, mirrorOf(element)),
  boundsCenter(b),
  element.angle,
)
```

- [ ] **Step 5: Implement the bindings change**

In `packages/scene/src/bindings.ts`:

Import block (lines 1-12) — swap `shapeVertices` for `mirroredShapeVertices` and add `mirrorOf`:

```ts
import {
  type EdgeKind,
  type Point,
  type PolygonShapeKind,
  boundsCenter,
  edgePointToward,
  mirroredShapeVertices,
  normalize,
  pointAdd,
  pointScale,
  polygonEdgePointToward,
} from "@excalidraw-clone/geometry"
import { getElementBounds } from "./bounds"
import { routeElbow, sideCenter, sideOf, type Side } from "./elbow"
import { mirrorOf } from "./flip"
import { hitTestElement } from "./hit-test"
import type { ElementType, ExcalidrawElement, PointBinding } from "./types"
```

`computeBoundEndpoint` polygon edge (lines 72-75):

```ts
const edge = polyKind
  ? polygonEdgePointToward(
      mirroredShapeVertices(polyKind, bounds, mirrorOf(target)),
      bounds,
      toward,
    )
  : edgePointToward(bounds, edgeKindFor(target.type), toward)
```

> Import-cycle check: `flip.ts` imports `./bounds` + `./frames` (→ `./bounds`) only. `hit-test.ts` → `./flip` and `bindings.ts` → `./flip` + `./hit-test` introduce no cycle (`flip.ts` imports neither).

- [ ] **Step 6: Run both suites to verify they pass**

Run: `pnpm --filter @excalidraw-clone/scene test -- hit-test.test.ts bindings.test.ts`
Expected: PASS.

- [ ] **Step 7: Run the full scene suite**

Run: `pnpm --filter @excalidraw-clone/scene test`
Expected: PASS — `bounds.test.ts`, `elbow-reconcile.test.ts`, `labels.test.ts`, etc. unaffected.

- [ ] **Step 8: Typecheck + lint**

Run: `pnpm turbo run typecheck lint --filter @excalidraw-clone/scene`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/scene/src/hit-test.ts packages/scene/src/bindings.ts \
  packages/scene/test/hit-test.test.ts packages/scene/test/bindings.test.ts
git commit -m "scene: hit-test + binding-edge honour element mirror"
```

---

### Task 6: Keyboard shortcut `Shift+H` / `Shift+V` + Help dialog

Adds the `Shift+H` (x-axis) / `Shift+V` (y-axis) handlers to `attachShortcuts`, placed **before** the `TOOL_KEYS` dispatch. With a non-empty selection: flip and `return` (do not fall through to the selection-tool switch). With an empty selection: `return` early (no-op — a small, intended behaviour change from today's bare-`v`-style tool switch on `Shift+V`). Adds the two rows to the Help dialog with new `shortcuts:*` i18n keys.

**Files:**

- Modify: `apps/web/src/keyboard/shortcuts.ts` (new branch before line 182 `const tool = TOOL_KEYS[key]`)
- Modify: `packages/ui/src/HelpDialog.tsx` (`EDITOR_SHORTCUTS`, after the `Cmd/Ctrl+K` row ~line 40)
- Modify: `apps/web/src/locales/en/shortcuts.json` (add `flipHorizontal`, `flipVertical`)
- Modify: `apps/web/src/locales/ko/shortcuts.json` (add `flipHorizontal`, `flipVertical`)
- Test: `apps/web/test/keyboard-shortcuts.test.ts` (Shift+H / Shift+V cases)
- Test: `packages/ui/test/HelpDialog.test.tsx` (new rows present)
- Test: `apps/web/test/i18n-shortcuts.test.tsx` (translated labels, no raw keys)

**Interfaces:**

- Consumes: `flipElements` (`@excalidraw-clone/scene`), `patchScene(scene, patches)` (already imported in `shortcuts.ts`), `useAppStore.getState().selectedIds`.
- Produces:
  - `attachShortcuts` handles `!isMeta && e.shiftKey && (key === "h" || key === "v")`: when `selectedIds.length > 0`, `e.preventDefault()`, `patchScene(scene, flipElements(scene.getElements(), ids, key === "h" ? "x" : "y"))`, then `return`. When `selectedIds.length === 0`, `return` (no-op).
  - `HelpDialog` `EDITOR_SHORTCUTS` gains `{ keys: "Shift+H", label: "shortcuts:flipHorizontal" }` and `{ keys: "Shift+V", label: "shortcuts:flipVertical" }`.
  - `shortcuts.json` (en): `"flipHorizontal": "Flip horizontal"`, `"flipVertical": "Flip vertical"`. (ko): `"flipHorizontal": "좌우 반전"`, `"flipVertical": "상하 반전"`.

- [ ] **Step 1: Write the failing keyboard tests**

In `apps/web/test/keyboard-shortcuts.test.ts`, inside `describe("keyboard shortcuts")`, add. The suite already imports `newRectangle`, `newTriangle` is available from `@excalidraw-clone/scene` — extend line 7's import:

```ts
import { newRectangle, newText, newTriangle, Scene } from "@excalidraw-clone/scene"
```

Cases:

```ts
it("Shift+H flips the selection across the x-axis", () => {
  const tri = newTriangle({ x: 0, y: 0, width: 40, height: 30 })
  scene.mutate((draft) => {
    draft.push(tri)
  })
  useAppStore.getState().setSelection([tri.id])
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "H", shiftKey: true }))
  expect(scene.getElements()[0]!.mirror).toEqual([-1, 1])
})

it("Shift+V with a non-empty selection flips and does NOT switch to the selection tool", () => {
  const tri = newTriangle({ x: 0, y: 0, width: 40, height: 30 })
  scene.mutate((draft) => {
    draft.push(tri)
  })
  useAppStore.getState().setSelection([tri.id])
  useAppStore.getState().setActiveTool("rectangle")
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "V", shiftKey: true }))
  expect(scene.getElements()[0]!.mirror).toEqual([1, -1])
  expect(useAppStore.getState().activeTool).toBe("rectangle")
})

it("Shift+V with an empty selection is a no-op", () => {
  const tri = newTriangle({ x: 0, y: 0, width: 40, height: 30 })
  scene.mutate((draft) => {
    draft.push(tri)
  })
  useAppStore.getState().setActiveTool("rectangle")
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "V", shiftKey: true }))
  expect(scene.getElements()[0]!.mirror).toBeUndefined()
  expect(useAppStore.getState().activeTool).toBe("rectangle")
})
```

- [ ] **Step 2: Run the keyboard suite to verify it fails**

Run: `pnpm --filter @excalidraw-clone/web test -- keyboard-shortcuts.test.ts`
Expected: FAIL — `mirror` is `undefined` after `Shift+H`; `Shift+V` switches `activeTool` to `"selection"`.

- [ ] **Step 3: Implement the shortcut handler**

In `apps/web/src/keyboard/shortcuts.ts`, extend the scene import (lines 3-9):

```ts
import {
  expandIdsToFrameMembers,
  flipElements,
  groupElements,
  lockElements,
  type Scene,
  ungroupElements,
} from "@excalidraw-clone/scene"
```

Immediately before `const tool = TOOL_KEYS[key]` (line 182):

```ts
if (!isMeta && e.shiftKey && (key === "h" || key === "v")) {
  const ids = useAppStore.getState().selectedIds
  if (ids.length === 0) return
  e.preventDefault()
  patchScene(scene, flipElements(scene.getElements(), ids, key === "h" ? "x" : "y"))
  return
}
```

- [ ] **Step 4: Run the keyboard suite to verify it passes**

Run: `pnpm --filter @excalidraw-clone/web test -- keyboard-shortcuts.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing Help dialog tests**

In `packages/ui/test/HelpDialog.test.tsx`, add to the existing suite:

```ts
it("lists the flip shortcuts", () => {
  render(<HelpDialog t={t} open onClose={() => {}} />)
  expect(screen.getByText("Shift+H")).toBeInTheDocument()
  expect(screen.getByText("Shift+V")).toBeInTheDocument()
  expect(screen.getByText("shortcuts:flipHorizontal")).toBeInTheDocument()
  expect(screen.getByText("shortcuts:flipVertical")).toBeInTheDocument()
})
```

In `apps/web/test/i18n-shortcuts.test.tsx`, add to the assertion list in the existing test:

```ts
expect(screen.getByText("Flip horizontal")).toBeDefined()
expect(screen.getByText("Flip vertical")).toBeDefined()
```

- [ ] **Step 6: Run both to verify they fail**

Run: `pnpm --filter @excalidraw-clone/ui test -- HelpDialog.test.tsx` and `pnpm --filter @excalidraw-clone/web test -- i18n-shortcuts.test.tsx`
Expected: FAIL — rows / translations absent.

- [ ] **Step 7: Add the Help rows and locale keys**

In `packages/ui/src/HelpDialog.tsx`, in `EDITOR_SHORTCUTS`, after the `Cmd/Ctrl+K` row (line 40):

```ts
  { keys: "Shift+H", label: "shortcuts:flipHorizontal" },
  { keys: "Shift+V", label: "shortcuts:flipVertical" },
```

In `apps/web/src/locales/en/shortcuts.json`, add after `"openLink"`:

```json
  "flipHorizontal": "Flip horizontal",
  "flipVertical": "Flip vertical"
```

In `apps/web/src/locales/ko/shortcuts.json`, add after `"openLink"`:

```json
  "flipHorizontal": "좌우 반전",
  "flipVertical": "상하 반전"
```

(Mind trailing-comma placement — `"openLink"` is currently the last key in both files.)

- [ ] **Step 8: Run both suites to verify they pass**

Run: `pnpm --filter @excalidraw-clone/ui test -- HelpDialog.test.tsx` and `pnpm --filter @excalidraw-clone/web test -- i18n-shortcuts.test.tsx`
Expected: PASS.

- [ ] **Step 9: Typecheck + lint**

Run: `pnpm turbo run typecheck lint --filter @excalidraw-clone/web --filter @excalidraw-clone/ui`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/keyboard/shortcuts.ts packages/ui/src/HelpDialog.tsx \
  apps/web/src/locales/en/shortcuts.json apps/web/src/locales/ko/shortcuts.json \
  apps/web/test/keyboard-shortcuts.test.ts packages/ui/test/HelpDialog.test.tsx \
  apps/web/test/i18n-shortcuts.test.tsx
git commit -m "web/ui: Shift+H / Shift+V flip shortcut + Help dialog rows"
```

---

### Task 7: PropertiesPanel flip row + App wiring + `properties.*` i18n

Adds an always-rendered flip row to `PropertiesPanel` (shown whenever `selectedElements.length >= 1` and not every element is locked), independent of the `>= 2`-gated Arrange section, placed just above the `panel-lock` button. New `onFlip: (axis: "x" | "y") => void` prop. `App.tsx` wires it through `flipElements` + `patchScene`. New `properties.flip_horizontal` / `properties.flip_vertical` keys (en + ko).

**Files:**

- Modify: `packages/ui/src/PropertiesPanel.tsx` (prop + row; ~line 40-52 props, insert row before line 365 `panel-lock`)
- Modify: `apps/web/src/components/App.tsx` (add `onFlip` to the `<PropertiesPanel>` props, ~line 451-537)
- Modify: `apps/web/src/locales/en/common.json` (`properties.flip_horizontal`, `properties.flip_vertical`)
- Modify: `apps/web/src/locales/ko/common.json` (same keys)
- Test: `packages/ui/test/PropertiesPanel.test.tsx` (add `onFlip` to shared `handlers`; new cases)

**Interfaces:**

- Consumes: `flipElements` (`@excalidraw-clone/scene`), `patchScene` (already imported in `App.tsx`), `selectedIds`, `scene`.
- Produces:
  - `PropertiesPanelProps.onFlip: (axis: "x" | "y") => void` (required prop).
  - A `<div className="flex gap-1">` with two `<button>`s: `data-testid="flip-x"` (glyph `⇋`, `aria-label={t("properties.flip_horizontal")}`, `onClick={() => onFlip("x")}`) and `data-testid="flip-y"` (glyph `⥯`, `aria-label={t("properties.flip_vertical")}`, `onClick={() => onFlip("y")}`). Rendered when `selectedElements.length >= 1 && !selectedElements.every((el) => el.locked)`.
  - `App.tsx`: `onFlip={(axis) => patchScene(scene, flipElements(scene.getElements(), selectedIds, axis))}`.
  - `common.json` (en): `"flip_horizontal": "Flip horizontal"`, `"flip_vertical": "Flip vertical"`. (ko): `"flip_horizontal": "좌우 반전"`, `"flip_vertical": "상하 반전"`.

- [ ] **Step 1: Write the failing PropertiesPanel tests**

In `packages/ui/test/PropertiesPanel.test.tsx`, add `onFlip` to the shared `handlers` object (line 11-20):

```ts
const handlers = {
  onChange: vi.fn(),
  onDelete: vi.fn(),
  onDuplicate: vi.fn(),
  onAlign: noop,
  onDistribute: noop,
  onGroup: vi.fn(),
  onUngroup: vi.fn(),
  onLock: vi.fn(),
  onFlip: vi.fn(),
}
```

Add cases:

```ts
it("shows the flip row for a single selected element", () => {
  const el = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
  render(<PropertiesPanel t={t} selectedElements={[el]} {...handlers} />)
  expect(screen.getByTestId("flip-x")).toBeInTheDocument()
  expect(screen.getByTestId("flip-y")).toBeInTheDocument()
})

it("calls onFlip with the axis when a flip button is clicked", async () => {
  const el = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
  const onFlip = vi.fn()
  render(<PropertiesPanel t={t} selectedElements={[el]} {...handlers} onFlip={onFlip} />)
  await userEvent.click(screen.getByTestId("flip-x"))
  expect(onFlip).toHaveBeenCalledWith("x")
  await userEvent.click(screen.getByTestId("flip-y"))
  expect(onFlip).toHaveBeenCalledWith("y")
})

it("hides the flip row when every selected element is locked", () => {
  const el = { ...newRectangle({ x: 0, y: 0, width: 10, height: 10 }), locked: true }
  render(<PropertiesPanel t={t} selectedElements={[el]} {...handlers} />)
  expect(screen.queryByTestId("flip-x")).toBeNull()
})
```

- [ ] **Step 2: Run the PropertiesPanel suite to verify it fails**

Run: `pnpm --filter @excalidraw-clone/ui test -- PropertiesPanel.test.tsx`
Expected: FAIL — `flip-x` not found; also a TS error until the prop type exists (the `handlers` spread now has an extra key).

- [ ] **Step 3: Add the prop and the row**

In `packages/ui/src/PropertiesPanel.tsx`:

`PropertiesPanelProps` (after `onLock: () => void`, line 50):

```ts
  onFlip: (axis: "x" | "y") => void
```

Destructure it in the component signature (after `onLock,`, line 73):

```ts
  onFlip,
```

Insert the row immediately before the `panel-lock` button (line 365):

```tsx
{
  selectedElements.length >= 1 && !selectedElements.every((el) => el.locked) && (
    <div className="flex gap-1">
      <button
        type="button"
        data-testid="flip-x"
        aria-label={t("properties.flip_horizontal")}
        onClick={() => onFlip("x")}
        className="flex-1 rounded border border-panel p-1 text-xs"
      >
        ⇋
      </button>
      <button
        type="button"
        data-testid="flip-y"
        aria-label={t("properties.flip_vertical")}
        onClick={() => onFlip("y")}
        className="flex-1 rounded border border-panel p-1 text-xs"
      >
        ⥯
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Run the PropertiesPanel suite to verify it passes**

Run: `pnpm --filter @excalidraw-clone/ui test -- PropertiesPanel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Wire `onFlip` in `App.tsx` and add the locale keys**

In `apps/web/src/components/App.tsx`, extend the `@excalidraw-clone/scene` import (lines 5-23) with `flipElements`, then add to the `<PropertiesPanel>` props (after `onLock={...}`, line 536):

```tsx
              onFlip={(axis) => {
                patchScene(scene, flipElements(scene.getElements(), selectedIds, axis))
              }}
```

In `apps/web/src/locales/en/common.json`, in the `properties` object (after `"lock": "Lock"`, line ~78 — note `lock` is currently the last key, add a comma):

```json
  "flip_horizontal": "Flip horizontal",
  "flip_vertical": "Flip vertical"
```

In `apps/web/src/locales/ko/common.json`, `properties` object after `"lock": "잠금"`:

```json
  "flip_horizontal": "좌우 반전",
  "flip_vertical": "상하 반전"
```

- [ ] **Step 6: Run the web + ui suites**

Run: `pnpm --filter @excalidraw-clone/web test` and `pnpm --filter @excalidraw-clone/ui test`
Expected: PASS. (Watch for other `PropertiesPanel` consumers — grep `onLock=` / `<PropertiesPanel` across `apps/web` and `packages`; `App.tsx` is the only one.)

- [ ] **Step 7: Typecheck + lint**

Run: `pnpm turbo run typecheck lint --filter @excalidraw-clone/web --filter @excalidraw-clone/ui`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/ui/src/PropertiesPanel.tsx apps/web/src/components/App.tsx \
  apps/web/src/locales/en/common.json apps/web/src/locales/ko/common.json \
  packages/ui/test/PropertiesPanel.test.tsx
git commit -m "ui/web: PropertiesPanel flip row + onFlip wiring + i18n"
```

---

### Task 8: Context menu — element-menu flip items

Adds "Flip horizontal" / "Flip vertical" to the **element** context menu (not the canvas menu), in the not-locked (`else`) branch of `ContextMenuHost`, reusing the `properties.*` i18n keys added in Task 7. Calls the same `flipElements` + `patchScene` path with the menu's `elementIds`.

**Files:**

- Modify: `apps/web/src/components/ContextMenuHost.tsx` (add two items in the `else` branch, near the `delete` / `bring-to-front` items ~line 198-253)
- Test: `apps/web/e2e/context-menu.spec.ts` OR a new `apps/web/e2e/flip.spec.ts` case (element menu offers the items and flipping via the menu persists) — folded into Task 9's e2e spec.
- Test: none at unit level for `ContextMenuHost` (no unit harness exists; consistent with the existing context-menu items). Covered by e2e in Task 9.

**Interfaces:**

- Consumes: `flipElements` (`@excalidraw-clone/scene`), `patchScene` (already imported), `contextMenu.elementIds`, `scene`.
- Produces: two `ContextMenuItem`s in the element menu's not-locked branch:
  - `{ id: "flip-horizontal", label: t("properties.flip_horizontal"), perform: () => patchScene(scene, flipElements(scene.getElements(), elementIds, "x")) }`
  - `{ id: "flip-vertical", label: t("properties.flip_vertical"), perform: () => patchScene(scene, flipElements(scene.getElements(), elementIds, "y")) }`
  - Rendered testids: `context-menu-item-flip-horizontal` / `context-menu-item-flip-vertical`.

- [ ] **Step 1: Implement the context-menu items**

In `apps/web/src/components/ContextMenuHost.tsx`, extend the `@excalidraw-clone/scene` import (lines 3-16) with `flipElements`. In the `else` (not-locked) branch, right after the `duplicate` item's closing (`})` on line 164, before the `move-to-page` block):

```ts
items.push({
  id: "flip-horizontal",
  label: t("properties.flip_horizontal"),
  perform: () => patchScene(scene, flipElements(scene.getElements(), elementIds, "x")),
})
items.push({
  id: "flip-vertical",
  label: t("properties.flip_vertical"),
  perform: () => patchScene(scene, flipElements(scene.getElements(), elementIds, "y")),
})
```

> The `else` branch already means `!locked`, so no extra guard is needed — matches how `cut` / `duplicate` / `delete` are gated.

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm turbo run typecheck lint --filter @excalidraw-clone/web`
Expected: PASS.

- [ ] **Step 3: Run the web unit suite (no regression)**

Run: `pnpm --filter @excalidraw-clone/web test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/ContextMenuHost.tsx
git commit -m "web: element context-menu Flip horizontal / vertical"
```

---

### Task 9: e2e spec + full gate + diff-scope check

Adds the end-to-end spec (draw → select → flip → reload → assert `mirror` persisted; plus a context-menu flip case), then runs the complete gate and confirms the diff stays within the spec's file touch list.

**Files:**

- Create: `apps/web/e2e/flip.spec.ts`
- Test: itself + full gate (verification only for the rest)

**Interfaces:**

- Consumes: `parseStoredScene<T>(json)` and `dragOnCanvas(page, from, to)` from `apps/web/e2e/_helpers.ts`; localStorage key `"excalidraw-scene"`.

- [ ] **Step 1: Write the e2e spec**

Create `apps/web/e2e/flip.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test"
import { dragOnCanvas, parseStoredScene } from "./_helpers"

type SceneEl = { id: string; type: string; mirror?: [number, number]; isDeleted?: boolean }

const readScene = async (page: Page): Promise<SceneEl[]> => {
  const json = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  return parseStoredScene<SceneEl>(json).elements.filter((e) => !e.isDeleted)
}

const freshCanvas = async (page: Page): Promise<void> => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-triangle"]').waitFor({ state: "visible" })
}

const drawTriangle = async (page: Page): Promise<void> => {
  await page.locator('[data-testid="toolbar-triangle"]').click()
  await dragOnCanvas(page, { x: 120, y: 80 }, { x: 220, y: 180 })
  await page.waitForTimeout(120)
  await page.locator('[data-testid="toolbar-selection"]').click()
}

const selectTriangle = async (page: Page): Promise<void> => {
  const box = await page.locator("canvas").first().boundingBox()
  if (!box) throw new Error("canvas not found")
  await page.mouse.click(box.x + 180, box.y + 160) // inside the lower body of the triangle
}

test("Shift+V flips a triangle and the mirror persists across reload", async ({ page }) => {
  await freshCanvas(page)
  await drawTriangle(page)
  await selectTriangle(page)
  await page.keyboard.press("Shift+V")
  await page.waitForTimeout(900) // autosave debounce

  await page.reload()
  await page.locator('[data-testid="toolbar-selection"]').click()
  const tri = (await readScene(page)).find((e) => e.type === "triangle")
  expect(tri?.mirror).toEqual([1, -1])
})

test("element context menu offers Flip horizontal and flips on click", async ({ page }) => {
  await freshCanvas(page)
  await drawTriangle(page)
  await selectTriangle(page)

  const box = await page.locator("canvas").first().boundingBox()
  if (!box) throw new Error("canvas not found")
  await page.mouse.click(box.x + 180, box.y + 160, { button: "right" })
  await expect(page.locator('[data-testid="context-menu-item-flip-horizontal"]')).toBeVisible()
  await page.locator('[data-testid="context-menu-item-flip-horizontal"]').click()
  await page.waitForTimeout(900)

  const tri = (await readScene(page)).find((e) => e.type === "triangle")
  expect(tri?.mirror).toEqual([-1, 1])
})
```

- [ ] **Step 2: Run the new spec**

Run: `pnpm --filter @excalidraw-clone/web exec playwright test flip.spec.ts`
Expected: PASS. If `selectTriangle`'s click misses (triangle geometry — apex is top-centre, body widens downward), nudge the click point toward `box.x + 170, box.y + 165` and re-run. Confirm the selection landed by asserting the PropertiesPanel `flip-x` testid is visible before pressing the key if needed.

- [ ] **Step 3: Full unit + typecheck + lint gate**

Run: `pnpm turbo run typecheck lint test`
Expected: PASS for every package. If lint cites another worktree's paths, re-run `pnpm turbo run lint --force`.

- [ ] **Step 4: Full e2e suite**

Run: `pnpm --filter @excalidraw-clone/web exec playwright test`
Expected: PASS — `flip.spec.ts` green, no regression in `context-menu.spec.ts`, `flowchart-shapes.spec.ts`, `elbow-arrows.spec.ts`, `frames.spec.ts`, `element-links.spec.ts`.

- [ ] **Step 5: Diff-scope check against the spec's File touch list**

Run: `git diff --stat main...HEAD`
Expected: only these files (+ this plan doc):

| Area     | Files                                                                                                                                                                                                                                                                                                                                         |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| scene    | `packages/scene/src/types.ts`, `packages/scene/src/flip.ts` (new), `packages/scene/src/index.ts`, `packages/scene/src/hit-test.ts`, `packages/scene/src/bindings.ts`                                                                                                                                                                          |
| geometry | `packages/geometry/src/polygon.ts`, `packages/geometry/src/index.ts`                                                                                                                                                                                                                                                                          |
| renderer | `packages/renderer/src/shapes/polygon.ts`, `packages/renderer/src/draw-element.ts`, `packages/renderer/src/svg.ts` (+ `shape-cache.ts` only if Task 4 Step 8 found a collision)                                                                                                                                                               |
| ui       | `packages/ui/src/PropertiesPanel.tsx`, `packages/ui/src/HelpDialog.tsx`                                                                                                                                                                                                                                                                       |
| web      | `apps/web/src/keyboard/shortcuts.ts`, `apps/web/src/components/App.tsx`, `apps/web/src/components/ContextMenuHost.tsx`, `apps/web/src/locales/{en,ko}/common.json`, `apps/web/src/locales/{en,ko}/shortcuts.json`                                                                                                                             |
| tests    | `packages/geometry/test/polygon.test.ts`, `packages/scene/test/{types,flip,hit-test,bindings}.test.ts`, `packages/renderer/test/{shapes-others,draw-image,svg,shape-cache}.test.ts`, `apps/web/test/{keyboard-shortcuts,i18n-shortcuts}.test.ts`, `packages/ui/test/{PropertiesPanel,HelpDialog}.test.tsx`, `apps/web/e2e/flip.spec.ts` (new) |

Any file outside this set → investigate and revert or justify.

- [ ] **Step 6: Commit (only if Steps 3-4 required fixes)**

```bash
git add -A
git commit -m "flip: e2e spec + full-gate fixes"
```

If Steps 3-4 were green with no edits, skip this commit.

---

## Self-Review

### Spec coverage

| Spec section | Requirement                                                                                                  | Task                                                                                                                                                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| §1           | optional `mirror` field, no format bump                                                                      | Task 1 (Step 7)                                                                                                                                                                                                          |
| §1           | `mirrorOf` helper exported from scene                                                                        | Task 1                                                                                                                                                                                                                   |
| §1           | `[1,1] → omit` normalization owned by `flipElements`                                                         | Task 2 (Step 3), tested Task 2 Step 1 + Task 3 Step 1                                                                                                                                                                    |
| §1           | `image.scale` stays unread                                                                                   | Global Constraints; no task touches it                                                                                                                                                                                   |
| §2           | polygon/image/text/rect/ellipse/diamond/frame: toggle `mirror` + `angle → -angle`                            | Task 2 `flipOne`                                                                                                                                                                                                         |
| §2           | `angle → -angle`, `-0` normalized                                                                            | Task 2 `negateAngle`                                                                                                                                                                                                     |
| §2           | linear/freedraw: bake into `points`, `angle → -angle`, `focus → -focus`, no `mirror`, start/end not swapped  | Task 2 `flipOne` linear branch                                                                                                                                                                                           |
| §2           | bound-text label of a flipped container is NOT flipped                                                       | Emergent — `flipElements` only touches `ids`/frame closure, not `boundElements`; a container's label is not in the frame closure and `reconcileBoundText` re-lays it. Covered implicitly; no explicit test (flag below). |
| §2           | elbow arrows re-routed by post-flip reconcile                                                                | Emergent — `scene.mutate` (via `patchScene`) always runs `reconcileBindings`, which re-routes elbowed arrows (`bindings.ts:111-166`). Verified via full e2e (`elbow-arrows.spec.ts` stays green, Task 9 Step 4).         |
| §3           | multi: combined bounds from closure, reflect each centre, then per-element flip                              | Task 3                                                                                                                                                                                                                   |
| §3           | `groupIds` unchanged; frame reflects members                                                                 | Task 3 (`flipOne` never touches `groupIds`; `expandIdsToFrameMembers`)                                                                                                                                                   |
| §4           | `flipElements` contract, signature, `[]` cases, frame-closure expansion, locked filter, whole-element return | Task 2 + Task 3                                                                                                                                                                                                          |
| §4           | wired into App like `onAlign`/`onGroup`                                                                      | Task 7 (Step 5)                                                                                                                                                                                                          |
| §5           | `mirroredShapeVertices` new in geometry, single source of truth, `[1,1]` identity                            | Task 1                                                                                                                                                                                                                   |
| §5           | consumers: renderer polygon, hit-test, bindings                                                              | Task 4 + Task 5                                                                                                                                                                                                          |
| §5           | `binding-edge.ts` needs no change                                                                            | Not touched — noted in Task 5                                                                                                                                                                                            |
| §6           | canvas `image`/`text` mirror step after rotate                                                               | Task 4 (Step 4)                                                                                                                                                                                                          |
| §6           | polygons mirrored via vertices; rect/ellipse/diamond/frame no-op                                             | Task 4 (Step 3)                                                                                                                                                                                                          |
| §6           | ShapeCache key verification                                                                                  | Task 4 (Step 8)                                                                                                                                                                                                          |
| §6           | SVG `elementTransform` scale term for `image`/`text`                                                         | Task 4 (Step 5)                                                                                                                                                                                                          |
| §7           | hit-test polygon branch → `mirroredShapeVertices`; others unchanged                                          | Task 5 (Step 4)                                                                                                                                                                                                          |
| §7           | `bounds.ts` no change                                                                                        | Not touched — noted in Task 5                                                                                                                                                                                            |
| §7           | bindings reconcile after flip fixes bound arrows + elbow                                                     | Global Constraints (automatic via `scene.mutate`) + Task 5 (edge points)                                                                                                                                                 |
| §8           | keyboard `Shift+H`/`Shift+V` before `TOOL_KEYS`, empty-selection no-op, non-empty no tool switch             | Task 6                                                                                                                                                                                                                   |
| §8           | PropertiesPanel flip row + `onFlip` prop, always-rendered when `>=1` & not all locked                        | Task 7                                                                                                                                                                                                                   |
| §8           | i18n `properties.flip_horizontal` / `_vertical` (en + ko)                                                    | Task 7                                                                                                                                                                                                                   |
| §8           | HelpDialog `Shift+H` / `Shift+V` rows                                                                        | Task 6                                                                                                                                                                                                                   |
| §8           | context menu element-menu items, locked → hidden                                                             | Task 8                                                                                                                                                                                                                   |
| §9           | geometry tests                                                                                               | Task 1 Step 1                                                                                                                                                                                                            |
| §9           | `packages/scene/test/flip.test.ts` full enumeration                                                          | Task 2 Step 1 + Task 3 Step 1                                                                                                                                                                                            |
| §9           | renderer tests (`polygonShape` mirrored, `svg.ts` scale term)                                                | Task 4 Step 1                                                                                                                                                                                                            |
| §9           | `apps/web` keyboard + PropertiesPanel + e2e `flip.spec.ts`                                                   | Task 6, Task 7, Task 9                                                                                                                                                                                                   |
| §9           | full gate + diff scope                                                                                       | Task 9                                                                                                                                                                                                                   |
| §10          | out-of-scope items                                                                                           | No task implements them                                                                                                                                                                                                  |

### Placeholder scan

- No "TBD" / "TODO" / "handle edge cases" / "add validation" / "similar to Task N" strings. Every code step carries literal code (helper bodies, JSX, full test bodies).
- Task 2 Step 3 carries an "Implementation notes" caveat about union narrowing — this is guidance around a real TS-union friction point, not a placeholder; the required end-state (fields per element class) is spelled out explicitly and the tests pin it.
- All referenced identifiers are defined by an earlier task: `mirror`, `mirrorOf`, `FlipAxis`, `mirroredShapeVertices` (Task 1); `flipElements`, `flipOne` (Tasks 2-3); `onFlip` prop (Task 7). `patchScene`, `expandIdsToFrameMembers`, `getElementsBounds`, `newTriangle`/`newParallelogram`/`newFreedraw`/`newArrow`/`newFrame`/`newRectangle`, `parseStoredScene`, `dragOnCanvas` are pre-existing.

### Type consistency

- `mirrorOf` accepts `Pick<ExcalidrawElement, "mirror">` and returns `readonly [number, number]` — same signature at every call site (`hit-test.ts`, `bindings.ts`, `draw-element.ts`, `svg.ts`). The renderer `shapes/polygon.ts` deliberately uses the inline `e.mirror ?? [1, 1]` form instead (documented in Task 4 Step 3) to avoid a value import into the shapes layer; `mirroredShapeVertices`'s third param is `readonly [number, number]`, satisfied by both forms.
- `mirroredShapeVertices(kind: PolygonShapeKind, b: Bounds, mirror: readonly [number, number]): Point[]` — identical in the geometry definition (Task 1 Step 3), `polygon.test.ts` (Task 1 Step 1), `shapes/polygon.ts` (Task 4), `hit-test.ts` (Task 5), `bindings.ts` (Task 5).
- `flipElements(elements: readonly ExcalidrawElement[], ids: readonly string[], axis: FlipAxis): ExcalidrawElement[]` — identical in `flip.ts` (Tasks 2-3), `shortcuts.ts` (Task 6), `App.tsx` (Task 7), `ContextMenuHost.tsx` (Task 8). `FlipAxis` = `"x" | "y"`; the PropertiesPanel prop is typed `(axis: "x" | "y") => void` (structurally identical — the spec's §8 snippet uses the literal, not the alias, in the UI package to keep `@excalidraw-clone/ui` from importing the type; consistent).
- `ExcalidrawElementBase.mirror?: readonly [1 | -1, 1 | -1]` — tests use `[-1, 1] as const` / `[1, -1] as const` which widen-assign cleanly; `flipElements` casts its computed pair back to `readonly [1 | -1, 1 | -1]`.
- `el.locked` is non-optional `boolean` (`ExcalidrawElementBase`) — `!el.locked` and `.every((el) => el.locked)` need no nullish handling.
- Help dialog rows use `shortcuts:*` label keys (namespaced) — matches the existing `EDITOR_SHORTCUTS` entries; PropertiesPanel/context-menu use `properties.*` (dot, default namespace) — matches existing `align_*` / `lock` keys.

### Open questions / spec gaps found

1. **Lone-frame flip. — RESOLVED.** §4 (single-vs-group by `ids.length`) and §3 ("a selected `frame` reflects its members") conflict for a lone-selected frame. Decision: a lone selected frame takes the **group path** so its members reflect (a frame rectangle is symmetric — flipping it alone is otherwise a no-op). Implemented via the `soloNonFrame` guard in Task 2 Step 3; covered by a Task 3 test.
2. **Bound-text label of a flipped container (§2 last row).** The spec says the label "only flips when itself directly selected". With `flipElements` operating on `ids` + frame closure, a container's bound label is normally not in that set, so it is left readable — correct by omission. But if a user multi-selects a shape _and its own bound label_, both are in `ids` and both flip (the label mirrors its glyphs). The spec doesn't explicitly forbid this; no test covers it. Left as-is.
3. **`reconcileBindings` already runs in `scene.mutate`.** The spec (§4, §7, §8) repeatedly says "followed by a `reconcileBindings` pass" / "fold the reconcile into `patchScene`'s call site". Verified unnecessary: `Scene.mutate` (`packages/scene/src/scene.ts:54-56`) already calls `reconcileBoundText` → `reconcileBindings` → `reconcileFrameMembership` on every mutation, and `patchScene` goes through `scene.mutate`. No task adds a manual pass. This also answers the spec's parenthetical "match how other geometry-mutating shortcuts already reconcile, if any" — they rely on the same automatic pass.
4. **`Shift+V` empty-selection behaviour is a (small) change.** Today `TOOL_KEYS["v"]` fires with any modifiers, so `Shift+V` currently switches to the selection tool. The new handler `return`s early on an empty selection, so `Shift+V` becomes a true no-op there. The spec's §8 parenthetical ("today's behaviour: nothing") is slightly inaccurate but the intended end-state (no-op) is unambiguous and is what Task 6's test pins.
5. **`mirroredShapeVertices` return type.** Spec §5 signature returns `Point[]`; the `[1,1]` fast path returns `shapeVertices`'s array directly (same reference). Callers only read it, so this is safe, but a defensive `.slice()` could be added if a caller ever mutates. Not done (no caller mutates).

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-09-03-flip-horizontal-vertical.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
