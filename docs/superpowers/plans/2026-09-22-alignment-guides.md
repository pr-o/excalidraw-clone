# Smart Alignment Guides Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Each task is self-contained: write the failing test first, watch it fail, implement the minimum, watch it pass, commit. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** While dragging a selection, show dashed alignment guides and snap its position against other elements' edges/centers on both axes, continuously for the duration of the drag.

**Architecture:** A new pure function `computeAlignmentSnap` in `packages/geometry/src/alignment-guides.ts` compares a moving bounding box's near-edge/center/far-edge against candidate elements' same three values per axis and returns a correction + guide lines. `packages/tools/src/tools/selection/alignment.ts` wires this into the selection tool's drag reducer (`reduceDragging` in `packages/tools/src/tools/selection/index.ts`), folding the correction into the existing `dx`/`dy` drag-delta math and emitting a new `setGuides` `ToolEffect` on every `pointerMove`. That effect flows through `apps/web/src/driver/effects.ts` into a new Zustand `guides` store slice, exactly mirroring how the laser tool's `laserMove` effect already flows to its own sink. `useDrawingDriver.ts` syncs the store's `activeGuides` to a new `CanvasRenderer.setGuides()` method, which a new `drawAlignmentGuides()` in `packages/renderer/src/overlay.ts` paints as dashed lines on the overlay canvas, alongside the existing selection chrome.

**Tech Stack:** TypeScript, Vitest (unit), Playwright (`@playwright/test`, e2e), pnpm workspaces + Turbo, Zustand.

**Spec:** `docs/superpowers/specs/2026-09-21-alignment-guides-design.md`

## Global Constraints

