# Phase 2: `@excalidraw-clone/geometry` Implementation Plan

> Inline execution. Each task ends with a commit on `develop`. TDD-style: failing test first, then implementation.

**Goal:** Implement the pure-math primitives that every other package will lean on: vector ops, rotation, AABB bounds, shape hit-tests, segment distance, and viewport ↔ scene coordinate transforms.

**Architecture constraint:** `geometry` imports nothing (per spec § 4). Pure functions, fully tree-shakable, deterministic, side-effect free.

**Tech:** TypeScript strict, Vitest table-driven tests. No new dependencies.

**Spec reference:** `docs/superpowers/specs/2026-04-28-excalidraw-clone-design.md` § 3 (coordinates), § 4 (boundaries), § 11 (testing strategy: "hit-test, bbox, rotation: pure math, table-driven").

**Working branch:** `develop`. Every task ends with a commit.

**Out of scope (deferred to scene or later phases):**

- Element-specific hit-tests that pull bounds/angle out of an `ExcalidrawElement` (lives in scene).
- Snap-to-grid (lives in tools).
- Stroke-aware hit-test thresholds tied to per-element `strokeWidth` (geometry exposes the primitive; scene/tools apply it).

---

## Task 1: Core types + barrel export skeleton

Set up `Point`, `Vector`, `Bounds`, `LineSegment`, `ViewTransform`. Wire them through `index.ts`.

**Files:**

- Create: `packages/geometry/src/types.ts`
- Modify: `packages/geometry/src/index.ts`
- Create: `packages/geometry/test/types.test.ts`

- [ ] **Step 1:** `packages/geometry/src/types.ts`

```ts
export interface Point {
  readonly x: number
  readonly y: number
}

export type Vector = Point

export interface Bounds {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export type LineSegment = readonly [Point, Point]

export interface ViewTransform {
  readonly scrollX: number
  readonly scrollY: number
  readonly zoom: number
}
```

- [ ] **Step 2:** Modify `packages/geometry/src/index.ts`

```ts
export { PACKAGE_NAME, PACKAGE_VERSION } from "./version"
export type { Point, Vector, Bounds, LineSegment, ViewTransform } from "./types"
```

- [ ] **Step 3:** `packages/geometry/test/types.test.ts` — type-level smoke (no runtime assertions; just verify the types compile when used).

```ts
import { describe, it, expect } from "vitest"
import type { Bounds, LineSegment, Point, Vector, ViewTransform } from "../src"

describe("geometry types", () => {
  it("Point literal is assignable", () => {
    const p: Point = { x: 1, y: 2 }
    expect(p.x + p.y).toBe(3)
  })

  it("Vector is structurally identical to Point", () => {
    const v: Vector = { x: 1, y: 0 }
    const p: Point = v
    expect(p).toBe(v)
  })

  it("Bounds literal is assignable", () => {
    const b: Bounds = { x: 0, y: 0, width: 10, height: 5 }
    expect(b.width * b.height).toBe(50)
  })

  it("LineSegment is a readonly tuple of two points", () => {
    const seg: LineSegment = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ]
    expect(seg).toHaveLength(2)
  })

  it("ViewTransform literal is assignable", () => {
    const t: ViewTransform = { scrollX: 0, scrollY: 0, zoom: 1 }
    expect(t.zoom).toBe(1)
  })
})
```

- [ ] **Step 4:** Run tests + typecheck.

```bash
pnpm --filter @excalidraw-clone/geometry test
pnpm --filter @excalidraw-clone/geometry typecheck
```

Expected: all tests pass (2 from version smoke + 5 new = **7 tests**).

- [ ] **Step 5:** Commit.

```bash
git add packages/geometry
git commit -m "Phase 2.1: geometry core types"
```

---

## Task 2: Vector math

Vector add/subtract/scale, distance, dot, cross, length, normalize.

**Files:**

- Create: `packages/geometry/src/vector.ts`
- Modify: `packages/geometry/src/index.ts`
- Create: `packages/geometry/test/vector.test.ts`

- [ ] **Step 1:** `vector.ts`

```ts
import type { Point, Vector } from "./types"

export const pointAdd = (a: Point, b: Vector): Point => ({ x: a.x + b.x, y: a.y + b.y })
export const pointSubtract = (a: Point, b: Point): Vector => ({ x: a.x - b.x, y: a.y - b.y })
export const pointScale = (p: Point, s: number): Point => ({ x: p.x * s, y: p.y * s })

export const dot = (a: Vector, b: Vector): number => a.x * b.x + a.y * b.y
export const cross = (a: Vector, b: Vector): number => a.x * b.y - a.y * b.x

export const vectorLength = (v: Vector): number => Math.hypot(v.x, v.y)
export const vectorLengthSq = (v: Vector): number => v.x * v.x + v.y * v.y

export const pointDistance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y)
export const pointDistanceSq = (a: Point, b: Point): number => {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return dx * dx + dy * dy
}

export const normalize = (v: Vector): Vector => {
  const len = vectorLength(v)
  if (len === 0) return { x: 0, y: 0 }
  return { x: v.x / len, y: v.y / len }
}
```

