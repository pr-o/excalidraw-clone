# Smart Arrows / Element Binding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Arrows bind to shapes on draw and keep their endpoints glued to the shape's edge as the shape moves or resizes.

**Architecture:** A pure geometry primitive (`edgePointToward`) computes where a ray from a shape's center crosses its edge. A scene-level `bindings` module turns that into edge+gap endpoints and a `reconcileBindings(draft)` pass that runs inside `scene.mutate()` right after `reconcileBoundText`, so any mutation that moves/resizes a bound shape updates its arrows automatically. The arrow tool sets bindings on draw; selection-drag clears them when an arrow is dragged away from its target; the renderer highlights the binding candidate during draw.

**Tech Stack:** TypeScript monorepo (pnpm + turbo), Vitest unit tests in `packages/<pkg>/test/`, Playwright e2e in `apps/web/e2e/`, React + Zustand web app, canvas renderer.

## Global Constraints

- Tests live in `packages/<pkg>/test/` and import from `../src/...`. Test header: `import { describe, expect, it } from "vitest"`.
- Per-package test command: `pnpm --filter @excalidraw-clone/<pkg> test` (runs `vitest run`). Whole repo: `pnpm test`.
- Package dependency direction: `geometry` ← `scene` ← `tools`; `renderer` depends on `scene`+`geometry`; `apps/web` depends on all. Never import "upward".
- The element data model already has `PointBinding { elementId; focus; gap; fixedPoint? }`, `startBinding`/`endBinding` on linear elements, and `boundElements: readonly BoundElement[] | null` on every element. Do NOT change these types.
- `focus` is always `0` and `fixedPoint` is unused in this feature. `gap` default = `BINDING_GAP = 4`.
- Bindable element types: `rectangle, diamond, ellipse, image, text`. Never bind to `line`, `arrow`, `freedraw`, `frame`, or to a note's bound text (a `text` with `containerId !== null`).
- Use exact commit messages shown. End each commit message body with:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- Branch: work on `develop` (current branch).

---

### Task 1: Geometry primitive — `edgePointToward`

Where a ray from a box's center toward a point crosses the box's edge, for rect / ellipse / diamond shapes.

**Files:**

- Create: `packages/geometry/src/binding-edge.ts`
- Create: `packages/geometry/test/binding-edge.test.ts`
- Modify: `packages/geometry/src/index.ts`

**Interfaces:**

- Consumes: `Bounds`, `Point` from `./types`.
- Produces:
  - `type EdgeKind = "rect" | "ellipse" | "diamond"`
  - `edgePointToward(bounds: Bounds, kind: EdgeKind, toward: Point): Point` — ray origin is the box center; returns the edge crossing along center→toward. Returns the center for a degenerate input (toward == center, or zero-size box).

- [ ] **Step 1: Write the failing test**

Create `packages/geometry/test/binding-edge.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { edgePointToward } from "../src/binding-edge"
import type { Bounds } from "../src/types"

// 100x100 box centered at (50,50)
const box: Bounds = { x: 0, y: 0, width: 100, height: 100 }

describe("edgePointToward — rect", () => {
  it("crosses the right edge for a point due east", () => {
    const p = edgePointToward(box, "rect", { x: 1000, y: 50 })
    expect(p.x).toBeCloseTo(100)
    expect(p.y).toBeCloseTo(50)
  })
  it("crosses the top edge for a point due north", () => {
    const p = edgePointToward(box, "rect", { x: 50, y: -1000 })
    expect(p.x).toBeCloseTo(50)
    expect(p.y).toBeCloseTo(0)
  })
  it("crosses a corner for a diagonal point", () => {
    const p = edgePointToward(box, "rect", { x: 1000, y: 1000 })
    expect(p.x).toBeCloseTo(100)
    expect(p.y).toBeCloseTo(100)
  })
})

describe("edgePointToward — ellipse", () => {
  it("crosses the right vertex due east", () => {
    const p = edgePointToward(box, "ellipse", { x: 1000, y: 50 })
    expect(p.x).toBeCloseTo(100)
    expect(p.y).toBeCloseTo(50)
  })
  it("crosses the ellipse boundary on the diagonal (inside the rect corner)", () => {
    const p = edgePointToward(box, "ellipse", { x: 1000, y: 1000 })
    // 45° on a circle r=50 → center + (50/√2, 50/√2)
    expect(p.x).toBeCloseTo(50 + 50 / Math.SQRT2)
    expect(p.y).toBeCloseTo(50 + 50 / Math.SQRT2)
  })
})

describe("edgePointToward — diamond", () => {
  it("crosses the right vertex due east", () => {
    const p = edgePointToward(box, "diamond", { x: 1000, y: 50 })
    expect(p.x).toBeCloseTo(100)
    expect(p.y).toBeCloseTo(50)
  })
  it("crosses the diamond edge on the diagonal", () => {
    const p = edgePointToward(box, "diamond", { x: 1000, y: 1000 })
    // |x|/50 + |y|/50 = 1 with x==y → x = 25
    expect(p.x).toBeCloseTo(75)
    expect(p.y).toBeCloseTo(75)
  })
})

describe("edgePointToward — degenerate", () => {
  it("returns the center when toward == center", () => {
    const p = edgePointToward(box, "rect", { x: 50, y: 50 })
    expect(p).toEqual({ x: 50, y: 50 })
  })
  it("returns the center for a zero-width box", () => {
    const flat: Bounds = { x: 10, y: 10, width: 0, height: 40 }
    const p = edgePointToward(flat, "ellipse", { x: 1000, y: 30 })
    expect(p).toEqual({ x: 10, y: 30 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @excalidraw-clone/geometry test`
Expected: FAIL — `binding-edge` module not found.

- [ ] **Step 3: Write minimal implementation**

Create `packages/geometry/src/binding-edge.ts`:

