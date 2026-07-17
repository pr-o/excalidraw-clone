# Shape Labels (Bound Text in Shapes) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Project preference:** this repo's owner prefers inline execution in the main session (see memory `feedback_inline_execution`).

**Goal:** Double-click any of the six bindable shapes to add a centered text label that moves, resizes, and deletes with its container.

**Architecture:** A new pure `labelInnerBox` function in `@excalidraw-clone/geometry` computes the inscribed text box per shape type. `@excalidraw-clone/scene` gains a `newLabelFor` factory and `LABELABLE_TYPES` set, and `reconcileBoundText` switches to shape-aware boxes. The selection tool's `doubleClick` branch creates the label via a `skipHistory` mutation and emits `startTextEdit`. The web `TextEditingOverlay` gains empty-label cleanup via a pure `commitTextEdit` helper.

**Tech Stack:** TypeScript monorepo (pnpm + turbo), vitest, Playwright, React 19, zustand.

**Spec:** `docs/superpowers/specs/2026-07-17-shape-labels-design.md`

## Global Constraints

- The six labelable shapes are exactly: `rectangle`, `ellipse`, `diamond`, `triangle`, `parallelogram`, `hexagon`. Do NOT reuse `BINDABLE_TYPES` (it also contains `image` and `text`).
- Sticky notes (rectangle containers) must keep byte-identical behavior: 8px (`NOTE_PADDING`) inset.
- Label text elements are ordinary `text` elements linked via `containerId` + container `boundElements` — no new element types, no new fields.
- Label inner box invariant: contained in the shape interior, minimum 8px inset from container bounds on every edge, width/height clamped ≥ 0.
- All commits on `develop`. Commit messages follow existing style (`geometry: …`, `scene: …`, `tools: …`, `web: …`). End every commit message with the Claude Code trailer used throughout this repo.
- Run package tests with `pnpm --filter @excalidraw-clone/<pkg> test -- run <file>` from repo root, or `pnpm vitest run <file>` inside the package dir (match existing habit: `cd packages/<pkg> && pnpm vitest run test/<file>`).

---

### Task 1: geometry — `labelInnerBox`

**Files:**

- Create: `packages/geometry/src/label-box.ts`
- Modify: `packages/geometry/src/index.ts` (add exports)
- Test: `packages/geometry/test/label-box.test.ts`

**Interfaces:**

- Consumes: `Bounds` from `packages/geometry/src/types.ts` (`{ x, y, width, height }`, all readonly numbers); `shapeVertices`, `pointInConvexPolygon`, `boundsCenter` (tests only).
- Produces: `type LabelShapeKind = "rectangle" | "ellipse" | "diamond" | "triangle" | "parallelogram" | "hexagon"` and `labelInnerBox(kind: LabelShapeKind, b: Bounds, minInset = 8): Bounds`, both exported from `@excalidraw-clone/geometry`. Task 2 calls `labelInnerBox(container.type as LabelShapeKind, container, NOTE_PADDING)`.

- [ ] **Step 1: Write the failing test**