- [ ] **Step 2:** Re-export from `index.ts`.

```ts
export * from "./vector"
```

(keep prior exports)

- [ ] **Step 3:** Table-driven tests covering: zero-vectors, axis-aligned, 3-4-5 triangle, negative components, normalize-of-zero.

- [ ] **Step 4:** Run + typecheck. Commit.

```
Phase 2.2: vector math primitives
```

---

## Task 3: Scalar utilities

`clamp`, `lerp`, `degToRad`, `radToDeg`.

**Files:**

- Create: `packages/geometry/src/scalar.ts`
- Modify: `packages/geometry/src/index.ts`
- Create: `packages/geometry/test/scalar.test.ts`

```ts
export const clamp = (v: number, min: number, max: number): number =>
  v < min ? min : v > max ? max : v
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
export const degToRad = (d: number): number => (d * Math.PI) / 180
export const radToDeg = (r: number): number => (r * 180) / Math.PI
```

Tests: clamp covers below/inside/above; lerp covers t=0/0.5/1/extrapolation; deg↔rad round-trip.

```
Phase 2.3: scalar utilities
```

---

## Task 4: Rotation

`rotatePoint(p, center, angleRad)`.

**Files:**

- Create: `packages/geometry/src/rotation.ts`
- Modify: `packages/geometry/src/index.ts`
- Create: `packages/geometry/test/rotation.test.ts`

```ts
import type { Point } from "./types"

export const rotatePoint = (p: Point, center: Point, angle: number): Point => {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const dx = p.x - center.x
  const dy = p.y - center.y
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  }
}
```

Tests: 0 / π/2 / π / -π/2 / 2π around origin and around non-origin centers; verify floating-point with `toBeCloseTo`.

```
Phase 2.4: point rotation
```

---

## Task 5: Bounds primitives

`boundsContainsPoint`, `boundsIntersect`, `boundsContains`, `boundsFromPoints`, `boundsCenter`, `boundsExpand`.

**Files:**

- Create: `packages/geometry/src/bounds.ts`
- Modify: `packages/geometry/src/index.ts`
- Create: `packages/geometry/test/bounds.test.ts`

```ts
import type { Bounds, Point } from "./types"

export const boundsContainsPoint = (b: Bounds, p: Point): boolean =>
  p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height

export const boundsIntersect = (a: Bounds, b: Bounds): boolean =>
  !(a.x + a.width < b.x || b.x + b.width < a.x || a.y + a.height < b.y || b.y + b.height < a.y)

export const boundsContains = (outer: Bounds, inner: Bounds): boolean =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.width <= outer.x + outer.width &&
  inner.y + inner.height <= outer.y + outer.height

export const boundsFromPoints = (points: readonly Point[]): Bounds => {
  if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 }
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

export const boundsCenter = (b: Bounds): Point => ({
  x: b.x + b.width / 2,
  y: b.y + b.height / 2,
})

export const boundsExpand = (b: Bounds, padding: number): Bounds => ({
  x: b.x - padding,
  y: b.y - padding,
  width: b.width + padding * 2,
  height: b.height + padding * 2,
})
```

Tests: edge-on-boundary inclusion, fully-disjoint vs. touching vs. overlapping, empty point list, single point, padding negative + positive.

```
Phase 2.5: bounds primitives
```

---

## Task 6: Shape hit-tests

`pointInRectangle`, `pointInRotatedRectangle`, `pointInEllipse`, `pointInDiamond`.

All take a point in scene coords, an axis-aligned `Bounds`, and an `angle` (radians; 0 = no rotation). For rotated tests we transform the point into element-local space (center at origin) and apply the un-rotated test.

**Files:**

- Create: `packages/geometry/src/hit-test.ts`
- Modify: `packages/geometry/src/index.ts`
- Create: `packages/geometry/test/hit-test.test.ts`

```ts
import type { Bounds, Point } from "./types"
import { rotatePoint } from "./rotation"
import { boundsCenter, boundsContainsPoint } from "./bounds"

const toLocal = (p: Point, b: Bounds, angle: number): Point => {
  if (angle === 0) return p
  return rotatePoint(p, boundsCenter(b), -angle)
}

export const pointInRectangle = (p: Point, b: Bounds, angle = 0): boolean =>
  boundsContainsPoint(b, toLocal(p, b, angle))

export const pointInRotatedRectangle = pointInRectangle

export const pointInEllipse = (p: Point, b: Bounds, angle = 0): boolean => {
  const local = toLocal(p, b, angle)
  const cx = b.x + b.width / 2
  const cy = b.y + b.height / 2
  const rx = b.width / 2
  const ry = b.height / 2
  if (rx === 0 || ry === 0) return false
  const nx = (local.x - cx) / rx
  const ny = (local.y - cy) / ry
  return nx * nx + ny * ny <= 1
}

export const pointInDiamond = (p: Point, b: Bounds, angle = 0): boolean => {
  const local = toLocal(p, b, angle)
  const cx = b.x + b.width / 2
  const cy = b.y + b.height / 2
  const rx = b.width / 2
  const ry = b.height / 2
  if (rx === 0 || ry === 0) return false
  return Math.abs(local.x - cx) / rx + Math.abs(local.y - cy) / ry <= 1
}
```

