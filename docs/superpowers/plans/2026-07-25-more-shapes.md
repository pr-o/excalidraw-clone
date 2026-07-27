# More Shapes (Pentagon, Octagon) + Overflow Flyout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add pentagon and octagon as new drawable convex-polygon shapes, and introduce them into the UI through a new "more shapes" overflow flyout in the toolbar, without touching the existing 6 shape toolbar buttons or any existing e2e test.

**Architecture:** Pentagon and octagon reuse the existing convex-polygon pipeline end to end (`shapeVertices`/`labelInnerBox` in `packages/geometry`, the generic `polygonShape` renderer, the generic `pointInConvexPolygon`/`polygonEdgePointToward` hit-testing and binding, the generic `shapeReduce` drag-to-size tool factory) — only vertex formulas and element-type plumbing are new. A new `MoreShapesMenu` component, modeled directly on the existing `HamburgerMenu` open/close/Escape pattern, is rendered as a new slot inside `Toolbar.tsx` and houses the two new shape buttons; its open/closed state is owned by `App.tsx` (mirroring `menuOpen`/`libraryOpen`/`layersOpen`) and threaded down through new `ToolbarProps` fields.

**Tech Stack:** TypeScript, React, Vitest + @testing-library/react (unit), Playwright (e2e), pnpm workspaces + Turborepo, roughjs (renderer), Tailwind (styling), react-i18next (i18n).

## Global Constraints

- Pentagon and octagon join the convex-polygon pipeline with **no new geometry/rendering machinery** — only new vertex formulas and element-type plumbing.
- Hit-testing and arrow edge-binding require **no changes** — `pointInConvexPolygon` and `polygonEdgePointToward` already operate generically over any vertex array.
- Keyboard shortcuts are direct and bypass the flyout: `5` selects pentagon, `8` selects octagon (continuing the numeric-sides convention: `3`=triangle, `6`=hexagon; both digits confirmed unused elsewhere).
- The existing 6 shape toolbar buttons (`rectangle`, `ellipse`, `diamond`, `triangle`, `parallelogram`, `hexagon`) are **unchanged**: same `IconButton`s, same testids, same position. This is a purely additive change to `Toolbar.tsx`.
- `MoreShapesMenu`'s `open: boolean` / `onOpenChange: (open: boolean) => void` state is owned by `App.tsx` (a new `moreShapesOpen` state, mirroring `menuOpen`/`libraryOpen`/`layersOpen`) and threaded through new `ToolbarProps` fields (`moreShapesOpen`, `onMoreShapesOpenChange`), since `MoreShapesMenu` is rendered inside `Toolbar`, not as an `App.tsx` sibling like `HamburgerMenu`.
- YAGNI: no caret/split-button, no "last selected shape" memory, no migration of the existing 6 shapes into any flyout, no generalized "shape picker" abstraction beyond what 2 items need today.
- No changes required to any of the ~20 existing e2e specs that reference the existing 6 shape toolbar buttons.
- Full gate (`tsc` + unit + e2e) must be green before merge.

---

## Task 1: Geometry — pentagon/octagon vertex formulas and label boxes

**Files:**

- Modify: `packages/geometry/src/polygon.ts`
- Modify: `packages/geometry/src/label-box.ts`
- Test: `packages/geometry/test/polygon.test.ts`
- Test: `packages/geometry/test/label-box.test.ts`

**Interfaces:**

- Consumes: nothing new (self-contained geometry primitives).
- Produces:
  - `PolygonShapeKind` widened to `"triangle" | "parallelogram" | "hexagon" | "pentagon" | "octagon"`.
  - `shapeVertices(kind: PolygonShapeKind, b: Bounds): Point[]` — same signature, now handles `"pentagon"` and `"octagon"`.
  - `LabelShapeKind` widened to include `"pentagon" | "octagon"`.
  - `labelInnerBox(kind: LabelShapeKind, b: Bounds, minInset?: number): Bounds` — same signature, now handles `"pentagon"` and `"octagon"`.

- [ ] **Step 1: Write the failing tests for `shapeVertices` pentagon/octagon**

In `packages/geometry/test/polygon.test.ts`, add two new `it` blocks inside the existing `describe("shapeVertices", ...)` block (after the `"offsets by the bounds origin"` test, before its closing `})`):

```ts
it("pentagon: apex top-center, base inset 1/5, shoulders at 2/5 height", () => {
  expect(shapeVertices("pentagon", box)).toEqual([
    { x: 50, y: 0 },
    { x: 100, y: 24 },
    { x: 80, y: 60 },
    { x: 20, y: 60 },
    { x: 0, y: 24 },
  ])
})

it("octagon: flat edges, corners cut by 1/3", () => {
  const octBox: Bounds = { x: 0, y: 0, width: 120, height: 60 }
  expect(shapeVertices("octagon", octBox)).toEqual([
    { x: 40, y: 0 },
    { x: 80, y: 0 },
    { x: 120, y: 20 },
    { x: 120, y: 40 },
    { x: 80, y: 60 },
    { x: 40, y: 60 },
    { x: 0, y: 40 },
    { x: 0, y: 20 },
  ])
})

it("pentagon and octagon have the right vertex counts and stay inside the bounding box", () => {
  const pentBox: Bounds = { x: 10, y: 10, width: 90, height: 50 }
  const octBox: Bounds = { x: 10, y: 10, width: 90, height: 50 }
  const pentagon = shapeVertices("pentagon", pentBox)
  const octagon = shapeVertices("octagon", octBox)
  expect(pentagon).toHaveLength(5)
  expect(octagon).toHaveLength(8)
  for (const v of [...pentagon, ...octagon]) {
    expect(v.x).toBeGreaterThanOrEqual(pentBox.x)
    expect(v.x).toBeLessThanOrEqual(pentBox.x + pentBox.width)
    expect(v.y).toBeGreaterThanOrEqual(pentBox.y)
    expect(v.y).toBeLessThanOrEqual(pentBox.y + pentBox.height)
  }
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @excalidraw-clone/geometry test -- test/polygon.test.ts`
Expected: FAIL — the `"pentagon"`/`"octagon"` cases hit no branch in the `shapeVertices` switch (no `default` case), so the function returns `undefined` at runtime; the `toEqual([...])` and `toHaveLength(...)` assertions fail against `undefined`.

- [ ] **Step 3: Implement the pentagon/octagon vertex formulas**

In `packages/geometry/src/polygon.ts`, change the type declaration and add the two new `switch` cases:

```ts
export type PolygonShapeKind = "triangle" | "parallelogram" | "hexagon" | "pentagon" | "octagon"
```

Add these two `case` blocks to the `switch (kind)` inside `shapeVertices`, after the existing `"hexagon"` case:

```ts
    case "pentagon":
      // apex top-center; shoulders at 2/5 height; base inset 1/5 from each side
      return [
        { x: x + w / 2, y },
        { x: x + w, y: y + (2 * h) / 5 },
        { x: x + (4 * w) / 5, y: y + h },
        { x: x + w / 5, y: y + h },
        { x, y: y + (2 * h) / 5 },
      ]
    case "octagon":
      // flat top/right/bottom/left edges, corners cut by 1/3
      return [
        { x: x + w / 3, y },
        { x: x + (2 * w) / 3, y },
        { x: x + w, y: y + h / 3 },
        { x: x + w, y: y + (2 * h) / 3 },
        { x: x + (2 * w) / 3, y: y + h },
        { x: x + w / 3, y: y + h },
        { x, y: y + (2 * h) / 3 },
        { x, y: y + h / 3 },
      ]
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @excalidraw-clone/geometry test -- test/polygon.test.ts`
Expected: PASS (all tests in the file, including the pre-existing triangle/parallelogram/hexagon ones)

- [ ] **Step 5: Commit**

```bash
git add packages/geometry/src/polygon.ts packages/geometry/test/polygon.test.ts
git commit -m "geometry: add pentagon and octagon vertex formulas"
```

- [ ] **Step 6: Write the failing tests for `labelInnerBox` pentagon/octagon**

