# Arrow Endpoint Editing + Focus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users grab an arrow's start/end endpoint and drag it — re-binding (or unbinding) to whatever shape it lands on — and make the binding `focus` field control off-center attachment.

**Architecture:** Three layers. (1) `packages/scene/src/bindings.ts` gains a perpendicular-offset `focus` model: `computeBoundEndpoint` shifts the attach point by `focus * half-extent` perpendicular to the center→toward direction, and a new `computeFocus` recovers a `focus` value from a dropped endpoint. (2) `packages/tools` gains arrow-endpoint hit detection (`handles.ts`), an `endpointDragging` selection phase with effect builders (`selection/endpoint.ts`) that move/rebind the dragged end, and a shared `binding-refs.ts` for back-reference bookkeeping. (3) `packages/renderer/src/overlay.ts` draws two endpoint dots for linear elements instead of the resize/rotate bounding box, and the web driver highlights the binding candidate during an endpoint drag.

**Tech Stack:** TypeScript (strict), pnpm workspaces, Vitest (unit), Playwright (e2e), Zustand store, canvas 2D renderer.

## Global Constraints

- **Linear chrome decision:** arrow/line elements render **endpoint dots only** — no resize handles, no rotation handle, no bounding box. (Decided 2026-06-24.)
- **Focus model decision:** **simplified** — `focus ∈ [-1, 1]` is a perpendicular offset normalized by the target's half-extent; `focus = 0` reproduces today's center-attach behavior exactly. No full Excalidraw intersection-solver port. (Decided 2026-06-24.)
- **"Linear" = `type === "arrow" || type === "line"`.** Endpoint chrome and dragging apply to both; **re-binding logic applies to arrows only** (lines are not bindable in this codebase — `reconcileBindings` only touches arrows).
- Arrows are two-point in this codebase (`points.length === 2`); `reconcileBindings` and `linearPatch` both assume two points. Keep that assumption.
- Tests live in `packages/<pkg>/test/`, not co-located. Reducer unit tests use `makeCtx`/`applyMutation`/`point` from `packages/tools/test/test-utils.ts`. Identity view (zoom 1, scroll 0) means scene coords == viewport coords in tests.
- Run the full gate before merge: `pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm exec playwright test` (from repo root). Husky runs ESLint + prettier on pre-commit.
- Commit after each task. Branch is `develop`. Do not merge to `main` until the user approves.

---

## File Structure

| File                                                           | Responsibility                                                                           |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `packages/scene/src/bindings.ts` (modify)                      | `computeBoundEndpoint` gains `focus`; new `computeFocus`; shared `perpHalfExtent` helper |
| `packages/scene/src/index.ts` (modify)                         | export `computeFocus`                                                                    |
| `packages/scene/test/bindings.test.ts` (modify)                | focus-shift + round-trip tests                                                           |
| `packages/tools/src/binding-refs.ts` (create)                  | shared `addBackRef` / `removeBackRef`                                                    |
| `packages/tools/src/tools/linear.ts` (modify)                  | use shared `addBackRef`                                                                  |
| `packages/tools/src/tools/selection/drag.ts` (modify)          | use shared `removeBackRef`                                                               |
| `packages/tools/src/tools/selection/handles.ts` (modify)       | `endpoint` HandleHit variant; linear → endpoints only                                    |
| `packages/tools/src/tools/selection/endpoint.ts` (create)      | endpoint move/commit/revert effect builders + `snapshotLinear`                           |
| `packages/tools/src/tools/selection/types.ts` (modify)         | `endpointDragging` phase                                                                 |
| `packages/tools/src/tools/selection/index.ts` (modify)         | idle endpoint branch + `reduceEndpoint`                                                  |
| `packages/tools/src/index.ts` (modify)                         | re-export `EndpointDrag` candidate type if needed by driver                              |
| `packages/tools/test/selection-handles.test.ts` (create)       | endpoint hit detection                                                                   |
| `packages/tools/test/selection-endpoint.test.ts` (create)      | endpoint effect builders                                                                 |
| `packages/tools/test/selection-endpoint-tool.test.ts` (create) | endpoint state machine                                                                   |
| `packages/renderer/src/overlay.ts` (modify)                    | linear endpoint-dot chrome                                                               |
| `packages/renderer/test/overlay.test.ts` (modify)              | arrow chrome test                                                                        |
| `apps/web/src/driver/useDrawingDriver.ts` (modify)             | highlight candidate during endpoint drag                                                 |
| `apps/web/e2e/arrow-endpoint.spec.ts` (create)                 | drag endpoint onto a shape → binds                                                       |

---

## Task 1: Focus-aware `computeBoundEndpoint`

**Files:**

- Modify: `packages/scene/src/bindings.ts:43-53` (`computeBoundEndpoint`) and `:65-116` (`reconcileBindings` call sites)
- Test: `packages/scene/test/bindings.test.ts:54-61`

**Interfaces:**

- Produces: `computeBoundEndpoint(target: ExcalidrawElement, toward: Point, gap: number, focus?: number): Point` — `focus` defaults to `0`. Also a module-internal `perpHalfExtent(bounds: Bounds, perp: Point): number` reused by Task 2.

- [ ] **Step 1: Write the failing test**

Add to `packages/scene/test/bindings.test.ts` inside the existing `describe("computeBoundEndpoint", ...)` block (after line 60):

