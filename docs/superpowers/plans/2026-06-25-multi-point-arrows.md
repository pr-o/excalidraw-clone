# Multi-Point Arrows (Bend Points) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users add, drag, and remove intermediate bend points on arrows/lines via Excalidraw-style midpoint handles, with bends surviving on arrows bound to shapes.

**Architecture:** The element model and renderer/hit-test/bounds already handle N-point arrays. Two write paths flatten to 2 points and are fixed: (1) a new `pointsPatch` generalizes `linearPatch` to N points; (2) `reconcileBindings` recomputes only bound endpoints and preserves interior points. Editing reuses the shipped endpoint-handle machinery: `findHandleAt` gains `bend`/`bendAdd` hits, a new `selection/bend.ts` provides insert/move/commit/remove/revert effect builders, a `bendDragging` selection phase drives them, and `overlay.ts` draws interior dots + segment-midpoint ghost handles.

**Tech Stack:** TypeScript (strict), pnpm workspaces, Vitest (unit), Playwright (e2e), Zustand store, canvas 2D renderer.

## Global Constraints

- **Linear chrome decision:** arrow/line elements render **endpoint dots + interior bend dots + segment-midpoint ghost handles only** — no resize handles, rotation handle, or bounding box.
- **"Linear" = `type === "arrow" || type === "line"`.** Bend chrome and editing apply to both; **binding logic applies to arrows only** (`reconcileBindings` already skips non-arrows; lines are not bindable).
- **Minimum 2 points** always enforced — bend removal is a no-op at 2 points.
- **Bends never bind:** interior points carry no `focus`/back-ref logic. Only the first/last point participate in binding (already handled by the shipped `endpointDragging` phase).
- **History model:** `Scene.mutate` with `skipHistory: true` mutates live state without a snapshot; a non-`skipHistory` mutation appends the post-mutation snapshot, and undo restores the prior snapshot. So a drag = N `skipHistory` moves + one tracked commit yields correct single-step undo. Follow this pattern exactly (mirrors `selection/endpoint.ts`).
- Tests live in `packages/<pkg>/test/`, not co-located. Reducer unit tests use `makeCtx`/`applyMutation`/`IDENTITY_VIEW` from `packages/tools/test/test-utils.ts`. Identity view (zoom 1, scroll 0) means scene coords == viewport coords in tests.
- Run the full gate before merge: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` (repo root) + `pnpm exec playwright test` (from `apps/web`). Husky runs ESLint + prettier on pre-commit.
- Commit after each task. Branch is `develop`. Do not merge to `main` until the user approves.

---

## File Structure

| File                                                       | Responsibility                                         |
| ---------------------------------------------------------- | ------------------------------------------------------ |
| `packages/tools/src/tools/linear.ts` (modify)              | add `pointsPatch`; make `linearPatch` a wrapper        |
| `packages/tools/test/linear-points-patch.test.ts` (create) | `pointsPatch` round-trip                               |
| `packages/scene/src/bindings.ts` (modify)                  | `reconcileBindings` preserves interior points          |
| `packages/scene/test/bindings.test.ts` (modify)            | interior-point preservation under binding              |
| `packages/tools/src/tools/selection/handles.ts` (modify)   | `bend` + `bendAdd` HandleHit variants                  |
| `packages/tools/test/selection-handles.test.ts` (modify)   | bend hit detection                                     |
| `packages/tools/src/tools/selection/bend.ts` (create)      | insert/move/commit/remove/revert effect builders       |
| `packages/tools/test/selection-bend.test.ts` (create)      | bend effect builders                                   |
| `packages/tools/src/tools/selection/types.ts` (modify)     | `bendDragging` phase                                   |
| `packages/tools/src/tools/selection/index.ts` (modify)     | idle bend/bendAdd/double-click branches + `reduceBend` |
| `packages/tools/test/selection-bend-tool.test.ts` (create) | bend state machine                                     |
| `packages/renderer/src/overlay.ts` (modify)                | interior dots + ghost midpoint handles                 |
| `packages/renderer/test/overlay.test.ts` (modify)          | 3-point arrow chrome                                   |
| `apps/web/e2e/arrow-bend.spec.ts` (create)                 | add bend; bend survives target move                    |

---

## Task 1: `pointsPatch` — N-point geometry helper

**Files:**

- Modify: `packages/tools/src/tools/linear.ts` (`LinearPatch` interface :60-66, `linearPatch` :68-81)
- Test: `packages/tools/test/linear-points-patch.test.ts` (create)

**Interfaces:**

- Produces: `pointsPatch(absPoints: readonly Point[]): LinearPatch` — re-bases an array of absolute-scene points to a fresh min-x/min-y bounding box. `LinearPatch` is the existing `{ x; y; width; height; points: readonly Point[] }`. `linearPatch(start, end)` becomes `pointsPatch([start, end])` and keeps its exact current output.

- [ ] **Step 1: Write the failing test**

Create `packages/tools/test/linear-points-patch.test.ts`:

```typescript
import { describe, expect, it } from "vitest"
import { linearPatch, pointsPatch } from "../src/tools/linear"

