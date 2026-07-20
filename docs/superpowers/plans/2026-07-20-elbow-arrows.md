# Elbow Arrows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Arrows gain an `elbowed` mode — orthogonal Manhattan routing with side-snapping bound endpoints, recomputed on every mutation — toggled from a PropertiesPanel "Arrow type" control.

**Architecture:** `routeElbow` in `packages/scene/src/elbow.ts` is a pure router (endpoints + exit sides → orthogonal waypoints, 16px stubs). `reconcileBindings` gets an elbowed branch that snaps bound endpoints to side centers and replaces interior points with the routed waypoints on every mutate. `findHandleAt` suppresses bend handles for elbowed arrows. PropertiesPanel gets a sharp⇄elbow section (arrowhead-picker pattern). Renderers are untouched.

**Tech Stack:** TypeScript monorepo (pnpm + turbo), vitest, Playwright. Spec: `docs/superpowers/specs/2026-07-20-elbow-arrows-design.md`.

## Global Constraints

- `elbowed: boolean` lives on `ExcalidrawArrowElement` only. Old saves lack the field — every runtime check must treat `undefined` as `false` (plain truthiness on `arrow.elbowed` is fine); no persistence migration or format-version bump.
- Router constants: stub length `16`; `BINDING_GAP` is `4` (existing). Elbowed arrows ignore `binding.focus`; binding fields are never rewritten by the elbow branch beyond the existing dead-target nulling.
- Reference-stability: reconcilers must not write when nothing changed (compare bindings and point lists before replacing).
- `exactOptionalPropertyTypes` is on — new optional interface props receiving possibly-undefined values need `| undefined`.
- RTK: `>/dev/null 2>&1 && echo PASS || echo FAIL`; `rtk proxy` for details. Lint from repo root. Commits: `<package>: <what>` + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: scene — `elbowed` field + `routeElbow` router

**Files:**

- Modify: `packages/scene/src/types.ts` (`ExcalidrawLinearBase`/arrow), `packages/scene/src/factories.ts` (`newArrow`), `packages/scene/src/index.ts`
- Create: `packages/scene/src/elbow.ts`
- Test: `packages/scene/test/elbow.test.ts` (create)

**Interfaces (Tasks 2–4 rely on):**

- `type Side = "top" | "right" | "bottom" | "left"`
- `sideOf(center: Point, toward: Point): Side` — dominant axis of `toward − center` (`right` when `dx >= |dy|` and `dx >= 0`, ties prefer horizontal).
- `sideCenter(bounds: Bounds, side: Side, gap: number): Point` — the side's midpoint pushed outward by `gap`.
- `routeElbow(start: Point, end: Point, startSide: Side | null, endSide: Side | null): Point[]` — absolute orthogonal waypoints including both endpoints; duplicates and collinear middles collapsed; minimum length 2 unless `start === end` (then length may be < 2 — callers guard).
- `ExcalidrawArrowElement.elbowed: boolean`; `newArrow({ ..., elbowed? })` defaults `false`.