```typescript
it("focus shifts the attach point perpendicular to the toward direction", () => {
  const target = rect({ x: 0, y: 0, width: 100, height: 100 }) // center (50,50)
  // toward far to the right → dir ≈ (1,0), perp ≈ (0,1), halfPerp = height/2 = 50
  const centered = computeBoundEndpoint(target, { x: 1000, y: 50 }, 0, 0)
  const shifted = computeBoundEndpoint(target, { x: 1000, y: 50 }, 0, 0.5)
  expect(centered.y).toBeCloseTo(50)
  // focus 0.5 → +0.5 * 50 = +25 in the perpendicular (down) direction
  expect(shifted.y).toBeCloseTo(75)
  expect(shifted.x).toBeCloseTo(centered.x)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @excalidraw-clone/scene test -- bindings`
Expected: FAIL — `shifted.y` is `50`, not `75` (focus is ignored).

- [ ] **Step 3: Implement the focus shift**

In `packages/scene/src/bindings.ts`, replace `computeBoundEndpoint` (lines 43-53) with:

```typescript
const perpHalfExtent = (bounds: ReturnType<typeof getElementBounds>, perp: Point): number =>
  (Math.abs(perp.x) * bounds.width) / 2 + (Math.abs(perp.y) * bounds.height) / 2

export const computeBoundEndpoint = (
  target: ExcalidrawElement,
  toward: Point,
  gap: number,
  focus = 0,
): Point => {
  const bounds = getElementBounds(target)
  const center = boundsCenter(bounds)
  const edge = edgePointToward(bounds, edgeKindFor(target.type), toward)
  const dir = normalize({ x: toward.x - center.x, y: toward.y - center.y })
  const base = pointAdd(edge, pointScale(dir, gap))
  if (focus === 0) return base
  const perp: Point = { x: -dir.y, y: dir.x }
  return pointAdd(base, pointScale(perp, focus * perpHalfExtent(bounds, perp)))
}
```

Then update `reconcileBindings` to pass `focus`. Change line 93 from:

```typescript
startAbs = computeBoundEndpoint(startTarget, toward, startBinding!.gap)
```

to:

```typescript
startAbs = computeBoundEndpoint(startTarget, toward, startBinding!.gap, startBinding!.focus)
```

And change line 97 from:

```typescript
endAbs = computeBoundEndpoint(endTarget, toward, endBinding!.gap)
```

to:

```typescript
endAbs = computeBoundEndpoint(endTarget, toward, endBinding!.gap, endBinding!.focus)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @excalidraw-clone/scene test -- bindings`
Expected: PASS — all `computeBoundEndpoint` and `reconcileBindings` tests green (focus=0 cases unchanged).

- [ ] **Step 5: Commit**

```bash
git add packages/scene/src/bindings.ts packages/scene/test/bindings.test.ts
git commit -m "scene: computeBoundEndpoint honors binding focus (perpendicular offset)"
```

---

## Task 2: `computeFocus` helper

**Files:**

- Modify: `packages/scene/src/bindings.ts` (add `computeFocus` after `computeBoundEndpoint`)
- Modify: `packages/scene/src/index.ts:39-46` (export it)
- Test: `packages/scene/test/bindings.test.ts`

**Interfaces:**

- Consumes: `perpHalfExtent` (Task 1).
- Produces: `computeFocus(target: ExcalidrawElement, endpoint: Point, toward: Point): number` — returns `focus ∈ [-1, 1]` such that `computeBoundEndpoint(target, toward, gap, focus)` reproduces `endpoint`'s perpendicular offset. `toward` is the arrow's _other_ endpoint.

- [ ] **Step 1: Write the failing test**

Add a new `describe` block to `packages/scene/test/bindings.test.ts` (after the `computeBoundEndpoint` block):

```typescript
describe("computeFocus", () => {
  const target = rect({ x: 0, y: 0, width: 100, height: 100 }) // center (50,50)

  it("returns 0 for a centered endpoint", () => {
    expect(computeFocus(target, { x: 100, y: 50 }, { x: 1000, y: 50 })).toBeCloseTo(0)
  })

  it("round-trips: focus from a dropped point reproduces that point's offset", () => {
    const toward = { x: 1000, y: 50 } // dir ≈ (1,0), perp ≈ (0,1)
    const dropped = { x: 104, y: 75 } // 25 below center → focus 0.5
    const focus = computeFocus(target, dropped, toward)
    expect(focus).toBeCloseTo(0.5)
    const reproduced = computeBoundEndpoint(target, toward, 4, focus)
    expect(reproduced.y).toBeCloseTo(dropped.y)
  })

  it("clamps to [-1, 1]", () => {
    expect(computeFocus(target, { x: 100, y: 500 }, { x: 1000, y: 50 })).toBe(1)
    expect(computeFocus(target, { x: 100, y: -500 }, { x: 1000, y: 50 })).toBe(-1)
  })
})
```

Add `computeFocus` to the import from `../src/bindings` at the top of the test file (line 4-11).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @excalidraw-clone/scene test -- bindings`
Expected: FAIL — `computeFocus` is not exported / not a function.

- [ ] **Step 3: Implement `computeFocus`**

In `packages/scene/src/bindings.ts`, add after `computeBoundEndpoint`:

```typescript
export const computeFocus = (target: ExcalidrawElement, endpoint: Point, toward: Point): number => {
  const bounds = getElementBounds(target)
  const center = boundsCenter(bounds)
  const dir = normalize({ x: toward.x - center.x, y: toward.y - center.y })
  if (dir.x === 0 && dir.y === 0) return 0
  const perp: Point = { x: -dir.y, y: dir.x }
  const halfPerp = perpHalfExtent(bounds, perp)
  if (halfPerp === 0) return 0
  const perpComp = (endpoint.x - center.x) * perp.x + (endpoint.y - center.y) * perp.y
  return Math.max(-1, Math.min(1, perpComp / halfPerp))
}
```

Then export it in `packages/scene/src/index.ts` — add `computeFocus,` to the `from "./bindings"` block (alphabetically, after `computeBoundEndpoint,` on line 44):

```typescript
  computeBoundEndpoint,
  computeFocus,
  reconcileBindings,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @excalidraw-clone/scene test -- bindings`
Expected: PASS — all three `computeFocus` tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/scene/src/bindings.ts packages/scene/src/index.ts packages/scene/test/bindings.test.ts
git commit -m "scene: add computeFocus to recover focus from a dropped endpoint"
```