```ts
import type { Bounds, Point } from "./types"

export type EdgeKind = "rect" | "ellipse" | "diamond"

export const edgePointToward = (bounds: Bounds, kind: EdgeKind, toward: Point): Point => {
  const cx = bounds.x + bounds.width / 2
  const cy = bounds.y + bounds.height / 2
  const dx = toward.x - cx
  const dy = toward.y - cy
  const rx = bounds.width / 2
  const ry = bounds.height / 2
  if ((dx === 0 && dy === 0) || rx === 0 || ry === 0) return { x: cx, y: cy }

  let t: number
  if (kind === "ellipse") {
    t = 1 / Math.hypot(dx / rx, dy / ry)
  } else if (kind === "diamond") {
    t = 1 / (Math.abs(dx) / rx + Math.abs(dy) / ry)
  } else {
    const tx = dx === 0 ? Infinity : rx / Math.abs(dx)
    const ty = dy === 0 ? Infinity : ry / Math.abs(dy)
    t = Math.min(tx, ty)
  }
  return { x: cx + dx * t, y: cy + dy * t }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @excalidraw-clone/geometry test`
Expected: PASS (all `binding-edge` cases).

- [ ] **Step 5: Export from the geometry index**

In `packages/geometry/src/index.ts`, add after the `snap` export block:

```ts
export { edgePointToward } from "./binding-edge"
export type { EdgeKind } from "./binding-edge"
```

- [ ] **Step 6: Typecheck + commit**

Run: `pnpm --filter @excalidraw-clone/geometry typecheck && pnpm --filter @excalidraw-clone/geometry test`
Expected: PASS.

```bash
git add packages/geometry/src/binding-edge.ts packages/geometry/test/binding-edge.test.ts packages/geometry/src/index.ts
git commit -m "$(cat <<'EOF'
geometry: add edgePointToward for arrow-binding edge intersection

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Scene binding helpers — `canBindTo`, `bindingTargetAt`, `computeBoundEndpoint`

The pure helpers the arrow tool and reconcile pass build on. No `reconcileBindings` yet (Task 3).

**Files:**

- Create: `packages/scene/src/bindings.ts`
- Create: `packages/scene/test/bindings.test.ts`

**Interfaces:**

- Consumes: `edgePointToward`, `EdgeKind`, `boundsCenter`, `normalize`, `pointAdd`, `pointScale`, `Point` from `@excalidraw-clone/geometry`; `getElementBounds` from `./bounds`; `hitTestElement` from `./hit-test`; types from `./types`.
- Produces:
  - `const BINDING_GAP = 4`
  - `const BINDABLE_TYPES: ReadonlySet<ElementType>`
  - `canBindTo(el: ExcalidrawElement): boolean`
  - `bindingTargetAt(point: Point, elements: readonly ExcalidrawElement[]): ExcalidrawElement | null`
  - `computeBoundEndpoint(target: ExcalidrawElement, toward: Point, gap: number): Point`

- [ ] **Step 1: Write the failing test**

Create `packages/scene/test/bindings.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { newArrow, newEllipse, newRectangle, newText } from "../src/factories"
import {
  BINDABLE_TYPES,
  BINDING_GAP,
  bindingTargetAt,
  canBindTo,
  computeBoundEndpoint,
} from "../src/bindings"
import type { ExcalidrawElement } from "../src/types"

const rect = (over: Partial<ExcalidrawElement>): ExcalidrawElement => ({
  ...newRectangle({ x: 0, y: 0, width: 100, height: 100 }),
  ...over,
})

describe("canBindTo", () => {
  it("accepts closed shapes, text, image", () => {
    expect(canBindTo(newRectangle({ x: 0, y: 0, width: 1, height: 1 }))).toBe(true)
    expect(canBindTo(newEllipse({ x: 0, y: 0, width: 1, height: 1 }))).toBe(true)
    expect(canBindTo(newText({ x: 0, y: 0 }))).toBe(true)
  })
  it("rejects arrows and deleted elements", () => {
    expect(canBindTo(newArrow({ x: 0, y: 0 }))).toBe(false)
    expect(canBindTo(rect({ isDeleted: true }))).toBe(false)
  })
  it("BINDABLE_TYPES has the five expected types", () => {
    expect([...BINDABLE_TYPES].sort()).toEqual(["diamond", "ellipse", "image", "rectangle", "text"])
  })
})

describe("bindingTargetAt", () => {
  it("returns the topmost bindable element under the point", () => {
    const a = rect({ id: "a", x: 0, y: 0, width: 100, height: 100 })
    const b = rect({ id: "b", x: 0, y: 0, width: 100, height: 100 })
    expect(bindingTargetAt({ x: 50, y: 50 }, [a, b])?.id).toBe("b")
  })
  it("returns null over empty space", () => {
    const a = rect({ id: "a", x: 0, y: 0, width: 100, height: 100 })
    expect(bindingTargetAt({ x: 500, y: 500 }, [a])).toBeNull()
  })
  it("skips a note's bound text child", () => {
    const text = { ...newText({ x: 0, y: 0 }), id: "t", width: 100, height: 100, containerId: "c" }
    expect(bindingTargetAt({ x: 10, y: 10 }, [text])).toBeNull()
  })
})