- [ ] **Step 1: Write failing tests** — create `packages/scene/test/elbow.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { newArrow } from "../src"
import { routeElbow, sideCenter, sideOf } from "../src/elbow"

const orthogonal = (pts: readonly { x: number; y: number }[]): boolean => {
  for (let i = 0; i < pts.length - 1; i += 1) {
    const a = pts[i]!
    const b = pts[i + 1]!
    if (a.x !== b.x && a.y !== b.y) return false
  }
  return true
}

describe("sideOf / sideCenter", () => {
  it("picks the dominant axis, preferring horizontal on ties", () => {
    expect(sideOf({ x: 0, y: 0 }, { x: 10, y: 3 })).toBe("right")
    expect(sideOf({ x: 0, y: 0 }, { x: -10, y: 3 })).toBe("left")
    expect(sideOf({ x: 0, y: 0 }, { x: 2, y: 9 })).toBe("bottom")
    expect(sideOf({ x: 0, y: 0 }, { x: 2, y: -9 })).toBe("top")
    expect(sideOf({ x: 0, y: 0 }, { x: 5, y: 5 })).toBe("right")
  })

  it("sideCenter pushes the side midpoint out by gap", () => {
    const b = { x: 0, y: 0, width: 100, height: 60 }
    expect(sideCenter(b, "right", 4)).toEqual({ x: 104, y: 30 })
    expect(sideCenter(b, "top", 4)).toEqual({ x: 50, y: -4 })
    expect(sideCenter(b, "bottom", 0)).toEqual({ x: 50, y: 60 })
  })
})

describe("routeElbow", () => {
  it("opposite horizontal sides route as a Z through the mid corridor", () => {
    const pts = routeElbow({ x: 104, y: 50 }, { x: 296, y: 250 }, "right", "left")
    expect(orthogonal(pts)).toBe(true)
    expect(pts[0]).toEqual({ x: 104, y: 50 })
    expect(pts[pts.length - 1]).toEqual({ x: 296, y: 250 })
    expect(pts).toEqual([
      { x: 104, y: 50 },
      { x: 200, y: 50 },
      { x: 200, y: 250 },
      { x: 296, y: 250 },
    ])
  })

  it("aligned opposite sides collapse to a straight segment", () => {
    const pts = routeElbow({ x: 104, y: 50 }, { x: 296, y: 50 }, "right", "left")
    expect(pts).toEqual([
      { x: 104, y: 50 },
      { x: 296, y: 50 },
    ])
  })

  it("perpendicular sides route as an L", () => {
    const pts = routeElbow({ x: 104, y: 50 }, { x: 300, y: 196 }, "right", "top")
    expect(orthogonal(pts)).toBe(true)
    expect(pts).toEqual([
      { x: 104, y: 50 },
      { x: 300, y: 50 },
      { x: 300, y: 196 },
    ])
  })

  it("same-side exits route as a U outside both stubs", () => {
    const pts = routeElbow({ x: 104, y: 50 }, { x: 204, y: 150 }, "right", "right")
    expect(orthogonal(pts)).toBe(true)
    // outer corridor at max(104,204) + 16 = 220
    expect(pts).toEqual([
      { x: 104, y: 50 },
      { x: 220, y: 50 },
      { x: 220, y: 150 },
      { x: 204, y: 150 },
    ])
  })

  it("unbound endpoints route a plain L on the dominant axis", () => {
    const pts = routeElbow({ x: 0, y: 0 }, { x: 100, y: 40 }, null, null)
    expect(pts).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 40 },
    ])
  })

  it("newArrow defaults elbowed to false and accepts elbowed: true", () => {
    expect(newArrow({ x: 0, y: 0 }).elbowed).toBe(false)
    expect(newArrow({ x: 0, y: 0, elbowed: true }).elbowed).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd packages/scene && pnpm vitest run test/elbow.test.ts`
Expected: FAIL — `../src/elbow` does not exist.

- [ ] **Step 3: Implement the model** — in `packages/scene/src/types.ts`, add to `ExcalidrawArrowElement`:

```ts
export interface ExcalidrawArrowElement extends ExcalidrawLinearBase {
  type: "arrow"
  elbowed: boolean
}
```

In `packages/scene/src/factories.ts`:

```ts
export interface NewArrowInput extends NewElementInput {
  elbowed?: boolean
}

export const newArrow = (input: NewArrowInput): ExcalidrawArrowElement => ({
  ...baseElement(input),
  type: "arrow",
  points: [],
  lastCommittedPoint: null,
  startBinding: null,
  endBinding: null,
  startArrowhead: null,
  endArrowhead: "arrow",
  elbowed: input.elbowed ?? false,
})
```

- [ ] **Step 4: Implement the router** — create `packages/scene/src/elbow.ts`:

```ts
import type { Bounds, Point } from "@excalidraw-clone/geometry"

export type Side = "top" | "right" | "bottom" | "left"

export const ELBOW_STUB = 16

const NORMALS: Record<Side, Point> = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
}

const isHorizontal = (s: Side): boolean => s === "left" || s === "right"

/** Dominant axis of (toward - center); ties prefer horizontal. */
export const sideOf = (center: Point, toward: Point): Side => {
  const dx = toward.x - center.x
  const dy = toward.y - center.y
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "right" : "left"
  return dy >= 0 ? "bottom" : "top"
}

/** Midpoint of a bounds side, pushed outward by gap. */
export const sideCenter = (bounds: Bounds, side: Side, gap: number): Point => {
  const n = NORMALS[side]
  const cx = bounds.x + bounds.width / 2
  const cy = bounds.y + bounds.height / 2
  return {
    x: cx + n.x * (bounds.width / 2 + gap),
    y: cy + n.y * (bounds.height / 2 + gap),
  }
}

const stubOut = (p: Point, side: Side | null): Point =>
  side === null
    ? p
    : { x: p.x + NORMALS[side].x * ELBOW_STUB, y: p.y + NORMALS[side].y * ELBOW_STUB }

/** Single-corner connection (straight when already aligned). */
const connect = (a: Point, b: Point, horizontalFirst: boolean): Point[] => {
  if (a.x === b.x || a.y === b.y) return [a, b]
  return horizontalFirst ? [a, { x: b.x, y: a.y }, b] : [a, { x: a.x, y: b.y }, b]
}

const simplify = (pts: readonly Point[]): Point[] => {
  const out: Point[] = []
  for (const p of pts) {
    const last = out[out.length - 1]
    if (last && last.x === p.x && last.y === p.y) continue
    out.push(p)
  }
  for (let i = out.length - 2; i >= 1; i -= 1) {
    const a = out[i - 1]!
    const b = out[i]!
    const c = out[i + 1]!
    if ((a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y)) out.splice(i, 1)
  }
  return out
}

/**
 * Orthogonal route from start to end. A non-null side means the endpoint
 * leaves its shape perpendicular to that side through a 16px stub.
 */
export function routeElbow(
  start: Point,
  end: Point,
  startSide: Side | null,
  endSide: Side | null,
): Point[] {
  const s1 = stubOut(start, startSide)
  const e1 = stubOut(end, endSide)
  let mid: Point[]
  if (startSide !== null && endSide !== null) {
    const sh = isHorizontal(startSide)
    const eh = isHorizontal(endSide)
    if (sh && eh) {
      if (startSide !== endSide) {
        const midX = (s1.x + e1.x) / 2
        mid = [s1, { x: midX, y: s1.y }, { x: midX, y: e1.y }, e1]
      } else {
        const outerX = startSide === "right" ? Math.max(s1.x, e1.x) : Math.min(s1.x, e1.x)
        mid = [s1, { x: outerX, y: s1.y }, { x: outerX, y: e1.y }, e1]
      }
    } else if (!sh && !eh) {
      if (startSide !== endSide) {
        const midY = (s1.y + e1.y) / 2
        mid = [s1, { x: s1.x, y: midY }, { x: e1.x, y: midY }, e1]
      } else {
        const outerY = startSide === "bottom" ? Math.max(s1.y, e1.y) : Math.min(s1.y, e1.y)
        mid = [s1, { x: s1.x, y: outerY }, { x: e1.x, y: outerY }, e1]
      }
    } else {
      mid = sh ? [s1, { x: e1.x, y: s1.y }, e1] : [s1, { x: s1.x, y: e1.y }, e1]
    }
  } else if (startSide !== null) {
    mid = connect(s1, e1, isHorizontal(startSide))
  } else if (endSide !== null) {
    mid = connect(s1, e1, !isHorizontal(endSide))
  } else {
    const horizontalFirst = Math.abs(e1.x - s1.x) >= Math.abs(e1.y - s1.y)
    mid = connect(s1, e1, horizontalFirst)
  }
  return simplify([start, ...mid, end])
}
```