In `packages/geometry/test/label-box.test.ts`, add a new `it` block after `"parallelogram and hexagon get a 25% x-inset at full height (minus min inset)"` (before the `"respects the minimum inset on small shapes"` test):

```ts
it("octagon gets a 1/3 x-inset at full height", () => {
  expect(labelInnerBox("octagon", b(0, 0, 120, 60))).toEqual({
    x: 40,
    y: 8,
    width: 40,
    height: 44,
  })
})

it("pentagon gets the base band below the shoulders", () => {
  expect(labelInnerBox("pentagon", b(0, 0, 100, 60))).toEqual({
    x: 20,
    y: 24,
    width: 60,
    height: 28,
  })
})
```

Also extend the `"polygon-kind boxes stay inside the shape outline"` test's loop array to include the two new kinds:

```ts
  it("polygon-kind boxes stay inside the shape outline", () => {
    const bounds = b(0, 0, 200, 160)
    for (const kind of ["triangle", "parallelogram", "hexagon", "pentagon", "octagon"] as const) {
```

(leave the rest of that test body unchanged — only the array literal on this line changes)

- [ ] **Step 7: Run the tests to verify they fail**

Run: `pnpm --filter @excalidraw-clone/geometry test -- test/label-box.test.ts`
Expected: FAIL — `labelInnerBox("octagon", ...)` and `labelInnerBox("pentagon", ...)` hit no branch in the `factorBox` switch (no `default` case), so `factorBox` returns `undefined`, and `labelInnerBox` throws (destructuring `f.x`/`f.width`/etc. off `undefined`) or the `toEqual` assertions fail. The extended `"polygon-kind boxes..."` test also fails for the same reason.

- [ ] **Step 8: Implement the pentagon/octagon factor-box formulas**

In `packages/geometry/src/label-box.ts`, change the type declaration:

```ts
export type LabelShapeKind =
  | "rectangle"
  | "ellipse"
  | "diamond"
  | "triangle"
  | "parallelogram"
  | "hexagon"
  | "pentagon"
  | "octagon"
```

Add these two `case` blocks to the `switch (kind)` inside `factorBox`, after the existing `case "parallelogram": case "hexagon":` block:

```ts
    case "octagon":
      return { x: x + w / 3, y, width: w / 3, height: h }
    case "pentagon":
      return { x: x + w / 5, y: y + (2 * h) / 5, width: (3 * w) / 5, height: (3 * h) / 5 }
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `pnpm --filter @excalidraw-clone/geometry test -- test/label-box.test.ts`
Expected: PASS (all tests in the file)

- [ ] **Step 10: Commit**

```bash
git add packages/geometry/src/label-box.ts packages/geometry/test/label-box.test.ts
git commit -m "geometry: add pentagon and octagon label inner boxes"
```

---

## Task 2: Scene — element types, factories, and label allowlist

**Files:**

- Modify: `packages/scene/src/types.ts:3-15` (`ElementType`), `packages/scene/src/types.ts:100-103` (new interfaces), `packages/scene/src/types.ts:158-165` (`ExcalidrawElement` union)
- Modify: `packages/scene/src/factories.ts:104-107` (new factories)
- Modify: `packages/scene/src/index.ts:17-41` (factory exports), `packages/scene/src/index.ts:75-107` (type exports)
- Modify: `packages/scene/src/reconcile-bound-text.ts` (`LABELABLE_TYPES`)
- Test: `packages/scene/test/factories.test.ts`
- Test: `packages/scene/test/labels.test.ts`

**Interfaces:**

- Consumes: nothing new from Task 1 directly — `reconcile-bound-text.ts` already imports `labelInnerBox`/`LabelShapeKind` from `@excalidraw-clone/geometry` and casts `container.type as LabelShapeKind`, which now type-checks for `"pentagon"`/`"octagon"` because of Task 1.
- Produces:
  - `ElementType` widened to include `"pentagon" | "octagon"`.
  - `ExcalidrawPentagonElement extends ExcalidrawElementBase { type: "pentagon" }`, `ExcalidrawOctagonElement extends ExcalidrawElementBase { type: "octagon" }`, both added to the `ExcalidrawElement` discriminated union.
  - `newPentagon(input: NewElementInput): ExcalidrawPentagonElement`, `newOctagon(input: NewElementInput): ExcalidrawOctagonElement`, exported from `@excalidraw-clone/scene`.
  - `LABELABLE_TYPES` now contains `"pentagon"` and `"octagon"` alongside the existing 6 shapes.

- [ ] **Step 1: Write the failing test for the new factories**

In `packages/scene/test/factories.test.ts`, add a new `describe` block right after the existing `describe("flowchart shape factories", ...)` block:

```ts
describe("pentagon/octagon factories", () => {
  it("newPentagon/newOctagon create their types with base defaults", () => {
    const p = newPentagon({ x: 1, y: 2, width: 30, height: 40 })
    const o = newOctagon({ x: 0, y: 0 })
    expect(p.type).toBe("pentagon")
    expect(o.type).toBe("octagon")
    expect(p.width).toBe(30)
    expect(p.locked).toBe(false)
    expect(o.roundness).toBeNull()
  })
})
```

Add `newPentagon` and `newOctagon` to the existing `import { ... } from "../src/factories"` (or `from "../src"`, matching whatever this file currently imports from — check the top of `packages/scene/test/factories.test.ts` and add the two names alongside `newTriangle`, `newParallelogram`, `newHexagon`).

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @excalidraw-clone/scene test -- test/factories.test.ts`
Expected: FAIL with an import error — `newPentagon`/`newOctagon` are not exported from `../src/factories` (or `../src`) yet.

- [ ] **Step 3: Implement the element types and factories**

In `packages/scene/src/types.ts`, widen `ElementType` (lines 3-15):

```ts
export type ElementType =
  | "rectangle"
  | "diamond"
  | "ellipse"
  | "triangle"
  | "parallelogram"
  | "hexagon"
  | "pentagon"
  | "octagon"
  | "arrow"
  | "line"
  | "freedraw"
  | "text"
  | "image"
  | "frame"
```

Add two new element interfaces right after `ExcalidrawHexagonElement` (after line 102):

```ts
export interface ExcalidrawPentagonElement extends ExcalidrawElementBase {
  type: "pentagon"
}

export interface ExcalidrawOctagonElement extends ExcalidrawElementBase {
  type: "octagon"
}
```

Add both to the `ExcalidrawElement` union (lines 158-165), right after `ExcalidrawHexagonElement`:

```ts
export type ExcalidrawElement =
  | ExcalidrawRectangleElement
  | ExcalidrawDiamondElement
  | ExcalidrawEllipseElement
  | ExcalidrawTriangleElement
  | ExcalidrawParallelogramElement
  | ExcalidrawHexagonElement
  | ExcalidrawPentagonElement
  | ExcalidrawOctagonElement
  | ExcalidrawLineElement
  | ExcalidrawArrowElement
  | ExcalidrawFreedrawElement
  | ExcalidrawTextElement
  | ExcalidrawImageElement
```

(keep every other member of the union exactly as it already is — this only inserts two new lines after `ExcalidrawHexagonElement`)

In `packages/scene/src/factories.ts`, add two new factories right after `newHexagon` (after line 107):

```ts
export const newPentagon = (input: NewElementInput): ExcalidrawPentagonElement => ({
  ...baseElement(input),
  type: "pentagon",
})

export const newOctagon = (input: NewElementInput): ExcalidrawOctagonElement => ({
  ...baseElement(input),
  type: "octagon",
})
```

Add `ExcalidrawPentagonElement` and `ExcalidrawOctagonElement` to this file's existing `import type { ... } from "./types"` statement, alongside `ExcalidrawHexagonElement`.

In `packages/scene/src/index.ts`, add `newPentagon` and `newOctagon` to the factory export block (alphabetically, after `newParallelogram` and before `newRectangle` — line 30-31):

```ts
export {
  newArrow,
  newDiamond,
  newEllipse,
  newFrame,
  newFreedraw,
  newHexagon,
  newImage,
  newLabelFor,
  newLabelForLinear,
  newLine,
  newNote,
  NOTE_BG_COLOR,
  newOctagon,
  newParallelogram,
  newPentagon,
  newRectangle,
  newText,
  newTriangle,
} from "./factories"
```