Create `packages/geometry/test/label-box.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { boundsCenter, labelInnerBox, pointInConvexPolygon, shapeVertices } from "../src"
import type { Bounds } from "../src"

const b = (x: number, y: number, width: number, height: number): Bounds => ({
  x,
  y,
  width,
  height,
})

describe("labelInnerBox", () => {
  it("rectangle keeps the plain 8px inset (sticky-note behavior)", () => {
    expect(labelInnerBox("rectangle", b(0, 0, 100, 60))).toEqual({
      x: 8,
      y: 8,
      width: 84,
      height: 44,
    })
  })

  it("ellipse gets the inscribed rect (w/√2 × h/√2, centered)", () => {
    const box = labelInnerBox("ellipse", b(0, 0, 100, 100))
    expect(box.x).toBeCloseTo((100 - 100 * Math.SQRT1_2) / 2, 5)
    expect(box.width).toBeCloseTo(100 * Math.SQRT1_2, 5)
    expect(box.y).toBeCloseTo(box.x, 5)
    expect(box.height).toBeCloseTo(box.width, 5)
  })

  it("diamond gets the centered half-size box", () => {
    expect(labelInnerBox("diamond", b(0, 0, 100, 80))).toEqual({
      x: 25,
      y: 20,
      width: 50,
      height: 40,
    })
  })

  it("triangle gets the bottom-half inscribed rect", () => {
    expect(labelInnerBox("triangle", b(0, 0, 100, 80))).toEqual({
      x: 25,
      y: 40,
      width: 50,
      height: 40,
    })
  })

  it("parallelogram and hexagon get a 25% x-inset at full height (minus min inset)", () => {
    for (const kind of ["parallelogram", "hexagon"] as const) {
      expect(labelInnerBox(kind, b(0, 0, 100, 80))).toEqual({
        x: 25,
        y: 8,
        width: 50,
        height: 64,
      })
    }
  })

  it("respects the minimum inset on small shapes", () => {
    // diamond factor box is {5,5,10,10}; the 8px inset ring shrinks it further
    expect(labelInnerBox("diamond", b(0, 0, 20, 20))).toEqual({ x: 8, y: 8, width: 4, height: 4 })
  })

  it("clamps degenerate boxes to zero size", () => {
    const box = labelInnerBox("rectangle", b(0, 0, 10, 10))
    expect(box.width).toBe(0)
    expect(box.height).toBe(0)
  })

  it("offsets by the container origin", () => {
    expect(labelInnerBox("diamond", b(40, 30, 100, 80))).toEqual({
      x: 65,
      y: 50,
      width: 50,
      height: 40,
    })
  })

  it("polygon-kind boxes stay inside the shape outline", () => {
    const bounds = b(0, 0, 200, 160)
    for (const kind of ["triangle", "parallelogram", "hexagon"] as const) {
      const box = labelInnerBox(kind, bounds)
      const vertices = shapeVertices(kind, bounds)
      const center = boundsCenter(bounds)
      const corners = [
        { x: box.x, y: box.y },
        { x: box.x + box.width, y: box.y },
        { x: box.x + box.width, y: box.y + box.height },
        { x: box.x, y: box.y + box.height },
      ]
      for (const c of corners) {
        expect(pointInConvexPolygon(c, vertices, center)).toBe(true)
      }
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/geometry && pnpm vitest run test/label-box.test.ts`
Expected: FAIL — `labelInnerBox` is not exported.

- [ ] **Step 3: Write the implementation**

Create `packages/geometry/src/label-box.ts`:

```ts
import type { Bounds } from "./types"

export type LabelShapeKind =
  | "rectangle"
  | "ellipse"
  | "diamond"
  | "triangle"
  | "parallelogram"
  | "hexagon"

const centered = (b: Bounds, width: number, height: number): Bounds => ({
  x: b.x + (b.width - width) / 2,
  y: b.y + (b.height - height) / 2,
  width,
  height,
})

/** Largest practical axis-aligned box inside the shape, before insetting. */
const factorBox = (kind: LabelShapeKind, b: Bounds): Bounds => {
  const { x, y, width: w, height: h } = b
  switch (kind) {
    case "rectangle":
      return b
    case "ellipse":
      return centered(b, w * Math.SQRT1_2, h * Math.SQRT1_2)
    case "diamond":
      return centered(b, w / 2, h / 2)
    case "triangle":
      // largest inscribed rect of an apex-top isosceles triangle: w/2 × h/2, bottom half
      return { x: x + w / 4, y: y + h / 2, width: w / 2, height: h / 2 }
    case "parallelogram":
    case "hexagon":
      // interior for every y is at least the middle 50% of the width
      return { x: x + w / 4, y, width: w / 2, height: h }
  }
}

/** Inscribed text box for a label inside a container shape: the per-shape
 *  inscribed box intersected with a `minInset` ring, clamped to ≥ 0. */
export const labelInnerBox = (kind: LabelShapeKind, b: Bounds, minInset = 8): Bounds => {
  const f = factorBox(kind, b)
  const left = Math.max(f.x, b.x + minInset)
  const top = Math.max(f.y, b.y + minInset)
  const right = Math.min(f.x + f.width, b.x + b.width - minInset)
  const bottom = Math.min(f.y + f.height, b.y + b.height - minInset)
  return { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) }
}
```

Add to `packages/geometry/src/index.ts` (next to the polygon exports at the bottom):