Export from `packages/scene/src/index.ts`:

```ts
export { ELBOW_STUB, routeElbow, sideCenter, sideOf, type Side } from "./elbow"
```

- [ ] **Step 5: Run to verify green**

Run: `cd packages/scene && pnpm vitest run && pnpm exec tsc --noEmit`
Expected: all PASS (any factory/type fallout fixed — no other package constructs arrows literally except via `newArrow`).

- [ ] **Step 6: Commit**

```bash
git add packages/scene
git commit -m "scene: elbowed arrow field + routeElbow Manhattan router"
```

### Task 2: scene — elbowed branch in `reconcileBindings`

**Files:**

- Modify: `packages/scene/src/bindings.ts` (`reconcileBindings`)
- Test: `packages/scene/test/elbow-reconcile.test.ts` (create)

**Interfaces:**

- Consumes: `routeElbow`, `sideCenter`, `sideOf` (Task 1); existing `liveTarget`, `getElementBounds`, `boundsCenter`.
- Produces: behavior only — every mutate leaves each elbowed arrow's `points` equal to the routed waypoints (relative to a recomputed `x`/`y` bbox). Sharp arrows are untouched by this branch.

- [ ] **Step 1: Write failing tests** — create `packages/scene/test/elbow-reconcile.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { BINDING_GAP, newArrow, newRectangle, Scene, type ExcalidrawElement } from "../src"

const orthogonal = (pts: readonly { x: number; y: number }[]): boolean => {
  for (let i = 0; i < pts.length - 1; i += 1) {
    const a = pts[i]!
    const b = pts[i + 1]!
    if (a.x !== b.x && a.y !== b.y) return false
  }
  return true
}

const boundElbow = () => {
  const a = newRectangle({ x: 0, y: 0, width: 100, height: 100 })
  const b = newRectangle({ x: 300, y: 200, width: 100, height: 100 })
  const arrow: ExcalidrawElement = {
    ...newArrow({ x: 100, y: 50, elbowed: true }),
    points: [
      { x: 0, y: 0 },
      { x: 200, y: 200 },
    ],
    startBinding: { elementId: a.id, focus: 0, gap: BINDING_GAP },
    endBinding: { elementId: b.id, focus: 0, gap: BINDING_GAP },
  }
  return { a, b, arrow }
}

describe("reconcileBindings — elbowed arrows", () => {
  it("snaps endpoints to side centers and routes orthogonally", () => {
    const { a, b, arrow } = boundElbow()
    const scene = new Scene([a, b, arrow])
    scene.mutate(() => undefined)
    const out = scene.getElements().find((e) => e.type === "arrow")!
    const abs = out.points.map((p) => ({ x: out.x + p.x, y: out.y + p.y }))
    expect(orthogonal(abs)).toBe(true)
    // A center (50,50) → B center (350,250): dominant x → exit "right" at (104,50)
    expect(abs[0]).toEqual({ x: 100 + BINDING_GAP, y: 50 })
    // B exits "left" at (300-gap, 250)
    expect(abs[abs.length - 1]).toEqual({ x: 300 - BINDING_GAP, y: 250 })
  })

  it("re-routes when a bound shape moves", () => {
    const { a, b, arrow } = boundElbow()
    const scene = new Scene([a, b, arrow])
    scene.mutate(() => undefined)
    scene.mutate((draft) => {
      const i = draft.findIndex((e) => e.id === b.id)
      draft[i] = { ...draft[i]!, x: 0, y: 300 } // B now below A
    })
    const out = scene.getElements().find((e) => e.type === "arrow")!
    const abs = out.points.map((p) => ({ x: out.x + p.x, y: out.y + p.y }))
    expect(orthogonal(abs)).toBe(true)
    // A center (50,50) → B center (50,350): dominant y → exit "bottom"
    expect(abs[0]).toEqual({ x: 50, y: 100 + BINDING_GAP })
    expect(abs[abs.length - 1]).toEqual({ x: 50, y: 300 - BINDING_GAP })
  })

  it("drops manual bends: interior points are fully derived", () => {
    const { a, b, arrow } = boundElbow()
    const bent = {
      ...arrow,
      points: [
        { x: 0, y: 0 },
        { x: 77, y: -333 },
        { x: 200, y: 200 },
      ],
    }
    const scene = new Scene([a, b, bent])
    scene.mutate(() => undefined)
    const out = scene.getElements().find((e) => e.type === "arrow")!
    const abs = out.points.map((p) => ({ x: out.x + p.x, y: out.y + p.y }))
    expect(orthogonal(abs)).toBe(true)
    expect(abs.some((p) => p.y < 0)).toBe(false)
  })

  it("routes unbound elbowed arrows orthogonally too", () => {
    const arrow: ExcalidrawElement = {
      ...newArrow({ x: 0, y: 0, elbowed: true }),
      points: [
        { x: 0, y: 0 },
        { x: 120, y: 80 },
      ],
    }
    const scene = new Scene([arrow])
    scene.mutate(() => undefined)
    const out = scene.getElements().find((e) => e.type === "arrow")!
    expect(orthogonal(out.points)).toBe(true)
    expect(out.points.length).toBeGreaterThan(2)
  })

  it("is reference-stable when nothing changed and leaves sharp arrows alone", () => {
    const { a, b, arrow } = boundElbow()
    const sharp = {
      ...newArrow({ x: 0, y: 150 }),
      points: [
        { x: 0, y: 0 },
        { x: 50, y: 37 },
      ],
    }
    const scene = new Scene([a, b, arrow, sharp])
    scene.mutate(() => undefined)
    const routedOnce = scene.getElements().find((e) => e.type === "arrow" && e.elbowed)!
    const sharpOnce = scene.getElements().find((e) => e.type === "arrow" && !e.elbowed)!
    scene.mutate(() => undefined)
    expect(scene.getElements().find((e) => e.type === "arrow" && e.elbowed)).toBe(routedOnce)
    expect(scene.getElements().find((e) => e.type === "arrow" && !e.elbowed)).toBe(sharpOnce)
    expect(sharpOnce.points[1]).toEqual({ x: 50, y: 37 })
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd packages/scene && pnpm vitest run test/elbow-reconcile.test.ts`
Expected: FAIL — points stay diagonal (no elbow branch yet).