---

## Task 3: Shared `binding-refs.ts` (extract back-ref helpers)

**Files:**

- Create: `packages/tools/src/binding-refs.ts`
- Modify: `packages/tools/src/tools/linear.ts:46-53` (remove local `addBackRef`, import shared)
- Modify: `packages/tools/src/tools/selection/drag.ts:5-11` (remove local `removeBackRef`, import shared)
- Test: existing `selection-drag.test.ts`, `linear-tools.test.ts`, `arrow-binding.test.ts` must still pass.

**Interfaces:**

- Produces: `addBackRef(draft, targetId, arrowId)` and `removeBackRef(draft, targetId, arrowId)` — both `(draft: ExcalidrawElement[], targetId: string, arrowId: string) => void`. `addBackRef` is idempotent (no duplicate). `removeBackRef` filters the arrow id out of the target's `boundElements`.

- [ ] **Step 1: Create the shared module**

Create `packages/tools/src/binding-refs.ts`:

```typescript
import type { ExcalidrawElement } from "@excalidraw-clone/scene"

/** Add an arrow back-reference to a target's boundElements (idempotent). */
export const addBackRef = (draft: ExcalidrawElement[], targetId: string, arrowId: string): void => {
  const j = draft.findIndex((e) => e.id === targetId)
  if (j < 0) return
  const t = draft[j]!
  const existing = t.boundElements ?? []
  if (existing.some((b) => b.id === arrowId)) return
  draft[j] = { ...t, boundElements: [...existing, { id: arrowId, type: "arrow" }] }
}

/** Remove an arrow back-reference from a target's boundElements. */
export const removeBackRef = (
  draft: ExcalidrawElement[],
  targetId: string,
  arrowId: string,
): void => {
  const j = draft.findIndex((e) => e.id === targetId)
  if (j < 0) return
  const t = draft[j]!
  if (!t.boundElements) return
  draft[j] = { ...t, boundElements: t.boundElements.filter((b) => b.id !== arrowId) }
}
```

- [ ] **Step 2: Refactor `linear.ts` to use it**

In `packages/tools/src/tools/linear.ts`, delete the local `addBackRef` (lines 46-53) and add an import near the top (after line 4):

```typescript
import { addBackRef } from "../binding-refs"
```

- [ ] **Step 3: Refactor `drag.ts` to use it**

In `packages/tools/src/tools/selection/drag.ts`, delete the local `removeBackRef` (lines 5-11) and add an import near the top (after line 3):

```typescript
import { removeBackRef } from "../../binding-refs"
```

- [ ] **Step 4: Run the affected tests to verify nothing broke**

Run: `pnpm --filter @excalidraw-clone/tools test -- selection-drag linear-tools arrow-binding`
Expected: PASS — back-ref behavior unchanged, all existing tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/tools/src/binding-refs.ts packages/tools/src/tools/linear.ts packages/tools/src/tools/selection/drag.ts
git commit -m "tools: extract shared addBackRef/removeBackRef into binding-refs"
```

---

## Task 4: Endpoint hit detection in `handles.ts`

**Files:**

- Modify: `packages/tools/src/tools/selection/handles.ts` (add `endpoint` variant, linear branch)
- Test: `packages/tools/test/selection-handles.test.ts` (create)

**Interfaces:**

- Produces: `HandleHit` gains `| { kind: "endpoint"; elementId: string; end: "start" | "end" }`. For a single-selected linear element (`arrow`/`line`), `findHandleAt` returns **only** endpoint hits (no resize/rotate). For non-linear elements, behavior is unchanged.

- [ ] **Step 1: Write the failing test**

Create `packages/tools/test/selection-handles.test.ts`:

```typescript
import { newArrow, newRectangle } from "@excalidraw-clone/scene"
import type { ExcalidrawArrowElement, ExcalidrawElement } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { findHandleAt } from "../src"
import { IDENTITY_VIEW } from "./test-utils"

