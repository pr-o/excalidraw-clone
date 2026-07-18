# Arrow & Line Labels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Double-click an arrow or line to add a text label pinned to the midpoint of its path; the label follows every edit and renders over a canvas-colored backing rect in both canvas and SVG output.

**Architecture:** Reuses the shape-labels bound-text pipeline (`containerId`/`boundElements`/`reconcileBoundText`). New geometry helper `polylineMidpoint` finds the 50%-of-path-length point; the scene reconciler gains a recenter-only branch for linear containers; the selection tool's double-click gains a linear creation branch; both renderers paint an occlusion rect behind linear labels.

**Tech Stack:** TypeScript monorepo (pnpm + turbo), vitest unit tests, Playwright e2e. Spec: `docs/superpowers/specs/2026-07-18-arrow-labels-design.md`.

## Global Constraints

- Bound labels are plain `text` elements — no new element types, no new fields on arrows/lines.
- Label creation mutations use `skipHistory: true` so an abandoned empty label is invisible to undo.
- Shape-label and sticky-note reconcile behavior must stay byte-identical (existing tests enforce this).
- Occlusion backing padding is 4px per side; backing only for labels whose container is `arrow`/`line`.
- RTK filters test output: check pass/fail with `>/dev/null 2>&1 && echo PASS || echo FAIL`; on FAIL rerun via `rtk proxy` to see details.
- `pnpm lint` is CWD-dependent — run lint from the repo root only.
- Commit messages follow existing style: `<package>: <what changed>` + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: geometry — `polylineMidpoint`

**Files:**

- Create: `packages/geometry/src/polyline.ts`
- Modify: `packages/geometry/src/index.ts`
- Test: `packages/geometry/test/polyline.test.ts`

**Interfaces:**

- Consumes: `Point` from `packages/geometry/src/types.ts` (`{ x: number; y: number }`).
- Produces: `polylineMidpoint(points: readonly Point[]): Point` — the point at half the polyline's cumulative length, in the same (element-local) space as the input. Tasks 2 uses it from `@excalidraw-clone/geometry`.

- [ ] **Step 1: Write the failing test**

Create `packages/geometry/test/polyline.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { polylineMidpoint } from "../src/polyline"

describe("polylineMidpoint", () => {
  it("returns the midpoint of a straight two-point segment", () => {
    expect(
      polylineMidpoint([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ]),
    ).toEqual({ x: 5, y: 0 })
  })

  it("lands at half total length across uneven segments", () => {
    // lengths 10 then 20; half of 30 is 15 → 5 into the second segment
    const p = polylineMidpoint([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 20 },
    ])
    expect(p.x).toBeCloseTo(10)
    expect(p.y).toBeCloseTo(5)
  })

  it("returns the single point for a one-point polyline", () => {
    expect(polylineMidpoint([{ x: 3, y: 4 }])).toEqual({ x: 3, y: 4 })
  })

  it("returns the first point when all points coincide", () => {
    expect(
      polylineMidpoint([
        { x: 3, y: 4 },
        { x: 3, y: 4 },
      ]),
    ).toEqual({ x: 3, y: 4 })
  })

  it("returns the origin for an empty polyline", () => {
    expect(polylineMidpoint([])).toEqual({ x: 0, y: 0 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @excalidraw-clone/geometry test >/dev/null 2>&1 && echo PASS || echo FAIL`
Expected: `FAIL` (module `../src/polyline` does not exist)

- [ ] **Step 3: Write minimal implementation**

Create `packages/geometry/src/polyline.ts`:

```ts
import type { Point } from "./types"
import { pointDistance } from "./vector"

/** Point at half the polyline's cumulative length, in the polyline's own
 *  coordinate space. Degenerate inputs fall back to the first point
 *  (or the origin for an empty polyline). */
export const polylineMidpoint = (points: readonly Point[]): Point => {
  if (points.length === 0) return { x: 0, y: 0 }
  if (points.length === 1) return points[0]!
  let total = 0
  for (let i = 0; i < points.length - 1; i += 1) {
    total += pointDistance(points[i]!, points[i + 1]!)
  }
  if (total === 0) return points[0]!
  let remaining = total / 2
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i]!
    const b = points[i + 1]!
    const len = pointDistance(a, b)
    if (remaining <= len) {
      const t = len === 0 ? 0 : remaining / len
      return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) }
    }
    remaining -= len
  }
  return points[points.length - 1]!
}
```

In `packages/geometry/src/index.ts`, after the line `export { labelInnerBox } from "./label-box"`... block, add:

```ts
export { polylineMidpoint } from "./polyline"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @excalidraw-clone/geometry test >/dev/null 2>&1 && echo PASS || echo FAIL`
Expected: `PASS`

- [ ] **Step 5: Commit**