describe("pointsPatch", () => {
  it("re-bases a 3-point path to a fresh bounding box", () => {
    const patch = pointsPatch([
      { x: 10, y: 20 },
      { x: 50, y: 5 },
      { x: 30, y: 60 },
    ])
    expect(patch.x).toBe(10)
    expect(patch.y).toBe(5)
    expect(patch.width).toBe(40) // 50 - 10
    expect(patch.height).toBe(55) // 60 - 5
    expect(patch.points).toEqual([
      { x: 0, y: 15 },
      { x: 40, y: 0 },
      { x: 20, y: 55 },
    ])
  })

  it("round-trips: abs -> patch -> abs reproduces the input", () => {
    const abs = [
      { x: 100, y: 200 },
      { x: 140, y: 260 },
    ]
    const patch = pointsPatch(abs)
    const back = patch.points.map((p) => ({ x: patch.x + p.x, y: patch.y + p.y }))
    expect(back).toEqual(abs)
  })

  it("linearPatch matches pointsPatch of two points", () => {
    const a = { x: 30, y: 70 }
    const b = { x: 10, y: 10 }
    expect(linearPatch(a, b)).toEqual(pointsPatch([a, b]))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @excalidraw-clone/tools test -- linear-points-patch`
Expected: FAIL — `pointsPatch` is not exported.

- [ ] **Step 3: Implement `pointsPatch` and rewrite `linearPatch`**

In `packages/tools/src/tools/linear.ts`, replace the `linearPatch` function (lines 68-81) with:

```typescript
export const pointsPatch = (absPoints: readonly Point[]): LinearPatch => {
  const xs = absPoints.map((p) => p.x)
  const ys = absPoints.map((p) => p.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  return {
    x: minX,
    y: minY,
    width: Math.max(...xs) - minX,
    height: Math.max(...ys) - minY,
    points: absPoints.map((p) => ({ x: p.x - minX, y: p.y - minY })),
  }
}

export const linearPatch = (start: Point, end: Point): LinearPatch => pointsPatch([start, end])
```

(`LinearPatch` interface on lines 60-66 is unchanged.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @excalidraw-clone/tools test -- linear-points-patch`
Expected: PASS — all three tests green.

- [ ] **Step 5: Run the tools suite to confirm no regression**

Run: `pnpm --filter @excalidraw-clone/tools test`
Expected: PASS — `linear-tools`, `selection-endpoint`, etc. unaffected (`linearPatch` output identical).

- [ ] **Step 6: Commit**

```bash
git add packages/tools/src/tools/linear.ts packages/tools/test/linear-points-patch.test.ts
git commit -m "tools: add pointsPatch (N-point geometry) and route linearPatch through it"
```

---

## Task 2: `reconcileBindings` preserves interior points

**Files:**

- Modify: `packages/scene/src/bindings.ts` — the bound-arrow rebuild in `reconcileBindings` (the `pts.length >= 2` branch, lines ~104-134)
- Test: `packages/scene/test/bindings.test.ts` (add to the existing `reconcileBindings` describe block)

**Interfaces:**

- Consumes: `computeBoundEndpoint`, `getElementBounds`, `boundsCenter` (already imported in `bindings.ts`).
- Produces: no signature change. Behaviour: a bound arrow with `points.length > 2` keeps its interior points at their absolute positions; only bound endpoint(s) reflow. 2-point arrows behave exactly as before.

- [ ] **Step 1: Write the failing test**

Add to `packages/scene/test/bindings.test.ts` inside the existing `describe("reconcileBindings", ...)` block. (Confirm `reconcileBindings`, `rect`, and `newArrow` are already imported at the top of the file; they are used by existing tests there.)

```typescript
it("preserves interior bend points; only the bound end reflows", () => {
  // Rectangle target on the right, center (250,50).
  const target = { ...rect({ x: 200, y: 0, width: 100, height: 100 }), id: "t" }
  // 3-point arrow: start (0,50) -> bend (100,200) -> end (250,50) inside target.
  const arrow = {
    ...newArrow({ x: 0, y: 0 }),
    id: "ar",
    x: 0,
    y: 50,
    width: 250,
    height: 150,
    points: [
      { x: 0, y: 0 },
      { x: 100, y: 150 },
      { x: 250, y: 0 },
    ],
    endBinding: { elementId: "t", focus: 0, gap: 4 },
  }
  const draft = [target, arrow]
  reconcileBindings(draft)
  const a = draft.find((e) => e.id === "ar")!
  // still three points
  expect(a.points.length).toBe(3)
  // interior bend point absolute position unchanged at (100,200)
  const bendAbs = { x: a.x + a.points[1]!.x, y: a.y + a.points[1]!.y }
  expect(bendAbs.x).toBeCloseTo(100)
  expect(bendAbs.y).toBeCloseTo(200)
  // bound end now sits on the target's left edge (x ≈ 200 - gap = 196), not 250
  const endAbs = { x: a.x + a.points[2]!.x, y: a.y + a.points[2]!.y }
  expect(endAbs.x).toBeLessThan(210)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @excalidraw-clone/scene test -- bindings`
Expected: FAIL — `a.points.length` is `2` (interior bend erased by the 2-point rebuild).

- [ ] **Step 3: Implement interior-point preservation**

In `packages/scene/src/bindings.ts`, replace the bound-arrow rebuild — the block that currently starts at `let startAbs: Point = ...` and ends with the `draft[i] = { ...arrow, x: minX, ... points: [ ... ], startBinding, endBinding }` literal — with:

```typescript
const abs: Point[] = pts.map((p) => ({ x: arrow.x + p.x, y: arrow.y + p.y }))
const hasBends = abs.length > 2
let startAbs = abs[0]!
let endAbs = abs[abs.length - 1]!

if (startTarget) {
  const toward = hasBends ? abs[1]! : endTarget ? boundsCenter(getElementBounds(endTarget)) : endAbs
  startAbs = computeBoundEndpoint(startTarget, toward, startBinding!.gap, startBinding!.focus)
}
if (endTarget) {
  const toward = hasBends
    ? abs[abs.length - 2]!
    : startTarget
      ? boundsCenter(getElementBounds(startTarget))
      : startAbs
  endAbs = computeBoundEndpoint(endTarget, toward, endBinding!.gap, endBinding!.focus)
}

const newAbs: Point[] = [startAbs, ...abs.slice(1, abs.length - 1), endAbs]
const xs = newAbs.map((p) => p.x)
const ys = newAbs.map((p) => p.y)
const minX = Math.min(...xs)
const minY = Math.min(...ys)
draft[i] = {
  ...arrow,
  x: minX,
  y: minY,
  width: Math.max(...xs) - minX,
  height: Math.max(...ys) - minY,
  points: newAbs.map((p) => ({ x: p.x - minX, y: p.y - minY })),
  startBinding,
  endBinding,
}
```

Notes: for a 2-point arrow `hasBends` is false, so `toward` resolves to exactly the previous expression (target center, else other endpoint) and `newAbs` is `[startAbs, endAbs]` — byte-identical behaviour to before. `Point` is already imported in this file.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @excalidraw-clone/scene test -- bindings`
Expected: PASS — the new test plus all existing `reconcileBindings` and `computeBoundEndpoint` tests stay green.

- [ ] **Step 5: Run the scene suite**

Run: `pnpm --filter @excalidraw-clone/scene test`
Expected: PASS — no regression.

- [ ] **Step 6: Commit**

```bash
git add packages/scene/src/bindings.ts packages/scene/test/bindings.test.ts
git commit -m "scene: reconcileBindings preserves interior bend points (only bound ends reflow)"
```

---

## Task 3: Bend hit detection in `handles.ts`

**Files:**

- Modify: `packages/tools/src/tools/selection/handles.ts` (`HandleHit` union :13-16; the `isLinear(e)` branch in `findHandleAt` :73-85)
- Test: `packages/tools/test/selection-handles.test.ts` (add cases)

**Interfaces:**

- Produces: `HandleHit` gains `| { kind: "bend"; elementId: string; index: number }` and `| { kind: "bendAdd"; elementId: string; segmentIndex: number; at: Point }`. For a single-selected linear element, `findHandleAt` priority is: endpoints → interior points (`bend`, index in `1..n-2`) → segment midpoints (`bendAdd`, `at` = scene midpoint of segment `segmentIndex`). Non-linear behaviour unchanged.

- [ ] **Step 1: Write the failing test**

Add to `packages/tools/test/selection-handles.test.ts`. The existing `horizontalArrow()` helper makes a 2-point arrow; add a 3-point helper near it:

```typescript
const bentArrow = (): ExcalidrawArrowElement => ({
  ...newArrow({ x: 0, y: 0 }),
  id: "ar",
  x: 0,
  y: 0,
  width: 200,
  height: 100,
  points: [
    { x: 0, y: 0 },
    { x: 100, y: 100 },
    { x: 200, y: 0 },
  ],
})
```

Then add a describe block:

```typescript
describe("findHandleAt — bend points", () => {
  it("hits an interior point as a bend", () => {
    const a = bentArrow()
    const hit = findHandleAt({ x: 100, y: 100 }, [a.id], [a], IDENTITY_VIEW)
    expect(hit).toEqual({ kind: "bend", elementId: "ar", index: 1 })
  })

  it("endpoints still win over interior/segment hits", () => {
    const a = bentArrow()
    expect(findHandleAt({ x: 0, y: 0 }, [a.id], [a], IDENTITY_VIEW)).toEqual({
      kind: "endpoint",
      elementId: "ar",
      end: "start",
    })
    expect(findHandleAt({ x: 200, y: 0 }, [a.id], [a], IDENTITY_VIEW)).toEqual({
      kind: "endpoint",
      elementId: "ar",
      end: "end",
    })
  })

  it("hits a segment midpoint as bendAdd", () => {
    const a = bentArrow()
    // midpoint of segment 0: between (0,0) and (100,100) => (50,50)
    const hit = findHandleAt({ x: 50, y: 50 }, [a.id], [a], IDENTITY_VIEW)
    expect(hit).toEqual({ kind: "bendAdd", elementId: "ar", segmentIndex: 0, at: { x: 50, y: 50 } })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @excalidraw-clone/tools test -- selection-handles`
Expected: FAIL — interior/segment points return `null` (only endpoints are checked).

- [ ] **Step 3: Extend `HandleHit` and the linear branch**

In `packages/tools/src/tools/selection/handles.ts`, extend the union (lines 13-16):

```typescript
export type HandleHit =
  | { kind: "resize"; elementId: string; handle: ResizeHandle }
  | { kind: "rotate"; elementId: string }
  | { kind: "endpoint"; elementId: string; end: "start" | "end" }
  | { kind: "bend"; elementId: string; index: number }
  | { kind: "bendAdd"; elementId: string; segmentIndex: number; at: Point }
```

Replace the entire `if (isLinear(e)) { ... }` block (lines 73-85) with:

```typescript
if (isLinear(e)) {
  const atV = sceneToViewport(at, view)
  const pts = (e as { points: readonly Point[] }).points
  const abs = pts.map((p) => ({ x: e.x + p.x, y: e.y + p.y }))
  // Endpoints first.
  if (within(atV, sceneToViewport(abs[0]!, view))) {
    return { kind: "endpoint", elementId: id, end: "start" }
  }
  if (within(atV, sceneToViewport(abs[abs.length - 1]!, view))) {
    return { kind: "endpoint", elementId: id, end: "end" }
  }
  // Interior bend points.
  for (let k = 1; k < abs.length - 1; k += 1) {
    if (within(atV, sceneToViewport(abs[k]!, view))) {
      return { kind: "bend", elementId: id, index: k }
    }
  }
  // Segment midpoints (add a bend).
  for (let k = 0; k < abs.length - 1; k += 1) {
    const mid = midPoint(abs[k]!, abs[k + 1]!)
    if (within(atV, sceneToViewport(mid, view))) {
      return { kind: "bendAdd", elementId: id, segmentIndex: k, at: mid }
    }
  }
  return null
}
```

(`midPoint` and `within` already exist in this file; `linearEndpoints` is now unused for this branch but is still referenced nowhere else — delete the now-dead `linearEndpoints` helper if lint flags it as unused, otherwise leave it.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @excalidraw-clone/tools test -- selection-handles`
Expected: PASS — bend, endpoint-priority, and bendAdd tests green; existing endpoint/rectangle tests unchanged.

- [ ] **Step 5: Commit**

```bash
git add packages/tools/src/tools/selection/handles.ts packages/tools/test/selection-handles.test.ts
git commit -m "tools: detect bend (interior) and bendAdd (segment-midpoint) linear handles"
```

---

## Task 4: Bend effect builders (`selection/bend.ts`)

**Files:**

- Create: `packages/tools/src/tools/selection/bend.ts`
- Test: `packages/tools/test/selection-bend.test.ts` (create)

**Interfaces:**

- Consumes: `pointsPatch` (Task 1), `LinearSnapshot`/`snapshotLinear` (existing `selection/endpoint.ts`).
- Produces:
  - `buildBendInsertEffect(elementId: string, insertIndex: number, at: Point): ToolEffect` (skipHistory; splices `at` into points)
  - `buildBendMoveEffect(elementId: string, index: number, to: Point): ToolEffect` (skipHistory)
  - `buildBendCommitEffect(elementId: string): ToolEffect` (history-tracked; rewrites current geometry as the undo boundary)
  - `buildBendRemoveEffect(elementId: string, index: number): ToolEffect` (history-tracked; removes an interior point, no-op if it would drop below 2 points or targets an endpoint)
  - `buildBendRevertEffect(elementId: string, origin: LinearSnapshot): ToolEffect` (skipHistory)

- [ ] **Step 1: Write the failing test**

Create `packages/tools/test/selection-bend.test.ts`:

```typescript
import { newArrow } from "@excalidraw-clone/scene"
import type { ExcalidrawArrowElement, ExcalidrawElement } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import {
  buildBendInsertEffect,
  buildBendMoveEffect,
  buildBendRemoveEffect,
  buildBendRevertEffect,
} from "../src/tools/selection/bend"
import { snapshotLinear } from "../src/tools/selection/endpoint"
import { applyMutation } from "./test-utils"

const arrow = (): ExcalidrawArrowElement => ({
  ...newArrow({ x: 0, y: 0 }),
  id: "ar",
  x: 0,
  y: 0,
  width: 100,
  height: 0,
  points: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ],
})

const abs = (a: ExcalidrawArrowElement, i: number) => ({
  x: a.x + a.points[i]!.x,
  y: a.y + a.points[i]!.y,
})

describe("bend insert", () => {
  it("splices a new point at the given index", () => {
    const draft: ExcalidrawElement[] = [arrow()]
    applyMutation([buildBendInsertEffect("ar", 1, { x: 50, y: 40 })], draft)
    const a = draft[0] as ExcalidrawArrowElement
    expect(a.points.length).toBe(3)
    expect(abs(a, 1)).toEqual({ x: 50, y: 40 })
  })
})

describe("bend move", () => {
  it("repositions an interior point", () => {
    const draft: ExcalidrawElement[] = [arrow()]
    applyMutation([buildBendInsertEffect("ar", 1, { x: 50, y: 40 })], draft)
    applyMutation([buildBendMoveEffect("ar", 1, { x: 70, y: 90 })], draft)
    const a = draft[0] as ExcalidrawArrowElement
    expect(abs(a, 1)).toEqual({ x: 70, y: 90 })
  })
})

describe("bend remove", () => {
  it("removes an interior point and rejoins neighbors", () => {
    const draft: ExcalidrawElement[] = [arrow()]
    applyMutation([buildBendInsertEffect("ar", 1, { x: 50, y: 40 })], draft)
    applyMutation([buildBendRemoveEffect("ar", 1)], draft)
    const a = draft[0] as ExcalidrawArrowElement
    expect(a.points.length).toBe(2)
    expect(abs(a, 0)).toEqual({ x: 0, y: 0 })
    expect(abs(a, 1)).toEqual({ x: 100, y: 0 })
  })

  it("is a no-op at 2 points", () => {
    const draft: ExcalidrawElement[] = [arrow()]
    applyMutation([buildBendRemoveEffect("ar", 1)], draft)
    const a = draft[0] as ExcalidrawArrowElement
    expect(a.points.length).toBe(2)
  })
})

describe("bend revert", () => {
  it("restores the original geometry", () => {
    const a0 = arrow()
    const origin = snapshotLinear(a0)
    const draft: ExcalidrawElement[] = [a0]
    applyMutation([buildBendInsertEffect("ar", 1, { x: 50, y: 999 })], draft)
    applyMutation([buildBendRevertEffect("ar", origin)], draft)
    const a = draft[0] as ExcalidrawArrowElement
    expect(a.points.length).toBe(2)
    expect(abs(a, 1)).toEqual({ x: 100, y: 0 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @excalidraw-clone/tools test -- selection-bend`
Expected: FAIL — `../src/tools/selection/bend` has no such exports.

- [ ] **Step 3: Implement the builders**

Create `packages/tools/src/tools/selection/bend.ts`:

```typescript
import type { Point } from "@excalidraw-clone/geometry"
import type { ExcalidrawArrowElement } from "@excalidraw-clone/scene"
import type { ToolEffect } from "../../types"
import { pointsPatch } from "../linear"
import type { LinearSnapshot } from "./endpoint"

const absPoints = (a: ExcalidrawArrowElement): Point[] =>
  a.points.map((p) => ({ x: a.x + p.x, y: a.y + p.y }))

export const buildBendInsertEffect = (
  elementId: string,
  insertIndex: number,
  at: Point,
): ToolEffect => ({
  kind: "mutation",
  skipHistory: true,
  apply: (draft) => {
    const i = draft.findIndex((e) => e.id === elementId)
    if (i < 0) return
    const a = draft[i] as ExcalidrawArrowElement
    const abs = absPoints(a)
    abs.splice(insertIndex, 0, at)
    draft[i] = { ...a, ...pointsPatch(abs) }
  },
})

export const buildBendMoveEffect = (elementId: string, index: number, to: Point): ToolEffect => ({
  kind: "mutation",
  skipHistory: true,
  apply: (draft) => {
    const i = draft.findIndex((e) => e.id === elementId)
    if (i < 0) return
    const a = draft[i] as ExcalidrawArrowElement
    if (index < 0 || index >= a.points.length) return
    const abs = absPoints(a)
    abs[index] = to
    draft[i] = { ...a, ...pointsPatch(abs) }
  },
})

export const buildBendCommitEffect = (elementId: string): ToolEffect => ({
  kind: "mutation",
  apply: (draft) => {
    const i = draft.findIndex((e) => e.id === elementId)
    if (i < 0) return
    const a = draft[i] as ExcalidrawArrowElement
    draft[i] = { ...a, ...pointsPatch(absPoints(a)) }
  },
})

export const buildBendRemoveEffect = (elementId: string, index: number): ToolEffect => ({
  kind: "mutation",
  apply: (draft) => {
    const i = draft.findIndex((e) => e.id === elementId)
    if (i < 0) return
    const a = draft[i] as ExcalidrawArrowElement
    if (a.points.length <= 2) return
    if (index <= 0 || index >= a.points.length - 1) return // interior only
    const abs = absPoints(a)
    abs.splice(index, 1)
    draft[i] = { ...a, ...pointsPatch(abs) }
  },
})

export const buildBendRevertEffect = (elementId: string, origin: LinearSnapshot): ToolEffect => ({
  kind: "mutation",
  skipHistory: true,
  apply: (draft) => {
    const i = draft.findIndex((e) => e.id === elementId)
    if (i < 0) return
    draft[i] = { ...(draft[i] as ExcalidrawArrowElement), ...origin }
  },
})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @excalidraw-clone/tools test -- selection-bend`
Expected: PASS — insert/move/remove/no-op/revert tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/tools/src/tools/selection/bend.ts packages/tools/test/selection-bend.test.ts
git commit -m "tools: bend insert/move/commit/remove/revert effect builders"
```

---

## Task 5: Wire the `bendDragging` selection phase

**Files:**

- Modify: `packages/tools/src/tools/selection/types.ts` (add phase)
- Modify: `packages/tools/src/tools/selection/index.ts` (idle bend/bendAdd/double-click + `reduceBend` + switch case)
- Test: `packages/tools/test/selection-bend-tool.test.ts` (create)

**Interfaces:**

- Consumes: `findHandleAt` bend/bendAdd variants (Task 3), bend effect builders (Task 4), `snapshotLinear` (existing).
- Produces: `SelectionState` gains `| { phase: "bendDragging"; elementId: string; index: number; origin: LinearSnapshot }`. `index` is the live array index of the point being dragged (for an added point, `segmentIndex + 1`).

- [ ] **Step 1: Write the failing test**

Create `packages/tools/test/selection-bend-tool.test.ts`:

```typescript
import { newArrow } from "@excalidraw-clone/scene"
import type { ExcalidrawArrowElement, ExcalidrawElement } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { selectionTool } from "../src"
import { applyMutation, makeCtx } from "./test-utils"

const arrow = (): ExcalidrawArrowElement => ({
  ...newArrow({ x: 0, y: 0 }),
  id: "ar",
  x: 0,
  y: 0,
  width: 100,
  height: 0,
  points: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ],
})

describe("selection — bend dragging", () => {
  it("grabbing a segment midpoint inserts a point and enters bendDragging", () => {
    const a = arrow()
    const draft: ExcalidrawElement[] = [a]
    const ctx = makeCtx({ readElements: () => draft, selectedIds: ["ar"] })
    const s = selectionTool.reduce(
      selectionTool.initial,
      { type: "pointerDown", at: { x: 50, y: 0 } },
      ctx,
    )
    applyMutation(s[1], draft)
    expect(s[0].phase).toBe("bendDragging")
    if (s[0].phase === "bendDragging") expect(s[0].index).toBe(1)
    expect((draft[0] as ExcalidrawArrowElement).points.length).toBe(3)
  })

  it("drag + up commits the new bend (3 points, back to idle)", () => {
    const a = arrow()
    const draft: ExcalidrawElement[] = [a]
    const ctx = makeCtx({ readElements: () => draft, selectedIds: ["ar"] })
    let s = selectionTool.reduce(
      selectionTool.initial,
      { type: "pointerDown", at: { x: 50, y: 0 } },
      ctx,
    )
    applyMutation(s[1], draft)
    s = selectionTool.reduce(s[0], { type: "pointerMove", at: { x: 50, y: 60 } }, ctx)
    applyMutation(s[1], draft)
    s = selectionTool.reduce(s[0], { type: "pointerUp", at: { x: 50, y: 60 } }, ctx)
    applyMutation(s[1], draft)
    expect(s[0].phase).toBe("idle")
    const e = draft[0] as ExcalidrawArrowElement
    expect(e.points.length).toBe(3)
    expect({ x: e.x + e.points[1]!.x, y: e.y + e.points[1]!.y }).toEqual({ x: 50, y: 60 })
  })

  it("double-clicking an interior bend removes it", () => {
    const a: ExcalidrawArrowElement = {
      ...arrow(),
      height: 60,
      points: [
        { x: 0, y: 0 },
        { x: 50, y: 60 },
        { x: 100, y: 0 },
      ],
    }
    const draft: ExcalidrawElement[] = [a]
    const ctx = makeCtx({ readElements: () => draft, selectedIds: ["ar"] })
    const s = selectionTool.reduce(
      selectionTool.initial,
      { type: "doubleClick", at: { x: 50, y: 60 } },
      ctx,
    )
    applyMutation(s[1], draft)
    expect((draft[0] as ExcalidrawArrowElement).points.length).toBe(2)
  })

  it("escape reverts an added bend", () => {
    const a = arrow()
    const draft: ExcalidrawElement[] = [a]
    const ctx = makeCtx({ readElements: () => draft, selectedIds: ["ar"] })
    let s = selectionTool.reduce(
      selectionTool.initial,
      { type: "pointerDown", at: { x: 50, y: 0 } },
      ctx,
    )
    applyMutation(s[1], draft)
    s = selectionTool.reduce(s[0], { type: "pointerMove", at: { x: 50, y: 200 } }, ctx)
    applyMutation(s[1], draft)
    s = selectionTool.reduce(s[0], { type: "escape" }, ctx)
    applyMutation(s[1], draft)
    expect((draft[0] as ExcalidrawArrowElement).points.length).toBe(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @excalidraw-clone/tools test -- selection-bend-tool`
Expected: FAIL — pointerDown on the midpoint returns `dragging`/`marquee`, not `bendDragging`.

- [ ] **Step 3: Add the state type**

In `packages/tools/src/tools/selection/types.ts`, add this variant to the `SelectionState` union (after the `endpointDragging` variant, before `marquee`):

```typescript
  | {
      phase: "bendDragging"
      elementId: string
      index: number
      origin: LinearSnapshot
    }
```

(`LinearSnapshot` is already imported at the top of this file.)

- [ ] **Step 4: Add imports and idle handling in `index.ts`**

In `packages/tools/src/tools/selection/index.ts`, add the bend builders import after the endpoint import block (after line 10):

```typescript
import {
  buildBendCommitEffect,
  buildBendInsertEffect,
  buildBendMoveEffect,
  buildBendRemoveEffect,
  buildBendRevertEffect,
} from "./bend"
```

In `reduceIdle`, inside the `if (handle) { ... }` block, after the existing `if (e && handle.kind === "endpoint") { ... }` branch, add:

```typescript
if (e && handle.kind === "bend") {
  return [
    {
      phase: "bendDragging",
      elementId: handle.elementId,
      index: handle.index,
      origin: snapshotLinear(e),
    },
    [],
  ]
}
if (e && handle.kind === "bendAdd") {
  return [
    {
      phase: "bendDragging",
      elementId: handle.elementId,
      index: handle.segmentIndex + 1,
      origin: snapshotLinear(e),
    },
    [buildBendInsertEffect(handle.elementId, handle.segmentIndex + 1, handle.at)],
  ]
}
```

Then handle double-click removal. In `reduceIdle`'s `if (event.type === "doubleClick")` block, add this as the **first** statement inside the block (before `const hit = ctx.hitTest(event.at)`):

```typescript
const bendHandle = findHandleAt(event.at, ctx.selectedIds, ctx.readElements(), ctx.viewTransform)
if (bendHandle && bendHandle.kind === "bend") {
  return [{ phase: "idle" }, [buildBendRemoveEffect(bendHandle.elementId, bendHandle.index)]]
}
```

- [ ] **Step 5: Add `reduceBend` and route to it**

In `packages/tools/src/tools/selection/index.ts`, add after `reduceEndpoint` (after line ~268):

```typescript
const reduceBend = (
  state: Extract<SelectionState, { phase: "bendDragging" }>,
  event: ToolEvent,
): [SelectionState, readonly ToolEffect[]] => {
  switch (event.type) {
    case "pointerMove":
      return [state, [buildBendMoveEffect(state.elementId, state.index, event.at)]]
    case "pointerUp":
      return [{ phase: "idle" }, [buildBendCommitEffect(state.elementId)]]
    case "escape":
      return [{ phase: "idle" }, [buildBendRevertEffect(state.elementId, state.origin)]]
    default:
      return [state, []]
  }
}
```

Add the case to the `switch (state.phase)` in `selectionTool.reduce` (after the `endpointDragging` case):

```typescript
      case "bendDragging":
        return reduceBend(state, event)
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @excalidraw-clone/tools test -- selection-bend-tool`
Expected: PASS — insert-on-grab, commit, double-click-remove, escape-revert green.

- [ ] **Step 7: Run the full tools suite**

Run: `pnpm --filter @excalidraw-clone/tools test`
Expected: PASS — no existing selection tests regressed (note: `doubleClick` on a non-bend still falls through to the existing text-edit logic).

- [ ] **Step 8: Commit**

```bash
git add packages/tools/src/tools/selection/types.ts packages/tools/src/tools/selection/index.ts packages/tools/test/selection-bend-tool.test.ts
git commit -m "tools: add bendDragging selection phase (add/move/remove bend points)"
```

---

## Task 6: Render bend chrome (interior dots + midpoint ghosts)

**Files:**

- Modify: `packages/renderer/src/overlay.ts` (the `isLinear(e)` branch in `drawElementChrome` :78-85; add a `drawGhostHandle` helper near `drawHandle` :70-77)
- Test: `packages/renderer/test/overlay.test.ts` (add a 3-point arrow case)

**Interfaces:**

- Produces: a selected linear element draws a solid handle at **every** point and a hollow ghost handle (strokeRect, no fill) at **every segment midpoint**. No rotation arc, no bbox stroke. 2-point arrows keep `fillRect === 2` and `arc === 0` (existing test unaffected).

- [ ] **Step 1: Write the failing test**

Add to `packages/renderer/test/overlay.test.ts` inside the `describe("CanvasRenderer selection overlay", ...)` block (`newArrow` is already imported by the existing arrow test):

```typescript
it("single selected 3-point arrow → 3 solid dots + 2 ghost dots, no arc", () => {
  const { canvas: main } = createMockCanvas()
  const { canvas: overlay, ctx: overlayCtx } = createMockCanvas()
  const arrow = {
    ...newArrow({ x: 0, y: 0 }),
    width: 200,
    height: 100,
    points: [
      { x: 0, y: 0 },
      { x: 100, y: 100 },
      { x: 200, y: 0 },
    ],
  }
  const scene = new Scene([arrow])
  const r = new CanvasRenderer(main, scene, { overlayCanvas: overlay, selection: [arrow.id] })
  r.start()
  flush()
  // one fillRect per real point (solid handles); ghosts are stroke-only
  expect(overlayCtx.__calls.filter((c) => c.method === "fillRect").length).toBe(3)
  // 3 solid handle strokes + 2 segment-midpoint ghost strokes
  expect(overlayCtx.__calls.filter((c) => c.method === "strokeRect").length).toBe(5)
  expect(overlayCtx.__calls.filter((c) => c.method === "arc").length).toBe(0)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @excalidraw-clone/renderer test -- overlay`
Expected: FAIL — current linear branch draws only 2 endpoint handles (`fillRect === 2`, `strokeRect === 2`).

- [ ] **Step 3: Implement the chrome**

In `packages/renderer/src/overlay.ts`, add a ghost-handle helper immediately after `drawHandle` (after line 77):

```typescript
const drawGhostHandle = (ctx: CanvasRenderingContext2D, p: Point, theme: Theme): void => {
  ctx.strokeStyle = SELECTION_STROKE[theme]
  ctx.lineWidth = 1
  ctx.strokeRect(p.x - HANDLE_SIZE / 2, p.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE)
}
```

Replace the `isLinear(e)` branch in `drawElementChrome` (lines 78-85) with:

```typescript
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
```

(`midPoint` already exists in this file; the `linearEndpoints` helper above may now be unused — delete it if lint flags it.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @excalidraw-clone/renderer test -- overlay`
Expected: PASS — 3-point arrow draws 3 fillRect + 5 strokeRect + 0 arc; the existing 2-point arrow test (`fillRect === 2`, `arc === 0`) still passes.

- [ ] **Step 5: Run the renderer suite**

Run: `pnpm --filter @excalidraw-clone/renderer test`
Expected: PASS — no regression.

- [ ] **Step 6: Commit**

```bash
git add packages/renderer/src/overlay.ts packages/renderer/test/overlay.test.ts
git commit -m "renderer: draw interior bend dots + segment-midpoint ghost handles"
```

---

## Task 7: E2e + full gate

**Files:**

- Create: `apps/web/e2e/arrow-bend.spec.ts`

**Interfaces:**

- Consumes: the running web app; `dragOnCanvas` from `apps/web/e2e/_helpers.ts`; scene state via `localStorage["excalidraw-scene"]`.

- [ ] **Step 1: Write the e2e spec**

Create `apps/web/e2e/arrow-bend.spec.ts`:

```typescript
import { expect, test, type Page } from "@playwright/test"
import { dragOnCanvas } from "./_helpers"

type SceneEl = {
  id: string
  type: string
  x: number
  y: number
  points?: { x: number; y: number }[]
  isDeleted?: boolean
}

const readScene = async (page: Page): Promise<SceneEl[]> => {
  const json = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  const data = JSON.parse(json!) as { elements: SceneEl[] }
  return data.elements.filter((e) => !e.isDeleted)
}

const arrowOf = (els: SceneEl[]): SceneEl => els.find((e) => e.type === "arrow")!
const interiorAbs = (a: SceneEl): { x: number; y: number } => {
  const p = a.points![1]!
  return { x: a.x + p.x, y: a.y + p.y }
}

test("add a bend point, then bend survives moving a bound target", async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-rectangle"]').waitFor({ state: "visible" })

  // Rectangle on the right (target).
  await page.locator('[data-testid="toolbar-rectangle"]').click()
  await dragOnCanvas(page, { x: 500, y: 200 }, { x: 600, y: 300 })

  // Horizontal arrow on the left; end already inside the rectangle so it binds.
  await page.locator('[data-testid="toolbar-arrow"]').click()
  await dragOnCanvas(page, { x: 150, y: 250 }, { x: 550, y: 250 })
  await page.waitForTimeout(700)

  // Select the arrow (click its body).
  await page.locator('[data-testid="toolbar-selection"]').click()
  await dragOnCanvas(page, { x: 300, y: 250 }, { x: 300, y: 250 })

  // Drag the segment midpoint (≈ 350,250) downward to add a bend.
  await dragOnCanvas(page, { x: 350, y: 250 }, { x: 350, y: 400 })
  await page.waitForTimeout(700)

  const before = await readScene(page)
  const arrowBefore = arrowOf(before)
  expect(arrowBefore.points!.length).toBe(3)
  const bendBefore = interiorAbs(arrowBefore)

  // Move the rectangle; the bound end follows, the interior bend stays put.
  await dragOnCanvas(page, { x: 580, y: 290 }, { x: 780, y: 290 })
  await page.waitForTimeout(700)

  const after = await readScene(page)
  const arrowAfter = arrowOf(after)
  expect(arrowAfter.points!.length).toBe(3)
  const bendAfter = interiorAbs(arrowAfter)
  // interior bend unchanged (within 1px)
  expect(Math.abs(bendAfter.x - bendBefore.x)).toBeLessThan(1)
  expect(Math.abs(bendAfter.y - bendBefore.y)).toBeLessThan(1)
})
```

- [ ] **Step 2: Run the e2e spec**

Run (from `apps/web`): `pnpm exec playwright test arrow-bend`
Expected: PASS. If selecting the arrow via a zero-distance drag does not select it, fall back to `page.mouse.click(box.x + 300, box.y + 250)` for the select step (mirror the working approach in `arrow-endpoint.spec.ts`).

- [ ] **Step 3: Run the complete gate from repo root**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Then (from `apps/web`): `pnpm exec playwright test`
Expected: all green. Note: `pnpm lint` may exit non-zero only due to the pre-existing `vitest.workspace.ts` artifact — confirm via `turbo` that all package lint tasks succeed (out of scope).

- [ ] **Step 4: Commit**

```bash
git add apps/web/e2e/arrow-bend.spec.ts
git commit -m "web: e2e — add bend point; bend survives bound-target move"
```

- [ ] **Step 5: Confirm with the user before merging to `main`**

Report the gate result and the commit range on `develop`. Do not fast-forward to `main` or push until the user approves (per project convention).

---

## Self-Review Notes

- **Spec coverage:** `pointsPatch` (spec Layer 2) → Task 1. Reconciler interior preservation + adjacent-point `toward` (spec Layer 1) → Task 2. `bend`/`bendAdd` hit detection (spec Layer 2) → Task 3. Bend builders (spec Layer 2) → Task 4. `bendDragging` phase + add/move/remove/escape + double-click remove (spec Layer 2 + interaction decisions) → Task 5. Interior dots + ghost midpoints (spec Layer 3) → Task 6. E2e: add bend + survives bound-target move (spec Testing) → Task 7.
- **Type consistency:** `pointsPatch(absPoints) → LinearPatch` defined Task 1, consumed Tasks 2/4. `HandleHit` `bend`/`bendAdd` shapes defined Task 3, consumed Task 5. Bend builder signatures defined Task 4, consumed Task 5. `bendDragging` state (`elementId`/`index`/`origin`) defined Task 5 type, consumed by `reduceBend`. `LinearSnapshot`/`snapshotLinear` reused from existing `selection/endpoint.ts` (Tasks 4/5).
- **Behaviour preservation:** Tasks 1 and 2 are explicitly byte-identical for the 2-point case, so the existing `linear-tools`, `selection-endpoint`, `arrow-binding`, and `reconcileBindings` tests stay green. Task 6 keeps `fillRect === 2`/`arc === 0` for 2-point arrows.
- **Known approximation:** the reconciler aims a bound end at its adjacent bend point (not the far target center) when bends exist; straight (bend-free) bound arrows are unaffected.
- **Open item resolved during Task 7:** arrow-selection mechanism in e2e must match `arrow-endpoint.spec.ts`; fallback to `page.mouse.click` is documented inline.

```

```