const horizontalArrow = (): ExcalidrawArrowElement => ({
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

describe("findHandleAt — linear endpoints", () => {
  it("hits the start endpoint", () => {
    const a = horizontalArrow()
    const hit = findHandleAt({ x: 0, y: 0 }, [a.id], [a], IDENTITY_VIEW)
    expect(hit).toEqual({ kind: "endpoint", elementId: "ar", end: "start" })
  })

  it("hits the end endpoint", () => {
    const a = horizontalArrow()
    const hit = findHandleAt({ x: 100, y: 0 }, [a.id], [a], IDENTITY_VIEW)
    expect(hit).toEqual({ kind: "endpoint", elementId: "ar", end: "end" })
  })

  it("never returns resize/rotate handles for a linear element", () => {
    const a = horizontalArrow()
    // mid-body point: not an endpoint, must be a miss (no resize box)
    expect(findHandleAt({ x: 50, y: 0 }, [a.id], [a], IDENTITY_VIEW)).toBeNull()
  })

  it("still returns resize handles for a rectangle", () => {
    const r: ExcalidrawElement = newRectangle({ x: 0, y: 0, width: 100, height: 100 })
    const hit = findHandleAt({ x: 100, y: 100 }, [r.id], [r], IDENTITY_VIEW)
    expect(hit?.kind).toBe("resize")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @excalidraw-clone/tools test -- selection-handles`
Expected: FAIL — linear element returns a `resize`/`rotate` hit or null, not `endpoint`.

- [ ] **Step 3: Implement the endpoint branch**

In `packages/tools/src/tools/selection/handles.ts`:

Extend the `HandleHit` union (lines 14-16):

```typescript
export type HandleHit =
  | { kind: "resize"; elementId: string; handle: ResizeHandle }
  | { kind: "rotate"; elementId: string }
  | { kind: "endpoint"; elementId: string; end: "start" | "end" }
```

Add a linear-detection helper and endpoint check. Insert this helper after `within` (line 41):

```typescript
const isLinear = (e: ExcalidrawElement): boolean => e.type === "arrow" || e.type === "line"

const linearEndpoints = (e: ExcalidrawElement): readonly [Point, Point] => {
  const pts = (e as { points: readonly Point[] }).points
  const first = pts[0] ?? { x: 0, y: 0 }
  const last = pts[pts.length - 1] ?? first
  return [
    { x: e.x + first.x, y: e.y + first.y },
    { x: e.x + last.x, y: e.y + last.y },
  ]
}
```

Then, inside `findHandleAt`, after resolving `e` (after line 52, `if (!e) return null`), add the linear short-circuit **before** the `atV`/`rotatedCorners` block:

```typescript
if (isLinear(e)) {
  const atV = sceneToViewport(at, view)
  const [startScene, endScene] = linearEndpoints(e)
  const startV = sceneToViewport(startScene, view)
  const endV = sceneToViewport(endScene, view)
  if (within(atV, startV)) return { kind: "endpoint", elementId: id, end: "start" }
  if (within(atV, endV)) return { kind: "endpoint", elementId: id, end: "end" }
  return null
}
```

(The existing `const atV = sceneToViewport(at, view)` on line 54 stays for the non-linear path.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @excalidraw-clone/tools test -- selection-handles`
Expected: PASS — all four tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/tools/src/tools/selection/handles.ts packages/tools/test/selection-handles.test.ts
git commit -m "tools: detect arrow/line endpoint handles (no resize box for linears)"
```

---

## Task 5: Endpoint effect builders (`selection/endpoint.ts`)

**Files:**

- Create: `packages/tools/src/tools/selection/endpoint.ts`
- Modify: `packages/tools/src/tools/linear.ts` (export `linearPatch` + `LinearPatch`)
- Test: `packages/tools/test/selection-endpoint.test.ts` (create)

**Interfaces:**

- Consumes: `addBackRef`/`removeBackRef` (Task 3), `computeFocus`/`bindingTargetAt`/`BINDING_GAP` (scene), `linearPatch` (linear.ts).
- Produces:
  - `LinearSnapshot = { x; y; width; height; points: readonly Point[]; startBinding: PointBinding | null; endBinding: PointBinding | null }`
  - `snapshotLinear(e: ExcalidrawElement): LinearSnapshot`
  - `buildEndpointMoveEffect(elementId: string, end: "start" | "end", to: Point): ToolEffect` (skipHistory; clears dragged-end binding so reconcile won't fight the manual position)
  - `buildEndpointCommitEffect(elementId: string, end: "start" | "end"): ToolEffect` (history-tracked; re-binds the dragged end to whatever shape it lands on, with computed focus)
  - `buildEndpointRevertEffect(elementId: string, origin: LinearSnapshot): ToolEffect` (skipHistory; restores geometry + bindings + back-refs)

- [ ] **Step 1: Export `linearPatch` from `linear.ts`**

In `packages/tools/src/tools/linear.ts`, change `interface LinearPatch` (line 60) to `export interface LinearPatch` and change `const linearPatch` (line 68) to `export const linearPatch`.

- [ ] **Step 2: Write the failing test**

Create `packages/tools/test/selection-endpoint.test.ts`:

```typescript
import { BINDING_GAP, newArrow, newRectangle } from "@excalidraw-clone/scene"
import type { ExcalidrawArrowElement, ExcalidrawElement } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import {
  buildEndpointCommitEffect,
  buildEndpointMoveEffect,
  buildEndpointRevertEffect,
  snapshotLinear,
} from "../src/tools/selection/endpoint"
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

const absEnd = (a: ExcalidrawArrowElement) => ({
  x: a.x + a.points[a.points.length - 1]!.x,
  y: a.y + a.points[a.points.length - 1]!.y,
})

describe("endpoint move", () => {
  it("moves the end endpoint to the new scene point", () => {
    const a = arrow()
    const draft: ExcalidrawElement[] = [a]
    applyMutation([buildEndpointMoveEffect("ar", "end", { x: 200, y: 60 })], draft)
    const e = draft[0] as ExcalidrawArrowElement
    expect(absEnd(e)).toEqual({ x: 200, y: 60 })
  })

  it("clears the dragged end binding while moving", () => {
    const a = { ...arrow(), endBinding: { elementId: "t", focus: 0, gap: BINDING_GAP } }
    const t = { ...newRectangle({ x: 300, y: 0, width: 100, height: 100 }), id: "t" }
    const draft: ExcalidrawElement[] = [t, a]
    applyMutation([buildEndpointMoveEffect("ar", "end", { x: 50, y: 50 })], draft)
    const e = draft.find((x) => x.id === "ar") as ExcalidrawArrowElement
    expect(e.endBinding).toBeNull()
  })
})

describe("endpoint commit", () => {
  it("binds the dragged end to the shape it lands on and adds a back-ref", () => {
    const t = { ...newRectangle({ x: 200, y: 0, width: 100, height: 100 }), id: "t" }
    // end endpoint sits inside t (center 250,50)
    const a = {
      ...arrow(),
      x: 0,
      y: 50,
      points: [
        { x: 0, y: 0 },
        { x: 250, y: 0 },
      ],
      width: 250,
    }
    const draft: ExcalidrawElement[] = [t, a]
    applyMutation([buildEndpointCommitEffect("ar", "end")], draft)
    const e = draft.find((x) => x.id === "ar") as ExcalidrawArrowElement
    expect(e.endBinding?.elementId).toBe("t")
    const target = draft.find((x) => x.id === "t")!
    expect(target.boundElements?.some((b) => b.id === "ar")).toBe(true)
  })

  it("leaves the end unbound when it lands on empty space", () => {
    const a = {
      ...arrow(),
      points: [
        { x: 0, y: 0 },
        { x: 999, y: 999 },
      ],
      width: 999,
      height: 999,
    }
    const draft: ExcalidrawElement[] = [a]
    applyMutation([buildEndpointCommitEffect("ar", "end")], draft)
    const e = draft[0] as ExcalidrawArrowElement
    expect(e.endBinding).toBeNull()
  })
})

describe("endpoint revert", () => {
  it("restores the original geometry and binding", () => {
    const a = arrow()
    const origin = snapshotLinear(a)
    const draft: ExcalidrawElement[] = [a]
    applyMutation([buildEndpointMoveEffect("ar", "end", { x: 999, y: 999 })], draft)
    applyMutation([buildEndpointRevertEffect("ar", origin)], draft)
    const e = draft[0] as ExcalidrawArrowElement
    expect(absEnd(e)).toEqual({ x: 100, y: 0 })
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @excalidraw-clone/tools test -- selection-endpoint`
Expected: FAIL — `../src/tools/selection/endpoint` has no such exports.

- [ ] **Step 4: Implement the builders**

Create `packages/tools/src/tools/selection/endpoint.ts`:

```typescript
import type { Point } from "@excalidraw-clone/geometry"
import { BINDING_GAP, bindingTargetAt, computeFocus } from "@excalidraw-clone/scene"
import type {
  ExcalidrawArrowElement,
  ExcalidrawElement,
  PointBinding,
} from "@excalidraw-clone/scene"
import { addBackRef, removeBackRef } from "../../binding-refs"
import type { ToolEffect } from "../../types"
import { linearPatch } from "../linear"

export interface LinearSnapshot {
  x: number
  y: number
  width: number
  height: number
  points: readonly Point[]
  startBinding: PointBinding | null
  endBinding: PointBinding | null
}

export const snapshotLinear = (e: ExcalidrawElement): LinearSnapshot => {
  const a = e as ExcalidrawArrowElement
  return {
    x: a.x,
    y: a.y,
    width: a.width,
    height: a.height,
    points: a.points,
    startBinding: a.startBinding ?? null,
    endBinding: a.endBinding ?? null,
  }
}

const endpointAbs = (a: ExcalidrawArrowElement, end: "start" | "end"): Point => {
  const idx = end === "start" ? 0 : a.points.length - 1
  const p = a.points[idx]!
  return { x: a.x + p.x, y: a.y + p.y }
}

const bindingKey = (end: "start" | "end"): "startBinding" | "endBinding" =>
  end === "start" ? "startBinding" : "endBinding"

export const buildEndpointMoveEffect = (
  elementId: string,
  end: "start" | "end",
  to: Point,
): ToolEffect => ({
  kind: "mutation",
  skipHistory: true,
  apply: (draft) => {
    const i = draft.findIndex((e) => e.id === elementId)
    if (i < 0) return
    const a = draft[i] as ExcalidrawArrowElement
    const startAbs = end === "start" ? to : endpointAbs(a, "start")
    const endAbs = end === "end" ? to : endpointAbs(a, "end")
    const dragged = a[bindingKey(end)]
    if (dragged) removeBackRef(draft, dragged.elementId, a.id)
    draft[i] = { ...a, ...linearPatch(startAbs, endAbs), [bindingKey(end)]: null }
  },
})

export const buildEndpointCommitEffect = (elementId: string, end: "start" | "end"): ToolEffect => ({
  kind: "mutation",
  apply: (draft) => {
    const i = draft.findIndex((e) => e.id === elementId)
    if (i < 0) return
    const a = draft[i] as ExcalidrawArrowElement
    if (a.type !== "arrow") return
    const endpoint = endpointAbs(a, end)
    const toward = endpointAbs(a, end === "start" ? "end" : "start")
    const target = bindingTargetAt(endpoint, draft)
    const old = a[bindingKey(end)]
    if (old && old.elementId !== target?.id) removeBackRef(draft, old.elementId, a.id)
    let binding: PointBinding | null = null
    if (target) {
      binding = {
        elementId: target.id,
        focus: computeFocus(target, endpoint, toward),
        gap: BINDING_GAP,
      }
      addBackRef(draft, target.id, a.id)
    }
    draft[i] = { ...a, [bindingKey(end)]: binding }
  },
})

export const buildEndpointRevertEffect = (
  elementId: string,
  origin: LinearSnapshot,
): ToolEffect => ({
  kind: "mutation",
  skipHistory: true,
  apply: (draft) => {
    const i = draft.findIndex((e) => e.id === elementId)
    if (i < 0) return
    draft[i] = { ...(draft[i] as ExcalidrawArrowElement), ...origin }
    if (origin.startBinding) addBackRef(draft, origin.startBinding.elementId, elementId)
    if (origin.endBinding) addBackRef(draft, origin.endBinding.elementId, elementId)
  },
})
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @excalidraw-clone/tools test -- selection-endpoint`
Expected: PASS — all move/commit/revert tests green.

- [ ] **Step 6: Commit**

```bash
git add packages/tools/src/tools/selection/endpoint.ts packages/tools/src/tools/linear.ts packages/tools/test/selection-endpoint.test.ts
git commit -m "tools: endpoint move/commit/revert effect builders with focus rebind"
```

---

## Task 6: Wire the `endpointDragging` selection phase

**Files:**

- Modify: `packages/tools/src/tools/selection/types.ts` (add phase)
- Modify: `packages/tools/src/tools/selection/index.ts` (idle branch + reducer)
- Test: `packages/tools/test/selection-endpoint-tool.test.ts` (create)

**Interfaces:**

- Consumes: `findHandleAt` endpoint variant (Task 4), endpoint effect builders + `snapshotLinear` (Task 5), `bindingTargetAt` (scene).
- Produces: `SelectionState` gains
  `| { phase: "endpointDragging"; elementId: string; end: "start" | "end"; origin: LinearSnapshot; candidateBindId: string | null }`.
  `candidateBindId` is the id of the shape currently under the dragged endpoint (for the renderer highlight), or `null`.

- [ ] **Step 1: Write the failing test**

Create `packages/tools/test/selection-endpoint-tool.test.ts`:

```typescript
import { newArrow, newRectangle } from "@excalidraw-clone/scene"
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

describe("selection — endpoint dragging", () => {
  it("pointerDown on an endpoint enters endpointDragging", () => {
    const a = arrow()
    const ctx = makeCtx({ readElements: () => [a], selectedIds: ["ar"] })
    const s = selectionTool.reduce(
      selectionTool.initial,
      { type: "pointerDown", at: { x: 100, y: 0 } },
      ctx,
    )
    expect(s[0].phase).toBe("endpointDragging")
    if (s[0].phase === "endpointDragging") expect(s[0].end).toBe("end")
  })

  it("drag + up over a shape binds the endpoint to it", () => {
    const t = { ...newRectangle({ x: 200, y: 0, width: 100, height: 100 }), id: "t" }
    const a = arrow()
    const draft: ExcalidrawElement[] = [t, a]
    const ctx = makeCtx({ readElements: () => draft, selectedIds: ["ar"] })
    let s = selectionTool.reduce(
      selectionTool.initial,
      { type: "pointerDown", at: { x: 100, y: 0 } },
      ctx,
    )
    s = selectionTool.reduce(s[0], { type: "pointerMove", at: { x: 250, y: 50 } }, ctx)
    applyMutation(s[1], draft)
    if (s[0].phase === "endpointDragging") expect(s[0].candidateBindId).toBe("t")
    s = selectionTool.reduce(s[0], { type: "pointerUp", at: { x: 250, y: 50 } }, ctx)
    applyMutation(s[1], draft)
    expect(s[0].phase).toBe("idle")
    const e = draft.find((x) => x.id === "ar") as ExcalidrawArrowElement
    expect(e.endBinding?.elementId).toBe("t")
  })

  it("escape restores original geometry", () => {
    const a = arrow()
    const draft: ExcalidrawElement[] = [a]
    const ctx = makeCtx({ readElements: () => draft, selectedIds: ["ar"] })
    let s = selectionTool.reduce(
      selectionTool.initial,
      { type: "pointerDown", at: { x: 100, y: 0 } },
      ctx,
    )
    s = selectionTool.reduce(s[0], { type: "pointerMove", at: { x: 400, y: 400 } }, ctx)
    applyMutation(s[1], draft)
    s = selectionTool.reduce(s[0], { type: "escape" }, ctx)
    applyMutation(s[1], draft)
    const e = draft[0] as ExcalidrawArrowElement
    expect(e.x + e.points[1]!.x).toBe(100)
    expect(e.y + e.points[1]!.y).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @excalidraw-clone/tools test -- selection-endpoint-tool`
Expected: FAIL — pointerDown on the endpoint returns `dragging` (hitTest fallback) or `idle`, not `endpointDragging`.

- [ ] **Step 3: Add the state type**

In `packages/tools/src/tools/selection/types.ts`, add an import at the top:

```typescript
import type { LinearSnapshot } from "./endpoint"
```

Add this variant to the `SelectionState` union (after the `rotating` variant, before `marquee`):

```typescript
  | {
      phase: "endpointDragging"
      elementId: string
      end: "start" | "end"
      origin: LinearSnapshot
      candidateBindId: string | null
    }
```

- [ ] **Step 4: Handle the endpoint hit in `reduceIdle`**

In `packages/tools/src/tools/selection/index.ts`, add imports near the existing ones (after line 11):

```typescript
import { bindingTargetAt } from "@excalidraw-clone/scene"
import {
  buildEndpointCommitEffect,
  buildEndpointMoveEffect,
  buildEndpointRevertEffect,
  snapshotLinear,
} from "./endpoint"
```

Inside `reduceIdle`, in the `if (handle)` block (after the `rotate` branch, before the closing brace at line 63), add:

```typescript
if (e && handle.kind === "endpoint") {
  return [
    {
      phase: "endpointDragging",
      elementId: handle.elementId,
      end: handle.end,
      origin: snapshotLinear(e),
      candidateBindId: null,
    },
    [],
  ]
}
```

- [ ] **Step 5: Add `reduceEndpoint` and route to it**

In `packages/tools/src/tools/selection/index.ts`, add a new reducer after `reduceRotating` (after line 248):

```typescript
const reduceEndpoint = (
  state: Extract<SelectionState, { phase: "endpointDragging" }>,
  event: ToolEvent,
  ctx: ToolContext,
): [SelectionState, readonly ToolEffect[]] => {
  switch (event.type) {
    case "pointerMove": {
      const candidate = bindingTargetAt(event.at, ctx.readElements())
      return [
        { ...state, candidateBindId: candidate?.id ?? null },
        [buildEndpointMoveEffect(state.elementId, state.end, event.at)],
      ]
    }
    case "pointerUp":
      return [{ phase: "idle" }, [buildEndpointCommitEffect(state.elementId, state.end)]]
    case "escape":
      return [{ phase: "idle" }, [buildEndpointRevertEffect(state.elementId, state.origin)]]
    default:
      return [state, []]
  }
}
```

Then add a case to the `switch (state.phase)` in `selectionTool.reduce` (after the `rotating` case, line 264):

```typescript
      case "endpointDragging":
        return reduceEndpoint(state, event, ctx)
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @excalidraw-clone/tools test -- selection-endpoint-tool`
Expected: PASS — enter-phase, bind-on-up, and escape-revert tests green.

- [ ] **Step 7: Run the full tools suite to catch regressions**

Run: `pnpm --filter @excalidraw-clone/tools test`
Expected: PASS — no existing selection tests regressed.

- [ ] **Step 8: Commit**

```bash
git add packages/tools/src/tools/selection/types.ts packages/tools/src/tools/selection/index.ts packages/tools/test/selection-endpoint-tool.test.ts
git commit -m "tools: add endpointDragging selection phase (drag + rebind arrow ends)"
```

---

## Task 7: Render endpoint-dot chrome for linear elements

**Files:**

- Modify: `packages/renderer/src/overlay.ts` (`drawElementChrome` branch for linear)
- Test: `packages/renderer/test/overlay.test.ts` (add an arrow case)

**Interfaces:**

- Consumes: nothing new — `drawSelectionChrome` already receives the elements and per-element type.
- Produces: a selected `arrow`/`line` draws exactly **two** endpoint dots (`fillRect` + `strokeRect` per dot, reusing `drawHandle`), **no** rotation `arc`, **no** bounding-box `stroke`.

- [ ] **Step 1: Write the failing test**

Add to `packages/renderer/test/overlay.test.ts` (import `newArrow` alongside `newRectangle` on line 1), inside the `describe("CanvasRenderer selection overlay", ...)` block:

```typescript
it("single selected arrow → 2 endpoint dots, no rotation arc, no bbox stroke", () => {
  const { canvas: main } = createMockCanvas()
  const { canvas: overlay, ctx: overlayCtx } = createMockCanvas()
  const arrow = {
    ...newArrow({ x: 0, y: 0 }),
    width: 100,
    height: 0,
    points: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
  }
  const scene = new Scene([arrow])
  const r = new CanvasRenderer(main, scene, { overlayCanvas: overlay, selection: [arrow.id] })
  r.start()
  flush()
  expect(overlayCtx.__calls.filter((c) => c.method === "fillRect").length).toBe(2)
  expect(overlayCtx.__calls.filter((c) => c.method === "arc").length).toBe(0)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @excalidraw-clone/renderer test -- overlay`
Expected: FAIL — arrow currently draws 8 `fillRect` handles + 1 `arc` (bounding-box chrome).

- [ ] **Step 3: Implement the linear chrome branch**

In `packages/renderer/src/overlay.ts`, add a helper after `midPoint` (line 56):

```typescript
const isLinear = (e: ExcalidrawElement): boolean => e.type === "arrow" || e.type === "line"

const linearEndpoints = (e: ExcalidrawElement): readonly [Point, Point] => {
  const pts = (e as { points: readonly Point[] }).points
  const first = pts[0] ?? { x: 0, y: 0 }
  const last = pts[pts.length - 1] ?? first
  return [
    { x: e.x + first.x, y: e.y + first.y },
    { x: e.x + last.x, y: e.y + last.y },
  ]
}

const drawLinearChrome = (
  ctx: CanvasRenderingContext2D,
  e: ExcalidrawElement,
  view: ViewTransform,
  theme: Theme,
): void => {
  const [start, end] = linearEndpoints(e)
  drawHandle(ctx, sceneToViewport(start, view), theme)
  drawHandle(ctx, sceneToViewport(end, view), theme)
}
```

Then, at the top of `drawElementChrome` (after line 71, before `const corners = ...`), short-circuit linear elements:

```typescript
if (isLinear(e)) {
  drawLinearChrome(ctx, e, view, theme)
  return
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @excalidraw-clone/renderer test -- overlay`
Expected: PASS — arrow draws 2 dots + 0 arcs; the existing rectangle tests (8 handles, 1 arc) still pass.

- [ ] **Step 5: Commit**

```bash
git add packages/renderer/src/overlay.ts packages/renderer/test/overlay.test.ts
git commit -m "renderer: draw endpoint dots for selected arrows/lines (no resize box)"
```

---

## Task 8: Driver highlight on endpoint drag + e2e

**Files:**

- Modify: `apps/web/src/driver/useDrawingDriver.ts:149-154` (highlight during endpoint drag)
- Create: `apps/web/e2e/arrow-endpoint.spec.ts`

**Interfaces:**

- Consumes: the `candidateBindId` on the `endpointDragging` selection state (Task 6), `SelectionState` type from `@excalidraw-clone/tools`.

- [ ] **Step 1: Import the selection state type**

In `apps/web/src/driver/useDrawingDriver.ts`, add `type SelectionState` to the existing import from `@excalidraw-clone/tools` (lines 11-19).

- [ ] **Step 2: Highlight the candidate during an endpoint drag**

In `apps/web/src/driver/useDrawingDriver.ts`, replace the highlight block (lines 149-154) with:

```typescript
if (toolName === "arrow" && (next as LinearState).phase === "drawing") {
  const cand = (next as Extract<LinearState, { phase: "drawing" }>).endBindId
  renderer.setBindingHighlight(cand ? [cand] : [])
} else if (toolName === "selection" && (next as SelectionState).phase === "endpointDragging") {
  const cand = (next as Extract<SelectionState, { phase: "endpointDragging" }>).candidateBindId
  renderer.setBindingHighlight(cand ? [cand] : [])
} else {
  renderer.setBindingHighlight([])
}
```

- [ ] **Step 3: Write the e2e spec**

Create `apps/web/e2e/arrow-endpoint.spec.ts`. It mirrors `apps/web/e2e/arrow-binding.spec.ts` exactly: state is observed by reading `localStorage["excalidraw-scene"]`, the UI is driven by `data-testid` toolbar buttons + the `dragOnCanvas` helper, and binding is _proven_ by moving the target shape and asserting the arrow's bound end followed.

```typescript
import { expect, test, type Page } from "@playwright/test"
import { dragOnCanvas } from "./_helpers"

type SceneEl = {
  id: string
  type: string
  x: number
  points?: { x: number; y: number }[]
  isDeleted?: boolean
}

const readScene = async (page: Page): Promise<SceneEl[]> => {
  const json = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  const data = JSON.parse(json!) as { elements: SceneEl[] }
  return data.elements.filter((e) => !e.isDeleted)
}

const arrowEndX = (els: SceneEl[]): number => {
  const a = els.find((e) => e.type === "arrow")!
  const last = a.points![a.points!.length - 1]!
  return a.x + last.x
}

test("dragging an arrow endpoint onto a shape binds it; moving the shape drags the arrow", async ({
  page,
}) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-rectangle"]').waitFor({ state: "visible" })

  // Rectangle on the right.
  await page.locator('[data-testid="toolbar-rectangle"]').click()
  await dragOnCanvas(page, { x: 500, y: 200 }, { x: 600, y: 300 })

  // Arrow on the left, ending in empty space (unbound end at ≈ 300,250).
  await page.locator('[data-testid="toolbar-arrow"]').click()
  await dragOnCanvas(page, { x: 150, y: 250 }, { x: 300, y: 250 })
  await page.waitForTimeout(700)

  // Select tool; click the arrow body to select it.
  await page.locator('[data-testid="toolbar-selection"]').click()
  await dragOnCanvas(page, { x: 225, y: 250 }, { x: 225, y: 250 })

  // Drag the arrow's end endpoint (≈ 300,250) into the rectangle (≈ 550,250).
  await dragOnCanvas(page, { x: 300, y: 250 }, { x: 550, y: 250 })
  await page.waitForTimeout(700)

  const before = await readScene(page)
  const beforeEndX = arrowEndX(before)

  // Move the rectangle right; the now-bound arrow end must follow.
  await dragOnCanvas(page, { x: 580, y: 290 }, { x: 780, y: 290 })
  await page.waitForTimeout(700)

  const after = await readScene(page)
  expect(arrowEndX(after)).toBeGreaterThan(beforeEndX)
})
```

**Before running:** confirm the selection-tool toolbar `data-testid` is exactly `toolbar-selection` (grep the toolbar component — `arrow-binding.spec.ts` only references `toolbar-rectangle`/`toolbar-arrow`). If the id differs, use the actual one. Also confirm `dragOnCanvas` with identical start/end points registers as a click-select; if it does not select the arrow, fall back to a single `page.mouse.click` at the arrow body coordinate.

- [ ] **Step 4: Run the e2e spec**

Run: `pnpm exec playwright test arrow-endpoint`
Expected: PASS.

- [ ] **Step 5: Run lint + typecheck on touched packages**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS — no unused imports, no type errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/driver/useDrawingDriver.ts apps/web/e2e/arrow-endpoint.spec.ts
git commit -m "web: highlight binding candidate while dragging an arrow endpoint; e2e"
```

---

## Task 9: Full gate + finish

- [ ] **Step 1: Run the complete gate from repo root**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm exec playwright test`
Expected: all green.

- [ ] **Step 2: Confirm with the user before merging to `main`**

Report the gate result and the commit range on `develop`. Do not fast-forward to `main` or push until the user approves (per project convention).

---

## Self-Review Notes

- **Spec coverage:** Linear-chrome decision → Task 4 (hit) + Task 7 (render). Focus decision → Task 1 (use) + Task 2 (compute) + Task 5 (apply on rebind). Endpoint editing → Tasks 4–6. Highlight feedback → Task 8.
- **Type consistency:** `LinearSnapshot` defined in Task 5, consumed in Task 6. `computeFocus` signature `(target, endpoint, toward)` consistent across Tasks 2 and 5. `bindingKey`/`end: "start" | "end"` consistent across Tasks 4, 5, 6. `candidateBindId` defined in Task 6, consumed in Task 8.
- **Known approximation:** the perpendicular-shift focus is exact-on-boundary for rectangles; for ellipse/diamond the shifted attach point is a simplified off-boundary offset — accepted per the Global Constraints decision.
- **Open item to resolve during Task 8:** the e2e assertion mechanism must match whatever `arrow-binding.spec.ts` already uses; the placeholder must be replaced with a concrete follow-on-move or scene-read check.