```bash
git add packages/geometry/src/polyline.ts packages/geometry/src/index.ts packages/geometry/test/polyline.test.ts
git commit -m "geometry: polylineMidpoint — point at half a polyline's path length

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: scene — `LINEAR_LABELABLE_TYPES`, `newLabelForLinear`, linear reconcile branch

**Files:**

- Modify: `packages/scene/src/reconcile-bound-text.ts`
- Modify: `packages/scene/src/factories.ts` (after `newLabelFor`, ~line 245)
- Modify: `packages/scene/src/index.ts`
- Test: `packages/scene/test/labels.test.ts` (extend)

**Interfaces:**

- Consumes: `polylineMidpoint(points: readonly Point[]): Point` from `@excalidraw-clone/geometry` (Task 1); existing `newText`, `DEFAULT_FONT_SIZE` (20), `DEFAULT_LINE_HEIGHT` (1.25).
- Produces: `LINEAR_LABELABLE_TYPES: ReadonlySet<ElementType>` (contains `"arrow"`, `"line"`) exported from `reconcile-bound-text.ts`; `newLabelForLinear(container: { id: string; x: number; y: number; points: readonly Point[] }): ExcalidrawTextElement` exported from `factories.ts`; both re-exported from the package root (Tasks 3–5 import them from `@excalidraw-clone/scene`). `reconcileBoundText` recenters (never resizes) labels of arrow/line containers on the path midpoint.

- [ ] **Step 1: Write the failing tests**

In `packages/scene/test/labels.test.ts`, extend the import to:

```ts
import {
  LABELABLE_TYPES,
  LINEAR_LABELABLE_TYPES,
  newArrow,
  newDiamond,
  newHexagon,
  newLabelFor,
  newLabelForLinear,
  newLine,
  newNote,
  reconcileBoundText,
} from "../src"
```

Append at the end of the file:

```ts
describe("LINEAR_LABELABLE_TYPES", () => {
  it("contains exactly arrow and line", () => {
    expect([...LINEAR_LABELABLE_TYPES].sort()).toEqual(["arrow", "line"])
  })
})

describe("newLabelForLinear", () => {
  it("returns a centered empty text bound to the arrow", () => {
    const arrow = {
      ...newArrow({ x: 100, y: 50 }),
      points: [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 40, y: 40 },
      ],
    }
    const label = newLabelForLinear(arrow)
    expect(label.type).toBe("text")
    expect(label.text).toBe("")
    expect(label.textAlign).toBe("center")
    expect(label.verticalAlign).toBe("middle")
    expect(label.containerId).toBe(arrow.id)
  })

  it("centers a zero-width box on the path midpoint", () => {
    // segment lengths 40 + 40; half of 80 lands at the corner (40, 0)
    const arrow = {
      ...newArrow({ x: 100, y: 50 }),
      points: [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 40, y: 40 },
      ],
    }
    const label = newLabelForLinear(arrow)
    // height = DEFAULT_FONT_SIZE 20 × DEFAULT_LINE_HEIGHT 1.25 = 25
    expect({ x: label.x, y: label.y, width: label.width, height: label.height }).toEqual({
      x: 140,
      y: 37.5,
      width: 0,
      height: 25,
    })
  })
})