```ts
export { labelInnerBox } from "./label-box"
export type { LabelShapeKind } from "./label-box"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/geometry && pnpm vitest run test/label-box.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Run the whole geometry suite + typecheck**

Run: `cd packages/geometry && pnpm vitest run && pnpm typecheck`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add packages/geometry/src/label-box.ts packages/geometry/src/index.ts packages/geometry/test/label-box.test.ts
git commit -m "geometry: labelInnerBox — inscribed label box per container shape"
```

---

### Task 2: scene — `LABELABLE_TYPES`, `newLabelFor`, shape-aware reconcile

**Files:**

- Modify: `packages/scene/src/reconcile-bound-text.ts` (add `LABELABLE_TYPES`, use `labelInnerBox`)
- Modify: `packages/scene/src/factories.ts` (add `newLabelFor`)
- Modify: `packages/scene/src/index.ts` (export both)
- Create: `packages/scene/test/labels.test.ts`

**Interfaces:**

- Consumes: `labelInnerBox`, `LabelShapeKind` from `@excalidraw-clone/geometry` (Task 1); existing `NOTE_PADDING`, `newText`, `ExcalidrawElement`, `ExcalidrawTextElement`, `ElementType`.
- Produces: `LABELABLE_TYPES: ReadonlySet<ElementType>` (defined in `reconcile-bound-text.ts` — NOT in `factories.ts`, which would create an import cycle since factories already imports `NOTE_PADDING` from reconcile) and `newLabelFor(container: ExcalidrawElement): ExcalidrawTextElement`, both exported from `@excalidraw-clone/scene`. Task 3 uses both.

- [ ] **Step 1: Write the failing test**

Create `packages/scene/test/labels.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import {
  LABELABLE_TYPES,
  newDiamond,
  newHexagon,
  newLabelFor,
  newNote,
  reconcileBoundText,
} from "../src"
import type { ExcalidrawElement } from "../src"

describe("LABELABLE_TYPES", () => {
  it("contains exactly the six container shapes", () => {
    expect([...LABELABLE_TYPES].sort()).toEqual([
      "diamond",
      "ellipse",
      "hexagon",
      "parallelogram",
      "rectangle",
      "triangle",
    ])
  })
})

describe("newLabelFor", () => {
  it("returns a centered empty text bound to the container", () => {
    const hexagon = newHexagon({ x: 0, y: 0, width: 100, height: 80 })
    const label = newLabelFor(hexagon)
    expect(label.type).toBe("text")
    expect(label.text).toBe("")
    expect(label.textAlign).toBe("center")
    expect(label.verticalAlign).toBe("middle")
    expect(label.containerId).toBe(hexagon.id)
  })

  it("uses the shape-aware inner box (hexagon: 25% x-inset, 8px y-inset)", () => {
    const hexagon = newHexagon({ x: 0, y: 0, width: 100, height: 80 })
    const label = newLabelFor(hexagon)
    expect({ x: label.x, y: label.y, width: label.width, height: label.height }).toEqual({
      x: 25,
      y: 8,
      width: 50,
      height: 64,
    })
  })
})

describe("reconcileBoundText — shape-aware boxes", () => {
  it("keeps a diamond's label inside the centered half-size box after a move", () => {
    const diamond = newDiamond({ x: 0, y: 0, width: 100, height: 80 })
    const label = newLabelFor(diamond)
    const linked: ExcalidrawElement = {
      ...diamond,
      boundElements: [{ id: label.id, type: "text" }],
    }
    const draft: ExcalidrawElement[] = [{ ...linked, x: 200, y: 100 }, label]
    reconcileBoundText(draft)
    const text = draft[1]!
    expect({ x: text.x, y: text.y, width: text.width, height: text.height }).toEqual({
      x: 225,
      y: 120,
      width: 50,
      height: 40,
    })
  })

  it("keeps sticky-note (rectangle) behavior byte-identical: 8px inset", () => {
    const { container, text } = newNote({ x: 10, y: 20, width: 100, height: 60 })
    const draft: ExcalidrawElement[] = [container, text]
    reconcileBoundText(draft)
    const t = draft[1]!
    expect({ x: t.x, y: t.y, width: t.width, height: t.height }).toEqual({
      x: 18,
      y: 28,
      width: 84,
      height: 44,
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/scene && pnpm vitest run test/labels.test.ts`
Expected: FAIL — `LABELABLE_TYPES` / `newLabelFor` not exported.

- [ ] **Step 3: Implement**

In `packages/scene/src/reconcile-bound-text.ts`, replace the whole file body with:

```ts
import { labelInnerBox, type LabelShapeKind } from "@excalidraw-clone/geometry"
import type { ElementType, ExcalidrawElement } from "./types"

/** Padding (px) between a note container's box and its bound text box. */
export const NOTE_PADDING = 8

/** Container shapes that can carry a bound text label. */
export const LABELABLE_TYPES: ReadonlySet<ElementType> = new Set<ElementType>([
  "rectangle",
  "ellipse",
  "diamond",
  "triangle",
  "parallelogram",
  "hexagon",
])

const innerBoxFor = (
  container: ExcalidrawElement,
): { x: number; y: number; width: number; height: number } => {
  if (LABELABLE_TYPES.has(container.type)) {
    return labelInnerBox(container.type as LabelShapeKind, container, NOTE_PADDING)
  }
  return {
    x: container.x + NOTE_PADDING,
    y: container.y + NOTE_PADDING,
    width: Math.max(0, container.width - 2 * NOTE_PADDING),
    height: Math.max(0, container.height - 2 * NOTE_PADDING),
  }
}

/**
 * Enforce the container↔bound-text invariant in place on a mutation draft:
 * each non-deleted container with a bound text child keeps that text sized to
 * the shape-aware inner label box and center/middle aligned; a deleted
 * container cascades isDeleted to its text. Text content is never modified.
 * Idempotent and O(n). Safe to run after every mutation.
 */
export function reconcileBoundText(draft: ExcalidrawElement[]): void {
  for (let i = 0; i < draft.length; i += 1) {
    const container = draft[i]!
    if (!container.boundElements) continue
    const ref = container.boundElements.find((b) => b.type === "text")
    if (!ref) continue
    const ti = draft.findIndex((e) => e.id === ref.id)
    if (ti < 0) continue
    const text = draft[ti]!
    if (text.type !== "text") continue

    if (container.isDeleted) {
      if (!text.isDeleted) draft[ti] = { ...text, isDeleted: true }
      continue
    }

    const { x, y, width, height } = innerBoxFor(container)
    if (
      text.x !== x ||
      text.y !== y ||
      text.width !== width ||
      text.height !== height ||
      text.textAlign !== "center" ||
      text.verticalAlign !== "middle"
    ) {
      draft[ti] = { ...text, x, y, width, height, textAlign: "center", verticalAlign: "middle" }
    }
  }
}
```

In `packages/scene/src/factories.ts`:

1. Change the reconcile import at the top to also pull `LABELABLE_TYPES` if needed — it is NOT needed here; only add to the geometry import. Add at the top (there is currently no geometry import in this file):

```ts
import { labelInnerBox, type LabelShapeKind } from "@excalidraw-clone/geometry"
```

2. Append after `newNote` (end of file):

```ts
/** Empty centered label text bound to `container`, sized to the shape-aware
 *  inner box. Caller must add `{ id, type: "text" }` to the container's
 *  boundElements. `container.type` must be in LABELABLE_TYPES. */
export const newLabelFor = (container: {
  id: string
  type: string
  x: number
  y: number
  width: number
  height: number
}): ExcalidrawTextElement => {
  const box = labelInnerBox(container.type as LabelShapeKind, container, NOTE_PADDING)
  return newText({
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    text: "",
    textAlign: "center",
    verticalAlign: "middle",
    containerId: container.id,
  })
}
```

In `packages/scene/src/index.ts`:

- Change the reconcile export line to `export { LABELABLE_TYPES, NOTE_PADDING, reconcileBoundText } from "./reconcile-bound-text"`.
- Add `newLabelFor` to the factories export list (alphabetical: between `newImage` and `newLine`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/scene && pnpm vitest run test/labels.test.ts && pnpm vitest run`
Expected: new file PASS and the full scene suite (148+ tests, incl. existing `reconcile-bound-text` and `scene-bound-text` tests) stays green — the rectangle path must not change behavior.

- [ ] **Step 5: Typecheck**

Run: `cd packages/scene && pnpm typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add packages/scene/src/reconcile-bound-text.ts packages/scene/src/factories.ts packages/scene/src/index.ts packages/scene/test/labels.test.ts
git commit -m "scene: newLabelFor factory + shape-aware reconcileBoundText via labelInnerBox"
```

---

### Task 3: tools — double-click a bare shape creates its label

**Files:**

- Modify: `packages/tools/src/tools/selection/index.ts` (doubleClick branch, ~line 164–189)
- Test: `packages/tools/test/selection-doubleclick.test.ts` (update one test, add two)

**Interfaces:**

- Consumes: `LABELABLE_TYPES`, `newLabelFor` from `@excalidraw-clone/scene` (Task 2); existing `ToolEffect` union (`{ kind: "mutation"; apply; skipHistory? }`, `{ kind: "startTextEdit"; elementId }`).
- Produces: no new exports — behavior only. Double-click on a labelable shape without a text ref yields effects `[mutation(skipHistory), select([hit.id]), startTextEdit(labelId)]`.

- [ ] **Step 1: Update the changed-behavior test and add the new ones**

In `packages/tools/test/selection-doubleclick.test.ts`:

1. Replace the `"double-click on a non-text element is a no-op"` test (a rectangle now creates a label — a line does not):

```ts
it("double-click on a non-labelable element is a no-op", () => {
  const l = newLine({ x: 0, y: 0, width: 10, height: 10 })
  const ctx = makeCtx({ hitTest: () => l })
  const out = selectionTool.reduce(
    selectionTool.initial,
    { type: "doubleClick", at: point(5, 5) },
    ctx,
  )
  expect(out[1]).toEqual([])
})
```

2. Add at the end of the describe block:

```ts
it("double-click on a bare shape creates a bound label and starts editing", () => {
  const hexagon = newHexagon({ x: 0, y: 0, width: 100, height: 80 })
  const ctx = makeCtx({ readElements: () => [hexagon], hitTest: () => hexagon })
  const [, effects] = selectionTool.reduce(
    selectionTool.initial,
    { type: "doubleClick", at: point(50, 40) },
    ctx,
  )
  const draft: ExcalidrawElement[] = [hexagon]
  applyMutation([...effects], draft)

  const label = draft.find((e) => e.type === "text") as ExcalidrawTextElement | undefined
  expect(label).toBeDefined()
  expect(label!.containerId).toBe(hexagon.id)
  const container = draft.find((e) => e.id === hexagon.id)!
  expect(container.boundElements).toEqual([{ id: label!.id, type: "text" }])

  const edit = effects.find((e) => e.kind === "startTextEdit")
  expect(edit && edit.kind === "startTextEdit" && edit.elementId).toBe(label!.id)
  // creation is skipHistory so the later text commit records one undo step
  const mut = effects.find((e) => e.kind === "mutation")
  expect(mut && mut.kind === "mutation" && mut.skipHistory).toBe(true)
})

it("double-click on a shape that already has a label reuses it", () => {
  const text = newText({ x: 0, y: 0, text: "hi", containerId: "D" })
  const diamond = {
    ...newDiamond({ x: 0, y: 0, width: 100, height: 80 }),
    id: "D",
    boundElements: [{ id: text.id, type: "text" as const }],
  }
  const ctx = makeCtx({ readElements: () => [diamond, text], hitTest: () => diamond })
  const [, effects] = selectionTool.reduce(
    selectionTool.initial,
    { type: "doubleClick", at: point(50, 40) },
    ctx,
  )
  const edit = effects.find((e) => e.kind === "startTextEdit")
  expect(edit && edit.kind === "startTextEdit" && edit.elementId).toBe(text.id)
  expect(effects.some((e) => e.kind === "mutation")).toBe(false)
})
```

3. Update the imports at the top of the file:

```ts
import {
  newDiamond,
  newHexagon,
  newLine,
  newRectangle,
  newText,
  type ExcalidrawElement,
  type ExcalidrawTextElement,
} from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { selectionTool } from "../src"
import { applyMutation, makeCtx, point } from "./test-utils"
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `cd packages/tools && pnpm vitest run test/selection-doubleclick.test.ts`
Expected: the two new tests FAIL (no label created); the updated no-op test PASSES.

- [ ] **Step 3: Implement the doubleClick branch**

In `packages/tools/src/tools/selection/index.ts`:

1. Extend the scene import (line 2):

```ts
import {
  bindingTargetAt,
  expandIdsToGroups,
  LABELABLE_TYPES,
  newLabelFor,
} from "@excalidraw-clone/scene"
```

2. In `reduceIdle`'s `doubleClick` branch, after the existing `textRef` block (currently `if (textRef) { … return startTextEdit }`) and before the closing `return [{ phase: "idle" }, []]`, add:

```ts
if (LABELABLE_TYPES.has(hit.type)) {
  const label = newLabelFor(hit)
  return [
    { phase: "idle" },
    [
      {
        kind: "mutation",
        apply: (draft) => {
          const i = draft.findIndex((e) => e.id === hit.id)
          if (i < 0) return
          const c = draft[i]!
          draft[i] = {
            ...c,
            boundElements: [...(c.boundElements ?? []), { id: label.id, type: "text" }],
          }
          draft.push(label)
        },
        skipHistory: true,
      },
      { kind: "select", ids: [hit.id] },
      { kind: "startTextEdit", elementId: label.id },
    ],
  ]
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/tools && pnpm vitest run test/selection-doubleclick.test.ts && pnpm vitest run`
Expected: file PASS; full tools suite (191+ tests) green.

- [ ] **Step 5: Typecheck**

Run: `cd packages/tools && pnpm typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add packages/tools/src/tools/selection/index.ts packages/tools/test/selection-doubleclick.test.ts
git commit -m "tools: double-click a bare shape creates a bound label and starts editing"
```

---

### Task 4: web — empty-label cleanup + help entry

**Files:**

- Create: `apps/web/src/driver/commitTextEdit.ts`
- Modify: `apps/web/src/components/TextEditingOverlay.tsx`
- Modify: `packages/ui/src/HelpDialog.tsx` (one `EDITOR_SHORTCUTS` row)
- Modify: `packages/ui/test/HelpDialog.test.tsx` (assert the new row)
- Modify: `apps/web/src/locales/en/shortcuts.json`, `apps/web/src/locales/ko/shortcuts.json`
- Test: `apps/web/test/commit-text-edit.test.ts`

**Interfaces:**

- Consumes: `newLabelFor`, `newRectangle`, `newText` from `@excalidraw-clone/scene`; `Scene.mutate(fn, options?: { skipHistory?: boolean })`.
- Produces: `commitTextEdit(draft: ExcalidrawElement[], id: string, finalText: string): void` — commits non-empty text; deletes an empty bound label and strips the container's ref (`boundElements` becomes `null` when emptied).

- [ ] **Step 1: Write the failing test**

Create `apps/web/test/commit-text-edit.test.ts`:

```ts
import {
  newLabelFor,
  newRectangle,
  newText,
  type ExcalidrawElement,
  type ExcalidrawTextElement,
} from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { commitTextEdit } from "../src/driver/commitTextEdit"

const labeledRect = (): { container: ExcalidrawElement; label: ExcalidrawTextElement } => {
  const rect = newRectangle({ x: 0, y: 0, width: 100, height: 60 })
  const label = newLabelFor(rect)
  return { container: { ...rect, boundElements: [{ id: label.id, type: "text" }] }, label }
}

describe("commitTextEdit", () => {
  it("non-empty commit updates the text and keeps the binding", () => {
    const { container, label } = labeledRect()
    const draft: ExcalidrawElement[] = [container, label]
    commitTextEdit(draft, label.id, "hello")
    expect(draft).toHaveLength(2)
    expect((draft[1] as ExcalidrawTextElement).text).toBe("hello")
    expect(draft[0]!.boundElements).toEqual([{ id: label.id, type: "text" }])
  })

  it("empty commit deletes the label and strips the container ref", () => {
    const { container, label } = labeledRect()
    const draft: ExcalidrawElement[] = [container, label]
    commitTextEdit(draft, label.id, "")
    expect(draft).toHaveLength(1)
    expect(draft[0]!.boundElements).toBeNull()
  })

  it("empty commit on a free text element keeps it", () => {
    const free = newText({ x: 0, y: 0, text: "old" })
    const draft: ExcalidrawElement[] = [free]
    commitTextEdit(draft, free.id, "")
    expect(draft).toHaveLength(1)
    expect((draft[0] as ExcalidrawTextElement).text).toBe("")
  })

  it("unknown id is a no-op", () => {
    const draft: ExcalidrawElement[] = []
    expect(() => commitTextEdit(draft, "nope", "x")).not.toThrow()
    expect(draft).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm vitest run test/commit-text-edit.test.ts`
Expected: FAIL — module `../src/driver/commitTextEdit` not found.

- [ ] **Step 3: Implement the helper**

Create `apps/web/src/driver/commitTextEdit.ts`:

```ts
import type { ExcalidrawElement } from "@excalidraw-clone/scene"

/** Apply the end of a text-edit session to a mutation draft: commit non-empty
 *  text; an empty bound label is deleted and unlinked from its container. */
export function commitTextEdit(draft: ExcalidrawElement[], id: string, finalText: string): void {
  const i = draft.findIndex((e) => e.id === id)
  if (i < 0) return
  const el = draft[i]!
  if (el.type !== "text") return
  if (finalText === "" && el.containerId !== null) {
    draft.splice(i, 1)
    const ci = draft.findIndex((e) => e.id === el.containerId)
    if (ci >= 0) {
      const c = draft[ci]!
      const rest = (c.boundElements ?? []).filter((b) => b.id !== id)
      draft[ci] = { ...c, boundElements: rest.length > 0 ? rest : null }
    }
    return
  }
  draft[i] = { ...el, text: finalText }
}
```

- [ ] **Step 4: Wire the overlay**

In `apps/web/src/components/TextEditingOverlay.tsx`:

1. Add the import:

```ts
import { commitTextEdit } from "../driver/commitTextEdit"
```

2. Replace the `commit` function and the Escape handler. The `commit` body becomes:

```ts
const commit = (): void => {
  const noVisibleChange = value === "" && (el?.text ?? "") === ""
  scene.mutate(
    (draft) => commitTextEdit(draft, id, value),
    noVisibleChange ? { skipHistory: true } : undefined,
  )
  setId(null)
}
```

3. Escape must also clean up a never-committed empty label (its committed text is still `""`). Replace the `onKeyDown` handler body:

```ts
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault()
          if ((el?.text ?? "") === "") {
            scene.mutate((draft) => commitTextEdit(draft, id, ""), { skipHistory: true })
          }
          setId(null)
        }
      }}
```

(Escape still discards typed-but-uncommitted input for existing text — unchanged behavior — but now deletes an empty bound label instead of leaving an invisible element.)

- [ ] **Step 5: Help entry + i18n**

In `packages/ui/src/HelpDialog.tsx`, add to `EDITOR_SHORTCUTS` after the `ungroup` row:

```ts
  { keys: "Double-click", label: "shortcuts.addLabel" },
```

In `packages/ui/test/HelpDialog.test.tsx`, extend the `"lists at least the canonical shortcuts"` test:

```ts
expect(screen.getByText("Double-click")).toBeInTheDocument()
```

In `apps/web/src/locales/en/shortcuts.json`, add after `"ungroup"`:

```json
  "addLabel": "Add label to shape",
```

In `apps/web/src/locales/ko/shortcuts.json`, add after `"ungroup"`:

```json
  "addLabel": "도형에 라벨 추가",
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd apps/web && pnpm vitest run && cd ../../packages/ui && pnpm vitest run test/HelpDialog.test.tsx`
Expected: all green.

- [ ] **Step 7: Typecheck web + ui**

Run: `pnpm typecheck` (repo root)
Expected: clean across all packages.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/driver/commitTextEdit.ts apps/web/src/components/TextEditingOverlay.tsx apps/web/test/commit-text-edit.test.ts packages/ui/src/HelpDialog.tsx packages/ui/test/HelpDialog.test.tsx apps/web/src/locales/en/shortcuts.json apps/web/src/locales/ko/shortcuts.json
git commit -m "web+ui: empty-label cleanup on text-edit close, help entry for shape labels"
```

---

### Task 5: e2e + full gate

**Files:**

- Create: `apps/web/e2e/shape-labels.spec.ts`

**Interfaces:**

- Consumes: `dragOnCanvas` from `apps/web/e2e/_helpers.ts`; toolbar testids `toolbar-diamond`, `toolbar-rectangle`, `toolbar-selection`; localStorage key `excalidraw-scene`.
- Produces: nothing — final verification.

- [ ] **Step 1: Write the e2e spec**

Create `apps/web/e2e/shape-labels.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test"
import { dragOnCanvas } from "./_helpers"

type SceneEl = {
  id: string
  type: string
  x: number
  y: number
  width: number
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
  await page.locator('[data-testid="toolbar-diamond"]').waitFor({ state: "visible" })
}

const dblClickCanvas = async (page: Page, at: { x: number; y: number }): Promise<void> => {
  const canvas = page.locator("canvas").first()
  const box = await canvas.boundingBox()
  if (!box) throw new Error("canvas not found")
  await page.mouse.dblclick(box.x + at.x, box.y + at.y)
}

test("double-click a diamond adds a label that follows the shape and persists", async ({
  page,
}) => {
  await freshCanvas(page)

  await page.locator('[data-testid="toolbar-diamond"]').click()
  await dragOnCanvas(page, { x: 100, y: 100 }, { x: 220, y: 180 })
  await page.waitForTimeout(120)

  await page.locator('[data-testid="toolbar-selection"]').click()
  await dblClickCanvas(page, { x: 160, y: 140 })
  const textarea = page.locator("textarea")
  await textarea.waitFor({ state: "visible" })
  await textarea.fill("OK")
  // blur commits
  await page.mouse.click(500, 400)
  await page.waitForTimeout(900)

  let els = await readScene(page)
  const diamond = els.find((e) => e.type === "diamond")!
  let label = els.find((e) => e.type === "text")!
  expect(label.text).toBe("OK")
  expect(label.containerId).toBe(diamond.id)
  // diamond inner box: x-offset = width/4
  expect(Math.abs(label.x - (diamond.x + diamond.width / 4))).toBeLessThanOrEqual(1)

  // drag the diamond; the label follows
  await dragOnCanvas(page, { x: 160, y: 140 }, { x: 360, y: 240 })
  await page.waitForTimeout(900)
  els = await readScene(page)
  const moved = els.find((e) => e.type === "diamond")!
  label = els.find((e) => e.type === "text")!
  expect(Math.abs(label.x - (moved.x + moved.width / 4))).toBeLessThanOrEqual(1)

  // persists across reload
  await page.reload()
  await page.locator('[data-testid="toolbar-diamond"]').waitFor({ state: "visible" })
  els = await readScene(page)
  expect(els.find((e) => e.type === "text")?.text).toBe("OK")
})

test("committing an empty label leaves the scene label-free", async ({ page }) => {
  await freshCanvas(page)

  await page.locator('[data-testid="toolbar-rectangle"]').click()
  await dragOnCanvas(page, { x: 100, y: 100 }, { x: 240, y: 180 })
  await page.waitForTimeout(120)

  await page.locator('[data-testid="toolbar-selection"]').click()
  await dblClickCanvas(page, { x: 170, y: 140 })
  await page.locator("textarea").waitFor({ state: "visible" })
  // blur with nothing typed
  await page.mouse.click(500, 400)
  await page.waitForTimeout(900)

  const els = await readScene(page)
  expect(els.filter((e) => e.type === "text")).toHaveLength(0)
  expect(els).toHaveLength(1)
})
```

- [ ] **Step 2: Run the new spec**

Run: `cd apps/web && pnpm playwright test e2e/shape-labels.spec.ts`
Expected: 2 passed. If the double-click lands on a resize handle instead of the shape body, nudge the click point a few px toward the shape center — handles sit on the selection frame edge, not the center.

- [ ] **Step 3: Full gate**

Run from repo root: `pnpm lint && pnpm typecheck && pnpm test && cd apps/web && pnpm e2e`
Expected: lint clean; typecheck clean; all unit suites green; 32 e2e passed.

- [ ] **Step 4: Commit**

```bash
git add apps/web/e2e/shape-labels.spec.ts
git commit -m "web: e2e — shape labels create/follow/persist, empty label cleans up"
```

---

## Self-Review Notes (already applied)

- **Spec coverage:** geometry §1 → Task 1; scene §2 → Task 2; tools §3 → Task 3; web §4 + UI/i18n §5 → Task 4; e2e §Testing → Task 5. Out-of-scope items have no tasks (correct).
- `LABELABLE_TYPES` lives in `reconcile-bound-text.ts`, not `factories.ts`, to avoid the `factories → reconcile-bound-text` import cycle.
- The pre-existing tools test `"double-click on a non-text element is a no-op"` asserts behavior this feature intentionally changes — Task 3 Step 1 rewrites it to use a line.
- `newLabelFor` takes a structural parameter (id/type/box) rather than `ExcalidrawElement` so the tools package can pass the hit element without narrowing; `labelInnerBox`'s `Bounds` parameter is satisfied structurally.