- Package manager is **pnpm**; task runner is **Turbo**. Run turbo as `pnpm turbo run <tasks>` (never `npx turbo`). Full gate: `pnpm turbo run lint typecheck test build --force`. The `--force` matters specifically for `lint` — this repo has a known stale-cache gotcha where `turbo run lint` alone can show cached output from a different worktree/branch; always use `--force` for the final full-gate lint run.
- Package filter names are the scoped npm names: `@excalidraw-clone/geometry`, `@excalidraw-clone/tools`, `@excalidraw-clone/renderer`, `@excalidraw-clone/scene`. `apps/web`'s package is filtered as `web` (its scoped name is `@excalidraw-clone/web`, but this repo's convention — see the laser-pointer and history-panel plans — filters it as `pnpm --filter web ...`).
- Playwright is invoked as `pnpm exec playwright test` from `apps/web/` (the CLI is not on PATH). Test import is `@playwright/test`.
- Scene localStorage key is `"excalidraw-scene"`. E2E helpers live in `apps/web/e2e/_helpers.ts` (`dragOnCanvas`, `parseStoredScene` — unwraps the v3 `pages[]` document to the active page's `elements`). This plan's e2e spec needs a _single-hop_ drag (no interpolation) for exact-position assertions, so it adds its own local helper rather than reusing `dragOnCanvas` (which always interpolates in 8 steps) — see Task 5.
- Formatting: no semicolons, double quotes, trailing commas everywhere, 100-char print width (`.prettierrc`) — `format:check` is part of the full gate.
- Default view transform is `{ scrollX: 0, scrollY: 0, zoom: 1 }`, so on a fresh page, canvas pixel coordinates equal scene coordinates — the e2e spec in Task 5 relies on this.
- **Scope, per the approved spec:** move-time (drag) snapping only. No equal-spacing/distribution guides, no resize-time guides, no rotation-aware bounds, no new keyboard shortcut. The existing `shortcuts:bypassSnap` HelpDialog entry ("Hold Cmd/Ctrl") already covers this feature — confirmed at `packages/ui/src/HelpDialog.tsx:49`; no HelpDialog change is needed in this plan.
- Threshold is **8 screen pixels**, converted to world units as `8 / ctx.viewTransform.zoom`.
- When `ctx.grid.enabled` is true, alignment-guide snapping is suppressed entirely for that drag (no computation, no guides) — the two snap systems never fight over the final position.
- Held Ctrl/Meta disables alignment snapping, using the exact same modifier check `snapPointToGrid` (`packages/geometry/src/snap.ts:14`) already uses: `mods.ctrl || mods.meta`.
- Candidates for snapping = every non-deleted, non-locked element on the active page except the ones being dragged. A multi-selection drag uses the combined bounding box (`getElementsBounds` from `@excalidraw-clone/scene`) as the moving bounds — the same precedent the just-shipped multi-element-resize feature established.
- Commit after every task with a conventional-commit message. Branch is `feat/alignment-guides`, created off **`main`** (currently clean at `c701b8e`, 1 commit ahead of `origin/main`, holding this plan's already-approved and already-committed spec doc).
- Final task: full gate + full e2e green, then integrate per **superpowers:finishing-a-development-branch**.

---

### Task 1: `computeAlignmentSnap` pure function in `packages/geometry`

**Context for a fresh implementer:** This is the one piece of math the whole feature depends on. Given the dragged selection's bounding box, a list of candidate elements' bounding boxes, and a threshold in world units, it independently finds the best snap on the X axis and on the Y axis. For each axis it compares three values from the moving box (near edge, center, far edge) against the same three values from every candidate, and the single closest pair within the threshold wins that axis. It has no dependency on the tools/scene/renderer packages — it operates purely on `Bounds` (`{ x, y, width, height }`, already defined in `packages/geometry/src/types.ts`).

**Files:**

- Create: `packages/geometry/src/alignment-guides.ts`
- Create: `packages/geometry/test/alignment-guides.test.ts`
- Modify: `packages/geometry/src/index.ts` (export the new function + types, after the existing `snapPointToGrid` export block at line 35-36)

**Interfaces:**

- Consumes: `type Bounds` from `./types`.
- Produces:

  ```ts
  export interface AlignmentGuide {
    axis: "x" | "y"
    position: number
    start: number
    end: number
  }
  export interface AlignmentSnapResult {
    dx: number
    dy: number
    guides: readonly AlignmentGuide[]
  }
  export function computeAlignmentSnap(
    movingBounds: Bounds,
    candidateBounds: readonly Bounds[],
    thresholdWorld: number,
  ): AlignmentSnapResult
  ```

  Later tasks (Task 2 onward) import `computeAlignmentSnap`, `AlignmentGuide`, and `AlignmentSnapResult` by these exact names from `@excalidraw-clone/geometry`.

- [ ] **Step 0 (branch setup):** From a clean tree on `main` (confirm with `git status`), create the working branch: `git switch -c feat/alignment-guides`. Confirm `git status` is clean.

- [ ] **Step 1: Write the failing tests**

Create `packages/geometry/test/alignment-guides.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { computeAlignmentSnap } from "../src/alignment-guides"

describe("computeAlignmentSnap", () => {
  it("snaps a far edge to another element's near edge within threshold (edge-to-edge, x axis)", () => {
    const moving = { x: 92, y: 0, width: 50, height: 50 } // far edge = 142
    const candidate = { x: 150, y: 0, width: 50, height: 50 } // near edge = 150
    const result = computeAlignmentSnap(moving, [candidate], 10)
    expect(result.dx).toBe(8) // 150 - 142
    expect(result.dy).toBe(0)
    expect(result.guides).toEqual([{ axis: "x", position: 150, start: 0, end: 50 }])
  })

  it("snaps center to center on the y axis", () => {
    const moving = { x: 0, y: 96, width: 20, height: 20 } // center y = 106
    const candidate = { x: 200, y: 90, width: 20, height: 40 } // center y = 110
    const result = computeAlignmentSnap(moving, [candidate], 10)
    expect(result.dy).toBe(4) // 110 - 106
    expect(result.dx).toBe(0)
    expect(result.guides).toEqual([{ axis: "y", position: 110, start: 0, end: 220 }])
  })

  it("snaps independently on both axes against different candidates", () => {
    const moving = { x: 100, y: 100, width: 10, height: 10 } // far edges = 110
    const candX = { x: 118, y: 900, width: 10, height: 10 } // near x = 118 (y is far away)
    const candY = { x: 900, y: 118, width: 10, height: 10 } // near y = 118 (x is far away)
    const result = computeAlignmentSnap(moving, [candX, candY], 10)
    expect(result.dx).toBe(8) // 118 - 110
    expect(result.dy).toBe(8) // 118 - 110
    expect(result.guides.length).toBe(2)
  })

  it("does not snap when the nearest value is exactly outside the threshold", () => {
    const moving = { x: 0, y: 0, width: 10, height: 10 } // far edge = 10
    const candidate = { x: 20.01, y: 1000, width: 10, height: 10 } // near edge dist = 10.01
    const result = computeAlignmentSnap(moving, [candidate], 10)
    expect(result).toEqual({ dx: 0, dy: 0, guides: [] })
  })

  it("snaps when the nearest value is exactly at the threshold boundary", () => {
    const moving = { x: 0, y: 0, width: 10, height: 10 } // far edge = 10
    const candidate = { x: 20, y: 1000, width: 10, height: 10 } // near edge dist = 10
    const result = computeAlignmentSnap(moving, [candidate], 10)
    expect(result.dx).toBe(10)
    expect(result.guides).toHaveLength(1)
  })

  it("picks the closest match across multiple candidates on the same axis", () => {
    const moving = { x: 0, y: 0, width: 10, height: 10 } // values (0, 5, 10)
    const far = { x: 25, y: 1000, width: 10, height: 10 } // nearest diff = 15
    const near = { x: 18, y: 1000, width: 10, height: 10 } // nearest diff = 8
    const result = computeAlignmentSnap(moving, [far, near], 20)
    expect(result.dx).toBe(8) // 18 - 10, from `near`, not `far`
  })

  it("returns zero correction and no guides when nothing is within threshold on either axis", () => {
    const moving = { x: 0, y: 0, width: 10, height: 10 }
    const candidate = { x: 1000, y: 1000, width: 10, height: 10 }
    const result = computeAlignmentSnap(moving, [candidate], 10)
    expect(result).toEqual({ dx: 0, dy: 0, guides: [] })
  })

  it("returns zero correction and no guides with no candidates at all", () => {
    const moving = { x: 0, y: 0, width: 10, height: 10 }
    const result = computeAlignmentSnap(moving, [], 10)
    expect(result).toEqual({ dx: 0, dy: 0, guides: [] })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @excalidraw-clone/geometry test alignment-guides`
Expected: FAIL — cannot resolve `../src/alignment-guides`.

- [ ] **Step 3: Implement `alignment-guides.ts`**

Create `packages/geometry/src/alignment-guides.ts`:

```ts
import type { Bounds } from "./types"

export interface AlignmentGuide {
  axis: "x" | "y"
  position: number
  start: number
  end: number
}

export interface AlignmentSnapResult {
  dx: number
  dy: number
  guides: readonly AlignmentGuide[]
}

interface AxisTriple {
  near: number
  center: number
  far: number
}

const xTriple = (b: Bounds): AxisTriple => ({
  near: b.x,
  center: b.x + b.width / 2,
  far: b.x + b.width,
})

const yTriple = (b: Bounds): AxisTriple => ({
  near: b.y,
  center: b.y + b.height / 2,
  far: b.y + b.height,
})

interface AxisMatch {
  distance: number
  correction: number
  position: number
  perpStart: number
  perpEnd: number
}

/** Finds the single closest (moving-value, candidate-value) pair within
 *  `thresholdWorld` for one axis, comparing near/center/far of the moving
 *  box against near/center/far of every candidate. Returns null when
 *  nothing is within threshold. */
const bestAxisMatch = (
  movingBounds: Bounds,
  candidateBounds: readonly Bounds[],
  axis: "x" | "y",
  thresholdWorld: number,
): AxisMatch | null => {
  const movingTriple = axis === "x" ? xTriple(movingBounds) : yTriple(movingBounds)
  const movingValues = [movingTriple.near, movingTriple.center, movingTriple.far]
  const movingPerpStart = axis === "x" ? movingBounds.y : movingBounds.x
  const movingPerpEnd =
    axis === "x" ? movingBounds.y + movingBounds.height : movingBounds.x + movingBounds.width

  let best: AxisMatch | null = null
  for (const candidate of candidateBounds) {
    const candidateTriple = axis === "x" ? xTriple(candidate) : yTriple(candidate)
    const candidateValues = [candidateTriple.near, candidateTriple.center, candidateTriple.far]
    const candidatePerpStart = axis === "x" ? candidate.y : candidate.x
    const candidatePerpEnd =
      axis === "x" ? candidate.y + candidate.height : candidate.x + candidate.width

    for (const mv of movingValues) {
      for (const cv of candidateValues) {
        const distance = Math.abs(cv - mv)
        if (distance > thresholdWorld) continue
        if (best === null || distance < best.distance) {
          best = {
            distance,
            correction: cv - mv,
            position: cv,
            perpStart: Math.min(movingPerpStart, candidatePerpStart),
            perpEnd: Math.max(movingPerpEnd, candidatePerpEnd),
          }
        }
      }
    }
  }
  return best
}

/** Compares the moving bbox's near-edge/center/far-edge against every
 *  candidate's same three values, independently per axis. The closest
 *  match within `thresholdWorld` wins that axis; an axis with no match
 *  contributes zero correction and no guide. */
export const computeAlignmentSnap = (
  movingBounds: Bounds,
  candidateBounds: readonly Bounds[],
  thresholdWorld: number,
): AlignmentSnapResult => {
  const guides: AlignmentGuide[] = []
  let dx = 0
  let dy = 0

  const xMatch = bestAxisMatch(movingBounds, candidateBounds, "x", thresholdWorld)
  if (xMatch) {
    dx = xMatch.correction
    guides.push({
      axis: "x",
      position: xMatch.position,
      start: xMatch.perpStart,
      end: xMatch.perpEnd,
    })
  }

  const yMatch = bestAxisMatch(movingBounds, candidateBounds, "y", thresholdWorld)
  if (yMatch) {
    dy = yMatch.correction
    guides.push({
      axis: "y",
      position: yMatch.position,
      start: yMatch.perpStart,
      end: yMatch.perpEnd,
    })
  }

  return { dx, dy, guides }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @excalidraw-clone/geometry test alignment-guides`
Expected: PASS (8 tests).

- [ ] **Step 5: Export from the package**

In `packages/geometry/src/index.ts`, after the existing block:

```ts
export { snapPointToGrid } from "./snap"
export type { GridSnap, SnapModifiers } from "./snap"
```

add:

```ts
export { computeAlignmentSnap } from "./alignment-guides"
export type { AlignmentGuide, AlignmentSnapResult } from "./alignment-guides"
```

- [ ] **Step 6: Run the full package test suite + typecheck**

Run: `pnpm --filter @excalidraw-clone/geometry test`
Expected: PASS (all files, including the new one).

Run: `pnpm turbo run typecheck --force`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/geometry/src/alignment-guides.ts packages/geometry/src/index.ts packages/geometry/test/alignment-guides.test.ts
git commit -m "feat(geometry): computeAlignmentSnap for move-time alignment guides"
```

---

### Task 2: `setGuides` ToolEffect + selection drag wiring

**Context for a fresh implementer:** The selection tool's drag reducer (`reduceDragging` in `packages/tools/src/tools/selection/index.ts`) already folds a grid-snap correction into its `dx`/`dy` on the _first_ move of a drag (see the `state.firstMove && ctx.grid.enabled` branch). This task adds a second, independent correction — alignment-guide snapping — that runs on _every_ `pointerMove` (not just the first), using `computeAlignmentSnap` from Task 1. The wiring logic (turning `ctx.readElements()` + `movedIds` + the raw pointer delta into a `Bounds` and a list of candidate `Bounds`) is pulled into its own small file, `alignment.ts`, so `reduceDragging` stays readable. A new `ToolEffect` kind, `setGuides`, carries the resulting guide lines out of the reducer — it's emitted with the correction on every `pointerMove`, and with an empty array on `pointerUp`/`escape` (and whenever grid-snap is active instead) to clear any guides left on screen.

**Files:**

- Modify: `packages/tools/src/types.ts` (add `AlignmentGuide` import; add the `setGuides` member to the `ToolEffect` union, ~lines 61-69)
- Create: `packages/tools/src/tools/selection/alignment.ts`
- Modify: `packages/tools/src/tools/selection/index.ts` (import + rewrite `reduceDragging`, ~lines 270-309)
- Test: `packages/tools/test/selection-drag.test.ts` (extend existing file — add a new `describe` block)

**Interfaces:**

- Consumes: `computeAlignmentSnap`, `type AlignmentGuide` from `@excalidraw-clone/geometry` (Task 1); `getElementBounds`, `getElementsBounds` from `@excalidraw-clone/scene`; `type ToolContext` from `../../types`.
- Produces:
  - `ToolEffect` now includes `{ kind: "setGuides"; guides: readonly AlignmentGuide[] }`.
  - `export interface DragAlignment { dx: number; dy: number; guides: readonly AlignmentGuide[] }`
  - `export const computeDragAlignment = (movedIds: readonly string[], dx: number, dy: number, ctx: ToolContext): DragAlignment` — later tasks do not call this directly (only `reduceDragging` does), but its name/shape must stay stable since this task's own tests exercise it indirectly through `selectionTool.reduce`.

- [ ] **Step 1: Write the failing tests**

In `packages/tools/test/selection-drag.test.ts`, add this new `describe` block immediately after the existing `describe("selection — drag with grid snap", ...)` block (before the `makeBoundPair` helper):

```ts
describe("selection — drag alignment guides", () => {
  it("emits a setGuides effect and folds the correction into dx when near a candidate edge", () => {
    const r = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const c = { ...newRectangle({ x: 28, y: 500, width: 10, height: 10 }), id: "c" }
    const draft: ExcalidrawElement[] = [r, c]
    const ctx = makeCtx({ hitTest: () => r, readElements: () => draft, selectedIds: [r.id] })
    const down = selectionTool.reduce(
      selectionTool.initial,
      { type: "pointerDown", at: point(5, 5) },
      ctx,
    )
    const move = selectionTool.reduce(down[0], { type: "pointerMove", at: point(25, 5) }, ctx)
    applyMutation(move[1], draft)
    // raw dx = 20 (far edge 30), alignment correction -2 (candidate near edge 28)
    expect(draft[0]!.x).toBe(18)
    expect(draft[0]!.y).toBe(0)
    const guidesEff = move[1].find((e) => e.kind === "setGuides")
    expect(guidesEff).toBeDefined()
    if (guidesEff?.kind === "setGuides") {
      // Perpendicular (y) extent is the min/max of BOTH the mover's (0..10)
      // and the candidate's (500..510) y ranges, per computeAlignmentSnap's
      // bestAxisMatch — they don't overlap, so the combined range is 0..510.
      expect(guidesEff.guides).toEqual([{ axis: "x", position: 28, start: 0, end: 510 }])
    }
  })

  it("grid enabled suppresses alignment guides entirely even near a candidate edge", () => {
    const r = newRectangle({ x: 20, y: 20, width: 10, height: 10 })
    const c = { ...newRectangle({ x: 48, y: 500, width: 10, height: 10 }), id: "c" }
    const draft: ExcalidrawElement[] = [r, c]
    const ctx = makeCtx({
      hitTest: () => r,
      readElements: () => draft,
      selectedIds: [r.id],
      grid: { enabled: true, size: 20 },
    })
    const down = selectionTool.reduce(
      selectionTool.initial,
      { type: "pointerDown", at: point(25, 25) },
      ctx,
    )
    const move = selectionTool.reduce(down[0], { type: "pointerMove", at: point(45, 25) }, ctx)
    applyMutation(move[1], draft)
    // Pure grid-path delta (anchor already on-grid, +20 from the pointer) — no alignment.
    expect(draft[0]!.x).toBe(40)
    const guidesEff = move[1].find((e) => e.kind === "setGuides")
    expect(guidesEff?.kind === "setGuides" && guidesEff.guides).toEqual([])
  })

  it("ctrl bypasses alignment guides even when a candidate edge is within threshold", () => {
    const r = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const c = { ...newRectangle({ x: 28, y: 500, width: 10, height: 10 }), id: "c" }
    const draft: ExcalidrawElement[] = [r, c]
    const ctx = makeCtx({
      hitTest: () => r,
      readElements: () => draft,
      selectedIds: [r.id],
      modifiers: withModifiers({ ctrl: true }),
    })
    const down = selectionTool.reduce(
      selectionTool.initial,
      { type: "pointerDown", at: point(5, 5) },
      ctx,
    )
    const move = selectionTool.reduce(down[0], { type: "pointerMove", at: point(25, 5) }, ctx)
    applyMutation(move[1], draft)
    // Pure delta (+20), no alignment correction.
    expect(draft[0]!.x).toBe(20)
    const guidesEff = move[1].find((e) => e.kind === "setGuides")
    expect(guidesEff?.kind === "setGuides" && guidesEff.guides).toEqual([])
  })

  it("multi-selection uses the combined bounding box, not a single member's bounds", () => {
    const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const b = { ...newRectangle({ x: 40, y: 0, width: 10, height: 10 }), id: "b" }
    // Candidate's center (25) matches the combined bbox's center (25) exactly;
    // neither a's own center (5) nor b's own center (45) is within the 8px threshold of it.
    const c = { ...newRectangle({ x: 21, y: 500, width: 8, height: 10 }), id: "c" }
    const draft: ExcalidrawElement[] = [a, b, c]
    const ctx = makeCtx({
      hitTest: () => a,
      readElements: () => draft,
      selectedIds: [a.id, b.id],
    })
    const down = selectionTool.reduce(
      selectionTool.initial,
      { type: "pointerDown", at: point(5, 5) },
      ctx,
    )
    expect(down[0].phase).toBe("dragging")
    if (down[0].phase === "dragging") expect(down[0].movedIds).toEqual([a.id, b.id])
    // Zero-delta move: pointer hasn't moved, so movingBounds equals the combined bbox exactly.
    const move = selectionTool.reduce(down[0], { type: "pointerMove", at: point(5, 5) }, ctx)
    const guidesEff = move[1].find((e) => e.kind === "setGuides")
    expect(guidesEff?.kind === "setGuides" && guidesEff.guides).toEqual([
      { axis: "x", position: 25, start: 0, end: 510 },
    ])
  })

  it("pointerUp and escape both clear guides", () => {
    const r = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const c = { ...newRectangle({ x: 28, y: 500, width: 10, height: 10 }), id: "c" }
    const draft: ExcalidrawElement[] = [r, c]
    const ctx = makeCtx({ hitTest: () => r, readElements: () => draft, selectedIds: [r.id] })
    const down = selectionTool.reduce(
      selectionTool.initial,
      { type: "pointerDown", at: point(5, 5) },
      ctx,
    )
    const move = selectionTool.reduce(down[0], { type: "pointerMove", at: point(25, 5) }, ctx)
    const up = selectionTool.reduce(move[0], { type: "pointerUp", at: point(25, 5) }, ctx)
    const upGuides = up[1].find((e) => e.kind === "setGuides")
    expect(upGuides?.kind === "setGuides" && upGuides.guides).toEqual([])

    const escape = selectionTool.reduce(move[0], { type: "escape" }, ctx)
    const escGuides = escape[1].find((e) => e.kind === "setGuides")
    expect(escGuides?.kind === "setGuides" && escGuides.guides).toEqual([])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @excalidraw-clone/tools test selection-drag`
Expected: FAIL — `setGuides` is not a valid `ToolEffect` kind (TS error) / no effect with that kind is ever emitted.

- [ ] **Step 3: Add the `setGuides` effect kind**

In `packages/tools/src/types.ts`, change the import line:

```ts
import type { GridSnap, Point, ViewTransform } from "@excalidraw-clone/geometry"
```

to:

```ts
import type { AlignmentGuide, GridSnap, Point, ViewTransform } from "@excalidraw-clone/geometry"
```

and add this member to the `ToolEffect` union (after `| { kind: "laserMove"; at: Point }`):

```ts
  | { kind: "setGuides"; guides: readonly AlignmentGuide[] }
```

- [ ] **Step 4: Implement the alignment wiring helper**

Create `packages/tools/src/tools/selection/alignment.ts`:

```ts
import { computeAlignmentSnap, type AlignmentGuide } from "@excalidraw-clone/geometry"
import { getElementBounds, getElementsBounds } from "@excalidraw-clone/scene"
import type { ToolContext } from "../../types"

const ALIGNMENT_THRESHOLD_SCREEN_PX = 8

export interface DragAlignment {
  dx: number
  dy: number
  guides: readonly AlignmentGuide[]
}

/** Extra snap correction against other elements' edges/centers, folded on
 *  top of a raw pointer-delta drag translation. Bypassed by Ctrl/Meta,
 *  mirroring `snapPointToGrid`'s exact modifier check. A multi-selection's
 *  moving bounds is the combined bbox of every dragged element
 *  (`getElementsBounds`), matching the multi-element-resize precedent.
 *  Candidates are every non-deleted, non-locked element not being dragged. */
export const computeDragAlignment = (
  movedIds: readonly string[],
  dx: number,
  dy: number,
  ctx: ToolContext,
): DragAlignment => {
  if (ctx.modifiers.ctrl || ctx.modifiers.meta) return { dx, dy, guides: [] }
  const elements = ctx.readElements()
  const movedSet = new Set(movedIds)
  const movedElements = elements.filter((e) => movedSet.has(e.id))
  const currentBounds = getElementsBounds(movedElements)
  if (!currentBounds) return { dx, dy, guides: [] }
  const movingBounds = {
    x: currentBounds.x + dx,
    y: currentBounds.y + dy,
    width: currentBounds.width,
    height: currentBounds.height,
  }
  const candidateBounds = elements
    .filter((e) => !e.isDeleted && !e.locked && !movedSet.has(e.id))
    .map(getElementBounds)
  const threshold = ALIGNMENT_THRESHOLD_SCREEN_PX / ctx.viewTransform.zoom
  const snap = computeAlignmentSnap(movingBounds, candidateBounds, threshold)
  return { dx: dx + snap.dx, dy: dy + snap.dy, guides: snap.guides }
}
```

- [ ] **Step 5: Wire it into `reduceDragging`**

In `packages/tools/src/tools/selection/index.ts`, add the import (alongside the other `./` imports, alphabetically before `./bend`):

```ts
import { computeDragAlignment } from "./alignment"
```

Replace the entire `reduceDragging` function (currently lines 270-309) with:

```ts
const reduceDragging = (
  state: Extract<SelectionState, { phase: "dragging" }>,
  event: ToolEvent,
  ctx: ToolContext,
): [SelectionState, readonly ToolEffect[]] => {
  switch (event.type) {
    case "pointerMove": {
      if (state.firstMove && ctx.grid.enabled) {
        const elements = ctx.readElements()
        const anchor = elements.find((e) => state.movedIds.includes(e.id))
        if (anchor) {
          const snapped = snapPointToGrid({ x: anchor.x, y: anchor.y }, ctx.grid, {
            ctrl: ctx.modifiers.ctrl,
            meta: ctx.modifiers.meta,
          })
          const dx = snapped.x - anchor.x + (event.at.x - state.last.x)
          const dy = snapped.y - anchor.y + (event.at.y - state.last.y)
          return [
            { ...state, last: event.at, firstMove: false },
            [buildDragMoveEffect(state.movedIds, dx, dy), { kind: "setGuides", guides: [] }],
          ]
        }
      }
      const rawDx = event.at.x - state.last.x
      const rawDy = event.at.y - state.last.y
      if (ctx.grid.enabled) {
        return [
          { ...state, last: event.at, firstMove: false },
          [buildDragMoveEffect(state.movedIds, rawDx, rawDy), { kind: "setGuides", guides: [] }],
        ]
      }
      const { dx, dy, guides } = computeDragAlignment(state.movedIds, rawDx, rawDy, ctx)
      return [
        { ...state, last: event.at, firstMove: false },
        [buildDragMoveEffect(state.movedIds, dx, dy), { kind: "setGuides", guides }],
      ]
    }
    case "pointerUp": {
      return [
        { phase: "idle" },
        [buildDragCommitEffect(state.movedIds), { kind: "setGuides", guides: [] }],
      ]
    }
    case "escape": {
      return [
        { phase: "idle" },
        [
          buildDragRevertEffect(state.movedIds, state.start, state.last),
          { kind: "setGuides", guides: [] },
        ],
      ]
    }
    default:
      return [state, []]
  }
}
```

This preserves the existing grid-snap-on-first-move behavior exactly (still returns before touching alignment), adds an explicit "grid enabled but not first move" branch that also skips alignment (grid governs for the whole drag, per the spec), and only calls `computeDragAlignment` when grid snapping is off entirely.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter @excalidraw-clone/tools test selection-drag`
Expected: PASS (all tests in the file, including the 5 new ones — the pre-existing grid-snap and translation tests still pass unmodified since they only inspect `mutation` effects via `applyMutation`, which ignores the new `setGuides` entries).

- [ ] **Step 7: Run the full package test suite + typecheck**

Run: `pnpm --filter @excalidraw-clone/tools test`
Expected: PASS.

Run: `pnpm turbo run typecheck --force`
Expected: PASS. `apps/web`'s `applyEffects` has a `switch` with no `default` case and returns `void`, so the new effect kind does not break its typecheck yet (Task 3 adds its handling).

- [ ] **Step 8: Commit**

```bash
git add packages/tools/src/types.ts packages/tools/src/tools/selection/alignment.ts packages/tools/src/tools/selection/index.ts packages/tools/test/selection-drag.test.ts
git commit -m "feat(tools): setGuides effect + alignment-guide snapping on drag"
```

---

### Task 3: `guides` store slice + `applyEffects` wiring

**Context for a fresh implementer:** The `setGuides` effect from Task 2 needs somewhere to land in `apps/web` before the renderer (Task 4) can draw it. This repo's pattern for tool-effect-driven UI state is a small Zustand slice (see `apps/web/src/store/slices/grid.ts`, `selection.ts`) plus a case in `apps/web/src/driver/effects.ts`'s `applyEffects` switch. This task adds both.

**Files:**

- Create: `apps/web/src/store/slices/guides.ts`
- Modify: `apps/web/src/store/index.ts` (import + add to `AppState` + spread into the store creator)
- Modify: `apps/web/src/driver/effects.ts` (add the `setGuides` case)
- Test: `apps/web/test/store-guides.test.ts` (new), `apps/web/test/effects.test.ts` (extend existing)

**Interfaces:**

- Consumes: `type AlignmentGuide` from `@excalidraw-clone/geometry`; the `setGuides` `ToolEffect` from Task 2.
- Produces:

  ```ts
  export interface GuidesSlice {
    activeGuides: readonly AlignmentGuide[]
    setActiveGuides: (guides: readonly AlignmentGuide[]) => void
  }
  ```

  `useAppStore.getState().activeGuides` and `.setActiveGuides(...)` — Task 4's `useDrawingDriver.ts` change reads `s.activeGuides` by this exact field name.

- [ ] **Step 1: Write the failing store test**

Create `apps/web/test/store-guides.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest"
import { useAppStore } from "../src/store"

describe("guidesSlice — activeGuides", () => {
  beforeEach(() => useAppStore.getState().setActiveGuides([]))

  it("defaults to an empty array", () => {
    expect(useAppStore.getState().activeGuides).toEqual([])
  })

  it("setActiveGuides replaces the guides", () => {
    const guides = [{ axis: "x" as const, position: 10, start: 0, end: 20 }]
    useAppStore.getState().setActiveGuides(guides)
    expect(useAppStore.getState().activeGuides).toEqual(guides)
    useAppStore.getState().setActiveGuides([])
    expect(useAppStore.getState().activeGuides).toEqual([])
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter web test store-guides`
Expected: FAIL — `setActiveGuides` does not exist on the store.

- [ ] **Step 3: Create the slice**

Create `apps/web/src/store/slices/guides.ts`:

```ts
import type { AlignmentGuide } from "@excalidraw-clone/geometry"
import type { StateCreator } from "zustand"

export interface GuidesSlice {
  activeGuides: readonly AlignmentGuide[]
  setActiveGuides: (guides: readonly AlignmentGuide[]) => void
}

export const createGuidesSlice: StateCreator<GuidesSlice, [], [], GuidesSlice> = (set) => ({
  activeGuides: [],
  setActiveGuides: (guides) => set({ activeGuides: guides }),
})
```

- [ ] **Step 4: Wire it into the store**

In `apps/web/src/store/index.ts`, add the import (alphabetically, after `createGridSlice`):

```ts
import { createGuidesSlice, type GuidesSlice } from "./slices/guides"
```

Add `GuidesSlice` to the `AppState` intersection (after `GridSlice &`):

```ts
export type AppState = ToolSlice &
  ThemeSlice &
  ViewSlice &
  GridSlice &
  GuidesSlice &
  DialogSlice &
  // ...(rest unchanged)
```

Add the spread into the store creator (after `...createGridSlice(...a),`):

```ts
  ...createGuidesSlice(...a),
```

- [ ] **Step 5: Run the store test to verify it passes**

Run: `pnpm --filter web test store-guides`
Expected: PASS.

- [ ] **Step 6: Write the failing effects test**

In `apps/web/test/effects.test.ts`, add this case inside the `describe("applyEffects", ...)` block (after the `laserMove` case):

```ts
it("setGuides effect updates the guides slice", () => {
  const scene = new Scene()
  const guides = [{ axis: "y" as const, position: 5, start: 0, end: 10 }]
  applyEffects(scene, [{ kind: "setGuides", guides }])
  expect(useAppStore.getState().activeGuides).toEqual(guides)
})
```

- [ ] **Step 7: Run it to verify it fails**

Run: `pnpm --filter web test effects`
Expected: FAIL — the `"setGuides"` case is unhandled, `activeGuides` stays at its prior value.

- [ ] **Step 8: Add the case to `applyEffects`**

In `apps/web/src/driver/effects.ts`, add this case to the `switch (eff.kind)` block, after `case "laserMove":`:

```ts
      case "setGuides":
        useAppStore.getState().setActiveGuides(eff.guides)
        break
```

- [ ] **Step 9: Run the effects test to verify it passes**

Run: `pnpm --filter web test effects`
Expected: PASS.

- [ ] **Step 10: Run the full web test suite + typecheck**

Run: `pnpm --filter web test`
Expected: PASS.

Run: `pnpm turbo run typecheck --force`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add apps/web/src/store/slices/guides.ts apps/web/src/store/index.ts apps/web/src/driver/effects.ts apps/web/test/store-guides.test.ts apps/web/test/effects.test.ts
git commit -m "feat(web): guides store slice + applyEffects wiring for setGuides"
```

---

### Task 4: `CanvasRenderer.setGuides` + `drawAlignmentGuides` + driver sync

**Context for a fresh implementer:** The renderer already has a pattern for small pieces of overlay chrome driven by setter methods — `setSelection`, `setMarquee`, `setBindingHighlight`, `setGrid` — each storing a private field and calling `requestRedraw()`, consumed inside `render()`/`renderSelection()`. This task adds `setGuides` following that exact pattern, plus a new `drawAlignmentGuides()` drawing function in `overlay.ts` (alongside the existing `drawSelectionChrome`), and finally wires `useDrawingDriver.ts`'s store-diff sync loop — which already does this for `selectedIds` → `setSelection` — to do the same for `activeGuides` → `setGuides`.

**Files:**

- Modify: `packages/renderer/src/types.ts` (add `guides?: readonly AlignmentGuide[]` to `CanvasRendererOptions`)
- Modify: `packages/renderer/src/overlay.ts` (add `drawAlignmentGuides`, after `drawSelectionChrome`)
- Modify: `packages/renderer/src/renderer.ts` (import, private field, `setGuides` method, call site in `renderSelection`)
- Modify: `apps/web/src/driver/useDrawingDriver.ts` (one line in the store-subscribe diff block)
- Test: `packages/renderer/test/renderer-skeleton.test.ts` (extend — `setGuides` schedules a redraw), `packages/renderer/test/overlay.test.ts` (extend — guide lines are drawn dashed)

**Interfaces:**

- Consumes: `type AlignmentGuide` from `@excalidraw-clone/geometry`; `activeGuides` from the store (Task 3).
- Produces: `CanvasRenderer.setGuides(guides: readonly AlignmentGuide[]): void`; `drawAlignmentGuides(ctx: CanvasRenderingContext2D, guides: readonly AlignmentGuide[], view: ViewTransform, theme: Theme): void` exported from `./overlay`.

- [ ] **Step 1: Write the failing renderer tests**

In `packages/renderer/test/renderer-skeleton.test.ts`, add this test inside the `describe("CanvasRenderer skeleton", ...)` block (after the `"setViewTransform/setSelection/setGrid each schedule a redraw"` test):

```ts
it("setGuides schedules a redraw", () => {
  const { canvas, ctx } = createMockCanvas()
  const scene = new Scene()
  const r = new CanvasRenderer(canvas, scene)
  r.start()
  flushFrame()
  const before = callsOf(ctx, "clearRect").length
  r.setGuides([{ axis: "x", position: 10, start: 0, end: 20 }])
  flushFrame()
  expect(callsOf(ctx, "clearRect").length).toBe(before + 1)
})
```

In `packages/renderer/test/overlay.test.ts`, add this new `describe` block (after the existing `describe("CanvasRenderer selection overlay", ...)` block, at the end of the file):

```ts
describe("CanvasRenderer alignment guides", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(RoughCanvas.prototype, "draw").mockImplementation(() => undefined)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("no guides set → no guide stroke calls", () => {
    const { canvas: main } = createMockCanvas()
    const { canvas: overlay, ctx: overlayCtx } = createMockCanvas()
    const r = new CanvasRenderer(main, new Scene(), { overlayCanvas: overlay })
    r.start()
    flush()
    expect(overlayCtx.__calls.filter((c) => c.method === "stroke").length).toBe(0)
  })

  it("setGuides draws one dashed stroke per guide on the overlay canvas", () => {
    const { canvas: main } = createMockCanvas()
    const { canvas: overlay, ctx: overlayCtx } = createMockCanvas()
    const r = new CanvasRenderer(main, new Scene(), { overlayCanvas: overlay })
    r.start()
    flush()
    r.setGuides([
      { axis: "x", position: 50, start: 0, end: 100 },
      { axis: "y", position: 20, start: 0, end: 200 },
    ])
    flush()
    expect(overlayCtx.__calls.filter((c) => c.method === "stroke").length).toBe(2)
    const dashCalls = overlayCtx.__calls.filter((c) => c.method === "setLineDash")
    expect(
      dashCalls.some((c) => Array.isArray(c.args[0]) && (c.args[0] as number[]).length > 0),
    ).toBe(true)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @excalidraw-clone/renderer test renderer-skeleton overlay`
Expected: FAIL — `setGuides` does not exist on `CanvasRenderer`.

- [ ] **Step 3: Add `guides` to `CanvasRendererOptions`**

In `packages/renderer/src/types.ts`, change the import line:

```ts
import type { ViewTransform } from "@excalidraw-clone/geometry"
```

to:

```ts
import type { AlignmentGuide, ViewTransform } from "@excalidraw-clone/geometry"
```

and add to `CanvasRendererOptions` (after `grid?: GridOptions`):

```ts
  guides?: readonly AlignmentGuide[]
```

- [ ] **Step 4: Implement `drawAlignmentGuides` in `overlay.ts`**

In `packages/renderer/src/overlay.ts`, change the import line:

```ts
import {
  type Bounds,
  type Point,
  type ViewTransform,
  rotatePoint,
  sceneToViewport,
} from "@excalidraw-clone/geometry"
```

to:

```ts
import {
  type AlignmentGuide,
  type Bounds,
  type Point,
  type ViewTransform,
  rotatePoint,
  sceneToViewport,
} from "@excalidraw-clone/geometry"
```

Add this near the other theme-keyed color constants (after `BINDING_HIGHLIGHT`):

```ts
const ALIGNMENT_GUIDE_STROKE: Record<Theme, string> = {
  light: "#6965db",
  dark: "#a5a5ff",
}
```

Add this new exported function at the end of the file (after `drawSelectionChrome`):

```ts
export const drawAlignmentGuides = (
  ctx: CanvasRenderingContext2D,
  guides: readonly AlignmentGuide[],
  view: ViewTransform,
  theme: Theme,
): void => {
  if (guides.length === 0) return
  ctx.save()
  ctx.strokeStyle = ALIGNMENT_GUIDE_STROKE[theme]
  ctx.lineWidth = 1
  ctx.setLineDash([4, 4])
  for (const g of guides) {
    const from: Point =
      g.axis === "x" ? { x: g.position, y: g.start } : { x: g.start, y: g.position }
    const to: Point = g.axis === "x" ? { x: g.position, y: g.end } : { x: g.end, y: g.position }
    const a = sceneToViewport(from, view)
    const b = sceneToViewport(to, view)
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
  }
  ctx.setLineDash([])
  ctx.restore()
}
```

- [ ] **Step 5: Wire `setGuides` into `CanvasRenderer`**

In `packages/renderer/src/renderer.ts`, change the overlay import line:

```ts
import { type MarqueeBox, drawSelectionChrome } from "./overlay"
```

to:

```ts
import { type MarqueeBox, drawAlignmentGuides, drawSelectionChrome } from "./overlay"
```

Add `type AlignmentGuide` to the geometry import at the top of the file:

```ts
import type { AlignmentGuide, Bounds, ViewTransform } from "@excalidraw-clone/geometry"
```

Add a private field (after `private highlight: readonly string[] = []`):

```ts
  private guides: readonly AlignmentGuide[] = []
```

In the constructor, after `this.grid = options.grid ?? { enabled: false, size: 20 }`, add:

```ts
this.guides = options.guides ?? []
```

Add the setter method (after `setGrid`):

```ts
  setGuides(guides: readonly AlignmentGuide[]): void {
    this.guides = guides
    this.requestRedraw()
  }
```

Replace the `renderSelection` method with:

```ts
  private renderSelection(elements: readonly ExcalidrawElement[]): void {
    if (this.overlayCanvas && this.overlayCtx) {
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
      drawAlignmentGuides(this.overlayCtx, this.guides, this.viewTransform, this.theme)
      return
    }
    if (
      this.selection.length === 0 &&
      !this.marquee &&
      this.highlight.length === 0 &&
      this.guides.length === 0
    ) {
      return
    }
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
    drawAlignmentGuides(this.ctx, this.guides, this.viewTransform, this.theme)
  }
```

- [ ] **Step 6: Run the renderer tests to verify they pass**

Run: `pnpm --filter @excalidraw-clone/renderer test`
Expected: PASS (all files).

- [ ] **Step 7: Wire the driver's store-diff sync**

In `apps/web/src/driver/useDrawingDriver.ts`, in the `useAppStore.subscribe((s, prev) => { ... })` block, add this line after `if (s.selectedIds !== prev.selectedIds) renderer.setSelection(s.selectedIds)`:

```ts
if (s.activeGuides !== prev.activeGuides) renderer.setGuides(s.activeGuides)
```

There is no dedicated unit test for this file's store-diff sync lines today (`gridEnabled`, `selectedIds`, etc. are exercised only via typecheck + the e2e suite) — Task 5's e2e spec is what proves this line works end-to-end.

- [ ] **Step 8: Run the full web + renderer suites and typecheck**

Run: `pnpm --filter web test && pnpm --filter @excalidraw-clone/renderer test`
Expected: PASS.

Run: `pnpm turbo run typecheck build --force`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/renderer/src/types.ts packages/renderer/src/overlay.ts packages/renderer/src/renderer.ts apps/web/src/driver/useDrawingDriver.ts packages/renderer/test/renderer-skeleton.test.ts packages/renderer/test/overlay.test.ts
git commit -m "feat(renderer,web): render alignment guides + wire into the live driver"
```

---

### Task 5: End-to-end spec + full gate + branch integration

**Context for a fresh implementer:** This is the final proof that the whole chain — reducer correction → effect → store → renderer — works in the real app, plus the three scenarios the spec calls out explicitly: (a) a normal snap lands on the exact aligned coordinate, (b) enabling the grid suppresses it, (c) holding Ctrl bypasses it. Because alignment-guide snapping recomputes its correction on _every_ `pointerMove` (unlike grid-snap, which only applies once), the exact resting position after a multi-step interpolated drag depends on how many intermediate steps fired — so this spec uses a **single-hop** drag helper (one `pointerDown`, one `pointerMove` straight to the target, one `pointerUp`) instead of the shared `dragOnCanvas` (which always interpolates in 8 steps), to keep the arithmetic exact and deterministic. The spec's positions are chosen so an alignment-snapped result (205, not a multiple of 20) can never be confused with a grid-snapped result (always a multiple of 20).

**Files:**

- Create: `apps/web/e2e/alignment-guides.spec.ts`

**Interfaces:**

- Consumes: `parseStoredScene` from `./_helpers`; `toolbar-rectangle` / `toolbar-selection` test ids; `Control+Quote` (grid toggle, per `apps/web/e2e/snap-to-grid.spec.ts`).

- [ ] **Step 1: Write the e2e spec**

Create `apps/web/e2e/alignment-guides.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test"
import { parseStoredScene } from "./_helpers"

interface SceneEl {
  id: string
  type: string
  x: number
  y: number
  width: number
  height: number
  isDeleted?: boolean
}

const readScene = async (page: Page): Promise<SceneEl[]> => {
  const json = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  return parseStoredScene<SceneEl>(json).elements.filter((e) => !e.isDeleted)
}

const freshCanvas = async (page: Page): Promise<void> => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-rectangle"]').waitFor({ state: "visible" })
}

const draw = async (
  page: Page,
  toolTestId: string,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> => {
  await page.locator(`[data-testid="${toolTestId}"]`).click()
  const canvas = page.locator("canvas").first()
  const box = await canvas.boundingBox()
  if (!box) throw new Error("canvas not found")
  await page.mouse.move(box.x + from.x, box.y + from.y)
  await page.mouse.down()
  await page.mouse.move(box.x + to.x, box.y + to.y, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(120)
}

/** A single-hop drag (no interpolation): one pointerDown, one pointerMove
 *  straight to the target, one pointerUp. Alignment-guide snapping
 *  recomputes its correction on every pointerMove, so a multi-step
 *  interpolated drag would make the exact resting position depend on the
 *  interpolation step count. A single hop keeps the arithmetic exact. */
const dragSingleStep = async (
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> => {
  const canvas = page.locator("canvas").first()
  const box = await canvas.boundingBox()
  if (!box) throw new Error("canvas not found")
  await page.mouse.move(box.x + from.x, box.y + from.y)
  await page.mouse.down()
  await page.mouse.move(box.x + to.x, box.y + to.y, { steps: 1 })
  await page.mouse.up()
  await page.waitForTimeout(900) // autosave debounce
}

const setUpTwoRectangles = async (page: Page): Promise<void> => {
  await freshCanvas(page)
  // A: x 105..205 (far edge 205, deliberately off the 20px grid lattice so a
  // grid-snapped result can never coincide with it).
  await draw(page, "toolbar-rectangle", { x: 105, y: 100 }, { x: 205, y: 200 })
  // B: x 325..425 (near edge 325, 120px from A's far edge).
  await draw(page, "toolbar-rectangle", { x: 325, y: 100 }, { x: 425, y: 200 })
  await page.locator('[data-testid="toolbar-selection"]').click()
}

test("dragging near another element's edge snaps exactly to it", async ({ page }) => {
  await setUpTwoRectangles(page)
  // Drag B so its near edge lands at 207 (2px from A's far edge, inside the 8px threshold).
  await dragSingleStep(page, { x: 335, y: 110 }, { x: 217, y: 110 })

  const rects = (await readScene(page))
    .filter((e) => e.type === "rectangle")
    .sort((a, b) => a.x - b.x)
  expect(rects).toHaveLength(2)
  expect(rects[1]!.x).toBeCloseTo(205, 5)
})

test("enabling the grid suppresses the alignment snap for the same drag", async ({ page }) => {
  await setUpTwoRectangles(page)
  await page.keyboard.press("Control+Quote") // toggle grid on (size 20)
  await dragSingleStep(page, { x: 335, y: 110 }, { x: 217, y: 110 })

  const rects = (await readScene(page))
    .filter((e) => e.type === "rectangle")
    .sort((a, b) => a.x - b.x)
  expect(rects).toHaveLength(2)
  // Grid governs instead: always lands on a 20px multiple, never on 205
  // (which is not itself a multiple of 20).
  expect(rects[1]!.x % 20).toBe(0)
  expect(rects[1]!.x).not.toBeCloseTo(205, 5)
})

test("holding Ctrl during the drag bypasses the alignment snap", async ({ page }) => {
  await setUpTwoRectangles(page)
  await page.keyboard.down("Control")
  await dragSingleStep(page, { x: 335, y: 110 }, { x: 217, y: 110 })
  await page.keyboard.up("Control")

  const rects = (await readScene(page))
    .filter((e) => e.type === "rectangle")
    .sort((a, b) => a.x - b.x)
  expect(rects).toHaveLength(2)
  // Pure pointer delta (325 - 118 = 207), no snap correction to 205.
  expect(rects[1]!.x).toBeCloseTo(207, 5)
})
```

- [ ] **Step 2: Run the new spec**

Run (from `apps/web/`): `pnpm exec playwright test e2e/alignment-guides.spec.ts --reporter=list`
Expected: PASS (3 tests). If the dev server is not already up, Playwright starts it (`webServer` config).

- [ ] **Step 3: Run the full gate**

Run: `pnpm turbo run lint typecheck test build --force`
Expected: all tasks PASS.

Run (from `apps/web/`): `pnpm exec playwright test --reporter=list`
Expected: full suite PASS (existing specs unaffected — this feature only adds a new effect kind and two new optional renderer/store fields, touching no existing behavior's inputs or outputs).

- [ ] **Step 4: Commit**

```bash
git add apps/web/e2e/alignment-guides.spec.ts
git commit -m "test(web): e2e coverage for alignment-guide snapping"
```

- [ ] **Step 5: Integrate the branch**

Follow the project's standard flow (see `superpowers:finishing-a-development-branch`): fast-forward `feat/alignment-guides` → `develop` → `main`, push both, delete the feature branch, then update memory.

---

## Self-review

- **Spec coverage:** `computeAlignmentSnap` signature/behavior (Task 1) ✓; multi-selection combined bbox (Task 2) ✓; candidates = non-deleted/non-locked, excluding dragged ids (Task 2, `alignment.ts`) ✓; 8px/zoom threshold (Task 2) ✓; grid suppresses entirely (Task 2) ✓; Ctrl/Meta bypass reusing `snapPointToGrid`'s check, no new shortcut (Task 2; confirmed existing HelpDialog entry in Global Constraints) ✓; continuous per-`pointerMove` recomputation, not one-shot (Task 2 — the grid-snap branch remains first-move-only by design, but the new alignment branch runs on every move) ✓; `setGuides` effect emitted every `pointerMove`, cleared on `pointerUp`/`escape` (Task 2) ✓; effect flow through `applyEffects` → store slice, mirroring `laserMove` (Task 3) ✓; renderer `setGuides` + `drawAlignmentGuides` on the overlay canvas alongside selection chrome (Task 4) ✓; driver sync line (Task 4) ✓; unit TDD in `alignment-guides.test.ts` and extended `selection-drag.test.ts` (Tasks 1-2) ✓; e2e spec covering exact-snap, grid-suppression, Ctrl-bypass (Task 5) ✓; full gate + full e2e run before merge, not scoped (Task 5, Global Constraints) ✓. Out-of-scope items (equal-spacing guides, resize-time guides, rotation-aware bounds, new shortcut) are deliberately untouched by every task.
- **No placeholders:** grepped this document for "TBD", "similar to Task", "appropriate error handling" — none found. Every code block is complete, real code against the actual signatures read from the repo (`Bounds`, `ToolContext`, `CanvasRendererOptions`, `AppState`, `StateCreator`, etc.).
- **Cross-task signature consistency:** `computeAlignmentSnap(movingBounds, candidateBounds, thresholdWorld)` (Task 1) is called with that exact argument order in `alignment.ts` (Task 2). `AlignmentGuide`/`AlignmentSnapResult` (Task 1) are imported by that exact name in Task 2 (`types.ts`, `alignment.ts`) and Task 4 (`renderer.ts`, `overlay.ts`, `types.ts`) and referenced in Task 3's `guides.ts`. The `setGuides` `ToolEffect` shape (`{ kind: "setGuides"; guides: readonly AlignmentGuide[] }`, Task 2) matches the case body in `effects.ts` (Task 3) and the test literals in Tasks 2/3/4. `GuidesSlice.activeGuides`/`setActiveGuides` (Task 3) are read by those exact names in `useDrawingDriver.ts` (Task 4). `CanvasRenderer.setGuides` (Task 4) is called by that exact name from the driver (Task 4) and exercised directly in the renderer's own tests (Task 4).