- [ ] **Step 3: Implement** — in `packages/scene/src/bindings.ts`, import from `./elbow`:

```ts
import { routeElbow, sideCenter, sideOf, type Side } from "./elbow"
```

Inside `reconcileBindings`'s loop, insert the elbowed branch right after `if (arrow.type !== "arrow") continue` and BEFORE the `if (!arrow.startBinding && !arrow.endBinding) continue` skip:

```ts
if (arrow.elbowed) {
  const startTarget = liveTarget(arrow.startBinding, byId)
  const endTarget = liveTarget(arrow.endBinding, byId)
  const startBinding = startTarget ? arrow.startBinding : null
  const endBinding = endTarget ? arrow.endBinding : null
  const pts = arrow.points
  if (pts.length < 2) {
    if (startBinding !== arrow.startBinding || endBinding !== arrow.endBinding) {
      draft[i] = { ...arrow, startBinding, endBinding }
    }
    continue
  }
  const abs: Point[] = pts.map((p) => ({ x: arrow.x + p.x, y: arrow.y + p.y }))
  let startAbs = abs[0]!
  let endAbs = abs[abs.length - 1]!
  const startRef = endTarget ? boundsCenter(getElementBounds(endTarget)) : endAbs
  const endRef = startTarget ? boundsCenter(getElementBounds(startTarget)) : startAbs
  let startSide: Side | null = null
  let endSide: Side | null = null
  if (startTarget) {
    const b = getElementBounds(startTarget)
    startSide = sideOf(boundsCenter(b), startRef)
    startAbs = sideCenter(b, startSide, startBinding!.gap)
  }
  if (endTarget) {
    const b = getElementBounds(endTarget)
    endSide = sideOf(boundsCenter(b), endRef)
    endAbs = sideCenter(b, endSide, endBinding!.gap)
  }
  const routed = routeElbow(startAbs, endAbs, startSide, endSide)
  if (routed.length < 2) continue
  const xs = routed.map((p) => p.x)
  const ys = routed.map((p) => p.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const rel = routed.map((p) => ({ x: p.x - minX, y: p.y - minY }))
  const unchanged =
    startBinding === arrow.startBinding &&
    endBinding === arrow.endBinding &&
    arrow.x === minX &&
    arrow.y === minY &&
    rel.length === pts.length &&
    rel.every((p, k) => p.x === pts[k]!.x && p.y === pts[k]!.y)
  if (unchanged) continue
  draft[i] = {
    ...arrow,
    x: minX,
    y: minY,
    width: Math.max(...xs) - minX,
    height: Math.max(...ys) - minY,
    points: rel,
    startBinding,
    endBinding,
  }
  continue
}
```