Tests:

- Rectangle: inside / on edge / outside / corner; rotated 90° flips x/y inclusion.
- Ellipse: center inside; cardinal axis-extreme on boundary; just-outside boundary; degenerate zero-size returns false.
- Diamond: center inside; midpoint of each edge on boundary; corners just outside.
- All three: rotated cases verified by feeding a point that should be excluded under rotation but included under axis-aligned, and vice versa.

```
Phase 2.6: shape hit-tests (rectangle, ellipse, diamond)
```

---

## Task 7: Segment distance

`distancePointToSegment(p, a, b)`, `pointOnSegment(p, a, b, threshold)`.

**Files:**

- Create: `packages/geometry/src/segment.ts`
- Modify: `packages/geometry/src/index.ts`
- Create: `packages/geometry/test/segment.test.ts`

```ts
import type { Point } from "./types"
import { pointDistance, pointDistanceSq } from "./vector"

export const distancePointToSegment = (p: Point, a: Point, b: Point): number => {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return pointDistance(p, a)
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq
  t = t < 0 ? 0 : t > 1 ? 1 : t
  const projX = a.x + t * dx
  const projY = a.y + t * dy
  return Math.hypot(p.x - projX, p.y - projY)
}

export const pointOnSegment = (p: Point, a: Point, b: Point, threshold: number): boolean =>
  distancePointToSegment(p, a, b) <= threshold
```

Tests: zero-length segment, perpendicular distance, off-end clamping, threshold edge-cases.

Use `pointDistanceSq` import only if needed; remove unused.

```
Phase 2.7: segment distance + hit-test
```

---

## Task 8: Viewport transforms

`sceneToViewport`, `viewportToScene`. Per spec § 3:

```
viewport = (scene + scroll) * zoom    // conceptually
scene    = viewport / zoom - scroll
```

We follow the same convention as upstream Excalidraw: `scrollX/scrollY` are the scene-coord origin offset; `zoom` is a multiplicative scale.

**Files:**

- Create: `packages/geometry/src/transform.ts`
- Modify: `packages/geometry/src/index.ts`
- Create: `packages/geometry/test/transform.test.ts`

```ts
import type { Point, ViewTransform } from "./types"

export const sceneToViewport = (p: Point, t: ViewTransform): Point => ({
  x: (p.x + t.scrollX) * t.zoom,
  y: (p.y + t.scrollY) * t.zoom,
})

export const viewportToScene = (p: Point, t: ViewTransform): Point => ({
  x: p.x / t.zoom - t.scrollX,
  y: p.y / t.zoom - t.scrollY,
})
```

Tests: identity transform (scrollX=0, scrollY=0, zoom=1); pure scroll; pure zoom; combined; round-trip `viewportToScene(sceneToViewport(p)) ≈ p` for arbitrary points.

```
Phase 2.8: viewport ↔ scene transforms
```

---

## Task 9: Final integration

- [ ] **Step 1:** Run the full pipeline.

```bash
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Expected: every command exits 0. Test count is up — total across the workspace should be **previous (18) + ~50–60 from geometry's new tests**. Exact number depends on table sizes; the requirement is that no test fails.

- [ ] **Step 2:** Verify the boundary rule still passes (geometry imports nothing else).

```bash
pnpm --filter @excalidraw-clone/geometry lint
```

- [ ] **Step 3:** Push.

```bash
git push origin develop
```

---

## Done criteria

Phase 2 is complete when:

1. `@excalidraw-clone/geometry` exports the API listed above.
2. `pnpm test` is green; geometry contributes the bulk of the new tests.
3. `pnpm typecheck`, `pnpm lint`, `pnpm build` are green.
4. The package still imports nothing else (verifiable: no `dependencies` block in `packages/geometry/package.json` beyond what was set in Phase 1).
5. All Phase 2 commits land on `origin/develop`.

## Not in Phase 2

- Element-aware hit-tests (those compose geometry + element shape; lives in scene).
- Bezier / freedraw simplification.
- Snap-to-grid rounding helpers (lives in tools when grid lands).
- Cubic / quadratic Bézier hit-test (only needed once arrows curve in v1.1).
