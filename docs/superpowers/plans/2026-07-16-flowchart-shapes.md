# Flowchart Shapes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three new first-class element types — triangle, parallelogram, hexagon — drawable from the toolbar, with exact polygon edge binding for smart arrows.

**Architecture:** One new geometry module (`polygon.ts`) is the single source of truth for vertices, point-in-polygon, and ray-to-edge intersection; scene, renderer, and bindings all consume it. Everything else is the established per-shape pattern: type + factory (scene), one shared rough polygon generator (renderer — SVG export flows through `generateShape` automatically), 10-line `shapeReduce` tool wrappers (tools), toolbar buttons + i18n (ui/web).

**Tech Stack:** TypeScript monorepo (pnpm + turbo), roughjs, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-16-flowchart-shapes-design.md`

## Global Constraints

- No new dependencies.
- Vertex conventions (box `w × h`, origin at box top-left):
  - triangle `(w/2, 0), (w, h), (0, h)`
  - parallelogram `(w/4, 0), (w, 0), (3w/4, h), (0, h)`
  - hexagon `(w/4, 0), (3w/4, 0), (w, h/2), (3w/4, h), (w/4, h), (0, h/2)`
- Shortcuts: `3` triangle, `G` parallelogram, `6` hexagon (plain keys; `Ctrl+G` group unaffected).
- Testids: `toolbar-triangle`, `toolbar-parallelogram`, `toolbar-hexagon` (generated from tool name).
- i18n keys in **both** `en` and `ko`: `toolbar.triangle|parallelogram|hexagon` (common.json) and `triangle|parallelogram|hexagon` (shortcuts.json). Korean: 삼각형 / 평행사변형 / 육각형.
- All three types join `BINDABLE_TYPES`; arrow endpoints land on actual polygon edges via `polygonEdgePointToward`.
- Commit style: `<package>: <summary>`.
- All commands run from the repo root `/home/sung/excalidraw-clone`.

---

### Task 1: Geometry — polygon module

**Files:**

- Create: `packages/geometry/test/polygon.test.ts`
- Create: `packages/geometry/src/polygon.ts`
- Modify: `packages/geometry/src/index.ts` (add exports after the `./binding-edge` exports)

**Interfaces:**

- Consumes: `Bounds`, `Point` from `./types`; `rotatePoint` from `./rotation`; `boundsCenter` from `./bounds`.
- Produces (all exported from `@excalidraw-clone/geometry`):
  - `type PolygonShapeKind = "triangle" | "parallelogram" | "hexagon"`
  - `shapeVertices(kind: PolygonShapeKind, b: Bounds): Point[]` — absolute vertices
  - `pointInConvexPolygon(p: Point, vertices: readonly Point[], center: Point, angle?: number): boolean`
  - `polygonEdgePointToward(vertices: readonly Point[], bounds: Bounds, toward: Point): Point`

- [ ] **Step 1: Write the failing test**

Create `packages/geometry/test/polygon.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { boundsCenter } from "../src/bounds"
import { pointInConvexPolygon, polygonEdgePointToward, shapeVertices } from "../src/polygon"
import type { Bounds } from "../src/types"

const box: Bounds = { x: 0, y: 0, width: 100, height: 60 }

describe("shapeVertices", () => {
  it("triangle: apex top-center, base bottom", () => {
    expect(shapeVertices("triangle", box)).toEqual([
      { x: 50, y: 0 },
      { x: 100, y: 60 },
      { x: 0, y: 60 },
    ])
  })

  it("parallelogram: right-leaning with 25% skew", () => {
    expect(shapeVertices("parallelogram", box)).toEqual([
      { x: 25, y: 0 },
      { x: 100, y: 0 },
      { x: 75, y: 60 },
      { x: 0, y: 60 },
    ])
  })

  it("hexagon: flat top/bottom, left/right points, 25% inset", () => {
    expect(shapeVertices("hexagon", box)).toEqual([
      { x: 25, y: 0 },
      { x: 75, y: 0 },
      { x: 100, y: 30 },
      { x: 75, y: 60 },
      { x: 25, y: 60 },
      { x: 0, y: 30 },
    ])
  })

  it("offsets by the bounds origin", () => {
    const shifted = shapeVertices("triangle", { x: 10, y: 20, width: 100, height: 60 })
    expect(shifted[0]).toEqual({ x: 60, y: 20 })
  })
})

describe("pointInConvexPolygon", () => {
  const tri = shapeVertices("triangle", box)
  const center = boundsCenter(box)

  it("hits the centroid area and misses the empty bbox corner", () => {
    expect(pointInConvexPolygon({ x: 50, y: 40 }, tri, center)).toBe(true)
    // top-left corner of the bbox is outside the triangle
    expect(pointInConvexPolygon({ x: 5, y: 5 }, tri, center)).toBe(false)
  })

  it("respects rotation", () => {
    // rotate 180°: the empty corner region moves to the bottom-left
    expect(pointInConvexPolygon({ x: 5, y: 55 }, tri, center, Math.PI)).toBe(false)
    expect(pointInConvexPolygon({ x: 5, y: 5 }, tri, center, Math.PI)).toBe(true)
  })

  it("returns false for degenerate polygons", () => {
    expect(pointInConvexPolygon({ x: 0, y: 0 }, [{ x: 0, y: 0 }], { x: 0, y: 0 })).toBe(false)
  })
})