describe("computeBoundEndpoint", () => {
  it("places the endpoint on the rect edge plus gap, toward the other end", () => {
    const target = rect({ x: 0, y: 0, width: 100, height: 100 }) // center (50,50)
    const p = computeBoundEndpoint(target, { x: 1000, y: 50 }, BINDING_GAP)
    expect(p.x).toBeCloseTo(100 + BINDING_GAP)
    expect(p.y).toBeCloseTo(50)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @excalidraw-clone/scene test`
Expected: FAIL — `../src/bindings` not found.

- [ ] **Step 3: Write minimal implementation**

Create `packages/scene/src/bindings.ts`:

```ts
import {
  type EdgeKind,
  type Point,
  boundsCenter,
  edgePointToward,
  normalize,
  pointAdd,
  pointScale,
} from "@excalidraw-clone/geometry"
import { getElementBounds } from "./bounds"
import { hitTestElement } from "./hit-test"
import type { ElementType, ExcalidrawElement } from "./types"

export const BINDING_GAP = 4

export const BINDABLE_TYPES: ReadonlySet<ElementType> = new Set<ElementType>([
  "rectangle",
  "diamond",
  "ellipse",
  "image",
  "text",
])

export const canBindTo = (el: ExcalidrawElement): boolean =>
  !el.isDeleted && BINDABLE_TYPES.has(el.type)

const edgeKindFor = (type: ElementType): EdgeKind =>
  type === "ellipse" ? "ellipse" : type === "diamond" ? "diamond" : "rect"

export const bindingTargetAt = (
  point: Point,
  elements: readonly ExcalidrawElement[],
): ExcalidrawElement | null => {
  for (let i = elements.length - 1; i >= 0; i -= 1) {
    const el = elements[i]!
    if (!canBindTo(el)) continue
    if (el.type === "text" && el.containerId !== null) continue
    if (hitTestElement(el, point)) return el
  }
  return null
}

export const computeBoundEndpoint = (
  target: ExcalidrawElement,
  toward: Point,
  gap: number,
): Point => {
  const bounds = getElementBounds(target)
  const center = boundsCenter(bounds)
  const edge = edgePointToward(bounds, edgeKindFor(target.type), toward)
  const dir = normalize({ x: toward.x - center.x, y: toward.y - center.y })
  return pointAdd(edge, pointScale(dir, gap))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @excalidraw-clone/scene test`
Expected: PASS (all `bindings` cases).

- [ ] **Step 5: Commit**

```bash
git add packages/scene/src/bindings.ts packages/scene/test/bindings.test.ts
git commit -m "$(cat <<'EOF'
scene: add binding helpers (canBindTo, bindingTargetAt, computeBoundEndpoint)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `reconcileBindings` pass

Recompute every bound arrow's endpoints from target geometry; drop bindings whose target is gone/deleted/non-bindable.

**Files:**

- Modify: `packages/scene/src/bindings.ts` (add `reconcileBindings`)
- Modify: `packages/scene/test/bindings.test.ts` (add a `reconcileBindings` describe block)

**Interfaces:**

- Consumes: `computeBoundEndpoint`, `canBindTo` (same module); `boundsCenter`, `getElementBounds`; arrow element types.
- Produces: `reconcileBindings(draft: ExcalidrawElement[]): void` — mutates the draft in place, replacing arrow elements (never mutating in place). Idempotent.

- [ ] **Step 1: Write the failing test**

Append to `packages/scene/test/bindings.test.ts`:

```ts
import { reconcileBindings } from "../src/bindings"
import type { ExcalidrawArrowElement } from "../src/types"

const boundArrow = (over: Partial<ExcalidrawArrowElement>): ExcalidrawArrowElement => ({
  ...newArrow({ x: 0, y: 0 }),
  points: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ],
  width: 100,
  height: 0,
  ...over,
})

const absEnd = (a: ExcalidrawArrowElement): Point => ({
  x: a.x + a.points[a.points.length - 1]!.x,
  y: a.y + a.points[a.points.length - 1]!.y,
})

describe("reconcileBindings", () => {
  it("follows a moved target (end bound to a rect)", () => {
    const target = rect({ id: "t", x: 200, y: 0, width: 100, height: 100 })
    const arrow = boundArrow({
      id: "ar",
      x: 0,
      y: 50,
      endBinding: { elementId: "t", focus: 0, gap: BINDING_GAP },
    })
    const draft: ExcalidrawElement[] = [target, arrow]
    reconcileBindings(draft)
    const ar1 = draft.find((e) => e.id === "ar") as ExcalidrawArrowElement
    const endX1 = absEnd(ar1).x

    // Move the target +300 in x.
    const ti = draft.findIndex((e) => e.id === "t")
    draft[ti] = { ...draft[ti]!, x: 500 }
    reconcileBindings(draft)
    const ar2 = draft.find((e) => e.id === "ar") as ExcalidrawArrowElement
    expect(absEnd(ar2).x).toBeGreaterThan(endX1)
  })

  it("is idempotent", () => {
    const target = rect({ id: "t", x: 200, y: 0, width: 100, height: 100 })
    const arrow = boundArrow({
      id: "ar",
      x: 0,
      y: 50,
      endBinding: { elementId: "t", focus: 0, gap: BINDING_GAP },
    })
    const draft: ExcalidrawElement[] = [target, arrow]
    reconcileBindings(draft)
    const once = absEnd(draft.find((e) => e.id === "ar") as ExcalidrawArrowElement)
    reconcileBindings(draft)
    const twice = absEnd(draft.find((e) => e.id === "ar") as ExcalidrawArrowElement)
    expect(twice.x).toBeCloseTo(once.x)
    expect(twice.y).toBeCloseTo(once.y)
  })

  it("clears a binding whose target is missing", () => {
    const arrow = boundArrow({
      id: "ar",
      endBinding: { elementId: "gone", focus: 0, gap: BINDING_GAP },
    })
    const draft: ExcalidrawElement[] = [arrow]
    reconcileBindings(draft)
    const ar = draft.find((e) => e.id === "ar") as ExcalidrawArrowElement
    expect(ar.endBinding).toBeNull()
  })

  it("clears a binding whose target is deleted", () => {
    const target = rect({ id: "t", x: 200, y: 0, width: 100, height: 100, isDeleted: true })
    const arrow = boundArrow({
      id: "ar",
      endBinding: { elementId: "t", focus: 0, gap: BINDING_GAP },
    })
    const draft: ExcalidrawElement[] = [target, arrow]
    reconcileBindings(draft)
    const ar = draft.find((e) => e.id === "ar") as ExcalidrawArrowElement
    expect(ar.endBinding).toBeNull()
  })

  it("resolves both ends bound to two rects in one pass", () => {
    const a = rect({ id: "a", x: 0, y: 0, width: 100, height: 100 })
    const b = rect({ id: "b", x: 400, y: 0, width: 100, height: 100 })
    const arrow = boundArrow({
      id: "ar",
      startBinding: { elementId: "a", focus: 0, gap: BINDING_GAP },
      endBinding: { elementId: "b", focus: 0, gap: BINDING_GAP },
    })
    const draft: ExcalidrawElement[] = [a, b, arrow]
    reconcileBindings(draft)
    const ar = draft.find((e) => e.id === "ar") as ExcalidrawArrowElement
    const start = { x: ar.x + ar.points[0]!.x, y: ar.y + ar.points[0]!.y }
    // start sits just right of rect A's right edge (x=100), end just left of B (x=400)
    expect(start.x).toBeCloseTo(100 + BINDING_GAP)
    expect(absEnd(ar).x).toBeCloseTo(400 - BINDING_GAP)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @excalidraw-clone/scene test`
Expected: FAIL — `reconcileBindings` is not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `packages/scene/src/bindings.ts`:

```ts
import type { ExcalidrawArrowElement, PointBinding } from "./types"

const liveTarget = (
  binding: PointBinding | null,
  byId: Map<string, ExcalidrawElement>,
): ExcalidrawElement | null => {
  if (!binding) return null
  const t = byId.get(binding.elementId)
  if (!t || !canBindTo(t)) return null
  return t
}

export const reconcileBindings = (draft: ExcalidrawElement[]): void => {
  const byId = new Map(draft.map((e) => [e.id, e]))
  for (let i = 0; i < draft.length; i += 1) {
    const arrow = draft[i]!
    if (arrow.type !== "arrow") continue
    if (!arrow.startBinding && !arrow.endBinding) continue

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

    let startAbs: Point = { x: arrow.x + pts[0]!.x, y: arrow.y + pts[0]!.y }
    let endAbs: Point = {
      x: arrow.x + pts[pts.length - 1]!.x,
      y: arrow.y + pts[pts.length - 1]!.y,
    }

    if (startTarget) {
      const toward = endTarget ? boundsCenter(getElementBounds(endTarget)) : endAbs
      startAbs = computeBoundEndpoint(startTarget, toward, startBinding!.gap)
    }
    if (endTarget) {
      const toward = startTarget ? boundsCenter(getElementBounds(startTarget)) : startAbs
      endAbs = computeBoundEndpoint(endTarget, toward, endBinding!.gap)
    }

    const minX = Math.min(startAbs.x, endAbs.x)
    const minY = Math.min(startAbs.y, endAbs.y)
    draft[i] = {
      ...arrow,
      x: minX,
      y: minY,
      width: Math.abs(endAbs.x - startAbs.x),
      height: Math.abs(endAbs.y - startAbs.y),
      points: [
        { x: startAbs.x - minX, y: startAbs.y - minY },
        { x: endAbs.x - minX, y: endAbs.y - minY },
      ],
      startBinding,
      endBinding,
    } as ExcalidrawArrowElement
  }
}
```

(The `import type { ExcalidrawArrowElement, PointBinding }` line can be merged into the existing `./types` import at the top of the file — keep a single import statement.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @excalidraw-clone/scene test`
Expected: PASS (all `reconcileBindings` cases).

- [ ] **Step 5: Commit**

```bash
git add packages/scene/src/bindings.ts packages/scene/test/bindings.test.ts
git commit -m "$(cat <<'EOF'
scene: add reconcileBindings to keep bound arrow endpoints on target edges

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Wire `reconcileBindings` into `scene.mutate` + package exports

Run the reconcile pass after every mutation (after `reconcileBoundText`) and export the public binding API.

**Files:**

- Modify: `packages/scene/src/scene.ts` (import + call in `mutate`)
- Modify: `packages/scene/src/index.ts` (exports)
- Modify: `packages/scene/test/scene-mutate.test.ts` (add a follow-on-move case)

**Interfaces:**

- Consumes: `reconcileBindings`, `BINDING_GAP`, `BINDABLE_TYPES`, `canBindTo`, `bindingTargetAt`, `computeBoundEndpoint` from `./bindings`.
- Produces: public exports from `@excalidraw-clone/scene` of the binding API; `scene.mutate` now reconciles bindings.

- [ ] **Step 1: Write the failing test**

Append to `packages/scene/test/scene-mutate.test.ts` (reuse its existing imports; add `reconcileBindings`-driven behavior through the Scene):

```ts
import { BINDING_GAP } from "../src/bindings"

it("moving a bound target updates the arrow endpoint through mutate()", () => {
  const scene = new Scene()
  const target = { ...newRectangle({ x: 200, y: 0, width: 100, height: 100 }), id: "t" }
  const arrow = {
    ...newArrow({ x: 0, y: 50 }),
    id: "ar",
    points: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
    width: 100,
    height: 0,
    endBinding: { elementId: "t", focus: 0, gap: BINDING_GAP },
  }
  scene.mutate((draft) => {
    draft.push(target, arrow)
  })
  const before = scene.getElements().find((e) => e.id === "ar")!
  const beforeEndX = before.x + (before as typeof arrow).points[1]!.x

  scene.mutate((draft) => {
    const i = draft.findIndex((e) => e.id === "t")
    draft[i] = { ...draft[i]!, x: 500 }
  })
  const after = scene.getElements().find((e) => e.id === "ar")!
  const afterEndX = after.x + (after as typeof arrow).points[1]!.x
  expect(afterEndX).toBeGreaterThan(beforeEndX)
})
```

Ensure `newArrow` and `newRectangle` are imported at the top of the file (add to the existing factory import if missing).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @excalidraw-clone/scene test`
Expected: FAIL — arrow endpoint does not move (reconcile not wired into `mutate`).

- [ ] **Step 3: Wire reconcile into `mutate`**

In `packages/scene/src/scene.ts`, add the import next to the existing reconcile import:

```ts
import { reconcileBindings } from "./bindings"
```

In `mutate`, add the call right after `reconcileBoundText(draft)`:

```ts
reconcileBoundText(draft)
reconcileBindings(draft)
this.setElements(draft)
```

- [ ] **Step 4: Add the public exports**

In `packages/scene/src/index.ts`, add after the `reconcile-bound-text` export line:

```ts
export {
  BINDABLE_TYPES,
  BINDING_GAP,
  bindingTargetAt,
  canBindTo,
  computeBoundEndpoint,
  reconcileBindings,
} from "./bindings"
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @excalidraw-clone/scene test && pnpm --filter @excalidraw-clone/scene typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/scene/src/scene.ts packages/scene/src/index.ts packages/scene/test/scene-mutate.test.ts
git commit -m "$(cat <<'EOF'
scene: reconcile bindings in mutate() and export binding API

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Arrow tool — bind on draw

The arrow tool detects a binding target under the start and release points, sets `startBinding`/`endBinding`, and adds `boundElements` back-references. The shared linear reducer gains optional binding awareness so the `line` tool is unaffected.

**Files:**

- Modify: `packages/tools/src/tools/linear.ts` (binding-aware reducer + `LinearState`)
- Modify: `packages/tools/src/tools/arrow.ts` (opt in by passing elements)
- Modify: `packages/tools/test/` — add `packages/tools/test/arrow-binding.test.ts`

**Interfaces:**

- Consumes: `bindingTargetAt`, `BINDING_GAP` from `@excalidraw-clone/scene`; `ExcalidrawArrowElement`, `ExcalidrawElement` from `@excalidraw-clone/scene`.
- Produces:
  - Extended `LinearState`: the `drawing` variant gains `startBindId: string | null` and `endBindId: string | null`.
  - `linearReduce` accepts an optional `bindTargets?: readonly ExcalidrawElement[]`; when present it detects/sets bindings (used by the arrow tool only).

- [ ] **Step 1: Write the failing test**

Create `packages/tools/test/arrow-binding.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { newRectangle } from "@excalidraw-clone/scene"
import type { ExcalidrawArrowElement, ExcalidrawElement } from "@excalidraw-clone/scene"
import { arrowTool } from "../src/tools/arrow"
import type { ToolContext } from "../src/types"

const target = { ...newRectangle({ x: 400, y: 0, width: 100, height: 100 }), id: "t" }

const ctxWith = (elements: readonly ExcalidrawElement[]): ToolContext => ({
  readElements: () => elements,
  hitTest: () => null,
  viewTransform: { scrollX: 0, scrollY: 0, zoom: 1 },
  modifiers: { shift: false, alt: false, ctrl: false, meta: false },
  selectedIds: [],
  grid: { enabled: false, size: 20 },
})

const runDraw = (
  from: { x: number; y: number },
  to: { x: number; y: number },
  elements: readonly ExcalidrawElement[],
): ExcalidrawElement[] => {
  const ctx = ctxWith(elements)
  let state = arrowTool.initial
  const draft: ExcalidrawElement[] = [...elements]
  const apply = (effects: readonly { kind: string }[]) => {
    for (const eff of effects) {
      if (eff.kind === "mutation") {
        ;(eff as { apply: (d: ExcalidrawElement[]) => void }).apply(draft)
      }
    }
  }
  let [s, e] = arrowTool.reduce(state, { type: "pointerDown", at: from }, ctx)
  apply(e)
  state = s
  ;[s, e] = arrowTool.reduce(state, { type: "pointerMove", at: to }, ctx)
  apply(e)
  state = s
  ;[s, e] = arrowTool.reduce(state, { type: "pointerUp", at: to }, ctx)
  apply(e)
  return draft
}

describe("arrow tool — bind on draw", () => {
  it("binds the end to a shape released over it and adds a back-reference", () => {
    const draft = runDraw({ x: 50, y: 50 }, { x: 450, y: 50 }, [target])
    const arrow = draft.find((e) => e.type === "arrow") as ExcalidrawArrowElement
    expect(arrow.endBinding?.elementId).toBe("t")
    expect(arrow.startBinding).toBeNull()
    const t = draft.find((e) => e.id === "t")!
    expect(t.boundElements?.some((b) => b.id === arrow.id && b.type === "arrow")).toBe(true)
  })

  it("creates no binding when released over empty space", () => {
    const draft = runDraw({ x: 50, y: 50 }, { x: 200, y: 50 }, [target])
    const arrow = draft.find((e) => e.type === "arrow") as ExcalidrawArrowElement
    expect(arrow.startBinding).toBeNull()
    expect(arrow.endBinding).toBeNull()
  })
})
```

(`Modifiers` here lists `shift/alt/ctrl/meta`; if the real `Modifiers` type differs, copy its exact fields from `packages/tools/src/types.ts` so the test ctx typechecks.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @excalidraw-clone/tools test`
Expected: FAIL — `endBinding` is null (arrow tool does not bind yet).

- [ ] **Step 3: Implement binding in the linear reducer**

In `packages/tools/src/tools/linear.ts`:

1. Add imports at the top:

```ts
import { BINDING_GAP, bindingTargetAt } from "@excalidraw-clone/scene"
import type { ExcalidrawArrowElement } from "@excalidraw-clone/scene"
```

2. Extend `LinearState`:

```ts
export type LinearState =
  | { phase: "idle" }
  | {
      phase: "drawing"
      start: Point
      current: Point
      elementId: string
      startBindId: string | null
      endBindId: string | null
    }
```

3. Add binding helpers near the other module-private helpers:

```ts
const addBackRef = (draft: ExcalidrawElement[], targetId: string, arrowId: string): void => {
  const j = draft.findIndex((e) => e.id === targetId)
  if (j < 0) return
  const t = draft[j]!
  const existing = t.boundElements ?? []
  if (existing.some((b) => b.id === arrowId)) return
  draft[j] = { ...t, boundElements: [...existing, { id: arrowId, type: "arrow" }] }
}

const bindIdAt = (
  at: Point,
  bindTargets: readonly ExcalidrawElement[] | undefined,
): string | null => (bindTargets ? (bindingTargetAt(at, bindTargets)?.id ?? null) : null)
```

4. Add `bindTargets?: readonly ExcalidrawElement[]` to `LinearReducerArgs` and thread it through:

```ts
interface LinearReducerArgs {
  state: LinearState
  event: /* unchanged */
  modifiers: Modifiers
  factory: (start: Point) => ExcalidrawElement
  bindTargets?: readonly ExcalidrawElement[]
}
```

5. In `linearReduce`, idle + `pointerDown` — set the candidate ids in state:

```ts
if (event.type === "pointerDown") {
  const element = factory(event.at)
  const next: LinearState = {
    phase: "drawing",
    start: event.at,
    current: event.at,
    elementId: element.id,
    startBindId: bindIdAt(event.at, bindTargets),
    endBindId: null,
  }
  return [
    next,
    [
      {
        kind: "mutation",
        apply: (draft) => {
          draft.push(element)
        },
        skipHistory: true,
      },
    ],
  ]
}
```

6. `pointerMove` — update `endBindId` for the highlight (keep the existing patch mutation):

```ts
    case "pointerMove": {
      const end = modifiers.shift ? constrainAngle(state.start, event.at) : event.at
      const id = state.elementId
      const patch = linearPatch(state.start, end)
      return [
        { ...state, current: end, endBindId: bindIdAt(end, bindTargets) },
        [{ kind: "mutation", apply: (draft) => replaceElement(draft, id, patch), skipHistory: true }],
      ]
    }
```

7. `pointerUp` (the non-zero branch) — set bindings + back-refs in the commit mutation:

```ts
    case "pointerUp": {
      const end = modifiers.shift ? constrainAngle(state.start, event.at) : event.at
      const id = state.elementId
      const patch = linearPatch(state.start, end)
      const next: LinearState = { phase: "idle" }
      const zero = end.x === state.start.x && end.y === state.start.y
      if (zero) {
        return [next, [{ kind: "mutation", apply: (draft) => removeElement(draft, id), skipHistory: true }]]
      }
      const startBindId = state.startBindId
      const endBindId = bindIdAt(end, bindTargets)
      return [
        next,
        [
          {
            kind: "mutation",
            apply: (draft) => {
              const i = draft.findIndex((e) => e.id === id)
              if (i < 0) return
              let arrow = { ...draft[i]!, ...patch } as ExcalidrawArrowElement
              if (startBindId) {
                arrow = { ...arrow, startBinding: { elementId: startBindId, focus: 0, gap: BINDING_GAP } }
                addBackRef(draft, startBindId, id)
              }
              if (endBindId) {
                arrow = { ...arrow, endBinding: { elementId: endBindId, focus: 0, gap: BINDING_GAP } }
                addBackRef(draft, endBindId, id)
              }
              draft[i] = arrow
            },
          },
          { kind: "select", ids: [id] },
          { kind: "switchTool", tool: "selection" },
        ],
      ]
    }
```

8. `escape` — unchanged. Note the `idle` early-return path (`return [state, []]`) is unchanged.

In `packages/tools/src/tools/arrow.ts`, pass `bindTargets`:

```ts
  reduce(state, event, ctx: ToolContext) {
    return linearReduce({
      state,
      event,
      modifiers: ctx.modifiers,
      factory: (start) => newArrow({ x: start.x, y: start.y }),
      bindTargets: ctx.readElements(),
    })
  },
```

Leave `packages/tools/src/tools/line.ts` unchanged (no `bindTargets` → never binds).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @excalidraw-clone/tools test && pnpm --filter @excalidraw-clone/tools typecheck`
Expected: PASS (arrow-binding cases + existing linear/line tests still green).

- [ ] **Step 5: Commit**

```bash
git add packages/tools/src/tools/linear.ts packages/tools/src/tools/arrow.ts packages/tools/test/arrow-binding.test.ts
git commit -m "$(cat <<'EOF'
tools: arrow binds to shapes on draw (start/end binding + back-references)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Unbind on arrow-body move

When an arrow is dragged, clear any binding whose target is not also moving (and remove the back-reference). Keep bindings when the target moves with the arrow.

**Files:**

- Modify: `packages/tools/src/tools/selection/drag.ts` (`translateElements`)
- Modify: `packages/tools/test/selection-drag.test.ts` (add unbind cases)

**Interfaces:**

- Consumes: `ExcalidrawArrowElement` from `@excalidraw-clone/scene`.
- Produces: `translateElements` additionally unbinds arrows dragged away from their targets. Signature unchanged: `translateElements(draft, ids, dx, dy)`.

- [ ] **Step 1: Write the failing test**

Append to `packages/tools/test/selection-drag.test.ts` (reuse its existing imports; add `newRectangle`, `newArrow`, and `ExcalidrawArrowElement` if missing):

```ts
import { newArrow, newRectangle } from "@excalidraw-clone/scene"
import type { ExcalidrawArrowElement, ExcalidrawElement } from "@excalidraw-clone/scene"
import { translateElements } from "../src/tools/selection/drag"
import { BINDING_GAP } from "@excalidraw-clone/scene"

const makeBoundPair = (): ExcalidrawElement[] => {
  const target = {
    ...newRectangle({ x: 400, y: 0, width: 100, height: 100 }),
    id: "t",
    boundElements: [{ id: "ar", type: "arrow" as const }],
  }
  const arrow: ExcalidrawArrowElement = {
    ...newArrow({ x: 0, y: 50 }),
    id: "ar",
    points: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
    width: 100,
    height: 0,
    endBinding: { elementId: "t", focus: 0, gap: BINDING_GAP },
  }
  return [target, arrow]
}

describe("translateElements — binding teardown", () => {
  it("unbinds an arrow dragged alone and clears the back-reference", () => {
    const draft = makeBoundPair()
    translateElements(draft, ["ar"], 10, 10)
    const arrow = draft.find((e) => e.id === "ar") as ExcalidrawArrowElement
    const target = draft.find((e) => e.id === "t")!
    expect(arrow.endBinding).toBeNull()
    expect(target.boundElements ?? []).toHaveLength(0)
  })

  it("keeps the binding when arrow and target move together", () => {
    const draft = makeBoundPair()
    translateElements(draft, ["ar", "t"], 10, 10)
    const arrow = draft.find((e) => e.id === "ar") as ExcalidrawArrowElement
    expect(arrow.endBinding?.elementId).toBe("t")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @excalidraw-clone/tools test`
Expected: FAIL — `endBinding` still set after a solo arrow drag.

- [ ] **Step 3: Implement unbind in `translateElements`**

Replace the body of `translateElements` in `packages/tools/src/tools/selection/drag.ts`:

```ts
import type { ExcalidrawArrowElement, ExcalidrawElement } from "@excalidraw-clone/scene"

const removeBackRef = (draft: ExcalidrawElement[], targetId: string, arrowId: string): void => {
  const j = draft.findIndex((e) => e.id === targetId)
  if (j < 0) return
  const t = draft[j]!
  if (!t.boundElements) return
  draft[j] = { ...t, boundElements: t.boundElements.filter((b) => b.id !== arrowId) }
}

const unbindMovedArrow = (
  draft: ExcalidrawElement[],
  arrow: ExcalidrawArrowElement,
  movedIds: ReadonlySet<string>,
): ExcalidrawArrowElement => {
  let startBinding = arrow.startBinding
  let endBinding = arrow.endBinding
  if (startBinding && !movedIds.has(startBinding.elementId)) {
    removeBackRef(draft, startBinding.elementId, arrow.id)
    startBinding = null
  }
  if (endBinding && !movedIds.has(endBinding.elementId)) {
    removeBackRef(draft, endBinding.elementId, arrow.id)
    endBinding = null
  }
  if (startBinding === arrow.startBinding && endBinding === arrow.endBinding) return arrow
  return { ...arrow, startBinding, endBinding }
}

export const translateElements = (
  draft: ExcalidrawElement[],
  ids: readonly string[],
  dx: number,
  dy: number,
): void => {
  if (dx === 0 && dy === 0) return
  const movedIds = new Set(ids)
  for (let i = 0; i < draft.length; i += 1) {
    const e = draft[i]!
    if (!movedIds.has(e.id)) continue
    let next: ExcalidrawElement = { ...e, x: e.x + dx, y: e.y + dy }
    if (next.type === "arrow") {
      next = unbindMovedArrow(draft, next, movedIds)
    }
    draft[i] = next
  }
}
```

(Keep the existing `Point` / `ToolEffect` imports and the other `buildDrag*` exports in the file as-is.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @excalidraw-clone/tools test && pnpm --filter @excalidraw-clone/tools typecheck`
Expected: PASS (new unbind cases + existing drag tests green).

- [ ] **Step 5: Commit**

```bash
git add packages/tools/src/tools/selection/drag.ts packages/tools/test/selection-drag.test.ts
git commit -m "$(cat <<'EOF'
tools: unbind an arrow dragged away from its target (keep when moved together)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Renderer — binding-candidate highlight

`drawSelectionChrome` accepts highlight ids; `CanvasRenderer` exposes `setBindingHighlight`.

**Files:**

- Modify: `packages/renderer/src/overlay.ts` (`drawSelectionChrome` gains `highlightIds`; add highlight stroke)
- Modify: `packages/renderer/src/renderer.ts` (field, `setBindingHighlight`, pass-through)
- Modify: `packages/renderer/test/overlay.test.ts` (add a highlight case)

**Interfaces:**

- Consumes: `getElementBounds` (already used in overlay), `sceneToViewport`.
- Produces:
  - `drawSelectionChrome(ctx, canvas, selection, elements, view, theme, marquee, highlightIds, options)` — new `highlightIds: readonly string[]` parameter inserted **before** `options`.
  - `CanvasRenderer.setBindingHighlight(ids: readonly string[]): void`.

- [ ] **Step 1: Write the failing test**

Open `packages/renderer/test/overlay.test.ts` and mirror its existing setup (it constructs a 2D context — reuse that helper). Add:

```ts
it("strokes a highlight box for each highlighted element id", () => {
  // Reuse the file's existing ctx/canvas/element fixtures.
  const calls: string[] = []
  const ctx = makeRecordingCtx(calls) // use the existing recording-context helper in this file
  const el = { ...baseRectFixture, id: "h", x: 0, y: 0, width: 100, height: 100 }
  drawSelectionChrome(
    ctx,
    canvasFixture,
    [], // no selection
    [el],
    identityView,
    "light",
    null, // no marquee
    ["h"], // highlightIds
    { clearBackground: true },
  )
  expect(calls).toContain("strokeRect")
})
```

If `overlay.test.ts` does not already expose a recording-context helper, copy the pattern it uses for the existing `drawSelectionChrome` test and assert that `strokeRect` (or the existing chrome's stroke call) fires for the highlighted id. The key assertion: passing a non-empty `highlightIds` for an element not in `selection` still produces a stroke.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @excalidraw-clone/renderer test`
Expected: FAIL — `drawSelectionChrome` has the wrong arity / no highlight drawing.

- [ ] **Step 3: Implement the highlight**

In `packages/renderer/src/overlay.ts`:

1. Add a highlight color constant near the existing `SELECTION_STROKE`:

```ts
const BINDING_HIGHLIGHT: Record<Theme, string> = {
  light: "#6965db",
  dark: "#a8a5ff",
}
```

2. Change the `drawSelectionChrome` signature to insert `highlightIds` before `options`:

```ts
export const drawSelectionChrome = (
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  selection: readonly string[],
  elements: readonly ExcalidrawElement[],
  view: ViewTransform,
  theme: Theme,
  marquee: MarqueeBox | null,
  highlightIds: readonly string[],
  options: DrawSelectionChromeOptions,
): void => {
```

3. After the `clearBackground` clear and before/after the selection loop, draw highlights (use `getElementBounds` + `sceneToViewport`, both already imported in this file):

```ts
if (highlightIds.length > 0) {
  const byId = new Map(elements.map((e) => [e.id, e]))
  for (const id of highlightIds) {
    const e = byId.get(id)
    if (!e) continue
    const b = getElementBounds(e)
    const tl = sceneToViewport({ x: b.x, y: b.y }, view)
    const br = sceneToViewport({ x: b.x + b.width, y: b.y + b.height }, view)
    ctx.setLineDash([])
    ctx.strokeStyle = BINDING_HIGHLIGHT[theme]
    ctx.lineWidth = 2
    ctx.strokeRect(tl.x - 2, tl.y - 2, br.x - tl.x + 4, br.y - tl.y + 4)
  }
}
```

In `packages/renderer/src/renderer.ts`:

1. Add the field with the other overlay state:

```ts
  private highlight: readonly string[] = []
```

2. Add the setter next to `setSelection`:

```ts
  setBindingHighlight(ids: readonly string[]): void {
    this.highlight = ids
    this.requestRedraw()
  }
```

3. Pass `this.highlight` in BOTH `drawSelectionChrome` calls inside `renderSelection`, before the `{ clearBackground }` arg:

```ts
// overlay branch
drawSelectionChrome(
  this.overlayCtx,
  this.overlayCanvas,
  this.selection,
  elements,
  this.viewTransform,
  this.theme,
  this.marquee,
  this.highlight,
  { clearBackground: true },
)
```

```ts
// main-canvas branch
if (this.selection.length === 0 && !this.marquee && this.highlight.length === 0) return
drawSelectionChrome(
  this.ctx,
  this.canvas,
  this.selection,
  elements,
  this.viewTransform,
  this.theme,
  this.marquee,
  this.highlight,
  { clearBackground: false },
)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @excalidraw-clone/renderer test && pnpm --filter @excalidraw-clone/renderer typecheck`
Expected: PASS. If other tests call `drawSelectionChrome` directly, update those calls to pass `[]` for `highlightIds`.

- [ ] **Step 5: Commit**

```bash
git add packages/renderer/src/overlay.ts packages/renderer/src/renderer.ts packages/renderer/test/overlay.test.ts
git commit -m "$(cat <<'EOF'
renderer: draw a binding-candidate highlight via setBindingHighlight

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Web wiring + e2e (follow-on-move)

Drive the highlight from arrow-tool state in the dispatch loop, and prove the end-to-end follow-on-move behavior with Playwright.

**Files:**

- Modify: `apps/web/src/driver/useDrawingDriver.ts` (highlight from tool state)
- Create: `apps/web/e2e/arrow-binding.spec.ts`

**Interfaces:**

- Consumes: `LinearState` from `@excalidraw-clone/tools`; `renderer.setBindingHighlight` from Task 7.
- Produces: live binding highlight while drawing an arrow; e2e coverage.

- [ ] **Step 1: Write the failing e2e test**

Create `apps/web/e2e/arrow-binding.spec.ts`:

```ts
import { expect, test } from "@playwright/test"
import { dragOnCanvas } from "./_helpers"

type SceneEl = {
  id: string
  type: string
  x: number
  points?: { x: number; y: number }[]
  isDeleted?: boolean
}

const readScene = async (page: import("@playwright/test").Page): Promise<SceneEl[]> => {
  const json = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  const data = JSON.parse(json!) as { elements: SceneEl[] }
  return data.elements.filter((e) => !e.isDeleted)
}

const arrowEndX = (els: SceneEl[]): number => {
  const a = els.find((e) => e.type === "arrow")!
  const last = a.points![a.points!.length - 1]!
  return a.x + last.x
}

test("a bound arrow follows its target shape when the shape moves", async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-rectangle"]').waitFor({ state: "visible" })

  // Rect A (left) and Rect B (right).
  await page.locator('[data-testid="toolbar-rectangle"]').click()
  await dragOnCanvas(page, { x: 100, y: 200 }, { x: 200, y: 300 })
  await page.locator('[data-testid="toolbar-rectangle"]').click()
  await dragOnCanvas(page, { x: 500, y: 200 }, { x: 600, y: 300 })

  // Arrow from inside A to inside B (binds both ends).
  await page.locator('[data-testid="toolbar-arrow"]').click()
  await dragOnCanvas(page, { x: 150, y: 250 }, { x: 550, y: 250 })

  await page.waitForTimeout(700)
  const before = await readScene(page)
  const beforeEndX = arrowEndX(before)

  // Drag B to the right (selection tool is active after the arrow auto-switch).
  // Click a spot inside B that is clear of the arrow line (y=250), e.g. (580,290).
  await dragOnCanvas(page, { x: 580, y: 290 }, { x: 780, y: 290 })

  await page.waitForTimeout(700)
  const after = await readScene(page)
  expect(arrowEndX(after)).toBeGreaterThan(beforeEndX)
})
```

- [ ] **Step 2: Run the e2e to verify it fails (or is flaky without highlight wiring)**

Run: `pnpm --filter @excalidraw-clone/web exec playwright test e2e/arrow-binding.spec.ts`
Expected: The follow-on-move assertion may already PASS (reconcile is wired). If so, this test still guards the behavior — proceed to wire the highlight in Step 3 and re-run. If the project's e2e command differs, use the same invocation the existing specs use (check `apps/web/package.json` scripts).

- [ ] **Step 3: Wire the highlight from arrow-tool state**

In `apps/web/src/driver/useDrawingDriver.ts`, import the state type:

```ts
import type { LinearState } from "@excalidraw-clone/tools"
```

In the `dispatch` function, right after `applyEffects(scene, effects)`:

```ts
applyEffects(scene, effects)
if (toolName === "arrow" && (next as LinearState).phase === "drawing") {
  const cand = (next as Extract<LinearState, { phase: "drawing" }>).endBindId
  renderer.setBindingHighlight(cand ? [cand] : [])
} else {
  renderer.setBindingHighlight([])
}
```

`renderer` is the instance created at the top of this effect (`const renderer = new CanvasRenderer(...)`). If `dispatch` cannot see `renderer` in its closure, use `rendererRef.current?.setBindingHighlight(...)` instead.

- [ ] **Step 4: Run the e2e + the web build/typecheck**

Run: `pnpm --filter @excalidraw-clone/web typecheck && pnpm --filter @excalidraw-clone/web exec playwright test e2e/arrow-binding.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/driver/useDrawingDriver.ts apps/web/e2e/arrow-binding.spec.ts
git commit -m "$(cat <<'EOF'
web: highlight binding candidate while drawing; e2e for arrow follow-on-move

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Full-gate verification

Run the whole monorepo gate to confirm nothing regressed across packages.

**Files:** none (verification only).

- [ ] **Step 1: Lint**

Run: `pnpm lint`
Expected: PASS.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Unit tests (all packages)**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 4: Build**

Run: `pnpm build`
Expected: PASS.

- [ ] **Step 5: Format check**

Run: `pnpm format:check`
Expected: PASS. If it fails, run `pnpm format` and amend the last commit.

- [ ] **Step 6: e2e (full suite)**

Run the project's standard e2e command (the same one used for the existing specs).
Expected: PASS, including `arrow-binding.spec.ts`.

---

## Notes for the implementer

- **Reconcile order matters:** `reconcileBindings` runs _after_ `reconcileBoundText` in `scene.mutate` so note containers are final-sized before arrows attach to them. Do not reorder.
- **Idempotency:** `reconcileBindings` must produce the same result when run twice — Task 3 tests this. The two-bound-ends case uses each target's _center_ as the "toward" reference (not the recomputed edge points), which keeps it stable in a single pass.
- **No upward imports:** `tools` and `renderer` import from `scene`/`geometry`, never the reverse.
- **Deferred (do NOT build):** endpoint-drag rebinding, re-reconcile on `loadFromJSON`, and the perpendicular `focus` offset. See the design spec.
- **Structural sharing:** never mutate elements in place; always replace with a new object in the draft (the codebase relies on reference comparison).