- [ ] **Step 4: Run to verify green**

Run: `cd packages/scene && pnpm vitest run && pnpm exec tsc --noEmit`
Expected: all PASS, no regressions in `bindings.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add packages/scene
git commit -m "scene: reconcileBindings routes elbowed arrows — derived orthogonal points"
```

### Task 3: tools + ui — bend suppression, Arrow type control, i18n

**Files:**

- Modify: `packages/tools/src/tools/selection/handles.ts` (bend block, ~lines 70-83), `packages/ui/src/PropertiesPanel.tsx` (after the arrowheads section), `apps/web/src/locales/en/common.json`, `apps/web/src/locales/ko/common.json`
- Test: `packages/tools/test/selection-handles.test.ts` (extend — check the actual filename with `ls packages/tools/test | grep -i handle` and use the existing handles test file), `packages/ui/test/properties-panel.test.tsx` (extend — same check with `ls packages/ui/test`)

**Interfaces:**

- Consumes: `elbowed` field (Task 1). `onChange({ elbowed: true } as Partial<ExcalidrawElement>)` flows through the existing App patch path — no App.tsx change needed.
- Produces: testids `arrow-type-sharp` / `arrow-type-elbow`; i18n keys `properties.arrowType`, `properties.arrowTypeSharp`, `properties.arrowTypeElbow`.

- [ ] **Step 1: Write failing tools test** — append to the existing handles test file in `packages/tools/test/` (mirror its existing setup helpers exactly; the assertion that matters):

```ts
it("elbowed arrows expose endpoint handles but no bend/bendAdd handles", () => {
  const arrow = {
    ...newArrow({ x: 0, y: 0, elbowed: true }),
    points: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 80 },
    ],
  }
  const view = { scrollX: 0, scrollY: 0, zoom: 1 }
  // interior vertex (100,0) would be a bend handle on a sharp arrow
  expect(findHandleAt({ x: 100, y: 0 }, [arrow.id], [arrow], view)).toBeNull()
  // segment midpoint (50,0) would be a bendAdd handle on a sharp arrow
  expect(findHandleAt({ x: 50, y: 0 }, [arrow.id], [arrow], view)).toBeNull()
  // endpoints still live
  expect(findHandleAt({ x: 0, y: 0 }, [arrow.id], [arrow], view)).toEqual({
    kind: "endpoint",
    elementId: arrow.id,
    end: "start",
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd packages/tools && pnpm vitest run`
Expected: the new test FAILS (bend handles found).

- [ ] **Step 3: Implement suppression** — in `packages/tools/src/tools/selection/handles.ts`, inside the `isLinear(e)` block, wrap the interior-bend and segment-midpoint loops:

```ts
const elbowed = e.type === "arrow" && e.elbowed
if (!elbowed) {
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
}
return null
```

(The endpoint checks above the loops stay outside the guard.)

