# Undo/Redo History Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Each task is self-contained: write the failing test first, watch it fail, implement the minimum, watch it pass, commit. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A docked, toggleable panel lists the active page's undo/redo history as human-readable entries (inferred by diffing consecutive snapshots) and lets the user click any entry to jump straight to that point.

**Architecture:** A new pure function `describeHistoryChange(prev, next)` in `packages/scene/src/describe-history-change.ts` diffs two consecutive element-array snapshots by id and classifies the transition into one of seven categories. `Scene` (`packages/scene/src/scene.ts`) gains three small additive methods — `getHistory`, `getHistoryIndex`, `jumpToHistory` — exposing its already-existing `history`/`historyIndex` fields without changing how they're recorded. A new pure component `HistoryPanel.tsx` in `packages/ui`, shaped exactly like the existing `LayersPanel`, renders one row per history entry (label from `describeHistoryChange`) and calls `onJump(index)` on click. `App.tsx` wires it to the active page's `scene`, docked on the right edge (mirroring `LayersPanel`'s left dock) below `PropertiesPanel`'s floating top-right box.

**Tech Stack:** TypeScript, Vitest (unit), Playwright (`@playwright/test`, e2e), pnpm workspaces + Turbo, react-i18next (i18next v24).

**Spec:** `docs/superpowers/specs/2026-09-21-history-panel-design.md`

## Global Constraints

- Package manager is **pnpm** (`pnpm@10.32.0`); task runner is **Turbo**. Run turbo as `pnpm turbo run <tasks>` (never `npx turbo`). Full gate: `pnpm turbo run lint typecheck test build --force`. The `--force` matters specifically for `lint` — this repo has a known stale-cache gotcha where `turbo run lint` alone can show cached output from a different worktree/branch; always use `--force` for the final full-gate lint run.
- Package filter names are the scoped npm names, not directory names: `@excalidraw-clone/scene`, `@excalidraw-clone/ui`, `@excalidraw-clone/web`.
- Playwright is invoked as `pnpm exec playwright test` from `apps/web/` (the CLI is not on PATH). Test import is `@playwright/test`.
- Scene localStorage key is `"excalidraw-scene"`. E2E helpers live in `apps/web/e2e/_helpers.ts` (`dragOnCanvas`, `parseStoredScene` — unwraps the v3 `pages[]` document to the active page's `elements`).
- Formatting: no semicolons, double quotes, trailing commas everywhere, 100-char print width (`.prettierrc`) — `format:check` is part of the full gate.
- `Scene` is instantiated once per page (`apps/web/src/driver/pages.ts`); history — and this panel — stays scoped to the active page. Do not add cross-page history in this plan.
- Do not change `Scene.mutate`, `pushHistory`, `skipHistory`, or the `MAX_HISTORY = 100` cap — this plan only exposes and visualizes the existing recording behavior, never alters it.
- Every element field written by any mutation in this codebase is either `versionNonce`/`updated` (bumped only by `locking.ts`, confirmed by repo-wide grep — no other call site bumps them) or a domain field. `describeHistoryChange` must never treat `versionNonce`/`updated` differences as meaningful — every comparison in Task 1 explicitly ignores them.
- **No new keyboard shortcut.** Toggle is button-only, matching `LayersPanel` (not `StatsPanel`'s `Alt+/` pattern). **No HelpDialog entry** — confirmed precedent: `HelpDialog.tsx` only renders `{keys, label}` shortcut rows and `LayersPanel`, which is also button-only with no shortcut, has zero presence there. Adding an entry would require inventing a new HelpDialog capability out of scope for this plan; this deviates from the spec's literal "one entry noting the panel exists" line in favor of the codebase's actual established precedent.
- i18n: both `apps/web/src/locales/en/common.json` and `apps/web/src/locales/ko/common.json` need updating. Count-pluralized keys use i18next v24's CLDR-based suffixes: `_one`/`_other` for English (`{{count}}` interpolation), `_other` only for Korean (Korean's CLDR plural rule is always `"other"`, so `Intl.PluralRules('ko').select(n)` never requests `_one` — omitting it isn't a gap).
- Commit after every task with a conventional-commit message. Branch is `feat/history-panel`, created off **`main`** (currently clean at `b243ab6`, which is 11 commits ahead of `origin/main` and one commit ahead of `develop` — holding the just-merged multi-element-resize feature plus this plan's approved spec doc).
- Final task: full gate + full e2e green, then integrate per **superpowers:finishing-a-development-branch**.

---

### Task 1: `describeHistoryChange` pure function in `packages/scene`

**Context for a fresh implementer (no prior context needed beyond this):** This is the one new piece of logic the whole feature depends on. Given two consecutive history snapshots (`prev` may be `undefined` for the very first entry), it classifies what changed into one of: `initial`, `added`, `removed`, `moved`, `resized`, `restyled`, `reordered`, `modified` (generic fallback), with a `count` of how many elements were affected. It has no dependency on the UI, React, or `Scene` — it's a standalone diff over two `readonly ExcalidrawElement[]` arrays. Snapshots include soft-deleted elements (`Scene.getElementsIncludingDeleted()`'s view, not the filtered `getElements()` view) — `isDeleted` transitions are how `added`/`removed` are detected.

**Files:**

- Create: `packages/scene/src/describe-history-change.ts`
- Create: `packages/scene/test/describe-history-change.test.ts`
- Modify: `packages/scene/src/index.ts` (export `describeHistoryChange` + its types)

**Interfaces:**

```ts
// packages/scene/src/describe-history-change.ts
export type HistoryChangeCategory =
  | "initial"
  | "added"
  | "removed"
  | "moved"
  | "resized"
  | "restyled"
  | "reordered"
  | "modified"

export interface HistoryChangeDescription {
  category: HistoryChangeCategory
  count: number
}

export function describeHistoryChange(
  prev: readonly ExcalidrawElement[] | undefined,
  next: readonly ExcalidrawElement[],
): HistoryChangeDescription
```

- `prev === undefined` → always `{ category: "initial", count: <live element count in next> }`. This lets a caller uniformly call `describeHistoryChange(history[i - 1], history[i])` for every index, including `i === 0` (where `history[-1]` is `undefined`).
- Per-element classification (by matching `id` across `prev`/`next`) feeds into a whole-transition aggregate: if every changed element falls into the same category, that's the transition's category and `count` is the number of changed elements; a mix of categories collapses to `modified`.
- A **reorder** is detected at the whole-snapshot level (not per element) _before_ per-element diffing: same id set in both arrays, every element's non-volatile fields identical by id, but array order differs.
- Per-element categories: `added` (id missing in prev, live in next), `removed` (id live in prev, deleted/missing in next), `moved` (only `x`/`y`, or for linear elements a pure-translation `points` change — no size change, no style change), `resized` (`width`/`height` changed, or a non-translation `points` change), `restyled` (only style fields — `strokeColor`, `backgroundColor`, `fillStyle`, `strokeWidth`, `strokeStyle`, `roughness`, `opacity`), `modified` (any other field changed, or a mix of the above within one element).

- [ ] **Step 0 (branch setup):** From a clean tree on `main` (confirm with `git status`), create the working branch: `git switch -c feat/history-panel`. Confirm `git status` is clean.

- [ ] **Step 1: Write the failing tests**, `packages/scene/test/describe-history-change.test.ts`:

  ```ts
  import { describe, expect, it } from "vitest"
  import { newLine, newRectangle } from "../src/factories"
  import { describeHistoryChange } from "../src/describe-history-change"

  describe("describeHistoryChange — initial entry", () => {
    it("returns 'initial' with the live element count when prev is undefined", () => {
      const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
      expect(describeHistoryChange(undefined, [a])).toEqual({ category: "initial", count: 1 })
    })

    it("initial count excludes soft-deleted elements", () => {
      const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
      const deleted = { ...newRectangle({ x: 5, y: 5, width: 10, height: 10 }), isDeleted: true }
      expect(describeHistoryChange(undefined, [a, deleted])).toEqual({
        category: "initial",
        count: 1,
      })
    })
  })

  describe("describeHistoryChange — single-category transitions", () => {
    it("detects an added element", () => {
      const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
      expect(describeHistoryChange([], [a])).toEqual({ category: "added", count: 1 })
    })

    it("detects a removed (soft-deleted) element", () => {
      const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
      const deleted = { ...a, isDeleted: true }
      expect(describeHistoryChange([a], [deleted])).toEqual({ category: "removed", count: 1 })
    })

    it("detects a moved element (position translated, size/style unchanged)", () => {
      const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
      const moved = { ...a, x: 10, y: 5 }
      expect(describeHistoryChange([a], [moved])).toEqual({ category: "moved", count: 1 })
    })

    it("detects a resized element (size changed)", () => {
      const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
      const resized = { ...a, width: 20 }
      expect(describeHistoryChange([a], [resized])).toEqual({ category: "resized", count: 1 })
    })

    it("detects a restyled element (only a style field changed)", () => {
      const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
      const restyled = { ...a, strokeColor: "#ff0000" }
      expect(describeHistoryChange([a], [restyled])).toEqual({ category: "restyled", count: 1 })
    })

    it("counts multiple elements changed the same way", () => {
      const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
      const b = newRectangle({ x: 20, y: 0, width: 10, height: 10 })
      const movedA = { ...a, x: 100 }
      const movedB = { ...b, x: 120 }
      expect(describeHistoryChange([a, b], [movedA, movedB])).toEqual({
        category: "moved",
        count: 2,
      })
    })
  })

  describe("describeHistoryChange — reorder", () => {
    it("detects a z-order-only change (same fields, different array order)", () => {
      const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
      const b = newRectangle({ x: 20, y: 0, width: 10, height: 10 })
      expect(describeHistoryChange([a, b], [b, a])).toEqual({ category: "reordered", count: 2 })
    })

    it("does not misclassify as reorder when order changed AND a field also changed", () => {
      const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
      const b = newRectangle({ x: 20, y: 0, width: 10, height: 10 })
      const movedB = { ...b, x: 200 }
      expect(describeHistoryChange([a, b], [movedB, a])).toEqual({ category: "moved", count: 1 })
    })
  })

  describe("describeHistoryChange — fallback to 'modified'", () => {
    it("falls back when categories differ across changed elements", () => {
      const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
      const b = newRectangle({ x: 20, y: 0, width: 10, height: 10 })
      const movedA = { ...a, x: 100 }
      const resizedB = { ...b, width: 30 }
      expect(describeHistoryChange([a, b], [movedA, resizedB])).toEqual({
        category: "modified",
        count: 2,
      })
    })

    it("falls back when a non-geometry/style field changes (e.g. locked)", () => {
      const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
      const locked = { ...a, locked: true }
      expect(describeHistoryChange([a], [locked])).toEqual({ category: "modified", count: 1 })
    })

    it("falls back when one element's geometry AND style change together", () => {
      const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
      const both = { ...a, x: 50, strokeColor: "#00ff00" }
      expect(describeHistoryChange([a], [both])).toEqual({ category: "modified", count: 1 })
    })

    it("ignores versionNonce/updated differences on their own (no-op mutation is unreachable in practice, but the ignore rule itself is directly testable)", () => {
      const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
      const touched = { ...a, versionNonce: a.versionNonce + 1, updated: a.updated + 1000 }
      // Same id set, all non-volatile fields equal, same order -> not a reorder either.
      expect(describeHistoryChange([a], [touched])).toEqual({ category: "modified", count: 0 })
    })
  })

  describe("describeHistoryChange — linear element points", () => {
    const asLine = (points: { x: number; y: number }[]) => ({
      ...newLine({ x: 0, y: 0, width: 10, height: 10 }),
      points,
    })

    it("classifies a pure-translation points change as moved", () => {
      const a = asLine([
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ])
      const moved = {
        ...a,
        x: a.x + 5,
        y: a.y + 5,
        points: a.points.map((p) => ({ x: p.x + 5, y: p.y + 5 })),
      }
      expect(describeHistoryChange([a], [moved])).toEqual({ category: "moved", count: 1 })
    })

    it("classifies a non-uniform points change as resized", () => {
      const a = asLine([
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ])
      const resized = {
        ...a,
        points: [
          { x: 0, y: 0 },
          { x: 20, y: 30 },
        ],
        width: 20,
        height: 30,
      }
      expect(describeHistoryChange([a], [resized])).toEqual({ category: "resized", count: 1 })
    })
  })
  ```

- [ ] **Step 2: Run the tests to verify they fail**

  Run: `pnpm --filter @excalidraw-clone/scene test -- describe-history-change`
  Expected: FAIL (`describe-history-change` module doesn't exist).

- [ ] **Step 3: Implement**, `packages/scene/src/describe-history-change.ts`:

  ```ts
  import type { ExcalidrawElement, ExcalidrawElementBase } from "./types"

  export type HistoryChangeCategory =
    | "initial"
    | "added"
    | "removed"
    | "moved"
    | "resized"
    | "restyled"
    | "reordered"
    | "modified"

  export interface HistoryChangeDescription {
    category: HistoryChangeCategory
    count: number
  }

  const STYLE_FIELDS: readonly (keyof ExcalidrawElementBase)[] = [
    "strokeColor",
    "backgroundColor",
    "fillStyle",
    "strokeWidth",
    "strokeStyle",
    "roughness",
    "opacity",
  ]

  const VOLATILE_FIELDS = ["versionNonce", "updated"] as const

  type ElementCategory =
    | "added"
    | "removed"
    | "moved"
    | "resized"
    | "restyled"
    | "modified"
    | "unchanged"

  function isLive(el: ExcalidrawElement | undefined): el is ExcalidrawElement {
    return el !== undefined && !el.isDeleted
  }

  function stripFields(el: ExcalidrawElement, fields: readonly string[]): Record<string, unknown> {
    const clone: Record<string, unknown> = { ...el }
    for (const field of fields) delete clone[field]
    return clone
  }

  function isPureTranslation(
    prevPoints: readonly { x: number; y: number }[],
    nextPoints: readonly { x: number; y: number }[],
  ): boolean {
    if (prevPoints.length !== nextPoints.length || prevPoints.length === 0) return false
    const dx = nextPoints[0]!.x - prevPoints[0]!.x
    const dy = nextPoints[0]!.y - prevPoints[0]!.y
    return prevPoints.every(
      (p, i) => nextPoints[i]!.x - p.x === dx && nextPoints[i]!.y - p.y === dy,
    )
  }

  function otherFieldsChanged(prev: ExcalidrawElement, next: ExcalidrawElement): boolean {
    const ignored = ["x", "y", "width", "height", "points", ...STYLE_FIELDS, ...VOLATILE_FIELDS]
    return JSON.stringify(stripFields(prev, ignored)) !== JSON.stringify(stripFields(next, ignored))
  }

  function classifyElementDiff(
    prev: ExcalidrawElement | undefined,
    next: ExcalidrawElement | undefined,
  ): ElementCategory {
    const prevLive = isLive(prev)
    const nextLive = isLive(next)
    if (!prevLive && nextLive) return "added"
    if (prevLive && !nextLive) return "removed"
    if (!prevLive && !nextLive) return "unchanged"

    const p = prev as ExcalidrawElement
    const n = next as ExcalidrawElement

    if (otherFieldsChanged(p, n)) return "modified"

    const positionChanged = p.x !== n.x || p.y !== n.y
    const sizeChanged = p.width !== n.width || p.height !== n.height
    let pointsChanged = false
    let pointsTranslated = true
    if ("points" in p && "points" in n) {
      pointsChanged = JSON.stringify(p.points) !== JSON.stringify(n.points)
      if (pointsChanged) pointsTranslated = isPureTranslation(p.points, n.points)
    }
    const styleChanged = STYLE_FIELDS.some((f) => p[f] !== n[f])
    const geometryChanged = positionChanged || sizeChanged || pointsChanged

    if (geometryChanged && styleChanged) return "modified"
    if (styleChanged) return "restyled"
    if (geometryChanged) {
      if (sizeChanged || (pointsChanged && !pointsTranslated)) return "resized"
      return "moved"
    }
    return "unchanged"
  }

  export function describeHistoryChange(
    prev: readonly ExcalidrawElement[] | undefined,
    next: readonly ExcalidrawElement[],
  ): HistoryChangeDescription {
    if (prev === undefined) {
      return { category: "initial", count: next.filter((e) => !e.isDeleted).length }
    }

    const prevIds = prev.map((e) => e.id)
    const nextIds = next.map((e) => e.id)
    const sameIdSet =
      prevIds.length === nextIds.length && prevIds.every((id) => nextIds.includes(id))

    if (sameIdSet) {
      const prevMap = new Map(prev.map((e) => [e.id, e]))
      const allFieldsEqual = next.every((e) => {
        const before = prevMap.get(e.id)!
        return (
          JSON.stringify(stripFields(before, VOLATILE_FIELDS)) ===
          JSON.stringify(stripFields(e, VOLATILE_FIELDS))
        )
      })
      if (allFieldsEqual) {
        const orderChanged = prevIds.join("|") !== nextIds.join("|")
        if (orderChanged) return { category: "reordered", count: next.length }
        return { category: "modified", count: 0 }
      }
    }

    const prevMap = new Map(prev.map((e) => [e.id, e]))
    const nextMap = new Map(next.map((e) => [e.id, e]))
    const allIds = new Set([...prevMap.keys(), ...nextMap.keys()])

    const categories: ElementCategory[] = []
    for (const id of allIds) {
      const category = classifyElementDiff(prevMap.get(id), nextMap.get(id))
      if (category !== "unchanged") categories.push(category)
    }

    if (categories.length === 0) return { category: "modified", count: 0 }

    const unique = new Set(categories)
    if (unique.size === 1) {
      return { category: categories[0]!, count: categories.length }
    }
    return { category: "modified", count: categories.length }
  }
  ```

- [ ] **Step 4: Run the tests to verify they pass**

  Run: `pnpm --filter @excalidraw-clone/scene test -- describe-history-change`
  Expected: PASS, all cases green.

- [ ] **Step 5: Export from the package**, add to `packages/scene/src/index.ts` (alongside the existing `export { computeStats } from "./stats"` / `export type { Stats } from "./stats"` pair):

  ```ts
  export { describeHistoryChange } from "./describe-history-change"
  export type { HistoryChangeCategory, HistoryChangeDescription } from "./describe-history-change"
  ```

- [ ] **Step 6: Run the package's full test + typecheck**

  Run: `pnpm --filter @excalidraw-clone/scene test`
  Run: `pnpm --filter @excalidraw-clone/scene typecheck`
  Expected: both green, no regressions in the rest of the package.

- [ ] **Step 7: Commit**

  ```bash
  git add packages/scene/src/describe-history-change.ts packages/scene/test/describe-history-change.test.ts packages/scene/src/index.ts
  git commit -m "feat(scene): add describeHistoryChange for history-entry labeling"
  ```

---

### Task 2: `Scene` API additions — `getHistory` / `getHistoryIndex` / `jumpToHistory`

**Context for a fresh implementer:** `packages/scene/src/scene.ts` already tracks `history` (a `readonly (readonly ExcalidrawElement[])[]`) and `historyIndex` as `private` fields, stepped one at a time by the existing `undo()`/`redo()` methods. This task exposes them read-only and adds a third navigation method that jumps directly to an arbitrary index — same shape as `undo`/`redo`, just parameterized. No existing method's behavior changes.

**Files:**

- Modify: `packages/scene/src/scene.ts`
- Modify: `packages/scene/test/scene-history.test.ts` (extend existing file — do not create a new one)

**Interfaces:**

```ts
// packages/scene/src/scene.ts, added to class Scene
getHistory(): readonly (readonly ExcalidrawElement[])[]
getHistoryIndex(): number
jumpToHistory(index: number): void
```

- `jumpToHistory(index)`: no-op (does not call `setElements`, does not change `historyIndex`) when `index < 0 || index >= this.history.length`. Otherwise sets `this.historyIndex = index` and calls `this.setElements(this.history[index]!)` — same pattern as `undo()`/`redo()`.

- [ ] **Step 1: Write the failing tests**, append to `packages/scene/test/scene-history.test.ts` (the file currently ends after the "Scene history — cap" `describe` block; add a new `describe` block after it):

  ```ts
  describe("Scene history — getHistory / getHistoryIndex / jumpToHistory", () => {
    it("getHistory returns every snapshot; getHistoryIndex tracks the current position", () => {
      const s = new Scene()
      s.mutate((d) => {
        d.push(newRectangle({ x: 0, y: 0 }))
      })
      s.mutate((d) => {
        d.push(newRectangle({ x: 1, y: 1 }))
      })
      expect(s.getHistory().length).toBe(3) // initial (empty) + 2 mutations
      expect(s.getHistoryIndex()).toBe(2)
    })

    it("jumpToHistory jumps directly to an arbitrary earlier index", () => {
      const s = new Scene()
      s.mutate((d) => {
        d.push(newRectangle({ x: 0, y: 0 }))
      })
      s.mutate((d) => {
        d.push(newRectangle({ x: 1, y: 1 }))
      })
      s.mutate((d) => {
        d.push(newRectangle({ x: 2, y: 2 }))
      })
      s.jumpToHistory(0)
      expect(s.getElements().length).toBe(0)
      expect(s.getHistoryIndex()).toBe(0)
    })

    it("jumpToHistory forward re-applies a later state", () => {
      const s = new Scene()
      s.mutate((d) => {
        d.push(newRectangle({ x: 0, y: 0 }))
      })
      s.mutate((d) => {
        d.push(newRectangle({ x: 1, y: 1 }))
      })
      s.jumpToHistory(0)
      s.jumpToHistory(2)
      expect(s.getElements().length).toBe(2)
      expect(s.getHistoryIndex()).toBe(2)
    })

    it("jumpToHistory is a no-op for a negative index", () => {
      const s = new Scene()
      s.mutate((d) => {
        d.push(newRectangle({ x: 0, y: 0 }))
      })
      s.jumpToHistory(-1)
      expect(s.getHistoryIndex()).toBe(1)
      expect(s.getElements().length).toBe(1)
    })

    it("jumpToHistory is a no-op for an index at or beyond history.length", () => {
      const s = new Scene()
      s.mutate((d) => {
        d.push(newRectangle({ x: 0, y: 0 }))
      })
      s.jumpToHistory(5)
      expect(s.getHistoryIndex()).toBe(1)
      expect(s.getElements().length).toBe(1)
    })

    it("a mutate() after jumping back truncates the future, same as after undo()", () => {
      const s = new Scene()
      s.mutate((d) => {
        d.push(newRectangle({ x: 0, y: 0 }))
      })
      s.mutate((d) => {
        d.push(newRectangle({ x: 1, y: 1 }))
      })
      s.jumpToHistory(0)
      s.mutate((d) => {
        d.push(newRectangle({ x: 2, y: 2 }))
      })
      expect(s.canRedo()).toBe(false)
      expect(s.getHistory().length).toBe(2) // initial + the new branch's one mutation
    })
  })
  ```

- [ ] **Step 2: Run the tests to verify they fail**

  Run: `pnpm --filter @excalidraw-clone/scene test -- scene-history`
  Expected: FAIL (`getHistory`/`getHistoryIndex`/`jumpToHistory` don't exist on `Scene`).

- [ ] **Step 3: Implement**, in `packages/scene/src/scene.ts`, add these three methods immediately after `canRedo()` (currently lines 86-88) and before `protected resetHistory(...)` (currently line 90):

  ```ts
  getHistory(): readonly (readonly ExcalidrawElement[])[] {
    return this.history
  }

  getHistoryIndex(): number {
    return this.historyIndex
  }

  jumpToHistory(index: number): void {
    if (index < 0 || index >= this.history.length) return
    this.historyIndex = index
    this.setElements(this.history[index]!)
  }
  ```

- [ ] **Step 4: Run the tests to verify they pass**

  Run: `pnpm --filter @excalidraw-clone/scene test -- scene-history`
  Expected: PASS, all cases green (old and new).

- [ ] **Step 5: Run the package's full test + typecheck**

  Run: `pnpm --filter @excalidraw-clone/scene test`
  Run: `pnpm --filter @excalidraw-clone/scene typecheck`
  Expected: both green — confirms nothing else in the package (e.g. `scene-mutate.test.ts`, `scene-json.test.ts`) regressed.

- [ ] **Step 6: Commit**

  ```bash
  git add packages/scene/src/scene.ts packages/scene/test/scene-history.test.ts
  git commit -m "feat(scene): expose Scene.getHistory/getHistoryIndex and add jumpToHistory"
  ```

---

### Task 3: `HistoryPanel` component in `packages/ui`

**Context for a fresh implementer:** This is the visual panel itself — a pure, presentational React component with no store access, shaped exactly like the existing `packages/ui/src/LayersPanel.tsx` (read that file first for the exact button/aside/list structure this mirrors). It takes the raw `history` array and `currentIndex` as props, computes a label for each entry via `describeHistoryChange` (from Task 1, already exported from `@excalidraw-clone/scene`), and renders a docked list. Clicking a row calls `onJump(index)`. It does not call `Scene` directly — that wiring is Task 4.

Note on the `t` prop's type: every other panel in this codebase types its `t` prop as `(key: string) => string`, because none of them need count-based pluralization. `HistoryPanel` is the first consumer that does, so its own `t` prop type is widened to `(key: string, options?: { count: number }) => string`. This is a component-local, additive type change — it does not touch any other component's prop type. The real `t` function App.tsx will pass in Task 4 comes from `useTranslation()` (react-i18next), whose actual runtime signature already supports this; only the narrower prop type declared by other components has never needed to say so.

**Files:**

- Create: `packages/ui/src/HistoryPanel.tsx`
- Create: `packages/ui/test/HistoryPanel.test.tsx`
- Modify: `packages/ui/src/index.ts` (export `HistoryPanel` + `HistoryPanelProps`)

**Interfaces:**

- Consumes: `describeHistoryChange`, `type HistoryChangeDescription`, `type ExcalidrawElement` from `@excalidraw-clone/scene` (Task 1).
- Produces:

  ```ts
  // packages/ui/src/HistoryPanel.tsx
  export interface HistoryPanelProps {
    t: (key: string, options?: { count: number }) => string
    history: readonly (readonly ExcalidrawElement[])[]
    currentIndex: number
    open: boolean
    onToggle: () => void
    onJump: (index: number) => void
  }
  export function HistoryPanel(props: HistoryPanelProps): React.ReactElement
  ```

  Test ids: `history-toggle` (the toggle button, rendered in both open and closed states, same dual-use pattern as `LayersPanel`'s `layers-toggle`), `history-panel` (the `<aside>`, only when open), `history-row-{index}` (each `<li>`), `history-jump-{index}` (the clickable button inside each row — this is what tests click and read text from).

- [ ] **Step 1: Write the failing tests**, `packages/ui/test/HistoryPanel.test.tsx`:

  ```tsx
  import { newRectangle } from "@excalidraw-clone/scene"
  import { render, screen } from "@testing-library/react"
  import userEvent from "@testing-library/user-event"
  import { describe, expect, it, vi } from "vitest"
  import { HistoryPanel } from "../src/HistoryPanel"

  const t = (key: string, options?: { count: number }): string =>
    options ? `${key}:${options.count}` : key

  const handlers = {
    onToggle: vi.fn(),
    onJump: vi.fn(),
  }

  describe("HistoryPanel", () => {
    it("shows only the toggle button when closed, keeping a11y attributes", () => {
      render(<HistoryPanel t={t} history={[[]]} currentIndex={0} open={false} {...handlers} />)
      expect(screen.queryByTestId("history-panel")).toBeNull()
      expect(screen.queryByTestId(/^history-row-/)).toBeNull()
      const toggle = screen.getByTestId("history-toggle")
      expect(toggle).toBeInTheDocument()
      expect(toggle).toHaveAttribute("aria-expanded", "false")
      expect(toggle).toHaveAttribute("aria-label", "history.toggle")
    })

    it("keeps toggle a11y attributes when open", () => {
      render(<HistoryPanel t={t} history={[[]]} currentIndex={0} open {...handlers} />)
      const toggle = screen.getByTestId("history-toggle")
      expect(toggle).toHaveAttribute("aria-expanded", "true")
      expect(toggle).toHaveAttribute("aria-label", "history.toggle")
    })

    it("renders one row per history entry, newest first", () => {
      const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
      render(<HistoryPanel t={t} history={[[], [a]]} currentIndex={1} open {...handlers} />)
      const rows = screen.getAllByTestId(/^history-row-/)
      expect(rows.map((r) => r.dataset.testid)).toEqual(["history-row-1", "history-row-0"])
    })

    it("labels the initial entry using history.initial", () => {
      render(<HistoryPanel t={t} history={[[]]} currentIndex={0} open {...handlers} />)
      expect(screen.getByTestId("history-jump-0")).toHaveTextContent("history.initial")
    })

    it("labels an added-element entry with the added category and count", () => {
      const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
      render(<HistoryPanel t={t} history={[[], [a]]} currentIndex={1} open {...handlers} />)
      expect(screen.getByTestId("history-jump-1")).toHaveTextContent("history.added:1")
    })

    it("highlights the row at currentIndex and no other", () => {
      const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
      render(<HistoryPanel t={t} history={[[], [a]]} currentIndex={0} open {...handlers} />)
      expect(screen.getByTestId("history-jump-0").className).toContain("bg-accent-soft")
      expect(screen.getByTestId("history-jump-1").className).not.toContain("bg-accent-soft")
    })

    it("calls onJump with the clicked entry's index", async () => {
      const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
      const onJump = vi.fn()
      render(
        <HistoryPanel
          t={t}
          history={[[], [a]]}
          currentIndex={1}
          open
          {...handlers}
          onJump={onJump}
        />,
      )
      await userEvent.click(screen.getByTestId("history-jump-0"))
      expect(onJump).toHaveBeenCalledWith(0)
    })

    it("calls onToggle when the toggle button is clicked", async () => {
      const onToggle = vi.fn()
      render(
        <HistoryPanel
          t={t}
          history={[[]]}
          currentIndex={0}
          open={false}
          {...handlers}
          onToggle={onToggle}
        />,
      )
      await userEvent.click(screen.getByTestId("history-toggle"))
      expect(onToggle).toHaveBeenCalled()
    })
  })
  ```

- [ ] **Step 2: Run the tests to verify they fail**

  Run: `pnpm --filter @excalidraw-clone/ui test -- HistoryPanel`
  Expected: FAIL (`../src/HistoryPanel` doesn't exist).

- [ ] **Step 3: Implement**, `packages/ui/src/HistoryPanel.tsx`:

  ```tsx
  import { describeHistoryChange, type ExcalidrawElement } from "@excalidraw-clone/scene"

  export interface HistoryPanelProps {
    t: (key: string, options?: { count: number }) => string
    history: readonly (readonly ExcalidrawElement[])[]
    currentIndex: number
    open: boolean
    onToggle: () => void
    onJump: (index: number) => void
  }

  export function HistoryPanel({
    t,
    history,
    currentIndex,
    open,
    onToggle,
    onJump,
  }: HistoryPanelProps): React.ReactElement {
    if (!open) {
      return (
        <button
          type="button"
          onClick={onToggle}
          aria-label={t("history.toggle")}
          aria-expanded={false}
          data-testid="history-toggle"
          className="fixed right-3 top-16 z-30 flex h-9 w-9 items-center justify-center rounded-lg bg-panel shadow hover:bg-panel-hover"
        >
          ‹
        </button>
      )
    }

    const entries = history.map((snapshot, i) => {
      const description = describeHistoryChange(i === 0 ? undefined : history[i - 1], snapshot)
      const label =
        description.category === "initial"
          ? t("history.initial")
          : t(`history.${description.category}`, { count: description.count })
      return { index: i, label }
    })

    return (
      <aside
        aria-label={t("history.title")}
        data-testid="history-panel"
        className="fixed right-0 top-16 z-30 flex h-[calc(100%-5rem)] w-64 flex-col bg-panel shadow-lg"
      >
        <button
          type="button"
          onClick={onToggle}
          aria-label={t("history.toggle")}
          aria-expanded={open}
          data-testid="history-toggle"
          className="flex h-10 w-10 items-center justify-center self-end border-b text-sm"
        >
          ›
        </button>

        <div className="border-b px-3 py-2 text-sm font-medium">{t("history.title")}</div>
        <ul className="flex-1 overflow-y-auto px-2 py-2">
          {entries
            .slice()
            .reverse()
            .map(({ index, label }) => {
              const current = index === currentIndex
              return (
                <li key={index} data-testid={`history-row-${index}`}>
                  <button
                    type="button"
                    data-testid={`history-jump-${index}`}
                    onClick={() => onJump(index)}
                    className={`mb-0.5 w-full rounded px-2 py-1 text-left text-xs ${
                      current ? "bg-accent-soft" : "hover:bg-panel-subtle"
                    }`}
                  >
                    {label}
                  </button>
                </li>
              )
            })}
        </ul>
      </aside>
    )
  }
  ```

- [ ] **Step 4: Run the tests to verify they pass**

  Run: `pnpm --filter @excalidraw-clone/ui test -- HistoryPanel`
  Expected: PASS, all cases green.

- [ ] **Step 5: Export from the package**, add to `packages/ui/src/index.ts` (alongside the existing `LayersPanel` export pair):

  ```ts
  export { HistoryPanel } from "./HistoryPanel"
  export type { HistoryPanelProps } from "./HistoryPanel"
  ```

- [ ] **Step 6: Run the package's full test + typecheck**

  Run: `pnpm --filter @excalidraw-clone/ui test`
  Run: `pnpm --filter @excalidraw-clone/ui typecheck`
  Expected: both green.

- [ ] **Step 7: Commit**

  ```bash
  git add packages/ui/src/HistoryPanel.tsx packages/ui/test/HistoryPanel.test.tsx packages/ui/src/index.ts
  git commit -m "feat(ui): add HistoryPanel component"
  ```

---

### Task 4: Wire `HistoryPanel` into `App.tsx` + i18n strings

**Context for a fresh implementer:** This task connects the panel built in Task 3 to a real `Scene`. There's no new logic here — just prop wiring, one new piece of local UI state (`historyOpen`, mirroring the existing `layersOpen`), and the locale strings the panel's labels resolve through at runtime (component tests in Task 3 used an identity `t` mock, so this is the first point real translated text exists). This task's own "test" is that the full gate stays green — no new unit tests are added here (matches how the pre-existing `LayersPanel`/`StatsPanel` wiring in `App.tsx` has none of its own; behavior is covered end-to-end by Task 5's e2e test).

**Files:**

- Modify: `apps/web/src/components/App.tsx`
- Modify: `apps/web/src/locales/en/common.json`
- Modify: `apps/web/src/locales/ko/common.json`

**Interfaces:**

- Consumes: `HistoryPanel`, `type HistoryPanelProps` from `@excalidraw-clone/ui` (Task 3); `scene.getHistory()`, `scene.getHistoryIndex()`, `scene.jumpToHistory(index)` from `@excalidraw-clone/scene`'s `Scene` (Task 2).

- [ ] **Step 1: Add `HistoryPanel` to the `@excalidraw-clone/ui` import** in `apps/web/src/components/App.tsx` (the import block currently reads `HamburgerMenu, LayersPanel, LibraryPanel, PagesTabBar, PropertiesPanel, StatsPanel, Toolbar` — alphabetically sorted; insert `HistoryPanel` between `HamburgerMenu` and `LayersPanel`):

  ```ts
  import {
    HamburgerMenu,
    HistoryPanel,
    LayersPanel,
    LibraryPanel,
    PagesTabBar,
    PropertiesPanel,
    StatsPanel,
    Toolbar,
  } from "@excalidraw-clone/ui"
  ```

- [ ] **Step 2: Add local state**, next to the existing `layersOpen`/`statsOpen` declarations (currently lines 235-237):

  ```ts
  const [historyOpen, setHistoryOpen] = useState(false)
  ```

- [ ] **Step 3: Derive the history array**, next to the existing `layerElements` derivation (`const layerElements = useMemo(() => scene.getElements(), [scene, sceneRevision])`):

  ```ts
  const historyEntries = useMemo(() => scene.getHistory(), [scene, sceneRevision])
  ```

- [ ] **Step 4: Mount the panel**, immediately after the existing `<StatsPanel ... />` block:

  ```tsx
  <HistoryPanel
    t={t}
    history={historyEntries}
    currentIndex={scene.getHistoryIndex()}
    open={historyOpen}
    onToggle={() => setHistoryOpen((v) => !v)}
    onJump={(index) => scene.jumpToHistory(index)}
  />
  ```

- [ ] **Step 5: Add i18n strings**, `apps/web/src/locales/en/common.json` — insert a new `"history"` section immediately after the existing `"layers"` section:

  ```json
  "history": {
    "title": "History",
    "toggle": "Toggle history panel",
    "initial": "Initial state",
    "added_one": "Added {{count}} element",
    "added_other": "Added {{count}} elements",
    "removed_one": "Deleted {{count}} element",
    "removed_other": "Deleted {{count}} elements",
    "moved_one": "Moved {{count}} element",
    "moved_other": "Moved {{count}} elements",
    "resized_one": "Resized {{count}} element",
    "resized_other": "Resized {{count}} elements",
    "restyled_one": "Changed style of {{count}} element",
    "restyled_other": "Changed style of {{count}} elements",
    "reordered_one": "Reordered {{count}} element",
    "reordered_other": "Reordered {{count}} elements",
    "modified_one": "Modified {{count}} element",
    "modified_other": "Modified {{count}} elements"
  },
  ```

  Remember to add a trailing comma after the closing `}` of the existing `"layers"` block (it currently ends the object early because nothing follows it at that point — check the surrounding JSON carefully; every key in this file except the very last needs a trailing comma).

- [ ] **Step 6: Add i18n strings**, `apps/web/src/locales/ko/common.json` — same position, Korean uses only the `_other` suffix (Korean has one CLDR plural category):

  ```json
  "history": {
    "title": "히스토리",
    "toggle": "히스토리 패널 열고 닫기",
    "initial": "초기 상태",
    "added_other": "요소 {{count}}개 추가됨",
    "removed_other": "요소 {{count}}개 삭제됨",
    "moved_other": "요소 {{count}}개 이동됨",
    "resized_other": "요소 {{count}}개 크기 변경됨",
    "restyled_other": "요소 {{count}}개 스타일 변경됨",
    "reordered_other": "요소 {{count}}개 순서 변경됨",
    "modified_other": "요소 {{count}}개 수정됨"
  },
  ```

- [ ] **Step 7: Verify the wiring compiles and nothing regressed**

  Run: `pnpm --filter @excalidraw-clone/web typecheck`
  Run: `pnpm --filter @excalidraw-clone/web test`
  Expected: both green.

- [ ] **Step 8: Manual smoke check** — run the dev server (`pnpm --filter @excalidraw-clone/web dev`), open the app, draw a couple of shapes, click the new history toggle button on the right edge (below where `PropertiesPanel` floats), confirm entries appear with readable labels and clicking an older entry visibly reverts the canvas. Confirm `PropertiesPanel` (top-right) and the new panel's toggle button don't visually overlap. Fix any layout issue found here directly (this offset was flagged in the spec as needing a visual pass, consistent with how past panels' layout issues were caught at this stage) before moving on.

- [ ] **Step 9: Commit**

  ```bash
  git add apps/web/src/components/App.tsx apps/web/src/locales/en/common.json apps/web/src/locales/ko/common.json
  git commit -m "feat(web): mount HistoryPanel and wire it to the active page's Scene"
  ```

---

### Task 5: E2E coverage, full gate, integrate

**Context for a fresh implementer:** This closes out the feature: an end-to-end Playwright test exercising the full stack (draw → open panel → see labeled entries → click an old entry to jump → confirm a subsequent edit truncates the future), then the full monorepo gate, then merging the branch back into `develop`/`main`.

**Files:**

- Create: `apps/web/e2e/history-panel.spec.ts`

- [ ] **Step 1: Write the e2e test**, `apps/web/e2e/history-panel.spec.ts`:

  ```ts
  import { expect, test } from "@playwright/test"
  import { dragOnCanvas, parseStoredScene } from "./_helpers"

  test("history panel: labeled entries, click-to-jump, and future truncation on new edit", async ({
    page,
  }) => {
    await page.goto("/")
    await page.evaluate(() => localStorage.clear())
    await page.reload()
    await page.locator('[data-testid="toolbar-rectangle"]').waitFor({ state: "visible" })

    const draw = async (from: { x: number; y: number }, to: { x: number; y: number }) => {
      await page.locator('[data-testid="toolbar-rectangle"]').click()
      await dragOnCanvas(page, from, to)
      await page.waitForTimeout(120)
    }

    // Panel starts closed.
    await expect(page.locator('[data-testid="history-panel"]')).toHaveCount(0)

    await draw({ x: 100, y: 100 }, { x: 160, y: 160 })
    await draw({ x: 220, y: 100 }, { x: 280, y: 160 })
    await page.keyboard.press("Escape")
    await page.waitForTimeout(700)

    let scene = parseStoredScene<{ type: string; isDeleted?: boolean }>(
      await page.evaluate(() => localStorage.getItem("excalidraw-scene")),
    )
    expect(scene.elements.filter((e) => !e.isDeleted).length).toBe(2)

    await page.locator('[data-testid="history-toggle"]').click()
    await expect(page.locator('[data-testid="history-panel"]')).toBeVisible()

    const rows = page.locator('[data-testid^="history-row-"]')
    await expect(rows).toHaveCount(3) // initial + two adds

    // Newest first.
    await expect(page.locator('[data-testid="history-jump-2"]')).toHaveText(/Added 1 element/)
    await expect(page.locator('[data-testid="history-jump-1"]')).toHaveText(/Added 1 element/)
    await expect(page.locator('[data-testid="history-jump-0"]')).toHaveText(/Initial state/)

    // Jump directly back to the initial (empty) state — a two-step undo in one click.
    await page.locator('[data-testid="history-jump-0"]').click()
    await page.waitForTimeout(700)

    scene = parseStoredScene(await page.evaluate(() => localStorage.getItem("excalidraw-scene")))
    expect(scene.elements.filter((e) => !e.isDeleted).length).toBe(0)

    // A new edit after jumping back truncates the future entries.
    await draw({ x: 400, y: 100 }, { x: 460, y: 160 })
    await page.waitForTimeout(700)

    await expect(page.locator('[data-testid^="history-row-"]')).toHaveCount(2) // initial + the new add only
  })
  ```

- [ ] **Step 2: Run the new spec**

  From `apps/web/`, run: `pnpm exec playwright test history-panel`
  Expected: PASS. If a fixed pixel coordinate misses (e.g. toolbar chrome offsets the canvas origin), adjust the coordinates to match this repo's actual canvas layout — do not weaken the assertions themselves.

- [ ] **Step 3: Commit**

  ```bash
  git add apps/web/e2e/history-panel.spec.ts
  git commit -m "test(web): e2e coverage for the undo/redo history panel"
  ```

- [ ] **Step 4: Full gate** — from the repo root, run `pnpm turbo run lint typecheck test build --force`. Confirm every package is green. Fix any fallout on this branch and re-run until clean.

- [ ] **Step 5: Full e2e** — from `apps/web/`, run `pnpm exec playwright test`. Confirm the **entire** suite passes, not just `history-panel.spec.ts`. Pay particular attention to `stats-panel.spec.ts`, `layers-panel.spec.ts`, and `undo-redo.spec.ts`, since this feature reads and calls into the same `Scene` history machinery those specs already exercise.

- [ ] **Step 6: Integrate** — this branch was created off `main` (Task 1, Step 0), which is one commit ahead of `develop` (the approved history-panel spec doc). Fast-forward `main` to this branch's tip first, then bring `develop` up to the same point:
  - `git switch main && git merge --ff-only feat/history-panel`
  - `git switch develop && git merge --ff-only main`
  - Confirm `pnpm turbo run typecheck test --force` is green on `main` after the merge.
  - Leave the push to origin and branch cleanup for explicit human confirmation (matching this repo's established pattern of treating push/branch-deletion as a separate, human-gated step) — do not run `git push` or delete `feat/history-panel` as part of this task.
  - Update `/home/sung/.claude/projects/-home-sung-excalidraw-clone/memory/MEMORY.md` with a one-line "Undo/redo history panel SHIPPED" entry (final commit SHA, all refs aligned locally, full gate green, not yet pushed).

---

## Self-Review — spec scope → task mapping

| Spec scope item                                                                                                                  | Task                                        | Notes                                                                                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Scene.getHistory()` / `getHistoryIndex()` / `jumpToHistory(index)`, additive, no change to `undo`/`redo`/`mutate`/`pushHistory` | Task 2                                      | New methods placed between `canRedo()` and `resetHistory()`; all pre-existing `scene-history.test.ts` cases re-run and stay green (Step 5)                                               |
| `describeHistoryChange(prev, next)` pure function, 7 categories + `initial`, index-0 special case                                | Task 1                                      | `prev: ... \| undefined` signature lets the caller pass `history[i-1]` uniformly for every index                                                                                         |
| Reorder detected as same-id-set + all-fields-equal + different array order                                                       | Task 1                                      | Dedicated test distinguishes pure reorder from reorder-plus-a-real-change (which must NOT be misclassified as reordered)                                                                 |
| `versionNonce`/`updated` never treated as meaningful                                                                             | Task 1                                      | `VOLATILE_FIELDS` stripped in both the reorder-equality check and `otherFieldsChanged`; dedicated test asserts a versionNonce/updated-only diff is not a reorder                         |
| Mixed-category transition → `modified` fallback                                                                                  | Task 1                                      | Two dedicated tests: cross-element mix, and single-element geometry+style mix                                                                                                            |
| `HistoryPanel` component: props, collapsed/expanded, reverse-chronological rows, current-entry highlight, click→`onJump`         | Task 3                                      | Mirrors `LayersPanel`'s structure directly; 7 tests covering every prop/behavior in the spec                                                                                             |
| Docked right, offset below `PropertiesPanel`, no thumbnails                                                                      | Task 3 (geometry) + Task 4 (mount position) | `top-16`/`h-[calc(100%-5rem)]` mirrors `LayersPanel`'s left-dock geometry on the opposite edge; Task 4 Step 8 is the explicit visual-collision check called out in the spec              |
| Wiring: `App.tsx` state + `scene.getHistory()`/`getHistoryIndex()`/`jumpToHistory`                                               | Task 4                                      | Follows the exact `layerElements`/`layersOpen` precedent already in the file                                                                                                             |
| No new keyboard shortcut                                                                                                         | Global Constraints + Task 4                 | Toggle button only; no `shortcuts.ts`/`shortcuts.json` changes anywhere in this plan                                                                                                     |
| No HelpDialog entry (deviation from the spec's literal line)                                                                     | Global Constraints                          | Ruling made during planning: `HelpDialog.tsx` has no shortcut-less entry mechanism, and `LayersPanel` (also shortcut-less) already establishes the precedent of zero HelpDialog presence |
| i18n: `history.*` keys, en `_one`/`_other`, ko `_other`-only                                                                     | Task 4, Steps 5-6                           | Both locale files updated in the same task that first needs real (non-mocked) translated strings                                                                                         |
| E2E: labeled entries, click-to-jump, future truncation on new edit after jumping back                                            | Task 5                                      | Single spec covers all three; truncation assertion directly exercises the pre-existing `pushHistory` truncation behavior, now visible in the panel                                       |
| Full gate + full e2e before merge                                                                                                | Task 5, Steps 4-5                           | `--force` on the final lint run per this repo's stale-cache gotcha                                                                                                                       |
| Cross-page history explicitly out of scope                                                                                       | Global Constraints                          | `Scene` stays one-per-page (`apps/web/src/driver/pages.ts`, unmodified); no task touches page-switching logic                                                                            |
| Thumbnails/previews explicitly out of scope                                                                                      | Task 3                                      | Component renders text labels only, no image/canvas snapshot rendering anywhere                                                                                                          |
| Branching/tree history explicitly out of scope                                                                                   | Global Constraints + Task 2                 | `jumpToHistory` only ever repositions `historyIndex` within the existing linear array; `pushHistory`'s truncate-on-new-mutate behavior is untouched                                      |