describe("polygonEdgePointToward", () => {
  it("hexagon: ray to the right exits exactly at the right point", () => {
    const hex = shapeVertices("hexagon", box)
    const p = polygonEdgePointToward(hex, box, { x: 500, y: 30 })
    expect(p.x).toBeCloseTo(100)
    expect(p.y).toBeCloseTo(30)
  })

  it("triangle: upward ray exits on the boundary above the center", () => {
    const tri = shapeVertices("triangle", box)
    const p = polygonEdgePointToward(tri, box, { x: 50, y: -100 })
    expect(p.x).toBeCloseTo(50)
    expect(p.y).toBeCloseTo(0)
  })

  it("triangle: slanted ray lands on the slanted edge, inside the bbox", () => {
    const tri = shapeVertices("triangle", box)
    const p = polygonEdgePointToward(tri, box, { x: 500, y: -170 }) // up-right diagonal
    // must lie strictly inside the bbox width (not the bbox corner)
    expect(p.x).toBeLessThan(100)
    expect(p.y).toBeGreaterThan(0)
    // and on the right slanted edge: from (50,0) to (100,60) → y = (x-50) * 60/50
    expect(p.y).toBeCloseTo(((p.x - 50) * 60) / 50, 5)
  })

  it("degenerate direction falls back to the center", () => {
    const tri = shapeVertices("triangle", box)
    expect(polygonEdgePointToward(tri, box, boundsCenter(box))).toEqual(boundsCenter(box))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @excalidraw-clone/geometry test -- test/polygon.test.ts`
Expected: FAIL — `Failed to load url ../src/polygon`.

- [ ] **Step 3: Write the implementation**

Create `packages/geometry/src/polygon.ts`:

```ts
import { boundsCenter } from "./bounds"
import { rotatePoint } from "./rotation"
import type { Bounds, Point } from "./types"

export type PolygonShapeKind = "triangle" | "parallelogram" | "hexagon"

/** Absolute vertices for a fixed-proportion flowchart shape inside `b`. */
export const shapeVertices = (kind: PolygonShapeKind, b: Bounds): Point[] => {
  const { x, y, width: w, height: h } = b
  switch (kind) {
    case "triangle":
      return [
        { x: x + w / 2, y },
        { x: x + w, y: y + h },
        { x, y: y + h },
      ]
    case "parallelogram":
      return [
        { x: x + w / 4, y },
        { x: x + w, y },
        { x: x + (3 * w) / 4, y: y + h },
        { x, y: y + h },
      ]
    case "hexagon":
      return [
        { x: x + w / 4, y },
        { x: x + (3 * w) / 4, y },
        { x: x + w, y: y + h / 2 },
        { x: x + (3 * w) / 4, y: y + h },
        { x: x + w / 4, y: y + h },
        { x, y: y + h / 2 },
      ]
  }
}

/** Point-in-convex-polygon via same-side half-plane tests. `angle` rotates
 *  the polygon around `center`; the point is un-rotated instead. */
export const pointInConvexPolygon = (
  p: Point,
  vertices: readonly Point[],
  center: Point,
  angle = 0,
): boolean => {
  if (vertices.length < 3) return false
  const local = angle === 0 ? p : rotatePoint(p, center, -angle)
  let sign = 0
  for (let i = 0; i < vertices.length; i += 1) {
    const a = vertices[i]!
    const b = vertices[(i + 1) % vertices.length]!
    const cross = (b.x - a.x) * (local.y - a.y) - (b.y - a.y) * (local.x - a.x)
    if (cross === 0) continue
    const s = cross > 0 ? 1 : -1
    if (sign === 0) sign = s
    else if (s !== sign) return false
  }
  return true
}

/** Intersection of the ray (bounds center → toward) with the polygon
 *  boundary — the polygon analogue of `edgePointToward`. Falls back to the
 *  center for degenerate directions. */
export const polygonEdgePointToward = (
  vertices: readonly Point[],
  bounds: Bounds,
  toward: Point,
): Point => {
  const c = boundsCenter(bounds)
  const dx = toward.x - c.x
  const dy = toward.y - c.y
  if (dx === 0 && dy === 0) return c
  let best: Point | null = null
  let bestT = Infinity
  for (let i = 0; i < vertices.length; i += 1) {
    const a = vertices[i]!
    const b = vertices[(i + 1) % vertices.length]!
    const ex = b.x - a.x
    const ey = b.y - a.y
    const denom = dx * ey - dy * ex
    if (denom === 0) continue
    const t = ((a.x - c.x) * ey - (a.y - c.y) * ex) / denom
    const u = ex !== 0 ? (c.x + t * dx - a.x) / ex : (c.y + t * dy - a.y) / ey
    if (t >= 0 && u >= -1e-9 && u <= 1 + 1e-9 && t < bestT) {
      bestT = t
      best = { x: c.x + t * dx, y: c.y + t * dy }
    }
  }
  return best ?? c
}
```

In `packages/geometry/src/index.ts`, after the `edgePointToward`/`EdgeKind` export lines, add:

```ts
export { pointInConvexPolygon, polygonEdgePointToward, shapeVertices } from "./polygon"
export type { PolygonShapeKind } from "./polygon"
```

- [ ] **Step 4: Run geometry tests to verify they pass**

Run: `pnpm --filter @excalidraw-clone/geometry test`
Expected: PASS (all geometry test files, 12 new tests included).

- [ ] **Step 5: Commit**

```bash
git add packages/geometry/src/polygon.ts packages/geometry/test/polygon.test.ts packages/geometry/src/index.ts
git commit -m "geometry: polygon module — shapeVertices, pointInConvexPolygon, polygonEdgePointToward"
```

---

### Task 2: Scene — types and factories

**Files:**

- Modify: `packages/scene/src/types.ts` (`ElementType` union at line 3; interfaces near `ExcalidrawDiamondElement`; `ExcalidrawElement` union at line 142)
- Modify: `packages/scene/src/factories.ts` (three factories after `newEllipse`)
- Modify: `packages/scene/src/index.ts` (factory + type exports)
- Test: `packages/scene/test/factories.test.ts` (append one test)

**Interfaces:**

- Consumes: `baseElement` helper already in factories.ts.
- Produces: `ElementType` gains `"triangle" | "parallelogram" | "hexagon"`; interfaces `ExcalidrawTriangleElement`, `ExcalidrawParallelogramElement`, `ExcalidrawHexagonElement` (plain base extensions); factories `newTriangle`, `newParallelogram`, `newHexagon` `(input: NewElementInput) => …`, all exported from `@excalidraw-clone/scene`.

- [ ] **Step 1: Write the failing test**

Append to `packages/scene/test/factories.test.ts`:

```ts
describe("flowchart shape factories", () => {
  it("newTriangle/newParallelogram/newHexagon create their types with base defaults", () => {
    const t = newTriangle({ x: 1, y: 2, width: 30, height: 40 })
    const p = newParallelogram({ x: 0, y: 0 })
    const h = newHexagon({ x: 0, y: 0 })
    expect(t.type).toBe("triangle")
    expect(p.type).toBe("parallelogram")
    expect(h.type).toBe("hexagon")
    expect(t.width).toBe(30)
    expect(t.locked).toBe(false)
    expect(h.roundness).toBeNull()
  })
})
```

Add `newTriangle, newParallelogram, newHexagon` to that file's import from `../src/factories` (check the existing import line and extend it).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @excalidraw-clone/scene test -- test/factories.test.ts`
Expected: FAIL — `newTriangle` has no exported member / is not a function.

- [ ] **Step 3: Implement**

In `packages/scene/src/types.ts`:

1. Extend `ElementType`:

```ts
export type ElementType =
  | "rectangle"
  | "diamond"
  | "ellipse"
  | "triangle"
  | "parallelogram"
  | "hexagon"
  | "arrow"
  | "line"
  | "freedraw"
  | "text"
  | "image"
  | "frame"
```

2. After `ExcalidrawEllipseElement`, add:

```ts
export interface ExcalidrawTriangleElement extends ExcalidrawElementBase {
  type: "triangle"
}

export interface ExcalidrawParallelogramElement extends ExcalidrawElementBase {
  type: "parallelogram"
}

export interface ExcalidrawHexagonElement extends ExcalidrawElementBase {
  type: "hexagon"
}
```

3. Add the three to the `ExcalidrawElement` union (after `ExcalidrawEllipseElement`).

In `packages/scene/src/factories.ts`, after `newEllipse` add (and extend the type-only import at the top with the three new interfaces):

```ts
export const newTriangle = (input: NewElementInput): ExcalidrawTriangleElement => ({
  ...baseElement(input),
  type: "triangle",
})

export const newParallelogram = (input: NewElementInput): ExcalidrawParallelogramElement => ({
  ...baseElement(input),
  type: "parallelogram",
})

export const newHexagon = (input: NewElementInput): ExcalidrawHexagonElement => ({
  ...baseElement(input),
  type: "hexagon",
})
```

In `packages/scene/src/index.ts`: add `newHexagon, newParallelogram, newTriangle` to the factories export block and `ExcalidrawHexagonElement, ExcalidrawParallelogramElement, ExcalidrawTriangleElement` to the type export block (keep alphabetical order within each block).

- [ ] **Step 4: Run scene tests + typecheck**

Run: `pnpm --filter @excalidraw-clone/scene test && pnpm typecheck`
Expected: scene tests PASS. **Typecheck may FAIL in the renderer** — `generateShape` has an exhaustive switch on `element.type` and now misses three cases. If it does, add a temporary passthrough to `packages/renderer/src/shapes/index.ts` (replaced properly in Task 4):

```ts
    case "triangle":
    case "parallelogram":
    case "hexagon":
      return []
```

Re-run `pnpm typecheck` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/scene/src/types.ts packages/scene/src/factories.ts packages/scene/src/index.ts packages/scene/test/factories.test.ts packages/renderer/src/shapes/index.ts
git commit -m "scene: triangle/parallelogram/hexagon element types and factories"
```

---

### Task 3: Scene — hit-test and exact edge binding

**Files:**

- Modify: `packages/scene/src/hit-test.ts` (switch in `hitTestElement`)
- Modify: `packages/scene/src/bindings.ts` (`BINDABLE_TYPES`, `computeBoundEndpoint`)
- Test: `packages/scene/test/hit-test.test.ts`, `packages/scene/test/bindings.test.ts`

**Interfaces:**

- Consumes: `shapeVertices`, `pointInConvexPolygon`, `polygonEdgePointToward`, `PolygonShapeKind`, `boundsCenter` from `@excalidraw-clone/geometry` (Task 1); `newTriangle`/`newHexagon` factories (Task 2).
- Produces: `hitTestElement` respects the true polygon outline (+rotation); `BINDABLE_TYPES` has 8 entries; `computeBoundEndpoint` routes polygon types through `polygonEdgePointToward` (gap and focus unchanged).

- [ ] **Step 1: Write the failing tests**

Append to `packages/scene/test/hit-test.test.ts` (extend its factory import with `newTriangle`):

```ts
describe("polygon shapes", () => {
  it("triangle: hits inside, misses the empty bbox corner", () => {
    const t = newTriangle({ x: 0, y: 0, width: 100, height: 60 })
    expect(hitTestElement(t, { x: 50, y: 40 })).toBe(true)
    expect(hitTestElement(t, { x: 5, y: 5 })).toBe(false)
  })

  it("triangle: rotation moves the empty corner", () => {
    const t = { ...newTriangle({ x: 0, y: 0, width: 100, height: 60 }), angle: Math.PI }
    expect(hitTestElement(t, { x: 5, y: 5 })).toBe(true)
    expect(hitTestElement(t, { x: 5, y: 55 })).toBe(false)
  })
})
```

Append to `packages/scene/test/bindings.test.ts` (extend its factory import with `newHexagon`):

```ts
describe("polygon shape binding", () => {
  it("BINDABLE_TYPES includes the flowchart shapes", () => {
    expect(BINDABLE_TYPES.has("triangle")).toBe(true)
    expect(BINDABLE_TYPES.has("parallelogram")).toBe(true)
    expect(BINDABLE_TYPES.has("hexagon")).toBe(true)
  })

  it("computeBoundEndpoint lands on the hexagon's right point, not the bbox corner", () => {
    const hex = newHexagon({ x: 0, y: 0, width: 100, height: 60 })
    const p = computeBoundEndpoint(hex, { x: 500, y: 30 }, 0)
    expect(p.x).toBeCloseTo(100)
    expect(p.y).toBeCloseTo(30)
  })

  it("computeBoundEndpoint respects the slanted hexagon top-right edge", () => {
    const hex = newHexagon({ x: 0, y: 0, width: 100, height: 60 })
    // ray up-right at 45°-ish exits through the top-right slanted edge
    const p = computeBoundEndpoint(hex, { x: 150, y: -70 }, 0)
    expect(p.x).toBeLessThan(100)
    expect(p.y).toBeGreaterThan(0)
    // on segment (75,0)→(100,30): y = (x - 75) * 30/25
    expect(p.y).toBeCloseTo(((p.x - 75) * 30) / 25, 5)
  })
})
```

Also update the existing `BINDABLE_TYPES has the five expected types` test:

```ts
it("BINDABLE_TYPES has the eight expected types", () => {
  expect([...BINDABLE_TYPES].sort()).toEqual([
    "diamond",
    "ellipse",
    "hexagon",
    "image",
    "parallelogram",
    "rectangle",
    "text",
    "triangle",
  ])
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @excalidraw-clone/scene test -- test/hit-test.test.ts test/bindings.test.ts`
Expected: FAIL — hit-test: triangle bbox corner hit returns `true` (TypeScript may instead complain the switch misses cases — same red); bindings: `BINDABLE_TYPES.has("triangle")` is `false`.

- [ ] **Step 3: Implement hit-test**

In `packages/scene/src/hit-test.ts`:

1. Extend the geometry import:

```ts
import {
  type Bounds,
  type Point,
  boundsCenter,
  distancePointToSegment,
  pointInConvexPolygon,
  pointInDiamond,
  pointInEllipse,
  pointInRectangle,
  rotatePoint,
  shapeVertices,
} from "@excalidraw-clone/geometry"
```

2. Add a case to the switch in `hitTestElement` (after the `"diamond"` case):

```ts
    case "triangle":
    case "parallelogram":
    case "hexagon":
      return pointInConvexPolygon(
        point,
        shapeVertices(element.type, b),
        boundsCenter(b),
        element.angle,
      )
```

- [ ] **Step 4: Implement binding**

In `packages/scene/src/bindings.ts`:

1. Extend the geometry import with `polygonEdgePointToward`, `shapeVertices`, and `type PolygonShapeKind`.
2. Extend `BINDABLE_TYPES`:

```ts
export const BINDABLE_TYPES: ReadonlySet<ElementType> = new Set<ElementType>([
  "rectangle",
  "diamond",
  "ellipse",
  "triangle",
  "parallelogram",
  "hexagon",
  "image",
  "text",
])
```

3. Below `edgeKindFor`, add:

```ts
const polygonKindFor = (type: ElementType): PolygonShapeKind | null =>
  type === "triangle" || type === "parallelogram" || type === "hexagon" ? type : null
```

4. In `computeBoundEndpoint`, replace the single `edge` line:

```ts
const polyKind = polygonKindFor(target.type)
const edge = polyKind
  ? polygonEdgePointToward(shapeVertices(polyKind, bounds), bounds, toward)
  : edgePointToward(bounds, edgeKindFor(target.type), toward)
```

(The rest of the function — `dir`, `gap`, `focus` — is unchanged.)

- [ ] **Step 5: Run scene tests + typecheck**

Run: `pnpm --filter @excalidraw-clone/scene test && pnpm typecheck`
Expected: PASS / exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/scene/src/hit-test.ts packages/scene/src/bindings.ts packages/scene/test/hit-test.test.ts packages/scene/test/bindings.test.ts
git commit -m "scene: polygon hit-test and exact edge binding for flowchart shapes"
```

---

### Task 4: Renderer — polygon shape generator (canvas + SVG)

**Files:**

- Create: `packages/renderer/src/shapes/polygon.ts`
- Modify: `packages/renderer/src/shapes/index.ts` (replace the Task 2 temporary `return []` passthrough)
- Test: `packages/renderer/test/shapes-others.test.ts`, `packages/renderer/test/svg.test.ts`

**Interfaces:**

- Consumes: `shapeVertices`, `PolygonShapeKind` from `@excalidraw-clone/geometry`; the new element interfaces (Task 2); roughjs `RoughGenerator.polygon`.
- Produces: `polygonShape(e, gen): readonly Drawable[]` for the three types, exported from `../src/shapes`; `generateShape` returns it; SVG export needs **no changes** (its `renderElement` falls through to `generateShape`).

- [ ] **Step 1: Write the failing tests**

Append to `packages/renderer/test/shapes-others.test.ts` (extend the scene import with `newHexagon, newTriangle` and the shapes import with `polygonShape`):

```ts
describe("polygonShape", () => {
  it("triangle: gen.polygon with apex + base corners, seeded", () => {
    const gen = new RoughGenerator()
    const spy = vi.spyOn(gen, "polygon")
    const t = newTriangle({ x: 0, y: 0, width: 40, height: 30 })
    polygonShape(t, gen)
    expect(spy).toHaveBeenCalledOnce()
    const [points, opts] = spy.mock.calls[0]!
    expect(points).toEqual([
      [20, 0],
      [40, 30],
      [0, 30],
    ])
    expect(opts?.seed).toBe(t.seed)
  })

  it("hexagon: 6 points, vertices relative to the element origin", () => {
    const gen = new RoughGenerator()
    const spy = vi.spyOn(gen, "polygon")
    polygonShape(newHexagon({ x: 5, y: 7, width: 40, height: 30 }), gen)
    const [points] = spy.mock.calls[0]!
    expect(points).toEqual([
      [10, 0],
      [30, 0],
      [40, 15],
      [30, 30],
      [10, 30],
      [0, 15],
    ])
  })

  it("transparent backgroundColor → no fill option", () => {
    const gen = new RoughGenerator()
    const spy = vi.spyOn(gen, "polygon")
    polygonShape(newTriangle({ x: 0, y: 0, width: 10, height: 10 }), gen)
    expect(spy.mock.calls[0]?.[1]?.fill).toBeUndefined()
  })
})
```

Append to `packages/renderer/test/svg.test.ts` (match that file's existing scene-construction pattern — read it first; the assertion below is the essential part):

```ts
it("renders flowchart shapes as path/polygon markup", () => {
  const scene = new Scene([newTriangle({ x: 0, y: 0, width: 40, height: 30 })])
  const svg = renderToSVG(scene)
  expect(svg).toContain("<g")
  expect(svg).toContain("path") // roughjs emits paths for polygons
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @excalidraw-clone/renderer test -- test/shapes-others.test.ts test/svg.test.ts`
Expected: FAIL — `polygonShape` is not exported.

- [ ] **Step 3: Implement**

Create `packages/renderer/src/shapes/polygon.ts`:

```ts
import { shapeVertices } from "@excalidraw-clone/geometry"
import type {
  ExcalidrawHexagonElement,
  ExcalidrawParallelogramElement,
  ExcalidrawTriangleElement,
} from "@excalidraw-clone/scene"
import type { Drawable, Options } from "roughjs/bin/core"
import type { RoughGenerator } from "roughjs/bin/generator"
import type { Point as RoughPoint } from "roughjs/bin/geometry"
import { strokeLineDash } from "./stroke-dash"

type PolygonElement =
  | ExcalidrawTriangleElement
  | ExcalidrawParallelogramElement
  | ExcalidrawHexagonElement

const polygonOptions = (e: PolygonElement): Options => {
  const opts: Options = {
    stroke: e.strokeColor,
    strokeWidth: e.strokeWidth,
    fillStyle: e.fillStyle,
    roughness: e.roughness,
    seed: e.seed,
    strokeLineDash: strokeLineDash(e.strokeStyle),
  }
  if (e.backgroundColor !== "transparent") opts.fill = e.backgroundColor
  return opts
}

export const polygonShape = (e: PolygonElement, gen: RoughGenerator): readonly Drawable[] => {
  const points: RoughPoint[] = shapeVertices(e.type, {
    x: 0,
    y: 0,
    width: e.width,
    height: e.height,
  }).map((p) => [p.x, p.y])
  return [gen.polygon(points, polygonOptions(e))]
}
```

In `packages/renderer/src/shapes/index.ts`: import `polygonShape` from `./polygon`, replace the Task 2 temporary passthrough with:

```ts
    case "triangle":
    case "parallelogram":
    case "hexagon":
      return polygonShape(element, gen)
```

and add `export { polygonShape } from "./polygon"` alongside the other re-exports.

- [ ] **Step 4: Run renderer tests to verify they pass**

Run: `pnpm --filter @excalidraw-clone/renderer test`
Expected: PASS (all renderer test files).

- [ ] **Step 5: Commit**

```bash
git add packages/renderer/src/shapes/polygon.ts packages/renderer/src/shapes/index.ts packages/renderer/test/shapes-others.test.ts packages/renderer/test/svg.test.ts
git commit -m "renderer: rough polygon generator for triangle/parallelogram/hexagon (canvas + SVG)"
```

---

### Task 5: Tools — three shape tools

**Files:**

- Create: `packages/tools/src/tools/triangle.ts`, `packages/tools/src/tools/parallelogram.ts`, `packages/tools/src/tools/hexagon.ts`
- Modify: `packages/tools/src/types.ts` (`ToolName` union), `packages/tools/src/registry.ts`, `packages/tools/src/index.ts`
- Test: `packages/tools/test/shape-tools.test.ts`

**Interfaces:**

- Consumes: `newTriangle`/`newParallelogram`/`newHexagon` (Task 2); `shapeReduce`, `SHAPE_INITIAL`, `ShapeState` from `./shape`.
- Produces: `triangleTool`, `parallelogramTool`, `hexagonTool` (`Tool<ShapeState, ToolEvent>`, names matching their types) registered in `TOOLS` and exported; `ToolName` gains the three names — the web store and Toolbar consume this union in Task 6.

- [ ] **Step 1: Write the failing test**

Append to `packages/tools/test/shape-tools.test.ts` (read its imports first and extend them: the three tools from `../src`, plus `makeCtx`/`point` if not already imported — this file already tests rectangle/ellipse/diamond, so the helpers exist):

```ts
describe("flowchart shape tools", () => {
  const cases = [
    ["triangle", triangleTool],
    ["parallelogram", parallelogramTool],
    ["hexagon", hexagonTool],
  ] as const

  for (const [type, tool] of cases) {
    it(`${type}: down→move→up creates a ${type} element and switches to selection`, () => {
      const ctx = makeCtx()
      const draft: ExcalidrawElement[] = []
      let s = tool.reduce(tool.initial, { type: "pointerDown", at: point(10, 10) }, ctx)
      applyMutation(s[1], draft)
      s = tool.reduce(s[0], { type: "pointerMove", at: point(60, 40) }, ctx)
      applyMutation(s[1], draft)
      s = tool.reduce(s[0], { type: "pointerUp", at: point(60, 40) }, ctx)
      applyMutation(s[1], draft)
      expect(draft).toHaveLength(1)
      expect(draft[0]!.type).toBe(type)
      expect(draft[0]!.width).toBe(50)
      expect(draft[0]!.height).toBe(30)
      expect(s[1].some((e) => e.kind === "switchTool" && e.tool === "selection")).toBe(true)
    })
  }

  it("escape mid-draw removes the provisional element", () => {
    const ctx = makeCtx()
    const draft: ExcalidrawElement[] = []
    let s = triangleTool.reduce(triangleTool.initial, { type: "pointerDown", at: point(0, 0) }, ctx)
    applyMutation(s[1], draft)
    s = triangleTool.reduce(s[0], { type: "escape" }, ctx)
    applyMutation(s[1], draft)
    expect(draft).toHaveLength(0)
  })

  it("TOOLS registry contains the three new tools", () => {
    expect(TOOLS.triangle).toBe(triangleTool)
    expect(TOOLS.parallelogram).toBe(parallelogramTool)
    expect(TOOLS.hexagon).toBe(hexagonTool)
  })
})
```

(If `applyMutation`/`ExcalidrawElement`/`TOOLS` aren't already imported in that file, add them from `./test-utils`, `@excalidraw-clone/scene`, and `../src` respectively.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @excalidraw-clone/tools test -- test/shape-tools.test.ts`
Expected: FAIL — `triangleTool` is not exported.

- [ ] **Step 3: Implement**

Create `packages/tools/src/tools/triangle.ts`:

```ts
import { newTriangle } from "@excalidraw-clone/scene"
import type { Tool, ToolContext, ToolEvent } from "../types"
import { SHAPE_INITIAL, type ShapeState, shapeReduce } from "./shape"

export const triangleTool: Tool<ShapeState, ToolEvent> = {
  name: "triangle",
  initial: SHAPE_INITIAL,
  reduce(state, event, ctx: ToolContext) {
    return shapeReduce({
      state,
      event,
      modifiers: ctx.modifiers,
      factory: (box) => newTriangle(box),
    })
  },
}
```

Create `packages/tools/src/tools/parallelogram.ts` and `packages/tools/src/tools/hexagon.ts` identically, substituting `parallelogramTool`/`newParallelogram`/`"parallelogram"` and `hexagonTool`/`newHexagon`/`"hexagon"`.

In `packages/tools/src/types.ts`, extend `ToolName` (after `"diamond"`):

```ts
  | "triangle"
  | "parallelogram"
  | "hexagon"
```

In `packages/tools/src/registry.ts`: import the three tools and add to `TOOLS`:

```ts
  triangle: triangleTool,
  parallelogram: parallelogramTool,
  hexagon: hexagonTool,
```

In `packages/tools/src/index.ts`, after the `diamondTool` export:

```ts
export { triangleTool } from "./tools/triangle"
export { parallelogramTool } from "./tools/parallelogram"
export { hexagonTool } from "./tools/hexagon"
```

- [ ] **Step 4: Run tools tests + typecheck**

Run: `pnpm --filter @excalidraw-clone/tools test && pnpm typecheck`
Expected: tools tests PASS; typecheck exit 0 (`TOOLS: Record<ToolName, …>` forces the registry entries; nothing else switches exhaustively on `ToolName`).

- [ ] **Step 5: Commit**

```bash
git add packages/tools/src/tools/triangle.ts packages/tools/src/tools/parallelogram.ts packages/tools/src/tools/hexagon.ts packages/tools/src/types.ts packages/tools/src/registry.ts packages/tools/src/index.ts packages/tools/test/shape-tools.test.ts
git commit -m "tools: triangle/parallelogram/hexagon shape tools"
```

---

### Task 6: UI + web wiring — toolbar, icons, shortcuts, help, i18n

**Files:**

- Modify: `packages/ui/src/Toolbar.tsx` (`TOOL_ITEMS`), `packages/ui/src/shared/icons.ts`, `packages/ui/src/HelpDialog.tsx` (`TOOL_SHORTCUTS`)
- Modify: `apps/web/src/keyboard/shortcuts.ts` (`TOOL_KEYS`)
- Modify: `apps/web/src/locales/en/common.json`, `apps/web/src/locales/ko/common.json` (toolbar block)
- Modify: `apps/web/src/locales/en/shortcuts.json`, `apps/web/src/locales/ko/shortcuts.json`
- Test: `packages/ui/test/Toolbar.test.tsx`

**Interfaces:**

- Consumes: `ToolName` union including the new names (Task 5).
- Produces: toolbar buttons `toolbar-triangle` / `toolbar-parallelogram` / `toolbar-hexagon`; key presses `3`/`g`/`6` activate the tools; Help dialog lists them.

- [ ] **Step 1: Write the failing test**

Append to `packages/ui/test/Toolbar.test.tsx` (match the existing render helper in that file — read it first; it renders `<Toolbar …>` with a `t` identity function):

```ts
it("renders the flowchart shape buttons after diamond", () => {
  renderToolbar()
  expect(screen.getByTestId("toolbar-triangle")).toBeInTheDocument()
  expect(screen.getByTestId("toolbar-parallelogram")).toBeInTheDocument()
  expect(screen.getByTestId("toolbar-hexagon")).toBeInTheDocument()
})
```

(If the file has no shared `renderToolbar` helper, inline the same `render(<Toolbar …/>)` call its other tests use.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @excalidraw-clone/ui test -- test/Toolbar.test.tsx`
Expected: FAIL — `Unable to find an element by: [data-testid="toolbar-triangle"]`.

- [ ] **Step 3: Implement**

1. `packages/ui/src/Toolbar.tsx` — insert into `TOOL_ITEMS` after `diamond`:

```ts
  { name: "triangle", shortcut: "3" },
  { name: "parallelogram", shortcut: "G" },
  { name: "hexagon", shortcut: "6" },
```

2. `packages/ui/src/shared/icons.ts` — add to `ICONS` after `diamond`:

```ts
  triangle:
    '<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="10,3 17,17 3,17"/></svg>',
  parallelogram:
    '<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="7,5 18,5 13,15 2,15"/></svg>',
  hexagon:
    '<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="6,4 14,4 18,10 14,16 6,16 2,10"/></svg>',
```

3. `packages/ui/src/HelpDialog.tsx` — insert into `TOOL_SHORTCUTS` after the `diamond` row:

```ts
  { keys: "3", label: "shortcuts.triangle" },
  { keys: "G", label: "shortcuts.parallelogram" },
  { keys: "6", label: "shortcuts.hexagon" },
```

4. `apps/web/src/keyboard/shortcuts.ts` — add to `TOOL_KEYS` after `d: "diamond"`:

```ts
  "3": "triangle",
  g: "parallelogram",
  "6": "hexagon",
```

5. i18n — `apps/web/src/locales/en/common.json` `toolbar` block, after `"diamond"`:

```json
    "triangle": "Triangle",
    "parallelogram": "Parallelogram",
    "hexagon": "Hexagon",
```

`ko/common.json` `toolbar` block:

```json
    "triangle": "삼각형",
    "parallelogram": "평행사변형",
    "hexagon": "육각형",
```

`en/shortcuts.json` after `"diamond"`:

```json
  "triangle": "Triangle",
  "parallelogram": "Parallelogram",
  "hexagon": "Hexagon",
```

`ko/shortcuts.json` after `"diamond"` (read the file to match its existing values):

```json
  "triangle": "삼각형",
  "parallelogram": "평행사변형",
  "hexagon": "육각형",
```

- [ ] **Step 4: Run ui + web tests, typecheck, lint**

Run: `pnpm --filter @excalidraw-clone/ui test && pnpm --filter @excalidraw-clone/web test && pnpm typecheck && pnpm lint`
Expected: all PASS / exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/Toolbar.tsx packages/ui/src/shared/icons.ts packages/ui/src/HelpDialog.tsx packages/ui/test/Toolbar.test.tsx apps/web/src/keyboard/shortcuts.ts apps/web/src/locales/en/common.json apps/web/src/locales/ko/common.json apps/web/src/locales/en/shortcuts.json apps/web/src/locales/ko/shortcuts.json
git commit -m "ui+web: toolbar buttons, icons, shortcuts (3/G/6), help + i18n for flowchart shapes"
```

---

### Task 7: e2e + full gate

**Files:**

- Create: `apps/web/e2e/flowchart-shapes.spec.ts`

**Interfaces:**

- Consumes: `dragOnCanvas` from `apps/web/e2e/_helpers.ts`; testids `toolbar-triangle`/`toolbar-parallelogram`/`toolbar-hexagon`/`toolbar-arrow`; localStorage key `excalidraw-scene` (auto-save ~800ms → wait 900ms before reading).
- Produces: end-to-end proof of drawing all three shapes and arrow-binding to a hexagon.

- [ ] **Step 1: Write the e2e spec**

Create `apps/web/e2e/flowchart-shapes.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test"
import { dragOnCanvas } from "./_helpers"

type SceneEl = {
  id: string
  type: string
  x: number
  y: number
  width: number
  endBinding?: { elementId: string } | null
  isDeleted?: boolean
}

const readScene = async (page: Page): Promise<SceneEl[]> => {
  const json = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  const data = JSON.parse(json!) as { elements: SceneEl[] }
  return data.elements.filter((e) => !e.isDeleted)
}

const freshCanvas = async (page: Page): Promise<void> => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-triangle"]').waitFor({ state: "visible" })
}

test("draws triangle, parallelogram, and hexagon", async ({ page }) => {
  await freshCanvas(page)

  const draw = async (
    tool: string,
    from: { x: number; y: number },
    to: { x: number; y: number },
  ) => {
    await page.locator(`[data-testid="toolbar-${tool}"]`).click()
    await dragOnCanvas(page, from, to)
    await page.waitForTimeout(120)
  }
  await draw("triangle", { x: 60, y: 60 }, { x: 140, y: 120 })
  await draw("parallelogram", { x: 180, y: 60 }, { x: 280, y: 120 })
  await draw("hexagon", { x: 320, y: 60 }, { x: 420, y: 120 })

  await page.waitForTimeout(900)
  const types = (await readScene(page)).map((e) => e.type).sort()
  expect(types).toEqual(["hexagon", "parallelogram", "triangle"])
})

test("arrow binds to a hexagon", async ({ page }) => {
  await freshCanvas(page)

  await page.locator('[data-testid="toolbar-hexagon"]').click()
  await dragOnCanvas(page, { x: 300, y: 100 }, { x: 400, y: 160 })
  await page.waitForTimeout(120)

  // Draw an arrow from empty space into the hexagon's center.
  await page.locator('[data-testid="toolbar-arrow"]').click()
  await dragOnCanvas(page, { x: 120, y: 130 }, { x: 350, y: 130 })
  await page.waitForTimeout(900)

  const els = await readScene(page)
  const hex = els.find((e) => e.type === "hexagon")
  const arrow = els.find((e) => e.type === "arrow")
  expect(hex).toBeDefined()
  expect(arrow?.endBinding?.elementId).toBe(hex!.id)
  // bound endpoint retracts to the hexagon edge: arrow must end left of the hexagon's left point (x=300) plus gap
  expect(arrow!.x + arrow!.width).toBeLessThanOrEqual(301)
})
```

- [ ] **Step 2: Run the new spec**

Run: `pnpm --filter @excalidraw-clone/web e2e -- flowchart-shapes.spec.ts`
Expected: 2 passed. (If the binding assertion is off by the 4px `BINDING_GAP`, loosen the final `toBeLessThanOrEqual` to `305` — the meaningful assertion is the `endBinding` identity.)

- [ ] **Step 3: Full gate**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all green.

Run: `pnpm --filter @excalidraw-clone/web e2e`
Expected: full suite passes (28 existing + 2 new = 30).

- [ ] **Step 4: Commit**

```bash
git add apps/web/e2e/flowchart-shapes.spec.ts
git commit -m "web: e2e — draw flowchart shapes, arrow binds to hexagon edge"
```

---

## Spec coverage map

| Spec section                                                 | Task                                     |
| ------------------------------------------------------------ | ---------------------------------------- |
| §2 geometry polygon module                                   | 1                                        |
| §3 types/factories                                           | 2                                        |
| §3 hit-test + BINDABLE_TYPES + exact edge binding            | 3                                        |
| §4 renderer canvas + SVG (SVG flows through `generateShape`) | 4                                        |
| §5 tools + registry + ToolName                               | 5                                        |
| §5 toolbar/icons/TOOL_KEYS/Help/i18n                         | 6                                        |
| §6 e2e                                                       | 7                                        |
| §1 conventions (vertex tables)                               | 1 (single source), asserted again in 3–4 |