- [ ] **Step 4: Run tools tests green, commit**

Run: `cd packages/tools && pnpm vitest run`
Expected: PASS.

```bash
git add packages/tools
git commit -m "tools: suppress bend handles for elbowed arrows"
```

- [ ] **Step 5: Write failing ui test** — append to the existing PropertiesPanel test file in `packages/ui/test/` (mirror its render/props helpers; assertions that matter):

```ts
it("shows the Arrow type control for arrow selections and patches elbowed", () => {
  const arrow = newArrow({ x: 0, y: 0 })
  const onChange = vi.fn()
  renderPanel({ selectedElements: [arrow], onChange }) // use the file's existing helper
  fireEvent.click(screen.getByTestId("arrow-type-elbow"))
  expect(onChange).toHaveBeenCalledWith({ elbowed: true })
  fireEvent.click(screen.getByTestId("arrow-type-sharp"))
  expect(onChange).toHaveBeenCalledWith({ elbowed: false })
})

it("hides the Arrow type control when selection has no arrow", () => {
  renderPanel({ selectedElements: [newRectangle({ x: 0, y: 0, width: 10, height: 10 })] })
  expect(screen.queryByTestId("arrow-type-elbow")).toBeNull()
})
```

- [ ] **Step 6: Run to verify failure**

Run: `cd packages/ui && pnpm vitest run`
Expected: new tests FAIL (no such testids).

- [ ] **Step 7: Implement the control** — in `packages/ui/src/PropertiesPanel.tsx`, beside the `allLinear` computation add:

```ts
const allArrow = selectedElements.length > 0 && selectedElements.every((e) => e.type === "arrow")
const elbowed = commonValue<boolean>(
  selectedElements as unknown as readonly { [k: string]: unknown }[],
  "elbowed",
)
```