Add `ExcalidrawOctagonElement` and `ExcalidrawPentagonElement` to the type export block (alphabetically, near `ExcalidrawParallelogramElement` — around line 94):

```ts
export type {
  Arrowhead,
  BoundElement,
  ElementType,
  ExcalidrawAppStateSnapshot,
  ExcalidrawArrowElement,
  ExcalidrawBinaryFile,
  ExcalidrawData,
  ExcalidrawDiamondElement,
  ExcalidrawElement,
  ExcalidrawElementBase,
  ExcalidrawEllipseElement,
  ExcalidrawFiles,
  ExcalidrawFrameElement,
  ExcalidrawFreedrawElement,
  ExcalidrawHexagonElement,
  ExcalidrawImageElement,
  ExcalidrawLineElement,
  ExcalidrawLinearBase,
  ExcalidrawOctagonElement,
  ExcalidrawParallelogramElement,
  ExcalidrawPentagonElement,
  ExcalidrawRectangleElement,
  ExcalidrawTextElement,
  ExcalidrawTriangleElement,
  FillStyle,
  FontFamily,
  PointBinding,
  Roughness,
  Roundness,
  StrokeStyle,
  StrokeWidth,
  TextAlign,
  VerticalAlign,
} from "./types"
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @excalidraw-clone/scene test -- test/factories.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/scene/src/types.ts packages/scene/src/factories.ts packages/scene/src/index.ts packages/scene/test/factories.test.ts
git commit -m "scene: add pentagon and octagon element types and factories"
```

- [ ] **Step 6: Write the failing test for the label allowlist**

In `packages/scene/test/labels.test.ts`, replace the existing `describe("LABELABLE_TYPES", ...)` block's test:

```ts
describe("LABELABLE_TYPES", () => {
  it("contains exactly the eight container shapes", () => {
    expect([...LABELABLE_TYPES].sort()).toEqual([
      "diamond",
      "ellipse",
      "hexagon",
      "octagon",
      "parallelogram",
      "pentagon",
      "rectangle",
      "triangle",
    ])
  })
})
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `pnpm --filter @excalidraw-clone/scene test -- test/labels.test.ts`
Expected: FAIL — actual array is `["diamond", "ellipse", "hexagon", "parallelogram", "rectangle", "triangle"]` (6 entries), missing `"octagon"` and `"pentagon"`.

- [ ] **Step 8: Add pentagon/octagon to `LABELABLE_TYPES`**

In `packages/scene/src/reconcile-bound-text.ts`, change:

```ts
export const LABELABLE_TYPES: ReadonlySet<ElementType> = new Set<ElementType>([
  "rectangle",
  "ellipse",
  "diamond",
  "triangle",
  "parallelogram",
  "hexagon",
  "pentagon",
  "octagon",
])
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `pnpm --filter @excalidraw-clone/scene test -- test/labels.test.ts`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add packages/scene/src/reconcile-bound-text.ts packages/scene/test/labels.test.ts
git commit -m "scene: allow pentagon and octagon to hold bound-text labels"
```

---

## Task 3: Renderer — widen the polygon shape renderer

**Files:**

- Modify: `packages/renderer/src/shapes/polygon.ts`
- Test: `packages/renderer/test/shapes-others.test.ts`

**Interfaces:**

- Consumes: `ExcalidrawPentagonElement`, `ExcalidrawOctagonElement` from `@excalidraw-clone/scene` (Task 2); `newPentagon`, `newOctagon` from `@excalidraw-clone/scene` (Task 2, test-only); `shapeVertices` from `@excalidraw-clone/geometry` (Task 1, already consumed here unchanged — no import change needed).
- Produces: `polygonShape(e: PolygonElement, gen: RoughGenerator): readonly Drawable[]` — same signature and behavior, `PolygonElement` now type-includes pentagon/octagon elements.

Note: `polygonShape`'s implementation calls `shapeVertices(e.type, ...)` generically with no per-kind branching, so passing a pentagon/octagon element through it **already works correctly at runtime** even before this task's type change (JS erases the `PolygonElement` union at runtime). This task's red/green cycle is therefore driven by `tsc`, not by a runtime assertion failure — the steps below reflect that honestly.

- [ ] **Step 1: Write the test for pentagon/octagon shapes**

In `packages/renderer/test/shapes-others.test.ts`, add two new `it` blocks inside `describe("polygonShape", ...)`, after the existing `"hexagon: 6 points, vertices relative to the element origin"` test:

```ts
it("pentagon: 5 points, vertices relative to the element origin", () => {
  const gen = new RoughGenerator()
  const spy = vi.spyOn(gen, "polygon")
  polygonShape(newPentagon({ x: 5, y: 7, width: 40, height: 30 }), gen)
  const [points] = spy.mock.calls[0]!
  expect(points).toEqual([
    [20, 0],
    [40, 12],
    [32, 30],
    [8, 30],
    [0, 12],
  ])
})