describe("reconcileBoundText — linear containers", () => {
  const linkedLine = () => {
    const line = {
      ...newLine({ x: 0, y: 0, width: 100, height: 0 }),
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
    }
    const label = { ...newLabelForLinear(line), width: 24, height: 24 }
    const linked = { ...line, boundElements: [{ id: label.id, type: "text" as const }] }
    return { linked, label }
  }

  it("recenters the label on the midpoint after the container moves", () => {
    const { linked, label } = linkedLine()
    const draft: ExcalidrawElement[] = [{ ...linked, x: 200, y: 100 }, label]
    reconcileBoundText(draft)
    const t = draft[1]!
    expect({ x: t.x, y: t.y }).toEqual({ x: 250 - 12, y: 100 - 12 })
  })

  it("recenters after the points change and never resizes", () => {
    const { linked, label } = linkedLine()
    const bent = {
      ...linked,
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
      ],
    }
    const draft: ExcalidrawElement[] = [bent, label]
    reconcileBoundText(draft)
    const t = draft[1]!
    // total length 200, half = 100 → the corner (100, 0)
    expect({ x: t.x, y: t.y, width: t.width, height: t.height }).toEqual({
      x: 100 - 12,
      y: 0 - 12,
      width: 24,
      height: 24,
    })
  })

  it("is idempotent: a second pass leaves the label reference-equal", () => {
    const { linked, label } = linkedLine()
    const draft: ExcalidrawElement[] = [linked, label]
    reconcileBoundText(draft)
    const after = draft[1]!
    reconcileBoundText(draft)
    expect(draft[1]).toBe(after)
  })

  it("cascades isDeleted from a deleted arrow to its label", () => {
    const arrow = {
      ...newArrow({ x: 0, y: 0 }),
      points: [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
      ],
    }
    const label = newLabelForLinear(arrow)
    const draft: ExcalidrawElement[] = [
      { ...arrow, boundElements: [{ id: label.id, type: "text" }], isDeleted: true },
      label,
    ]
    reconcileBoundText(draft)
    expect(draft[1]!.isDeleted).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @excalidraw-clone/scene test >/dev/null 2>&1 && echo PASS || echo FAIL`
Expected: `FAIL` (`LINEAR_LABELABLE_TYPES` / `newLabelForLinear` not exported)

- [ ] **Step 3: Implement**

In `packages/scene/src/reconcile-bound-text.ts`:

1. Change the geometry import to include `polylineMidpoint`:

```ts
import { labelInnerBox, polylineMidpoint, type LabelShapeKind } from "@excalidraw-clone/geometry"
```

2. After the `LABELABLE_TYPES` declaration, add:

```ts
/** Linear elements that can carry a midpoint-pinned bound text label. */
export const LINEAR_LABELABLE_TYPES: ReadonlySet<ElementType> = new Set<ElementType>([
  "arrow",
  "line",
])
```

3. In `reconcileBoundText`, after the `if (container.isDeleted) { ... continue }` block and before `const { x, y, width, height } = innerBoxFor(container)`, insert (the explicit type check — not `LINEAR_LABELABLE_TYPES.has` — narrows the union so `.points` typechecks):

```ts
if (container.type === "arrow" || container.type === "line") {
  const mid = polylineMidpoint(container.points)
  const x = container.x + mid.x - text.width / 2
  const y = container.y + mid.y - text.height / 2
  if (
    text.x !== x ||
    text.y !== y ||
    text.textAlign !== "center" ||
    text.verticalAlign !== "middle"
  ) {
    draft[ti] = { ...text, x, y, textAlign: "center", verticalAlign: "middle" }
  }
  continue
}
```

4. Update the function's doc comment first sentence to mention both behaviors, e.g.: "each non-deleted shape container keeps its bound text sized to the shape-aware inner label box; a linear (arrow/line) container keeps its bound text recentered on the path midpoint without resizing".

In `packages/scene/src/factories.ts`:

1. Extend the geometry import:

```ts
import {
  labelInnerBox,
  polylineMidpoint,
  type LabelShapeKind,
  type Point,
} from "@excalidraw-clone/geometry"
```

2. After `newLabelFor` (~line 245), add:

```ts
/** Empty centered label text bound to a linear `container` (arrow/line),
 *  its zero-width box centered on the midpoint of the container's path.
 *  Caller must add `{ id, type: "text" }` to the container's boundElements. */
export const newLabelForLinear = (container: {
  id: string
  x: number
  y: number
  points: readonly Point[]
}): ExcalidrawTextElement => {
  const mid = polylineMidpoint(container.points)
  const height = DEFAULT_FONT_SIZE * DEFAULT_LINE_HEIGHT
  return newText({
    x: container.x + mid.x,
    y: container.y + mid.y - height / 2,
    width: 0,
    height,
    text: "",
    textAlign: "center",
    verticalAlign: "middle",
    containerId: container.id,
  })
}
```

Note: `DEFAULT_FONT_SIZE` and `DEFAULT_LINE_HEIGHT` are already imported at the top of `factories.ts`.

In `packages/scene/src/index.ts`:

- Add `newLabelForLinear,` to the factories export list (alphabetical, next to `newLabelFor`).
- Change the reconcile export line to:

```ts
export {
  LABELABLE_TYPES,
  LINEAR_LABELABLE_TYPES,
  NOTE_PADDING,
  reconcileBoundText,
} from "./reconcile-bound-text"
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @excalidraw-clone/scene test >/dev/null 2>&1 && echo PASS || echo FAIL`
Expected: `PASS` (including the untouched shape-label byte-identity tests)

- [ ] **Step 5: Commit**

```bash
git add packages/scene/src/reconcile-bound-text.ts packages/scene/src/factories.ts packages/scene/src/index.ts packages/scene/test/labels.test.ts
git commit -m "scene: newLabelForLinear + midpoint-recentering reconcile for arrow/line labels

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: tools — double-click an arrow/line creates a bound label

**Files:**

- Modify: `packages/tools/src/tools/selection/index.ts` (imports ~line 2–7; doubleClick branch ~line 192)
- Test: `packages/tools/test/selection-doubleclick.test.ts` (extend + amend one existing test)

**Interfaces:**

- Consumes: `newLabelForLinear` from `@excalidraw-clone/scene` (Task 2); existing `LABELABLE_TYPES`, `newLabelFor`, effect kinds `mutation`/`select`/`startTextEdit`.
- Produces: no new exports — behavior change only. Double-click on a bare arrow/line emits the same three-effect sequence as bare shapes.

- [ ] **Step 1: Amend the stale test and write the failing tests**

In `packages/tools/test/selection-doubleclick.test.ts`:

1. The existing test `"double-click on a non-labelable element is a no-op"` uses `newLine` — lines are now labelable. Replace that test's body to use freedraw, and update the import list (add `newArrow`, `newFreedraw`; keep `newLine`):

```ts
it("double-click on a non-labelable element is a no-op", () => {
  const f = newFreedraw({ x: 0, y: 0, width: 10, height: 10 })
  const ctx = makeCtx({ hitTest: () => f })
  const out = selectionTool.reduce(
    selectionTool.initial,
    { type: "doubleClick", at: point(5, 5) },
    ctx,
  )
  expect(out[1]).toEqual([])
})
```

2. Append new tests:

```ts
it("double-click on a bare arrow creates a midpoint label and starts editing", () => {
  const arrow = {
    ...newArrow({ x: 10, y: 20 }),
    points: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
  }
  const ctx = makeCtx({ readElements: () => [arrow], hitTest: () => arrow })
  const [, effects] = selectionTool.reduce(
    selectionTool.initial,
    { type: "doubleClick", at: point(40, 20) },
    ctx,
  )
  const draft: ExcalidrawElement[] = [arrow]
  applyMutation([...effects], draft)

  const label = draft.find((e) => e.type === "text")
  expect(label).toBeDefined()
  expect(label!.containerId).toBe(arrow.id)
  // zero-width box centered on the path midpoint (10 + 50, 20 + 0)
  expect(label!.x).toBe(60)
  expect(label!.y + label!.height / 2).toBe(20)
  const container = draft.find((e) => e.id === arrow.id)!
  expect(container.boundElements).toEqual([{ id: label!.id, type: "text" }])

  const edit = effects.find((e) => e.kind === "startTextEdit")
  expect(edit && edit.kind === "startTextEdit" && edit.elementId).toBe(label!.id)
  const mut = effects.find((e) => e.kind === "mutation")
  expect(mut && mut.kind === "mutation" && mut.skipHistory).toBe(true)
})

it("double-click on a bare line creates a bound label", () => {
  const line = {
    ...newLine({ x: 0, y: 0 }),
    points: [
      { x: 0, y: 0 },
      { x: 60, y: 80 },
    ],
  }
  const ctx = makeCtx({ readElements: () => [line], hitTest: () => line })
  const [, effects] = selectionTool.reduce(
    selectionTool.initial,
    { type: "doubleClick", at: point(30, 40) },
    ctx,
  )
  const draft: ExcalidrawElement[] = [line]
  applyMutation([...effects], draft)
  const label = draft.find((e) => e.type === "text")
  expect(label).toBeDefined()
  expect(label!.containerId).toBe(line.id)
})

it("double-click on an arrow that already has a label reuses it", () => {
  const text = newText({ x: 0, y: 0, text: "yes", containerId: "A" })
  const arrow = {
    ...newArrow({ x: 0, y: 0 }),
    id: "A",
    points: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
    boundElements: [{ id: text.id, type: "text" as const }],
  }
  const ctx = makeCtx({ readElements: () => [arrow, text], hitTest: () => arrow })
  const [, effects] = selectionTool.reduce(
    selectionTool.initial,
    { type: "doubleClick", at: point(50, 0) },
    ctx,
  )
  const edit = effects.find((e) => e.kind === "startTextEdit")
  expect(edit && edit.kind === "startTextEdit" && edit.elementId).toBe(text.id)
  expect(effects.some((e) => e.kind === "mutation")).toBe(false)
})
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `pnpm --filter @excalidraw-clone/tools test >/dev/null 2>&1 && echo PASS || echo FAIL`
Expected: `FAIL` (bare arrow/line double-click currently yields `[]`)

- [ ] **Step 3: Implement**

In `packages/tools/src/tools/selection/index.ts`:

1. Add `newLabelForLinear` to the `@excalidraw-clone/scene` import (alphabetical, after `newLabelFor`).
2. Replace the creation branch

```ts
      if (LABELABLE_TYPES.has(hit.type)) {
        const label = newLabelFor(hit)
```

with (the `const` alias narrows `hit` to the linear members inside the ternary):

```ts
      const isLinear = hit.type === "arrow" || hit.type === "line"
      if (LABELABLE_TYPES.has(hit.type) || isLinear) {
        const label = isLinear ? newLabelForLinear(hit) : newLabelFor(hit)
```

The rest of the branch (mutation with `skipHistory: true`, `select`, `startTextEdit`) is unchanged.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @excalidraw-clone/tools test >/dev/null 2>&1 && echo PASS || echo FAIL`
Expected: `PASS` (including selection-bend tests — the bend-handle double-click path is untouched)

- [ ] **Step 5: Commit**

```bash
git add packages/tools/src/tools/selection/index.ts packages/tools/test/selection-doubleclick.test.ts
git commit -m "tools: double-click a bare arrow or line creates a midpoint label

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: renderer — canvas occlusion backing behind linear labels

**Files:**

- Modify: `packages/renderer/src/shapes/text.ts`
- Modify: `packages/renderer/src/draw-element.ts`
- Modify: `packages/renderer/src/renderer.ts` (`render()`, ~line 147–171)
- Test: `packages/renderer/test/shapes-text.test.ts`, `packages/renderer/test/renderer-elements.test.ts` (extend both)

**Interfaces:**

- Consumes: `LINEAR_LABELABLE_TYPES` from `@excalidraw-clone/scene` (Task 2); existing `resolveColor`, mock canvas (`measureText` returns `text.length * 10`).
- Produces: `drawText(ctx, e, fillColor?, occlude?: { background: string })` and exported `OCCLUSION_PADDING = 4` from `shapes/text.ts` (Task 5 imports the constant); `drawElement(..., theme?, labelOcclusionBg?: string)`.

- [ ] **Step 1: Write the failing tests**

Append to `packages/renderer/test/shapes-text.test.ts` (inside the `drawText` describe):

```ts
it("with occlude, fills a padded backing rect before the text", () => {
  const { ctx } = createMockCanvas()
  // mock measureText: width = text.length * 10 → "hi" = 20
  // default fontSize 20 × lineHeight 1.25 → line height 25; box is 0×0
  const t = { ...newText({ x: 0, y: 0, text: "hi" }) }
  drawText(ctx as unknown as CanvasRenderingContext2D, t, undefined, {
    background: "#ffffff",
  })
  const rects = ctx.__calls.filter((c) => c.method === "fillRect")
  expect(rects).toHaveLength(1)
  expect(rects[0]!.args).toEqual([-14, -16.5, 28, 33])
  const order = ctx.__calls.map((c) => c.method)
  expect(order.indexOf("fillRect")).toBeLessThan(order.indexOf("fillText"))
})

it("without occlude, no backing rect is filled", () => {
  const { ctx } = createMockCanvas()
  const t = { ...newText({ x: 0, y: 0, text: "hi" }) }
  drawText(ctx as unknown as CanvasRenderingContext2D, t)
  expect(ctx.__calls.filter((c) => c.method === "fillRect")).toHaveLength(0)
})

it("occlude with empty text draws nothing", () => {
  const { ctx } = createMockCanvas()
  const t = { ...newText({ x: 0, y: 0 }) }
  drawText(ctx as unknown as CanvasRenderingContext2D, t, undefined, {
    background: "#ffffff",
  })
  expect(ctx.__calls).toHaveLength(0)
})
```

Append to `packages/renderer/test/renderer-elements.test.ts` (inside the existing describe; `newArrow` and `newLabelForLinear` join the `@excalidraw-clone/scene` import):

```ts
it("paints an occlusion rect behind an arrow label but not behind a shape label", () => {
  vi.spyOn(RoughCanvas.prototype, "draw").mockImplementation(() => undefined)
  const arrow = {
    ...newArrow({ x: 0, y: 0 }),
    points: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
  }
  const arrowLabel = { ...newLabelForLinear(arrow), text: "yes" }
  const linkedArrow = { ...arrow, boundElements: [{ id: arrowLabel.id, type: "text" as const }] }

  const { canvas, ctx } = createMockCanvas()
  const scene = new Scene([linkedArrow, arrowLabel])
  const r = new CanvasRenderer(canvas, scene)
  r.start()
  flush()
  // one full-canvas background fill + one label backing rect
  expect(ctx.__calls.filter((c) => c.method === "fillRect")).toHaveLength(2)
  r.stop()

  const rect = newRectangle({ x: 0, y: 0, width: 100, height: 80 })
  const shapeLabel = {
    ...newText({ x: 8, y: 8, width: 84, height: 64, text: "box", textAlign: "center" }),
    containerId: rect.id,
  }
  const linkedRect = { ...rect, boundElements: [{ id: shapeLabel.id, type: "text" as const }] }
  const { canvas: canvas2, ctx: ctx2 } = createMockCanvas()
  const r2 = new CanvasRenderer(canvas2, new Scene([linkedRect, shapeLabel]))
  r2.start()
  flush()
  // only the full-canvas background fill
  expect(ctx2.__calls.filter((c) => c.method === "fillRect")).toHaveLength(1)
  r2.stop()
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @excalidraw-clone/renderer test >/dev/null 2>&1 && echo PASS || echo FAIL`
Expected: `FAIL` (`drawText` ignores the 4th argument; no backing rect painted)

- [ ] **Step 3: Implement**

`packages/renderer/src/shapes/text.ts` — new exports and drawText body:

```ts
/** Padding (px) around a linear-element label's occlusion backing rect. */
export const OCCLUSION_PADDING = 4

export interface TextOcclusion {
  background: string
}

export const drawText = (
  ctx: CanvasRenderingContext2D,
  e: ExcalidrawTextElement,
  fillColor?: string,
  occlude?: TextOcclusion,
): void => {
  if (e.text.length === 0) return
  const lines = e.text.split("\n")
  const lineHeightPx = e.fontSize * e.lineHeight
  const totalHeight = lines.length * lineHeightPx

  ctx.save()
  ctx.font = fontSpec(e.fontSize, e.fontFamily)
  if (occlude) {
    let maxWidth = 0
    for (const line of lines) maxWidth = Math.max(maxWidth, ctx.measureText(line).width)
    ctx.fillStyle = occlude.background
    ctx.fillRect(
      e.width / 2 - maxWidth / 2 - OCCLUSION_PADDING,
      e.height / 2 - totalHeight / 2 - OCCLUSION_PADDING,
      maxWidth + 2 * OCCLUSION_PADDING,
      totalHeight + 2 * OCCLUSION_PADDING,
    )
  }
  ctx.fillStyle = fillColor ?? e.strokeColor
  ctx.textBaseline = "top"
  ctx.textAlign = e.textAlign

  const baseY = verticalOffset(e, totalHeight)
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!
    const x = horizontalOffset(e, ctx.measureText(line).width)
    const y = baseY + i * lineHeightPx
    ctx.fillText(line, x, y)
  }
  ctx.restore()
}
```

(`horizontalOffset` / `verticalOffset` are unchanged.)

`packages/renderer/src/draw-element.ts` — add the trailing parameter and pass it through:

```ts
export const drawElement = (
  ctx: CanvasRenderingContext2D,
  element: ExcalidrawElement,
  rough: RoughCanvas,
  cache: ShapeCache,
  getImage: ImageLookup,
  theme: Theme = "light",
  labelOcclusionBg?: string,
): void => {
```

and in the text branch:

```ts
if (element.type === "text") {
  drawText(
    ctx,
    element,
    resolveColor(element.strokeColor, theme),
    labelOcclusionBg === undefined ? undefined : { background: labelOcclusionBg },
  )
  ctx.restore()
  return
}
```

`packages/renderer/src/renderer.ts` — add `LINEAR_LABELABLE_TYPES` to the `@excalidraw-clone/scene` import, then in `render()` replace the element loop with:

```ts
const byId = new Map(elements.map((e) => [e.id, e] as const))
const occludeBg = resolveColor(
  this.canvasBg === "transparent" ? "#ffffff" : this.canvasBg,
  this.theme,
)
for (const element of elements) {
  if (!isElementVisible(element, view)) continue
  const container =
    element.type === "text" && element.containerId !== null
      ? byId.get(element.containerId)
      : undefined
  const labelBg = container && LINEAR_LABELABLE_TYPES.has(container.type) ? occludeBg : undefined
  drawElement(ctx, element, this.rough, this.shapeCache, getImage, this.theme, labelBg)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @excalidraw-clone/renderer test >/dev/null 2>&1 && echo PASS || echo FAIL`
Expected: `PASS`

- [ ] **Step 5: Commit**

```bash
git add packages/renderer/src/shapes/text.ts packages/renderer/src/draw-element.ts packages/renderer/src/renderer.ts packages/renderer/test/shapes-text.test.ts packages/renderer/test/renderer-elements.test.ts
git commit -m "renderer: canvas-background occlusion rect behind arrow/line labels

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: renderer — SVG export backing parity

**Files:**

- Modify: `packages/renderer/src/svg.ts`
- Test: `packages/renderer/test/svg.test.ts` (extend)

**Interfaces:**

- Consumes: `OCCLUSION_PADDING` from `./shapes/text` (Task 4); `LINEAR_LABELABLE_TYPES` from `@excalidraw-clone/scene`; `measureText`, `TextSize` from `./text-metrics`.
- Produces: `SVGRenderOptions.measure?: TextMeasure` where `export type TextMeasure = (text: string, fontSize: number, family: FontFamily, lineHeight: number) => TextSize`. Labeled arrows/lines gain a `<rect>` (canvas-bg fill) inside the label's `<g>`, before the `<text>` node. When no measurer is available (no DOM canvas and no `measure` option), the backing is skipped gracefully.

- [ ] **Step 1: Write the failing tests**

Append to `packages/renderer/test/svg.test.ts` (add `newArrow`, `newLabelForLinear` to the scene import):

```ts
describe("renderToSVG linear label backing", () => {
  const stubMeasure = (
    text: string,
    fontSize: number,
    _family: number,
    lineHeight: number,
  ): { width: number; height: number } => ({
    width: text.length * 10,
    height: fontSize * lineHeight,
  })

  const labeledArrowScene = (): Scene => {
    const arrow = {
      ...newArrow({ x: 0, y: 0 }),
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
    }
    const label = { ...newLabelForLinear(arrow), text: "yes" }
    return new Scene([
      { ...arrow, boundElements: [{ id: label.id, type: "text" as const }] },
      label,
    ])
  }

  it("emits a backing rect behind an arrow label", () => {
    const svg = renderToSVG(labeledArrowScene(), { measure: stubMeasure })
    // "yes" → 30 wide; height 25; padding 4 → 38 × 33
    expect(svg).toContain('width="38"')
    expect(svg).toContain('height="33"')
    expect(svg).toContain('fill="#ffffff"')
  })

  it("emits no backing rect for a shape label", () => {
    const rect = newRectangle({ x: 0, y: 0, width: 100, height: 80 })
    const label = {
      ...newText({ x: 8, y: 8, width: 84, height: 64, text: "box" }),
      containerId: rect.id,
    }
    const scene = new Scene([
      { ...rect, boundElements: [{ id: label.id, type: "text" as const }] },
      label,
    ])
    const svg = renderToSVG(scene, { measure: stubMeasure })
    expect(svg).not.toContain("<rect")
  })

  it("skips the backing gracefully when no measurer is available", () => {
    // jsdom's canvas.getContext returns null → default measurer unavailable
    const svg = renderToSVG(labeledArrowScene())
    expect(svg).toContain("yes")
    expect(svg).not.toContain("<rect")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @excalidraw-clone/renderer test >/dev/null 2>&1 && echo PASS || echo FAIL`
Expected: `FAIL` (no `measure` option; no rect emitted)

- [ ] **Step 3: Implement**

In `packages/renderer/src/svg.ts`:

1. Extend imports:

```ts
import { LINEAR_LABELABLE_TYPES } from "@excalidraw-clone/scene"
import type { FontFamily } from "@excalidraw-clone/scene"
import { fontFamilyName, measureText, type TextSize } from "./text-metrics"
import { OCCLUSION_PADDING } from "./shapes/text"
```

2. Add the type and option:

```ts
export type TextMeasure = (
  text: string,
  fontSize: number,
  family: FontFamily,
  lineHeight: number,
) => TextSize
```

and in `SVGRenderOptions`:

```ts
  /** Text measurer for linear-label backing rects; defaults to a hidden
   *  canvas context, and the backing is skipped when none is available. */
  measure?: TextMeasure
```

3. Add the default measurer helper:

```ts
const defaultMeasure = (): TextMeasure | null => {
  if (typeof document === "undefined") return null
  const ctx = document.createElement("canvas").getContext("2d")
  if (!ctx) return null
  return (text, fontSize, family, lineHeight) =>
    measureText(ctx, text, fontSize, family, lineHeight)
}
```

4. In `renderToSVG`, before the element loop:

```ts
const measure = opts.measure ?? defaultMeasure()
const byId = new Map(elements.map((e) => [e.id, e] as const))
const labelBg = resolveColor(
  opts.background && opts.background !== "transparent" ? opts.background : "#ffffff",
  theme,
)
```

and change the loop to compute per-element backing:

```ts
for (const el of elements) {
  const container =
    el.type === "text" && el.containerId !== null ? byId.get(el.containerId) : undefined
  const backing =
    measure && container && LINEAR_LABELABLE_TYPES.has(container.type)
      ? { background: labelBg, measure }
      : undefined
  const node = renderElement(doc, el, rsvg, opts.files, theme, backing)
  if (node) root.appendChild(node)
}
```

5. Extend `renderElement`'s signature with `backing?: { background: string; measure: TextMeasure }` and, in the text branch, prepend the rect (element-local coordinates — the group carries the translate):

```ts
if (el.type === "text") {
  if (backing && el.text.length > 0) {
    const size = backing.measure(el.text, el.fontSize, el.fontFamily, el.lineHeight)
    const rect = doc.createElementNS(SVG_NS, "rect")
    rect.setAttribute("x", String(el.width / 2 - size.width / 2 - OCCLUSION_PADDING))
    rect.setAttribute("y", String(el.height / 2 - size.height / 2 - OCCLUSION_PADDING))
    rect.setAttribute("width", String(size.width + 2 * OCCLUSION_PADDING))
    rect.setAttribute("height", String(size.height + 2 * OCCLUSION_PADDING))
    rect.setAttribute("fill", backing.background)
    group.appendChild(rect)
  }
  group.appendChild(textNode(doc, el, theme))
  return group
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @excalidraw-clone/renderer test >/dev/null 2>&1 && echo PASS || echo FAIL`
Expected: `PASS`. If the "skips gracefully" test fails because the DOM shim's `getContext` returns a real context, change that test to assert the rect IS present instead — the graceful path is for measurement being unavailable, not a hard requirement that jsdom lack canvas.

- [ ] **Step 5: Commit**

```bash
git add packages/renderer/src/svg.ts packages/renderer/test/svg.test.ts
git commit -m "renderer: SVG export backing rect behind arrow/line labels

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: web — help copy, e2e, full gate

**Files:**

- Modify: `apps/web/src/locales/en/shortcuts.json` (line 24), `apps/web/src/locales/ko/shortcuts.json` (line 24)
- Create: `apps/web/e2e/arrow-labels.spec.ts`
- Test: the new spec + the full repo gate

**Interfaces:**

- Consumes: everything above through the running app; e2e helpers `dragOnCanvas` from `apps/web/e2e/_helpers.ts`; toolbar testids `toolbar-rectangle`, `toolbar-arrow`, `toolbar-line`, `toolbar-selection`.
- Produces: shipped feature; no code interfaces.

- [ ] **Step 1: Update the help copy**

The HelpDialog already shows a "Double-click" row keyed `shortcuts.addLabel`; only the copy changes.

`apps/web/src/locales/en/shortcuts.json` line 24: `"addLabel": "Add label to shape"` → `"addLabel": "Add label to shape or arrow"`.
`apps/web/src/locales/ko/shortcuts.json` line 24: `"addLabel": "도형에 라벨 추가"` → `"addLabel": "도형이나 화살표에 라벨 추가"`.

- [ ] **Step 2: Write the e2e spec**

Create `apps/web/e2e/arrow-labels.spec.ts`:

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
  points?: { x: number; y: number }[]
  boundElements?: { id: string; type: string }[] | null
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
  await page.locator('[data-testid="toolbar-arrow"]').waitFor({ state: "visible" })
}

const dblClickCanvas = async (page: Page, at: { x: number; y: number }): Promise<void> => {
  const canvas = page.locator("canvas").first()
  const box = await canvas.boundingBox()
  if (!box) throw new Error("canvas not found")
  await page.mouse.dblclick(box.x + at.x, box.y + at.y)
}

// straight (two-point) connectors only
const pathCenter = (el: SceneEl): { x: number; y: number } => {
  const first = el.points![0]!
  const last = el.points![el.points!.length - 1]!
  return { x: el.x + (first.x + last.x) / 2, y: el.y + (first.y + last.y) / 2 }
}

test("double-click an arrow adds a midpoint label that follows rebinding and persists", async ({
  page,
}) => {
  await freshCanvas(page)

  // two rects with a bound arrow between them
  await page.locator('[data-testid="toolbar-rectangle"]').click()
  await dragOnCanvas(page, { x: 100, y: 200 }, { x: 200, y: 300 })
  await page.locator('[data-testid="toolbar-rectangle"]').click()
  await dragOnCanvas(page, { x: 500, y: 200 }, { x: 600, y: 300 })
  await page.locator('[data-testid="toolbar-arrow"]').click()
  await dragOnCanvas(page, { x: 150, y: 250 }, { x: 550, y: 250 })
  await page.waitForTimeout(700)

  // double-click ON the line but away from the segment-midpoint bend handle
  await page.locator('[data-testid="toolbar-selection"]').click()
  await dblClickCanvas(page, { x: 300, y: 250 })
  const textarea = page.locator("textarea")
  await textarea.waitFor({ state: "visible" })
  await textarea.fill("yes")
  await page.mouse.click(300, 450) // blur commits
  await page.waitForTimeout(900)

  let els = await readScene(page)
  const arrow = els.find((e) => e.type === "arrow")!
  let label = els.find((e) => e.type === "text")!
  expect(label.text).toBe("yes")
  expect(label.containerId).toBe(arrow.id)
  let mid = pathCenter(arrow)
  expect(Math.abs(label.x + label.width / 2 - mid.x)).toBeLessThanOrEqual(1)
  expect(Math.abs(label.y + label.height / 2 - mid.y)).toBeLessThanOrEqual(1)

  // drag rect B down; the bound arrow follows and the label recenters
  await dragOnCanvas(page, { x: 580, y: 220 }, { x: 580, y: 320 })
  await page.waitForTimeout(900)
  els = await readScene(page)
  const movedArrow = els.find((e) => e.type === "arrow")!
  label = els.find((e) => e.type === "text")!
  mid = pathCenter(movedArrow)
  expect(Math.abs(label.x + label.width / 2 - mid.x)).toBeLessThanOrEqual(1)
  expect(Math.abs(label.y + label.height / 2 - mid.y)).toBeLessThanOrEqual(1)

  // persists across reload
  await page.reload()
  await page.locator('[data-testid="toolbar-arrow"]').waitFor({ state: "visible" })
  els = await readScene(page)
  expect(els.find((e) => e.type === "text")?.text).toBe("yes")
})

test("escaping an empty line label leaves the scene label-free", async ({ page }) => {
  await freshCanvas(page)

  await page.locator('[data-testid="toolbar-line"]').click()
  await dragOnCanvas(page, { x: 100, y: 100 }, { x: 300, y: 200 })
  await page.waitForTimeout(120)

  // on the line at 40% along its length — off the midpoint handle
  await page.locator('[data-testid="toolbar-selection"]').click()
  await dblClickCanvas(page, { x: 180, y: 140 })
  await page.locator("textarea").waitFor({ state: "visible" })
  await page.keyboard.press("Escape")
  await page.waitForTimeout(900)

  const els = await readScene(page)
  expect(els.filter((e) => e.type === "text")).toHaveLength(0)
  expect(els).toHaveLength(1)
  expect(els[0]!.boundElements ?? null).toBeNull()
})
```

- [ ] **Step 3: Run the new spec**

Start the dev server if the Playwright config doesn't (check `apps/web/playwright.config.ts` — it has a `webServer` block, so just run):

```bash
pnpm --filter @excalidraw-clone/web e2e -- arrow-labels.spec.ts
```

Expected: 2 passed. If the double-click lands on a selection handle instead of the line (flaky create), nudge the dblclick point a few px along the line — it must stay within ~5px of the stroke.

- [ ] **Step 4: Run the full gate**

```bash
rtk lint
pnpm typecheck >/dev/null 2>&1 && echo TYPECHECK-PASS || echo TYPECHECK-FAIL
pnpm test >/dev/null 2>&1 && echo UNIT-PASS || echo UNIT-FAIL
pnpm --filter @excalidraw-clone/web e2e
```

Expected: lint clean, TYPECHECK-PASS, UNIT-PASS, all e2e specs pass (34 = 32 existing + 2 new).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/locales/en/shortcuts.json apps/web/src/locales/ko/shortcuts.json apps/web/e2e/arrow-labels.spec.ts
git commit -m "web: e2e — arrow/line labels create/follow/persist; help copy covers arrows

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## After all tasks

Use superpowers:finishing-a-development-branch — merge `develop` → `main` fast-forward and push both, per this repo's convention.