After the arrowheads `Section` (inside the same `allLinear` conditional's sibling position — it renders only when `allArrow`):

```tsx
{
  allArrow && (
    <Section label={t("properties.arrowType")}>
      <div className="flex gap-1">
        <button
          type="button"
          data-testid="arrow-type-sharp"
          aria-pressed={elbowed === false}
          onClick={() => onChange({ elbowed: false })}
          className={`h-8 flex-1 rounded border text-xs ${elbowed === false ? "border-violet-600 bg-violet-100" : "border-gray-300"}`}
        >
          {t("properties.arrowTypeSharp")}
        </button>
        <button
          type="button"
          data-testid="arrow-type-elbow"
          aria-pressed={elbowed === true}
          onClick={() => onChange({ elbowed: true })}
          className={`h-8 flex-1 rounded border text-xs ${elbowed === true ? "border-violet-600 bg-violet-100" : "border-gray-300"}`}
        >
          {t("properties.arrowTypeElbow")}
        </button>
      </div>
    </Section>
  )
}
```

Add i18n keys — `apps/web/src/locales/en/common.json` (inside the `properties` block, matching existing style):

```json
"arrowType": "Arrow type",
"arrowTypeSharp": "Sharp",
"arrowTypeElbow": "Elbow"
```

`apps/web/src/locales/ko/common.json`:

```json
"arrowType": "화살표 유형",
"arrowTypeSharp": "직선",
"arrowTypeElbow": "직각"
```

(Check whether `packages/ui` tests use a stub `t` — if `t` returns the key, assert on testids only, as written above.)

- [ ] **Step 8: Run ui tests green, typecheck, commit**

Run: `cd packages/ui && pnpm vitest run && cd ../../ && pnpm turbo typecheck`
Expected: all PASS.

```bash
git add packages/ui apps/web/src/locales
git commit -m "ui: Arrow type control (sharp/elbow) in PropertiesPanel + i18n"
```

### Task 4: e2e + full gate

**Files:**

- Create: `apps/web/e2e/elbow-arrows.spec.ts`

**Interfaces:** consumes everything above through the running app.

- [ ] **Step 1: Write the spec** — create `apps/web/e2e/elbow-arrows.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test"
import { dragOnCanvas } from "./_helpers"

type SceneEl = {
  id: string
  type: string
  x: number
  y: number
  points?: { x: number; y: number }[]
  elbowed?: boolean
  startBinding?: { elementId: string } | null
  endBinding?: { elementId: string } | null
  isDeleted?: boolean
}

const readScene = async (page: Page): Promise<SceneEl[]> => {
  const json = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  const data = JSON.parse(json!) as { elements: SceneEl[] }
  return data.elements.filter((e) => !e.isDeleted)
}

const orthogonal = (pts: readonly { x: number; y: number }[]): boolean => {
  for (let i = 0; i < pts.length - 1; i += 1) {
    const a = pts[i]!
    const b = pts[i + 1]!
    if (Math.abs(a.x - b.x) > 0.01 && Math.abs(a.y - b.y) > 0.01) return false
  }
  return true
}

test("toggle to elbow routes orthogonally, re-routes on shape drag, persists", async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-rectangle"]').waitFor({ state: "visible" })

  // Rect A and rect B, then a bound arrow between them.
  await page.locator('[data-testid="toolbar-rectangle"]').click()
  await dragOnCanvas(page, { x: 100, y: 200 }, { x: 200, y: 300 })
  await page.locator('[data-testid="toolbar-rectangle"]').click()
  await dragOnCanvas(page, { x: 500, y: 300 }, { x: 600, y: 400 })
  await page.locator('[data-testid="toolbar-arrow"]').click()
  await dragOnCanvas(page, { x: 150, y: 250 }, { x: 550, y: 350 })
  await page.waitForTimeout(300)

  // Select the arrow (selection tool is active after the auto-switch):
  // click a point on the straight diagonal between the shapes.
  await dragOnCanvas(page, { x: 350, y: 300 }, { x: 350, y: 300 })
  await page.waitForTimeout(120)

  await page.locator('[data-testid="arrow-type-elbow"]').click()
  await page.waitForTimeout(900)

  let arrow = (await readScene(page)).find((e) => e.type === "arrow")!
  expect(arrow.elbowed).toBe(true)
  expect(arrow.startBinding).not.toBeNull()
  expect(arrow.endBinding).not.toBeNull()
  expect(orthogonal(arrow.points!)).toBe(true)

  // Drag rect B; the elbow re-routes and stays orthogonal + bound.
  await dragOnCanvas(page, { x: 580, y: 390 }, { x: 580, y: 480 })
  await page.waitForTimeout(900)
  arrow = (await readScene(page)).find((e) => e.type === "arrow")!
  expect(orthogonal(arrow.points!)).toBe(true)
  expect(arrow.endBinding).not.toBeNull()

  // Reload: elbowed flag and route persist.
  await page.reload()
  await page.locator('[data-testid="toolbar-rectangle"]').waitFor({ state: "visible" })
  arrow = (await readScene(page)).find((e) => e.type === "arrow")!
  expect(arrow.elbowed).toBe(true)
  expect(orthogonal(arrow.points!)).toBe(true)
})
```

- [ ] **Step 2: Run the spec**

Run: `cd apps/web && pnpm exec playwright test e2e/elbow-arrows.spec.ts`
Expected: PASS. (If selecting the arrow by clicking the diagonal misses, click closer to a known point on the line — the arrow hit-test threshold is `max(strokeWidth*2, 5)`.)

- [ ] **Step 3: Full gate**

Run from repo root: `rtk lint`, `pnpm turbo typecheck`, `pnpm turbo test`, then `cd apps/web && pnpm exec playwright test`.
Expected: all PASS (42 e2e: 41 existing + 1 new).

- [ ] **Step 4: Commit**

```bash
git add apps/web/e2e/elbow-arrows.spec.ts
git commit -m "web: elbow arrows e2e — toggle, re-route on drag, persistence"
```

---

## After all tasks

superpowers:finishing-a-development-branch — FF-merge `develop` → `main`, push both, record memory.