it("octagon: 8 points, vertices relative to the element origin", () => {
  const gen = new RoughGenerator()
  const spy = vi.spyOn(gen, "polygon")
  polygonShape(newOctagon({ x: 5, y: 7, width: 120, height: 60 }), gen)
  const [points] = spy.mock.calls[0]!
  expect(points).toEqual([
    [40, 0],
    [80, 0],
    [120, 20],
    [120, 40],
    [80, 60],
    [40, 60],
    [0, 40],
    [0, 20],
  ])
})
```

Add `newOctagon` and `newPentagon` to this file's existing `@excalidraw-clone/scene` import (alongside `newHexagon`, `newTriangle`).

- [ ] **Step 2: Run `tsc` to verify it fails**

Run: `pnpm --filter @excalidraw-clone/renderer typecheck`
Expected: FAIL with a TS2345 error — `Argument of type 'ExcalidrawPentagonElement' is not assignable to parameter of type 'PolygonElement'` (and the same for `ExcalidrawOctagonElement`), since `PolygonElement` in `packages/renderer/src/shapes/polygon.ts` doesn't include them yet.

- [ ] **Step 3: Widen the `PolygonElement` union**

In `packages/renderer/src/shapes/polygon.ts`, update the import and type:

```ts
import { shapeVertices } from "@excalidraw-clone/geometry"
import type {
  ExcalidrawHexagonElement,
  ExcalidrawOctagonElement,
  ExcalidrawParallelogramElement,
  ExcalidrawPentagonElement,
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
  | ExcalidrawPentagonElement
  | ExcalidrawOctagonElement
```

No other changes to this file — `polygonOptions` and `polygonShape` are unchanged.

- [ ] **Step 4: Run `tsc` to verify it passes**

Run: `pnpm --filter @excalidraw-clone/renderer typecheck`
Expected: PASS (no errors)

- [ ] **Step 5: Run the unit tests to verify they pass**

Run: `pnpm --filter @excalidraw-clone/renderer test -- test/shapes-others.test.ts`
Expected: PASS (both new tests, plus the pre-existing triangle/hexagon/transparent-fill tests in the same `describe` block)

- [ ] **Step 6: Commit**

```bash
git add packages/renderer/src/shapes/polygon.ts packages/renderer/test/shapes-others.test.ts
git commit -m "renderer: widen polygon shape renderer to pentagon and octagon"
```

---

## Task 4: Tools — pentagon and octagon drag-to-size tools

**Files:**

- Create: `packages/tools/src/tools/pentagon.ts`
- Create: `packages/tools/src/tools/octagon.ts`
- Modify: `packages/tools/src/types.ts:4-19` (`ToolName`)
- Modify: `packages/tools/src/registry.ts` (imports + `TOOLS` record)
- Modify: `packages/tools/src/index.ts` (exports)
- Test: `packages/tools/test/shape-tools.test.ts`

**Interfaces:**

- Consumes: `newPentagon`, `newOctagon` from `@excalidraw-clone/scene` (Task 2); `SHAPE_INITIAL`, `ShapeState`, `shapeReduce` from `./shape` (existing, unchanged); `Tool`, `ToolContext`, `ToolEvent` from `../types` (existing, unchanged).
- Produces: `pentagonTool: Tool<ShapeState, ToolEvent>`, `octagonTool: Tool<ShapeState, ToolEvent>`, both exported from `@excalidraw-clone/tools`; `ToolName` widened to include `"pentagon" | "octagon"`; `TOOLS.pentagon`, `TOOLS.octagon` registry entries.

- [ ] **Step 1: Write the failing test**

In `packages/tools/test/shape-tools.test.ts`, add `octagonTool` and `pentagonTool` to the existing import from `"../src"`:

```ts
import {
  diamondTool,
  ellipseTool,
  hexagonTool,
  octagonTool,
  parallelogramTool,
  pentagonTool,
  rectangleTool,
  TOOLS as TOOL_REGISTRY,
  triangleTool,
} from "../src"
```

Add two entries to the `TOOLS` array (after the `hexagon` entry):

```ts
const TOOLS = [
  { name: "rectangle", tool: rectangleTool, type: "rectangle" as const },
  { name: "ellipse", tool: ellipseTool, type: "ellipse" as const },
  { name: "diamond", tool: diamondTool, type: "diamond" as const },
  { name: "triangle", tool: triangleTool, type: "triangle" as const },
  { name: "parallelogram", tool: parallelogramTool, type: "parallelogram" as const },
  { name: "hexagon", tool: hexagonTool, type: "hexagon" as const },
  { name: "pentagon", tool: pentagonTool, type: "pentagon" as const },
  { name: "octagon", tool: octagonTool, type: "octagon" as const },
]
```

Update the registry test at the bottom of the file:

```ts
describe("flowchart shape tools registry", () => {
  it("TOOLS registry contains the five new tools", () => {
    expect(TOOL_REGISTRY.triangle).toBe(triangleTool)
    expect(TOOL_REGISTRY.parallelogram).toBe(parallelogramTool)
    expect(TOOL_REGISTRY.hexagon).toBe(hexagonTool)
    expect(TOOL_REGISTRY.pentagon).toBe(pentagonTool)
    expect(TOOL_REGISTRY.octagon).toBe(octagonTool)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @excalidraw-clone/tools test -- test/shape-tools.test.ts`
Expected: FAIL with an import error — `octagonTool`/`pentagonTool` are not exported from `../src` yet.

- [ ] **Step 3: Create the tool files**

Create `packages/tools/src/tools/pentagon.ts`:

```ts
import { newPentagon } from "@excalidraw-clone/scene"
import type { Tool, ToolContext, ToolEvent } from "../types"
import { SHAPE_INITIAL, type ShapeState, shapeReduce } from "./shape"

export const pentagonTool: Tool<ShapeState, ToolEvent> = {
  name: "pentagon",
  initial: SHAPE_INITIAL,
  reduce(state, event, ctx: ToolContext) {
    return shapeReduce({
      state,
      event,
      modifiers: ctx.modifiers,
      factory: (box) => newPentagon(box),
    })
  },
}
```

Create `packages/tools/src/tools/octagon.ts`:

```ts
import { newOctagon } from "@excalidraw-clone/scene"
import type { Tool, ToolContext, ToolEvent } from "../types"
import { SHAPE_INITIAL, type ShapeState, shapeReduce } from "./shape"

export const octagonTool: Tool<ShapeState, ToolEvent> = {
  name: "octagon",
  initial: SHAPE_INITIAL,
  reduce(state, event, ctx: ToolContext) {
    return shapeReduce({
      state,
      event,
      modifiers: ctx.modifiers,
      factory: (box) => newOctagon(box),
    })
  },
}
```

In `packages/tools/src/types.ts`, widen `ToolName` (lines 4-19):

```ts
export type ToolName =
  | "selection"
  | "rectangle"
  | "ellipse"
  | "diamond"
  | "triangle"
  | "parallelogram"
  | "hexagon"
  | "pentagon"
  | "octagon"
  | "line"
  | "arrow"
  | "freedraw"
  | "text"
  | "eraser"
  | "frame"
  | "image"
  | "note"
```

In `packages/tools/src/registry.ts`, add the imports and registry entries:

```ts
import { arrowTool } from "./tools/arrow"
import { diamondTool } from "./tools/diamond"
import { ellipseTool } from "./tools/ellipse"
import { eraserTool } from "./tools/eraser"
import { frameTool } from "./tools/frame"
import { freedrawTool } from "./tools/freedraw"
import { hexagonTool } from "./tools/hexagon"
import { imageTool } from "./tools/image"
import { lineTool } from "./tools/line"
import { noteTool } from "./tools/note"
import { octagonTool } from "./tools/octagon"
import { parallelogramTool } from "./tools/parallelogram"
import { pentagonTool } from "./tools/pentagon"
import { rectangleTool } from "./tools/rectangle"
import { selectionTool } from "./tools/selection"
import { textTool } from "./tools/text"
import { triangleTool } from "./tools/triangle"
import type { AnyToolEvent, Tool, ToolName } from "./types"

export const TOOLS: Record<ToolName, Tool<unknown, AnyToolEvent>> = {
  selection: selectionTool,
  rectangle: rectangleTool,
  ellipse: ellipseTool,
  diamond: diamondTool,
  triangle: triangleTool,
  parallelogram: parallelogramTool,
  hexagon: hexagonTool,
  pentagon: pentagonTool,
  octagon: octagonTool,
  line: lineTool,
  arrow: arrowTool,
  freedraw: freedrawTool,
  text: textTool,
  eraser: eraserTool,
  frame: frameTool,
  image: imageTool,
  note: noteTool,
}
```

In `packages/tools/src/index.ts`, add the two new tool exports right after `hexagonTool`:

```ts
export { hexagonTool } from "./tools/hexagon"
export { pentagonTool } from "./tools/pentagon"
export { octagonTool } from "./tools/octagon"
export type { ShapeState } from "./tools/shape"
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @excalidraw-clone/tools test -- test/shape-tools.test.ts`
Expected: PASS (all `describe.each` cases for all 8 shape tools, plus the registry test)

- [ ] **Step 5: Commit**

```bash
git add packages/tools/src/tools/pentagon.ts packages/tools/src/tools/octagon.ts packages/tools/src/types.ts packages/tools/src/registry.ts packages/tools/src/index.ts packages/tools/test/shape-tools.test.ts
git commit -m "tools: add pentagon and octagon drag-to-size tools"
```

---

## Task 5: UI — icons and the `MoreShapesMenu` component

**Files:**

- Modify: `packages/ui/src/shared/icons.ts`
- Create: `packages/ui/src/MoreShapesMenu.tsx`
- Modify: `packages/ui/src/index.ts`
- Test: `packages/ui/test/MoreShapesMenu.test.tsx`

**Interfaces:**

- Consumes: `iconHTML` from `./shared/icons` (existing, unchanged signature); `IconButton`, `IconButtonProps` from `./shared/IconButton` (existing, unchanged — reused as-is for both the trigger and the two popout items).
- Produces:
  - `ICONS` gains three new keys: `"pentagon"`, `"octagon"`, `"more-shapes"`.
  - `MoreShapesMenuProps { t: (key: string) => string; activeTool: string; open: boolean; onOpenChange: (open: boolean) => void; onSelectTool: (tool: "pentagon" | "octagon") => void; className?: string }`.
  - `MoreShapesMenu(props: MoreShapesMenuProps): React.ReactElement`, exported from `@excalidraw-clone/ui`, with trigger testid `"toolbar-more-shapes"` and popout item testids `"toolbar-pentagon"` / `"toolbar-octagon"`.

- [ ] **Step 1: Add the three new icon entries**

No dedicated unit test file exists for `ICONS` in this codebase (icon correctness is exercised indirectly, through the components that render them) — this step adds the data directly, and it is verified in Step 4 below via the `MoreShapesMenu` component test's DOM assertions (which render these exact SVGs).

In `packages/ui/src/shared/icons.ts`, add three new entries to the `ICONS` record, right after the `hamburger` entry:

```ts
  pentagon:
    '<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="10,3 17,9 14,17 6,17 3,9"/></svg>',
  octagon:
    '<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="7,2 13,2 18,7 18,13 13,18 7,18 2,13 2,7"/></svg>',
  "more-shapes":
    '<svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor"><circle cx="4" cy="10" r="1.5"/><circle cx="10" cy="10" r="1.5"/><circle cx="16" cy="10" r="1.5"/></svg>',
```

- [ ] **Step 2: Write the failing test for `MoreShapesMenu`**

Create `packages/ui/test/MoreShapesMenu.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { MoreShapesMenu, type MoreShapesMenuProps } from "../src/MoreShapesMenu"

const t = (key: string): string => key

const baseProps = (): MoreShapesMenuProps => ({
  t,
  activeTool: "selection",
  open: false,
  onOpenChange: vi.fn(),
  onSelectTool: vi.fn(),
})

describe("MoreShapesMenu", () => {
  it("trigger is visible when closed; pentagon/octagon buttons are not", () => {
    render(<MoreShapesMenu {...baseProps()} />)
    expect(screen.getByTestId("toolbar-more-shapes")).toBeInTheDocument()
    expect(screen.queryByTestId("toolbar-pentagon")).not.toBeInTheDocument()
    expect(screen.queryByTestId("toolbar-octagon")).not.toBeInTheDocument()
  })

  it("renders pentagon and octagon buttons when open", () => {
    render(<MoreShapesMenu {...baseProps()} open />)
    expect(screen.getByTestId("toolbar-pentagon")).toBeInTheDocument()
    expect(screen.getByTestId("toolbar-octagon")).toBeInTheDocument()
  })

  it("clicking the trigger toggles open via onOpenChange", async () => {
    const onOpenChange = vi.fn()
    render(<MoreShapesMenu {...baseProps()} onOpenChange={onOpenChange} />)
    await userEvent.click(screen.getByTestId("toolbar-more-shapes"))
    expect(onOpenChange).toHaveBeenCalledWith(true)
  })

  it("selecting pentagon calls onSelectTool and closes the popout", async () => {
    const onSelectTool = vi.fn()
    const onOpenChange = vi.fn()
    render(
      <MoreShapesMenu
        {...baseProps()}
        open
        onSelectTool={onSelectTool}
        onOpenChange={onOpenChange}
      />,
    )
    await userEvent.click(screen.getByTestId("toolbar-pentagon"))
    expect(onSelectTool).toHaveBeenCalledWith("pentagon")
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("selecting octagon calls onSelectTool and closes the popout", async () => {
    const onSelectTool = vi.fn()
    const onOpenChange = vi.fn()
    render(
      <MoreShapesMenu
        {...baseProps()}
        open
        onSelectTool={onSelectTool}
        onOpenChange={onOpenChange}
      />,
    )
    await userEvent.click(screen.getByTestId("toolbar-octagon"))
    expect(onSelectTool).toHaveBeenCalledWith("octagon")
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("marks the trigger active when the active tool is pentagon or octagon", () => {
    render(<MoreShapesMenu {...baseProps()} activeTool="pentagon" />)
    expect(screen.getByTestId("toolbar-more-shapes")).toHaveAttribute("aria-pressed", "true")
  })

  it("Escape closes the menu when open", async () => {
    const onOpenChange = vi.fn()
    render(<MoreShapesMenu {...baseProps()} open onOpenChange={onOpenChange} />)
    await userEvent.keyboard("{Escape}")
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("Escape does nothing when the menu is closed", async () => {
    const onOpenChange = vi.fn()
    render(<MoreShapesMenu {...baseProps()} onOpenChange={onOpenChange} />)
    await userEvent.keyboard("{Escape}")
    expect(onOpenChange).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm --filter @excalidraw-clone/ui test -- test/MoreShapesMenu.test.tsx`
Expected: FAIL with a module-not-found error — `../src/MoreShapesMenu` does not exist yet.

- [ ] **Step 5: Implement `MoreShapesMenu`**

Create `packages/ui/src/MoreShapesMenu.tsx`:

```tsx
import { useEffect } from "react"
import { IconButton } from "./shared/IconButton"
import { iconHTML } from "./shared/icons"

export interface MoreShapesMenuProps {
  t: (key: string) => string
  activeTool: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelectTool: (tool: "pentagon" | "octagon") => void
  className?: string
}

export function MoreShapesMenu(props: MoreShapesMenuProps): React.ReactElement {
  const { open, onOpenChange } = props

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onOpenChange(false)
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [open, onOpenChange])

  const select = (tool: "pentagon" | "octagon") => (): void => {
    props.onSelectTool(tool)
    onOpenChange(false)
  }

  const isActive = props.activeTool === "pentagon" || props.activeTool === "octagon"

  return (
    <div className={`relative ${props.className ?? ""}`}>
      <IconButton
        label={props.t("toolbar.moreShapes")}
        active={isActive}
        onClick={() => onOpenChange(!open)}
        data-testid="toolbar-more-shapes"
      >
        <span aria-hidden dangerouslySetInnerHTML={{ __html: iconHTML("more-shapes") }} />
      </IconButton>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-11 z-50 flex gap-1 rounded-lg bg-white p-2 shadow-lg"
        >
          <IconButton
            label={props.t("toolbar.pentagon")}
            active={props.activeTool === "pentagon"}
            onClick={select("pentagon")}
            data-testid="toolbar-pentagon"
          >
            <span aria-hidden dangerouslySetInnerHTML={{ __html: iconHTML("pentagon") }} />
          </IconButton>
          <IconButton
            label={props.t("toolbar.octagon")}
            active={props.activeTool === "octagon"}
            onClick={select("octagon")}
            data-testid="toolbar-octagon"
          >
            <span aria-hidden dangerouslySetInnerHTML={{ __html: iconHTML("octagon") }} />
          </IconButton>
        </div>
      )}
    </div>
  )
}
```

In `packages/ui/src/index.ts`, add the export right after the `LayersPanel` export block:

```ts
export { MoreShapesMenu } from "./MoreShapesMenu"
export type { MoreShapesMenuProps } from "./MoreShapesMenu"
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @excalidraw-clone/ui test -- test/MoreShapesMenu.test.tsx`
Expected: PASS (all 8 tests)

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/shared/icons.ts packages/ui/src/MoreShapesMenu.tsx packages/ui/src/index.ts packages/ui/test/MoreShapesMenu.test.tsx
git commit -m "ui: add pentagon/octagon icons and the MoreShapesMenu component"
```

---

## Task 6: Toolbar + App wiring + keyboard shortcuts + i18n

**Files:**

- Modify: `packages/ui/src/Toolbar.tsx`
- Modify: `packages/ui/test/Toolbar.test.tsx`
- Modify: `apps/web/src/components/App.tsx:104-107` (state), `apps/web/src/components/App.tsx:280-288` (`<Toolbar>` call)
- Modify: `packages/ui/src/HelpDialog.tsx:8-24` (`TOOL_SHORTCUTS`)
- Modify: `packages/ui/test/HelpDialog.test.tsx`
- Modify: `apps/web/src/keyboard/shortcuts.ts:18-34` (`TOOL_KEYS`)
- Modify: `apps/web/test/keyboard-shortcuts.test.ts`
- Modify: `apps/web/src/locales/en/common.json`, `apps/web/src/locales/ko/common.json`
- Modify: `apps/web/src/locales/en/shortcuts.json`, `apps/web/src/locales/ko/shortcuts.json`
- Modify: `apps/web/test/i18n-shortcuts.test.tsx`

**Interfaces:**

- Consumes: `MoreShapesMenu`, `MoreShapesMenuProps` from `@excalidraw-clone/ui` (Task 5); `ToolName` from `@excalidraw-clone/tools` (Task 4, already widened to include `"pentagon"`/`"octagon"` — `Toolbar`'s existing `activeTool: ToolName` / `onSelectTool: (tool: ToolName) => void` props need no signature change).
- Produces: `ToolbarProps` gains `moreShapesOpen: boolean` and `onMoreShapesOpenChange: (open: boolean) => void`; `App.tsx` owns a new `moreShapesOpen` state; `TOOL_KEYS` in `apps/web/src/keyboard/shortcuts.ts` maps `"5"` → `"pentagon"`, `"8"` → `"octagon"`; `HelpDialog`'s `TOOL_SHORTCUTS` documents both; all four locale JSON files gain `toolbar.pentagon`, `toolbar.octagon`, `toolbar.moreShapes` (common.json) and `pentagon`, `octagon` (shortcuts.json) keys.

- [ ] **Step 1: Write the failing test for the Toolbar's new slot**

Replace the full contents of `packages/ui/test/Toolbar.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { Toolbar } from "../src/Toolbar"

const t = (key: string): string => key

const baseProps = () => ({
  t,
  activeTool: "selection" as const,
  onSelectTool: () => {},
  lockActiveTool: false,
  onToggleLock: () => {},
  moreShapesOpen: false,
  onMoreShapesOpenChange: () => {},
})

describe("Toolbar", () => {
  it("renders all 10 tool buttons + lock toggle", () => {
    render(<Toolbar {...baseProps()} />)
    for (const name of [
      "selection",
      "rectangle",
      "ellipse",
      "diamond",
      "line",
      "arrow",
      "freedraw",
      "text",
      "image",
      "eraser",
      "frame",
    ]) {
      expect(screen.getByTestId(`toolbar-${name}`)).toBeInTheDocument()
    }
    expect(screen.getByTestId("toolbar-lock")).toBeInTheDocument()
  })

  it("renders a note tool button", () => {
    render(<Toolbar {...baseProps()} />)
    expect(screen.getByTestId("toolbar-note")).toBeInTheDocument()
  })

  it("renders the flowchart shape buttons", () => {
    render(<Toolbar {...baseProps()} />)
    expect(screen.getByTestId("toolbar-triangle")).toBeInTheDocument()
    expect(screen.getByTestId("toolbar-parallelogram")).toBeInTheDocument()
    expect(screen.getByTestId("toolbar-hexagon")).toBeInTheDocument()
  })

  it("marks the active tool as pressed", () => {
    render(<Toolbar {...baseProps()} activeTool="rectangle" />)
    expect(screen.getByTestId("toolbar-rectangle")).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByTestId("toolbar-selection")).toHaveAttribute("aria-pressed", "false")
  })

  it("calls onSelectTool with the tool name on click", async () => {
    const onSelectTool = vi.fn()
    render(<Toolbar {...baseProps()} onSelectTool={onSelectTool} />)
    await userEvent.click(screen.getByTestId("toolbar-rectangle"))
    expect(onSelectTool).toHaveBeenCalledWith("rectangle")
  })

  it("toggles lock and calls onToggleLock with negated value", async () => {
    const onToggleLock = vi.fn()
    render(<Toolbar {...baseProps()} onToggleLock={onToggleLock} />)
    await userEvent.click(screen.getByTestId("toolbar-lock"))
    expect(onToggleLock).toHaveBeenCalledWith(true)
  })

  it("renders the more-shapes trigger right after hexagon, closed by default", () => {
    render(<Toolbar {...baseProps()} />)
    expect(screen.getByTestId("toolbar-more-shapes")).toBeInTheDocument()
    expect(screen.queryByTestId("toolbar-pentagon")).not.toBeInTheDocument()
    expect(screen.queryByTestId("toolbar-octagon")).not.toBeInTheDocument()
  })

  it("shows pentagon/octagon buttons when moreShapesOpen is true", () => {
    render(<Toolbar {...baseProps()} moreShapesOpen />)
    expect(screen.getByTestId("toolbar-pentagon")).toBeInTheDocument()
    expect(screen.getByTestId("toolbar-octagon")).toBeInTheDocument()
  })

  it("clicking the more-shapes trigger calls onMoreShapesOpenChange", async () => {
    const onMoreShapesOpenChange = vi.fn()
    render(<Toolbar {...baseProps()} onMoreShapesOpenChange={onMoreShapesOpenChange} />)
    await userEvent.click(screen.getByTestId("toolbar-more-shapes"))
    expect(onMoreShapesOpenChange).toHaveBeenCalledWith(true)
  })

  it("selecting pentagon from the flyout calls onSelectTool", async () => {
    const onSelectTool = vi.fn()
    render(<Toolbar {...baseProps()} onSelectTool={onSelectTool} moreShapesOpen />)
    await userEvent.click(screen.getByTestId("toolbar-pentagon"))
    expect(onSelectTool).toHaveBeenCalledWith("pentagon")
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @excalidraw-clone/ui test -- test/Toolbar.test.tsx`
Expected: FAIL — `screen.getByTestId("toolbar-more-shapes")` throws (not found), since `Toolbar.tsx` doesn't render `MoreShapesMenu` yet.

- [ ] **Step 3: Wire `MoreShapesMenu` into `Toolbar`**

Replace the full contents of `packages/ui/src/Toolbar.tsx`:

```tsx
import type { ToolName } from "@excalidraw-clone/tools"
import { MoreShapesMenu } from "./MoreShapesMenu"
import { IconButton } from "./shared/IconButton"
import { iconHTML } from "./shared/icons"

const TOOL_ITEMS: ReadonlyArray<{ name: ToolName; shortcut: string }> = [
  { name: "selection", shortcut: "V" },
  { name: "rectangle", shortcut: "R" },
  { name: "ellipse", shortcut: "O" },
  { name: "diamond", shortcut: "D" },
  { name: "triangle", shortcut: "3" },
  { name: "parallelogram", shortcut: "G" },
  { name: "hexagon", shortcut: "6" },
  { name: "line", shortcut: "L" },
  { name: "arrow", shortcut: "A" },
  { name: "freedraw", shortcut: "P" },
  { name: "text", shortcut: "T" },
  { name: "image", shortcut: "9" },
  { name: "eraser", shortcut: "E" },
  { name: "frame", shortcut: "F" },
  { name: "note", shortcut: "N" },
]

const HEXAGON_INDEX = TOOL_ITEMS.findIndex((item) => item.name === "hexagon")

export interface ToolbarProps {
  t: (key: string) => string
  activeTool: ToolName
  onSelectTool: (tool: ToolName) => void
  lockActiveTool: boolean
  onToggleLock: (locked: boolean) => void
  moreShapesOpen: boolean
  onMoreShapesOpenChange: (open: boolean) => void
  className?: string
}

export function Toolbar({
  t,
  activeTool,
  onSelectTool,
  lockActiveTool,
  onToggleLock,
  moreShapesOpen,
  onMoreShapesOpenChange,
  className,
}: ToolbarProps): React.ReactElement {
  const renderItem = (item: { name: ToolName; shortcut: string }): React.ReactElement => (
    <IconButton
      key={item.name}
      label={t(`toolbar.${item.name}`)}
      shortcut={item.shortcut}
      active={activeTool === item.name}
      onClick={() => onSelectTool(item.name)}
      data-testid={`toolbar-${item.name}`}
    >
      <span aria-hidden dangerouslySetInnerHTML={{ __html: iconHTML(item.name) }} />
    </IconButton>
  )

  return (
    <div
      className={`flex items-center gap-1 rounded-lg bg-white p-1 shadow ${className ?? ""}`}
      role="toolbar"
      aria-label={t("toolbar.label")}
    >
      <IconButton
        label={t("toolbar.lock")}
        shortcut="Q"
        active={lockActiveTool}
        onClick={() => onToggleLock(!lockActiveTool)}
        data-testid="toolbar-lock"
      >
        <span aria-hidden>{lockActiveTool ? "🔒" : "🔓"}</span>
      </IconButton>
      <span className="mx-1 h-6 w-px bg-gray-200" aria-hidden />
      {TOOL_ITEMS.slice(0, HEXAGON_INDEX + 1).map(renderItem)}
      <MoreShapesMenu
        t={t}
        activeTool={activeTool}
        open={moreShapesOpen}
        onOpenChange={onMoreShapesOpenChange}
        onSelectTool={(tool) => onSelectTool(tool)}
      />
      {TOOL_ITEMS.slice(HEXAGON_INDEX + 1).map(renderItem)}
    </div>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @excalidraw-clone/ui test -- test/Toolbar.test.tsx`
Expected: PASS (all 10 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/Toolbar.tsx packages/ui/test/Toolbar.test.tsx
git commit -m "ui: wire MoreShapesMenu into Toolbar as a new slot after hexagon"
```

- [ ] **Step 6: Wire `moreShapesOpen` state into `App.tsx`**

In `apps/web/src/components/App.tsx`, add the new state next to the existing sibling states (around line 104-107):

```tsx
const [menuOpen, setMenuOpen] = useState(false)
const [libraryOpen, setLibraryOpen] = useState(false)
const [layersOpen, setLayersOpen] = useState(false)
const [moreShapesOpen, setMoreShapesOpen] = useState(false)
const [renderer, setRenderer] = useState<CanvasRenderer | null>(null)
```

Pass the new props into the `<Toolbar>` call (around line 280-288):

```tsx
<div className="absolute left-1/2 top-3 z-30 -translate-x-1/2">
  <Toolbar
    t={t}
    activeTool={activeTool}
    onSelectTool={setActiveTool}
    lockActiveTool={lockActiveTool}
    onToggleLock={() => toggleLockActiveTool()}
    moreShapesOpen={moreShapesOpen}
    onMoreShapesOpenChange={setMoreShapesOpen}
  />
</div>
```

There is no `apps/web` unit test for `App.tsx` component wiring (component-level RTL tests for this codebase's `apps/web` live only in dedicated files like `test/i18n-shortcuts.test.tsx` and `test/keyboard-shortcuts.test.ts`, not for `App.tsx` itself); this wiring is verified by `tsc` here and by the e2e spec in Task 7.

- [ ] **Step 7: Run typecheck to verify `App.tsx` compiles**

Run: `pnpm --filter @excalidraw-clone/web typecheck`
Expected: PASS (no errors)

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/App.tsx
git commit -m "web: thread moreShapesOpen state from App into Toolbar"
```

- [ ] **Step 9: Write the failing test for `HelpDialog`'s shortcut list**

In `packages/ui/test/HelpDialog.test.tsx`, add a new test after `"lists at least the canonical shortcuts"`:

```tsx
it("lists the pentagon and octagon shortcuts", () => {
  render(<HelpDialog t={t} open onClose={() => {}} />)
  expect(screen.getByText("5")).toBeInTheDocument()
  expect(screen.getByText("8")).toBeInTheDocument()
})
```

- [ ] **Step 10: Run the test to verify it fails**

Run: `pnpm --filter @excalidraw-clone/ui test -- test/HelpDialog.test.tsx`
Expected: FAIL — `screen.getByText("5")` and `screen.getByText("8")` throw (not found), since `TOOL_SHORTCUTS` doesn't have pentagon/octagon rows yet.

- [ ] **Step 11: Add pentagon/octagon rows to `TOOL_SHORTCUTS`**

In `packages/ui/src/HelpDialog.tsx`, insert two entries after the `hexagon` row (line 15):

```ts
const TOOL_SHORTCUTS: readonly Shortcut[] = [
  { keys: "V", label: "shortcuts:selection" },
  { keys: "R", label: "shortcuts:rectangle" },
  { keys: "O", label: "shortcuts:ellipse" },
  { keys: "D", label: "shortcuts:diamond" },
  { keys: "3", label: "shortcuts:triangle" },
  { keys: "G", label: "shortcuts:parallelogram" },
  { keys: "6", label: "shortcuts:hexagon" },
  { keys: "5", label: "shortcuts:pentagon" },
  { keys: "8", label: "shortcuts:octagon" },
  { keys: "L", label: "shortcuts:line" },
  { keys: "A", label: "shortcuts:arrow" },
  { keys: "P", label: "shortcuts:freedraw" },
  { keys: "T", label: "shortcuts:text" },
  { keys: "9", label: "shortcuts:image" },
  { keys: "E", label: "shortcuts:eraser" },
  { keys: "F", label: "shortcuts:frame" },
  { keys: "N", label: "shortcuts:note" },
]
```

- [ ] **Step 12: Run the test to verify it passes**

Run: `pnpm --filter @excalidraw-clone/ui test -- test/HelpDialog.test.tsx`
Expected: PASS

- [ ] **Step 13: Commit**

```bash
git add packages/ui/src/HelpDialog.tsx packages/ui/test/HelpDialog.test.tsx
git commit -m "ui: document pentagon and octagon shortcuts in HelpDialog"
```

- [ ] **Step 14: Write the failing tests for the keyboard shortcuts**

In `apps/web/test/keyboard-shortcuts.test.ts`, add two tests after `"'r' switches to rectangle tool"`:

```ts
it("'5' switches to pentagon tool", () => {
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "5" }))
  expect(useAppStore.getState().activeTool).toBe("pentagon")
})

it("'8' switches to octagon tool", () => {
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "8" }))
  expect(useAppStore.getState().activeTool).toBe("octagon")
})
```

- [ ] **Step 15: Run the tests to verify they fail**

Run: `pnpm --filter @excalidraw-clone/web test -- test/keyboard-shortcuts.test.ts`
Expected: FAIL — `TOOL_KEYS["5"]` and `TOOL_KEYS["8"]` are `undefined`, so `setActiveTool` is never called and `activeTool` stays `"selection"` (set in `beforeEach`).

- [ ] **Step 16: Add pentagon/octagon to `TOOL_KEYS`**

In `apps/web/src/keyboard/shortcuts.ts`, add two entries to `TOOL_KEYS` (after `"6": "hexagon"`):

```ts
const TOOL_KEYS: Record<string, ToolName> = {
  v: "selection",
  r: "rectangle",
  o: "ellipse",
  d: "diamond",
  "3": "triangle",
  g: "parallelogram",
  "6": "hexagon",
  "5": "pentagon",
  "8": "octagon",
  l: "line",
  a: "arrow",
  p: "freedraw",
  t: "text",
  "9": "image",
  e: "eraser",
  f: "frame",
  n: "note",
}
```

- [ ] **Step 17: Run the tests to verify they pass**

Run: `pnpm --filter @excalidraw-clone/web test -- test/keyboard-shortcuts.test.ts`
Expected: PASS

- [ ] **Step 18: Commit**

```bash
git add apps/web/src/keyboard/shortcuts.ts apps/web/test/keyboard-shortcuts.test.ts
git commit -m "web: bind 5/8 keys to pentagon/octagon tools"
```

- [ ] **Step 19: Write the failing test for real i18n resolution**

In `apps/web/test/i18n-shortcuts.test.tsx`, add two assertions to the existing test body, right after the `expect(screen.getByText("Undo")).toBeDefined()` line:

```tsx
expect(screen.getByText("Pentagon")).toBeDefined()
expect(screen.getByText("Octagon")).toBeDefined()
```

- [ ] **Step 20: Run the test to verify it fails**

Run: `pnpm --filter @excalidraw-clone/web test -- test/i18n-shortcuts.test.tsx`
Expected: FAIL — `screen.getByText("Pentagon")` throws (not found); i18next falls back to rendering the raw key `shortcuts:pentagon`/`shortcuts:octagon` text since the JSON files don't have those keys yet, so `"Pentagon"`/`"Octagon"` never appear as rendered text.

- [ ] **Step 21: Add the locale keys to all four JSON files**

In `apps/web/src/locales/en/common.json`, insert after `"hexagon": "Hexagon",`:

```json
    "hexagon": "Hexagon",
    "pentagon": "Pentagon",
    "octagon": "Octagon",
    "moreShapes": "More shapes",
    "line": "Line",
```

In `apps/web/src/locales/ko/common.json`, insert after `"hexagon": "육각형",`:

```json
    "hexagon": "육각형",
    "pentagon": "오각형",
    "octagon": "팔각형",
    "moreShapes": "도형 더 보기",
    "line": "선",
```

In `apps/web/src/locales/en/shortcuts.json`, insert after `"hexagon": "Hexagon",`:

```json
  "hexagon": "Hexagon",
  "pentagon": "Pentagon",
  "octagon": "Octagon",
  "line": "Line",
```

In `apps/web/src/locales/ko/shortcuts.json`, insert after `"hexagon": "육각형",`:

```json
  "hexagon": "육각형",
  "pentagon": "오각형",
  "octagon": "팔각형",
  "line": "선",
```

- [ ] **Step 22: Run the test to verify it passes**

Run: `pnpm --filter @excalidraw-clone/web test -- test/i18n-shortcuts.test.tsx`
Expected: PASS

- [ ] **Step 23: Commit**

```bash
git add apps/web/src/locales/en/common.json apps/web/src/locales/ko/common.json apps/web/src/locales/en/shortcuts.json apps/web/src/locales/ko/shortcuts.json apps/web/test/i18n-shortcuts.test.tsx
git commit -m "web: add pentagon/octagon i18n strings for en and ko"
```

---

## Task 7: E2e — `more-shapes.spec.ts`

**Files:**

- Create: `apps/web/e2e/more-shapes.spec.ts`

**Interfaces:**

- Consumes: `dragOnCanvas` from `./_helpers` (existing, unchanged); testids `toolbar-more-shapes`, `toolbar-pentagon`, `toolbar-octagon` (Task 5/6); keyboard shortcuts `5`/`8` (Task 6); the `excalidraw-scene` localStorage schema with element `type: "pentagon" | "octagon"` (Task 2) and `containerId`/`text` fields for labels (existing scene schema, unchanged).
- Produces: nothing consumed by later tasks (this is the last task).

- [ ] **Step 1: Write the e2e spec**

Create `apps/web/e2e/more-shapes.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test"
import { dragOnCanvas } from "./_helpers"

type SceneEl = {
  id: string
  type: string
  x: number
  y: number
  width: number
  height: number
  text?: string
  containerId?: string | null
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
  await page.locator('[data-testid="toolbar-more-shapes"]').waitFor({ state: "visible" })
}

const dblClickCanvas = async (page: Page, at: { x: number; y: number }): Promise<void> => {
  const canvas = page.locator("canvas").first()
  const box = await canvas.boundingBox()
  if (!box) throw new Error("canvas not found")
  await page.mouse.dblclick(box.x + at.x, box.y + at.y)
}

const drawViaFlyout = async (
  page: Page,
  shape: "pentagon" | "octagon",
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> => {
  await page.locator('[data-testid="toolbar-more-shapes"]').click()
  await page.locator(`[data-testid="toolbar-${shape}"]`).click()
  await dragOnCanvas(page, from, to)
  await page.waitForTimeout(120)
}

test("opens the flyout, draws pentagon and octagon, and closes automatically after selection", async ({
  page,
}) => {
  await freshCanvas(page)

  // flyout starts closed: pentagon/octagon testids are not in the DOM
  await expect(page.locator('[data-testid="toolbar-pentagon"]')).toHaveCount(0)

  await page.locator('[data-testid="toolbar-more-shapes"]').click()
  await expect(page.locator('[data-testid="toolbar-pentagon"]')).toBeVisible()
  await expect(page.locator('[data-testid="toolbar-octagon"]')).toBeVisible()

  await page.locator('[data-testid="toolbar-pentagon"]').click()
  // selecting a shape closes the popout
  await expect(page.locator('[data-testid="toolbar-octagon"]')).toHaveCount(0)
  await dragOnCanvas(page, { x: 60, y: 60 }, { x: 160, y: 140 })
  await page.waitForTimeout(120)

  await drawViaFlyout(page, "octagon", { x: 220, y: 60 }, { x: 340, y: 160 })

  await page.waitForTimeout(900)
  const els = await readScene(page)
  const types = els.map((e) => e.type).sort()
  expect(types).toEqual(["octagon", "pentagon"])

  const pentagon = els.find((e) => e.type === "pentagon")!
  expect(pentagon.width).toBeCloseTo(100, 0)
  expect(pentagon.height).toBeCloseTo(80, 0)

  const octagon = els.find((e) => e.type === "octagon")!
  expect(octagon.width).toBeCloseTo(120, 0)
  expect(octagon.height).toBeCloseTo(100, 0)
})

test("keyboard shortcuts 5 and 8 select pentagon/octagon directly without opening the flyout", async ({
  page,
}) => {
  await freshCanvas(page)

  await page.keyboard.press("5")
  await expect(page.locator('[data-testid="toolbar-pentagon"]')).toHaveCount(0)
  await dragOnCanvas(page, { x: 60, y: 60 }, { x: 160, y: 140 })
  await page.waitForTimeout(120)

  await page.keyboard.press("8")
  await expect(page.locator('[data-testid="toolbar-octagon"]')).toHaveCount(0)
  await dragOnCanvas(page, { x: 220, y: 60 }, { x: 340, y: 160 })

  await page.waitForTimeout(900)
  const types = (await readScene(page)).map((e) => e.type).sort()
  expect(types).toEqual(["octagon", "pentagon"])
})

test("Escape closes the open flyout", async ({ page }) => {
  await freshCanvas(page)

  await page.locator('[data-testid="toolbar-more-shapes"]').click()
  await expect(page.locator('[data-testid="toolbar-pentagon"]')).toBeVisible()

  await page.keyboard.press("Escape")
  await expect(page.locator('[data-testid="toolbar-pentagon"]')).toHaveCount(0)
})

test("double-click a pentagon and an octagon each add a label", async ({ page }) => {
  await freshCanvas(page)

  await drawViaFlyout(page, "pentagon", { x: 100, y: 100 }, { x: 220, y: 180 })
  await page.locator('[data-testid="toolbar-selection"]').click()
  await dblClickCanvas(page, { x: 160, y: 140 })
  let textarea = page.locator("textarea")
  await textarea.waitFor({ state: "visible" })
  await textarea.fill("Pentagon label")
  await page.mouse.click(500, 400)
  await page.waitForTimeout(900)

  let els = await readScene(page)
  const pentagon = els.find((e) => e.type === "pentagon")!
  let label = els.find((e) => e.type === "text" && e.containerId === pentagon.id)!
  expect(label.text).toBe("Pentagon label")

  await drawViaFlyout(page, "octagon", { x: 300, y: 100 }, { x: 420, y: 180 })
  await page.locator('[data-testid="toolbar-selection"]').click()
  await dblClickCanvas(page, { x: 360, y: 140 })
  textarea = page.locator("textarea")
  await textarea.waitFor({ state: "visible" })
  await textarea.fill("Octagon label")
  await page.mouse.click(500, 450)
  await page.waitForTimeout(900)

  els = await readScene(page)
  const octagon = els.find((e) => e.type === "octagon")!
  label = els.find((e) => e.type === "text" && e.containerId === octagon.id)!
  expect(label.text).toBe("Octagon label")
})
```

- [ ] **Step 2: Run the e2e spec to verify it fails**

Run: `pnpm --filter @excalidraw-clone/web e2e -- e2e/more-shapes.spec.ts`
Expected: FAIL before this plan's other tasks are implemented (no `toolbar-more-shapes` testid exists). If Tasks 1-6 are already complete when this task runs, this spec should already PASS on the first run since all underlying functionality exists — in that case, skip to Step 3's confirmation run directly.

- [ ] **Step 3: Run the e2e spec to verify it passes**

Run: `pnpm --filter @excalidraw-clone/web e2e -- e2e/more-shapes.spec.ts`
Expected: PASS (all 4 tests)

- [ ] **Step 4: Run the full existing e2e suite to confirm no regressions**

Run: `pnpm --filter @excalidraw-clone/web e2e`
Expected: PASS — all ~20 pre-existing specs (including `flowchart-shapes.spec.ts` and `shape-labels.spec.ts`) remain green, unmodified.

- [ ] **Step 5: Run the full gate**

Run: `pnpm typecheck && pnpm test && pnpm --filter @excalidraw-clone/web e2e`
Expected: PASS across every package (`geometry`, `scene`, `renderer`, `tools`, `ui`, `web`)

- [ ] **Step 6: Commit**

```bash
git add apps/web/e2e/more-shapes.spec.ts
git commit -m "web: e2e coverage for pentagon/octagon flyout, shortcuts, and labels"
```
