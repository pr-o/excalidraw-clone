# Lasso Polish + Eraser Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) Lock in the lasso tool's Shift-to-add behaviour and its HelpDialog entry with tests. (2) Upgrade the existing eraser tool so a drag deletes everything along the pointer path (not just under each sampled pointer position), widens hits to whole groups, skips locked elements and bound labels, needs to cross a frame's border to erase the frame, reverts fully on Escape (labels, arrow bindings and frame membership included), and shows a trail on the overlay. Then add an eraser e2e.

**Architecture:**

- `packages/tools/src/tools/eraser.ts` gets rewritten. It stops calling `ctx.hitTest`, which returns only the topmost element and lives in `apps/web` (`pickElementAtPoint`). Instead it runs `hitTestElement` from `@excalidraw-clone/scene` over `ctx.readElements()` at points sampled every `4 / zoom` scene units between consecutive pointer positions. It widens hits with `expandIdsToGroups` (also from scene) and then drops locked elements and bound text.
- Erased elements are still soft-deleted live with `skipHistory: true`, and `pointerUp` still commits one history-tracked mutation. Because `Scene.mutate` dedupes against the last _recorded_ snapshot (see `packages/scene/src/scene.ts`), the whole drag is one undo step.
- On `pointerDown` the state captures `before = ctx.readElements()`, and Escape writes those element objects back. A plain `isDeleted: false` flip can't be used because `Scene.mutate`'s reconcile passes have already cascaded the delete to bound text, dropped arrow bindings and released frame members by then, and flipping the flag doesn't bring any of that back.
- Deletion side effects need no new code. `Scene.mutate` runs `reconcileBoundText` (a deleted container deletes its label), `reconcileBindings` (arrows bound to a deleted shape stay but lose the binding) and `reconcileFrameMembership` (a deleted frame releases its members). The Delete key (`deleteElements` in `apps/web/src/driver/patchScene.ts`) does nothing beyond flipping `isDeleted`, so the eraser matches it.
- The trail reuses the lasso overlay as is. `useDrawingDriver` calls `renderer.setLasso(trail)` while the eraser is in its `erasing` phase.

**Tech Stack:** TypeScript, Vitest 2, Playwright (Chromium), pnpm + turbo. **No new dependencies.**

## Researched facts (verified 2026-10-11 against `main@812bfaa`)

1. **Most of the lasso work the request lists already shipped in `ab2752b`:**
   - Shift-to-add is implemented at `packages/tools/src/tools/lasso.ts`, in the `pointerUp` branch: `ctx.modifiers.shift ? [...new Set([...ctx.selectedIds, ...enclosed])] : enclosed`. The unit test `"with shift, adds to the existing selection"` in `packages/tools/test/lasso-tool.test.ts` covers it.
   - The driver passes real pointer modifiers through `modifiersOf(e)`.
   - The HelpDialog entry `{ keys: "S", label: "shortcuts:lasso" }` exists in `packages/ui/src/HelpDialog.tsx` (`TOOL_SHORTCUTS`), and the en/ko `shortcuts.json` and `common.json` keys exist.
   - `apps/web/e2e/lasso.spec.ts` exists but has **no Shift case**, and `packages/ui/test/HelpDialog.test.tsx` has **no lasso or eraser assertion**.

   So lasso polish comes down to two lock-in tests (Task 1). They are expected to pass on their first run. If either fails, that is a real bug: debug it, don't rewrite the test.

2. **The eraser tool already exists and is fully wired:** `eraserTool` is in `packages/tools/src/tools/eraser.ts`, registered in `registry.ts`, `ToolName` includes `"eraser"`, `TOOL_KEYS` has `e: "eraser"` (`apps/web/src/keyboard/shortcuts.ts`), `Toolbar.tsx` has `{ name: "eraser", shortcut: "E" }`, `icons.ts` has an `eraser` icon, `HelpDialog.tsx` has `{ keys: "E", label: "shortcuts:eraser" }`, and en/ko i18n has `tools.eraser` / `eraser`. **No shortcut, toolbar, icon or i18n work is needed.** No eraser e2e exists.
3. **The current eraser's gaps:**
   - (a) It hit-tests only the exact pointer position of each event, so a fast drag jumps over elements.
   - (b) `ctx.hitTest`, which is `pickElementAtPoint`, returns only the topmost element, so overlapped elements survive.
   - (c) Hitting a frame's empty interior erases the frame, because `pickElementAtPoint` falls back to the frame.
   - (d) It ignores groups.
   - (e) Escape flips `isDeleted` back to `false` on the hit ids only, so a labelled shape comes back without its label and an arrow bound to it stays unbound. **Gap (e) is a live bug.**
4. `ctx.readElements()` in the driver is `scene.getElements()`, which holds **live (non-deleted) elements only**. So elements soft-deleted earlier in the drag drop out of later reads by themselves, and `before` holds exactly the pre-gesture live set.
5. `hitTestElement(element, point)` returns `false` for deleted elements. Rectangles, text, images and frames hit across their whole interior (`pointInRectangle`). Linear elements and freedraw use a threshold of `max(strokeWidth * 2, 5)`. Sampling every 4 screen px therefore cannot step over a default 2px line.
6. `escape` reaches the active tool: `shortcuts.ts` calls `store.dispatchToolEvent?.({ type: "escape" })` before clearing the selection. After Escape the eraser is `idle`, so the trailing `pointerMove`/`pointerUp` events of the still-held mouse are ignored by the `idle` branch.
7. `tsconfig.base.json` has `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`. Never write `skipHistory: undefined`. Emit the commit effect without the key.
8. `renderer.setLasso(path)` draws an open dashed polyline in the selection stroke colour (`drawLasso` in `packages/renderer/src/overlay.ts`). The driver clears it when the active tool changes away from `"lasso"`.
9. Groups and frames get these behaviours:
   - **Groups:** erasing any member erases the whole group (`expandIdsToGroups`), like Excalidraw. Locked members of that group are kept.
   - **Frames:** a frame is erased only when the path passes within `6 / zoom` scene units of its border, so sweeping through a frame's interior to erase its contents leaves the frame alone. Its members are erased only when the path touches them; erasing a frame releases its members through `reconcileFrameMembership`, the same as the Delete key.

## Global Constraints

- Don't change `Scene`, the reconcile passes, `pickElementAtPoint`, `deleteElements`, `ToolContext` or `ToolEffect`.
- Don't add shortcut, toolbar, icon or i18n entries. They already exist (fact 2).
- The trail reuses `renderer.setLasso` unchanged. Don't add a separate renderer API or styling.
- TDD: write each failing test first and confirm the stated failure (lock-in tests in Task 1 and the undo test in Task 3 are the stated exceptions).
- Commit after each task with the given subject. End each commit message with `Co-Authored-By: <implementer's own model name> <noreply@anthropic.com>`, substituting the model that actually wrote the diff.
- Test commands:
  - `pnpm --filter @excalidraw-clone/tools exec vitest run <file>`
  - `pnpm --filter @excalidraw-clone/ui exec vitest run <file>`
  - `pnpm --filter @excalidraw-clone/web exec playwright test <file>`

  Before any Playwright run, check that nothing else is listening on port 3000 (`ss -ltnp | grep :3000`). `reuseExistingServer: true` would silently test another checkout.

- Lint is `typescript-eslint` `recommendedTypeChecked` plus `import-x`: use `import type` for type-only imports and keep imports sorted.

## Review Focus

- Escape must restore the `before` objects (Task 3). A reviewer should reject any "flip isDeleted back" variant.
- `pointerUp`'s commit effect must have **no** `skipHistory` key (one undo step).
- Locked elements must stay excluded _after_ group expansion, not only before it.

---

### Task 1: Lasso polish lock-in tests (HelpDialog + Shift e2e)

**Files:**

- Modify: `packages/ui/test/HelpDialog.test.tsx`
- Modify: `apps/web/e2e/lasso.spec.ts`

Both behaviours already exist (fact 1), so these tests are expected to pass on their first run.

- [ ] **Step 1: HelpDialog assertions.** In `packages/ui/test/HelpDialog.test.tsx`, add after the `"lists the laser pointer shortcut"` test:

```tsx
it("lists the lasso and eraser shortcuts", () => {
  render(<HelpDialog t={t} open onClose={() => {}} />)
  expect(screen.getByText("S")).toBeInTheDocument()
  expect(screen.getByText("shortcuts:lasso")).toBeInTheDocument()
  expect(screen.getByText("E")).toBeInTheDocument()
  expect(screen.getByText("shortcuts:eraser")).toBeInTheDocument()
})
```

- [ ] **Step 2: Run.** `pnpm --filter @excalidraw-clone/ui exec vitest run test/HelpDialog.test.tsx`. Expect a PASS.

- [ ] **Step 3: Shift e2e.** Replace `apps/web/e2e/lasso.spec.ts` with the version below. The existing test is the same, only moved onto shared helpers, and the Shift test is new.

```ts
import { expect, test, type Page } from "@playwright/test"
import { dragOnCanvas, parseStoredScene } from "./_helpers"

type Pt = { x: number; y: number }

/** Fresh canvas with two 60×60 rectangles, far apart. */
const drawTwoRects = async (page: Page): Promise<void> => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-rectangle"]').waitFor({ state: "visible" })
  for (const [from, to] of [
    [
      { x: 100, y: 150 },
      { x: 160, y: 210 },
    ],
    [
      { x: 400, y: 150 },
      { x: 460, y: 210 },
    ],
  ] as const) {
    await page.locator('[data-testid="toolbar-rectangle"]').click()
    await dragOnCanvas(page, from, to)
    await page.waitForTimeout(120)
  }
}

/** Switch to the lasso (S) and drag a closed loop through `path` (canvas coords). */
const lassoLoop = async (page: Page, path: readonly Pt[]): Promise<void> => {
  await page.keyboard.press("s")
  expect(await page.locator('[data-testid="toolbar-lasso"]').getAttribute("aria-pressed")).toBe(
    "true",
  )
  const box = await page.locator("canvas").first().boundingBox()
  if (!box) throw new Error("canvas not found")
  await page.mouse.move(box.x + path[0]!.x, box.y + path[0]!.y)
  await page.mouse.down()
  for (const p of [...path.slice(1), { x: path[0]!.x + 8, y: path[0]!.y + 10 }]) {
    await page.mouse.move(box.x + p.x, box.y + p.y, { steps: 5 })
  }
  await page.mouse.up()
  await page.waitForTimeout(100)
}

/** Delete the selection, then count live elements in the persisted scene. */
const deleteAndCountLive = async (page: Page): Promise<number> => {
  await page.keyboard.press("Delete")
  await page.waitForTimeout(900)
  const json = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  return parseStoredScene<{ isDeleted?: boolean }>(json).elements.filter((e) => !e.isDeleted).length
}

const AROUND_FIRST: readonly Pt[] = [
  { x: 80, y: 130 },
  { x: 200, y: 140 },
  { x: 190, y: 240 },
  { x: 70, y: 230 },
]
const AROUND_SECOND: readonly Pt[] = AROUND_FIRST.map((p) => ({ x: p.x + 300, y: p.y }))

test("lasso selects only the enclosed shape, then returns to the selection tool", async ({
  page,
}) => {
  await drawTwoRects(page)
  await lassoLoop(page, AROUND_FIRST)
  expect(await page.locator('[data-testid="toolbar-selection"]').getAttribute("aria-pressed")).toBe(
    "true",
  )
  expect(await deleteAndCountLive(page)).toBe(1)
})

test("shift + lasso adds to the existing selection", async ({ page }) => {
  await drawTwoRects(page)
  await lassoLoop(page, AROUND_FIRST)
  await page.keyboard.down("Shift")
  await lassoLoop(page, AROUND_SECOND)
  await page.keyboard.up("Shift")
  expect(await deleteAndCountLive(page)).toBe(0)
})
```

`page.keyboard.press("s")` runs inside `lassoLoop` **before** Shift is held, so the key is a plain `s`. Playwright applies a held Shift to the mouse events, which is what `modifiersOf(e)` reads on `pointerUp`.

- [ ] **Step 4: Run.** `pnpm --filter @excalidraw-clone/web exec playwright test e2e/lasso.spec.ts`. Expect 2 passed.

- [ ] **Step 5: Commit.**

```
test: lock in lasso shift-to-add and lasso/eraser HelpDialog entries
```

---

### Task 2: Eraser hits everything along the path (interpolation, overlap, groups, locked, labels)

**Files:**

- Modify: `packages/tools/src/tools/eraser.ts` (full rewrite)
- Modify: `packages/tools/test/eraser-tool.test.ts` (full rewrite; the old tests drive `ctx.hitTest`, which the tool no longer uses)

- [ ] **Step 1: Write the failing tests.** Replace `packages/tools/test/eraser-tool.test.ts` with:

```ts
import { type ExcalidrawElement, newLine, newRectangle } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { type EraserState, eraserTool } from "../src"
import { applyMutation, makeCtx, point } from "./test-utils"

type Effects = ReturnType<typeof eraserTool.reduce>[1]

const rect = (x: number, extra: Partial<ExcalidrawElement> = {}): ExcalidrawElement =>
  ({ ...newRectangle({ x, y: 0, width: 10, height: 10 }), ...extra }) as ExcalidrawElement

/** Drive one drag through `path`, applying effects to a draft the way the scene
 *  would (readElements sees live elements only). Optionally end with pointerUp/escape. */
const drag = (
  elements: readonly ExcalidrawElement[],
  path: readonly { x: number; y: number }[],
  end: "pointerUp" | "escape" | null = null,
) => {
  const draft = [...elements]
  const ctx = makeCtx({ readElements: () => draft.filter((e) => !e.isDeleted) })
  let state: EraserState = eraserTool.initial
  let effects: Effects = []
  for (const at of path) {
    const type = state.phase === "idle" ? "pointerDown" : "pointerMove"
    ;[state, effects] = eraserTool.reduce(state, { type, at }, ctx)
    applyMutation(effects, draft)
  }
  if (end) {
    const event =
      end === "escape" ? ({ type: "escape" } as const) : { type: end, at: path[path.length - 1]! }
    ;[state, effects] = eraserTool.reduce(state, event, ctx)
    applyMutation(effects, draft)
  }
  const isDeleted = (id: string) => draft.find((e) => e.id === id)?.isDeleted
  return { state, effects, isDeleted }
}

describe("eraser tool", () => {
  it("pointerDown over an element soft-deletes it live, outside history", () => {
    const r = rect(0)
    const { effects, isDeleted } = drag([r], [point(5, 5)])
    expect(isDeleted(r.id)).toBe(true)
    expect(effects).toMatchObject([{ kind: "mutation", skipHistory: true }])
  })

  it("a fast straight drag erases a thin line it jumps across", () => {
    const line = { ...newLine({ x: 50, y: 0 }), points: [point(0, 0), point(0, 100)] }
    const { isDeleted } = drag([line], [point(0, 50), point(100, 50)])
    expect(isDeleted(line.id)).toBe(true)
  })

  it("erases every element under the path, not just the topmost", () => {
    const below = rect(0)
    const above = rect(0)
    const { isDeleted } = drag([below, above], [point(5, 5)])
    expect(isDeleted(below.id)).toBe(true)
    expect(isDeleted(above.id)).toBe(true)
  })

  it("skips locked elements and bound labels", () => {
    const locked = rect(0, { locked: true })
    const label = rect(0, { type: "text", containerId: "some-box" } as Partial<ExcalidrawElement>)
    const { isDeleted } = drag([locked, label], [point(5, 5)])
    expect(isDeleted(locked.id)).toBe(false)
    expect(isDeleted(label.id)).toBe(false)
  })

  it("erasing one group member erases the whole group, except locked members", () => {
    const hit = rect(0, { groupIds: ["g"] })
    const mate = rect(100, { groupIds: ["g"] })
    const lockedMate = rect(200, { groupIds: ["g"], locked: true })
    const { isDeleted } = drag([hit, mate, lockedMate], [point(5, 5)])
    expect(isDeleted(hit.id)).toBe(true)
    expect(isDeleted(mate.id)).toBe(true)
    expect(isDeleted(lockedMate.id)).toBe(false)
  })

  it("erases each element once", () => {
    const r = rect(0)
    const { state, effects } = drag([r], [point(5, 5), point(6, 6)])
    expect(effects).toEqual([])
    expect(state.phase === "erasing" && state.erasedIds).toEqual([r.id])
  })

  it("pointerUp commits one history-tracked mutation; an empty drag commits nothing", () => {
    const r = rect(0)
    const hit = drag([r], [point(5, 5)], "pointerUp")
    expect(hit.state.phase).toBe("idle")
    expect(hit.effects).toHaveLength(1)
    expect(hit.effects[0]).not.toHaveProperty("skipHistory")
    expect(drag([r], [point(50, 50)], "pointerUp").effects).toEqual([])
  })

  it("escape mid-erase brings back everything erased so far", () => {
    const r = rect(0)
    const { state, isDeleted } = drag([r], [point(5, 5)], "escape")
    expect(state.phase).toBe("idle")
    expect(isDeleted(r.id)).toBe(false)
  })
})
```

- [ ] **Step 2: Run and confirm RED.** `pnpm --filter @excalidraw-clone/tools exec vitest run test/eraser-tool.test.ts`. Most cases fail because the old tool asks `ctx.hitTest`, which `makeCtx` stubs to `null`, so nothing is erased.

- [ ] **Step 3: Implement.** Replace `packages/tools/src/tools/eraser.ts` with:

```ts
import type { Point } from "@excalidraw-clone/geometry"
import { type ExcalidrawElement, expandIdsToGroups, hitTestElement } from "@excalidraw-clone/scene"
import type { Tool, ToolContext, ToolEffect, ToolEvent } from "../types"
import { NO_EFFECTS } from "../types"

type Erasing = {
  phase: "erasing"
  erasedIds: readonly string[]
  /** Every pointer position of this drag; drawn as the overlay trail. */
  trail: readonly Point[]
}

export type EraserState = { phase: "idle" } | Erasing

const ERASER_INITIAL: EraserState = { phase: "idle" }

/** Hit-test spacing along a drag, in screen px, so fast drags can't jump over thin lines. */
const STEP_PX = 4

/** Points from `a` (exclusive) to `b` (inclusive), at most `step` apart. */
const samplesBetween = (a: Point, b: Point, step: number): Point[] => {
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step))
  return Array.from({ length: n }, (_, i) => ({
    x: a.x + ((b.x - a.x) * (i + 1)) / n,
    y: a.y + ((b.y - a.y) * (i + 1)) / n,
  }))
}

/** Locked elements stay; bound labels go with their container (reconcileBoundText). */
const erasable = (e: ExcalidrawElement): boolean =>
  !e.locked && !(e.type === "text" && e.containerId !== null)

/** Ids of erasable elements under any of `points`, widened to whole groups, minus `skip`. */
const idsUnder = (
  points: readonly Point[],
  elements: readonly ExcalidrawElement[],
  skip: ReadonlySet<string>,
): string[] => {
  const hit = elements
    .filter((e) => !skip.has(e.id) && erasable(e) && points.some((p) => hitTestElement(e, p)))
    .map((e) => e.id)
  if (hit.length === 0) return []
  const byId = new Map(elements.map((e) => [e.id, e]))
  return expandIdsToGroups(hit, elements).filter((id) => {
    const e = byId.get(id)
    return e !== undefined && !skip.has(id) && erasable(e)
  })
}

const markDeleted =
  (ids: readonly string[]) =>
  (draft: ExcalidrawElement[]): void => {
    const set = new Set(ids)
    for (let i = 0; i < draft.length; i += 1) {
      const e = draft[i]!
      if (set.has(e.id) && !e.isDeleted) draft[i] = { ...e, isDeleted: true }
    }
  }

const eraseAt = (
  state: Erasing,
  points: readonly Point[],
  ctx: ToolContext,
): [EraserState, readonly ToolEffect[]] => {
  const ids = idsUnder(points, ctx.readElements(), new Set(state.erasedIds))
  if (ids.length === 0) return [state, NO_EFFECTS]
  return [
    { ...state, erasedIds: [...state.erasedIds, ...ids] },
    [{ kind: "mutation", apply: markDeleted(ids), skipHistory: true }],
  ]
}

export const eraserTool: Tool<EraserState, ToolEvent> = {
  name: "eraser",
  initial: ERASER_INITIAL,
  reduce(state, event, ctx) {
    if (state.phase === "idle") {
      if (event.type !== "pointerDown") return [state, NO_EFFECTS]
      return eraseAt({ phase: "erasing", erasedIds: [], trail: [event.at] }, [event.at], ctx)
    }
    switch (event.type) {
      case "pointerMove": {
        const last = state.trail[state.trail.length - 1] ?? event.at
        const samples = samplesBetween(last, event.at, STEP_PX / ctx.viewTransform.zoom)
        return eraseAt({ ...state, trail: [...state.trail, event.at] }, samples, ctx)
      }
      case "pointerUp":
        // The live soft-deletes skipped history; this one commit makes the drag one undo step.
        return [
          ERASER_INITIAL,
          state.erasedIds.length === 0
            ? NO_EFFECTS
            : [{ kind: "mutation", apply: markDeleted(state.erasedIds) }],
        ]
      case "escape": {
        const ids = new Set(state.erasedIds)
        if (ids.size === 0) return [ERASER_INITIAL, NO_EFFECTS]
        return [
          ERASER_INITIAL,
          [
            {
              kind: "mutation",
              apply: (draft) => {
                for (let i = 0; i < draft.length; i += 1) {
                  const e = draft[i]!
                  if (ids.has(e.id)) draft[i] = { ...e, isDeleted: false }
                }
              },
              skipHistory: true,
            },
          ],
        ]
      }
      default:
        return [state, NO_EFFECTS]
    }
  },
}
```

The Escape branch is a temporary carry-over of the old behaviour; Task 3 replaces it.

- [ ] **Step 4: Run GREEN.** `pnpm --filter @excalidraw-clone/tools exec vitest run test/eraser-tool.test.ts`. Expect all pass. Then `pnpm --filter @excalidraw-clone/tools exec tsc --noEmit -p .` (or `pnpm --filter @excalidraw-clone/tools typecheck`).

- [ ] **Step 5: Commit.**

```
feat(eraser): erase everything along the drag path, whole groups, skip locked and labels
```

---

### Task 3: Escape fully restores (labels, arrow bindings, frame membership); undo is one step

**Files:**

- Modify: `packages/tools/src/tools/eraser.ts`
- Modify: `packages/tools/test/eraser-tool.test.ts`

These tests use a real `Scene`, so the reconcile passes run exactly as they do in the app.

- [ ] **Step 1: Write the failing tests.** Change the scene import in `eraser-tool.test.ts` to:

```ts
import {
  type ExcalidrawElement,
  Scene,
  newArrow,
  newLine,
  newRectangle,
  newText,
} from "@excalidraw-clone/scene"
```

and append:

```ts
const run = (scene: Scene, effects: Effects): void => {
  for (const e of effects) {
    if (e.kind === "mutation")
      scene.mutate(e.apply, e.skipHistory ? { skipHistory: true } : undefined)
  }
}

describe("eraser tool against a real Scene", () => {
  it("escape restores an erased shape together with its label and arrow binding", () => {
    const base = newRectangle({ x: 0, y: 0, width: 40, height: 40 })
    const label = newText({ x: 0, y: 0, text: "hi", containerId: base.id })
    const arrow = {
      ...newArrow({ x: 100, y: 20 }),
      points: [point(0, 0), point(-56, 0)],
      endBinding: { elementId: base.id, focus: 0, gap: 4 },
    }
    const box = {
      ...base,
      boundElements: [
        { id: label.id, type: "text" as const },
        { id: arrow.id, type: "arrow" as const },
      ],
    }
    const scene = new Scene([box, label, arrow])
    const ctx = makeCtx({ readElements: () => scene.getElements() })
    const get = (id: string) => scene.getElementsIncludingDeleted().find((e) => e.id === id)!

    const [erasing, down] = eraserTool.reduce(
      eraserTool.initial,
      { type: "pointerDown", at: point(20, 20) },
      ctx,
    )
    run(scene, down)
    // Same side effects as the Delete key: label cascades, arrow survives unbound.
    expect(get(label.id).isDeleted).toBe(true)
    expect(get(arrow.id).isDeleted).toBe(false)
    const unbound = get(arrow.id)
    expect(unbound.type === "arrow" ? unbound.endBinding : "not an arrow").toBeNull()

    const [, esc] = eraserTool.reduce(erasing, { type: "escape" }, ctx)
    run(scene, esc)
    expect(get(box.id).isDeleted).toBe(false)
    expect(get(label.id).isDeleted).toBe(false)
    const rebound = get(arrow.id)
    expect(rebound.type === "arrow" ? rebound.endBinding?.elementId : null).toBe(box.id)
  })

  it("a whole drag is one undo step", () => {
    const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const b = newRectangle({ x: 100, y: 0, width: 10, height: 10 })
    const scene = new Scene([a, b])
    const ctx = makeCtx({ readElements: () => scene.getElements() })
    let [state, effects] = eraserTool.reduce(
      eraserTool.initial,
      { type: "pointerDown", at: point(5, 5) },
      ctx,
    )
    run(scene, effects)
    ;[state, effects] = eraserTool.reduce(state, { type: "pointerMove", at: point(105, 5) }, ctx)
    run(scene, effects)
    ;[, effects] = eraserTool.reduce(state, { type: "pointerUp", at: point(105, 5) }, ctx)
    run(scene, effects)
    expect(scene.getElements()).toHaveLength(0)
    scene.undo()
    expect(scene.getElements()).toHaveLength(2)
    expect(scene.canUndo()).toBe(false)
  })
})
```

- [ ] **Step 2: Run and confirm RED.** `pnpm --filter @excalidraw-clone/tools exec vitest run test/eraser-tool.test.ts`. The escape test fails at `get(label.id).isDeleted` → expected `false` (the label stays deleted), and the binding stays `null`. The undo test **already passes**, which is by design since Task 2's `pointerUp` commit produces the single step; it stays as a regression lock.

- [ ] **Step 3: Implement.** In `eraser.ts`:
  1. Add `before` to `Erasing`:

```ts
type Erasing = {
  phase: "erasing"
  /** Live elements at pointerDown. Escape puts them back verbatim, which also restores
   *  the labels, arrow bindings and frame membership the scene's reconcile pass dropped. */
  before: readonly ExcalidrawElement[]
  erasedIds: readonly string[]
  /** Every pointer position of this drag; drawn as the overlay trail. */
  trail: readonly Point[]
}
```

2. Add after `markDeleted`:

```ts
const restore =
  (before: readonly ExcalidrawElement[]) =>
  (draft: ExcalidrawElement[]): void => {
    const byId = new Map(before.map((e) => [e.id, e]))
    for (let i = 0; i < draft.length; i += 1) {
      const original = byId.get(draft[i]!.id)
      if (original) draft[i] = original
    }
  }
```

3. In `pointerDown`, change the initial erasing state to `{ phase: "erasing", before: ctx.readElements(), erasedIds: [], trail: [event.at] }`.

4. Replace the whole `case "escape": { ... }` block with:

```ts
      case "escape":
        return [
          ERASER_INITIAL,
          state.erasedIds.length === 0
            ? NO_EFFECTS
            : [{ kind: "mutation", apply: restore(state.before), skipHistory: true }],
        ]
```

- [ ] **Step 4: Run GREEN.** Same command. Expect all pass.

- [ ] **Step 5: Commit.**

```
fix(eraser): escape restores erased shapes with their labels, bindings and frame membership
```

---

### Task 4: Frames are erased only by crossing their border

**Files:**

- Modify: `packages/tools/src/tools/eraser.ts`
- Modify: `packages/tools/test/eraser-tool.test.ts`

- [ ] **Step 1: Write the failing test.** Add `newFrame` to the scene import and append inside the first `describe("eraser tool", …)`:

```ts
it("sweeping a frame's interior keeps the frame; crossing its border erases it", () => {
  const frame = newFrame({ x: 0, y: 0, width: 200, height: 200 })
  expect(drag([frame], [point(100, 100), point(150, 100)]).isDeleted(frame.id)).toBe(false)
  expect(drag([frame], [point(100, 100), point(198, 100)]).isDeleted(frame.id)).toBe(true)
})
```

- [ ] **Step 2: Run and confirm RED.** The first expectation fails, because the interior hit erases the frame.

- [ ] **Step 3: Implement.** In `eraser.ts`:
  1. Change the geometry import to `import { type Point, pointInRectangle } from "@excalidraw-clone/geometry"`.
  2. Add below `STEP_PX`:

```ts
/** How close (screen px) the path must pass to a frame's border to erase the frame,
 *  so sweeping through a frame to erase its contents leaves the frame alone. */
const FRAME_EDGE_PX = 6

const inset = (e: ExcalidrawElement, d: number) => ({
  x: e.x + d,
  y: e.y + d,
  width: e.width - 2 * d,
  height: e.height - 2 * d,
})

const touches = (e: ExcalidrawElement, p: Point, edge: number): boolean =>
  e.type === "frame"
    ? pointInRectangle(p, inset(e, -edge), e.angle) && !pointInRectangle(p, inset(e, edge), e.angle)
    : hitTestElement(e, p)
```

3. In `idsUnder`, add a parameter `edge: number` after `skip`, and replace `hitTestElement(e, p)` with `touches(e, p, edge)`.
4. In `eraseAt`, call `idsUnder(points, ctx.readElements(), new Set(state.erasedIds), FRAME_EDGE_PX / ctx.viewTransform.zoom)`.

A frame smaller than `2 * edge` gets a negative inner box, which contains nothing, so the whole tiny frame becomes erasable. That is acceptable.

- [ ] **Step 4: Run GREEN**, then run the whole tools suite: `pnpm --filter @excalidraw-clone/tools exec vitest run`.

- [ ] **Step 5: Commit.**

```
feat(eraser): only erase a frame when the path crosses its border
```

---

### Task 5: Eraser trail on the overlay (reuse the lasso path)

**Files:**

- Modify: `apps/web/src/driver/useDrawingDriver.ts`

The driver has no unit tests for overlay calls (the lasso's `setLasso` wiring has none either). Check this task with typecheck and a visual check; Task 6's e2e exercises the code path.

- [ ] **Step 1: Wire it.** In `useDrawingDriver.ts`:
  1. Add `type EraserState,` to the `@excalidraw-clone/tools` import list (alphabetical, before `type LassoState`).
  2. In the store subscription, change

```ts
if (s.activeTool !== prev.activeTool && prev.activeTool === "lasso") renderer.setLasso([])
```

to

```ts
if (
  s.activeTool !== prev.activeTool &&
  (prev.activeTool === "lasso" || prev.activeTool === "eraser")
) {
  renderer.setLasso([])
}
```

3. In `dispatch`, directly after the `if (toolName === "lasso") { ... }` block, add:

```ts
if (toolName === "eraser") {
  const eraser = next as EraserState
  renderer.setLasso(eraser.phase === "erasing" ? eraser.trail : [])
}
```

- [ ] **Step 2: Verify.** Run `pnpm --filter @excalidraw-clone/web typecheck` and `pnpm --filter @excalidraw-clone/web lint`. Then run `pnpm dev`, press `E` and drag: a dashed trail follows the pointer and disappears on release or Escape.

- [ ] **Step 3: Commit.**

```
feat(eraser): draw the drag trail on the overlay, reusing the lasso path
```

---

### Task 6: Eraser e2e

**Files:**

- Create: `apps/web/e2e/eraser.spec.ts`

- [ ] **Step 1: Write the test.**

```ts
import { expect, test, type Page } from "@playwright/test"
import { dragOnCanvas, parseStoredScene } from "./_helpers"

const liveCount = async (page: Page): Promise<number> => {
  await page.waitForTimeout(900) // autosave debounce
  const json = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  return parseStoredScene<{ isDeleted?: boolean }>(json).elements.filter((e) => !e.isDeleted).length
}

/** Fresh canvas, two rects 140px apart, eraser active. Returns the canvas origin. */
const setup = async (page: Page): Promise<{ x: number; y: number }> => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-rectangle"]').waitFor({ state: "visible" })
  for (const x of [100, 300]) {
    await page.locator('[data-testid="toolbar-rectangle"]').click()
    await dragOnCanvas(page, { x, y: 150 }, { x: x + 60, y: 210 })
    await page.waitForTimeout(120)
  }
  await page.keyboard.press("e")
  expect(await page.locator('[data-testid="toolbar-eraser"]').getAttribute("aria-pressed")).toBe(
    "true",
  )
  const box = await page.locator("canvas").first().boundingBox()
  if (!box) throw new Error("canvas not found")
  return box
}

test("a fast drag erases every shape it crosses; one undo brings them all back", async ({
  page,
}) => {
  const box = await setup(page)
  await page.mouse.move(box.x + 80, box.y + 180)
  await page.mouse.down()
  // Two big jumps (80 → 240 → 400): the middle sample lands between the rects,
  // so only path interpolation can catch both.
  await page.mouse.move(box.x + 400, box.y + 180, { steps: 2 })
  await page.mouse.up()
  expect(await liveCount(page)).toBe(0)

  await page.keyboard.press(process.platform === "darwin" ? "Meta+Z" : "Control+Z")
  expect(await liveCount(page)).toBe(2)
})

test("Escape mid-erase restores everything erased so far", async ({ page }) => {
  const box = await setup(page)
  await page.mouse.move(box.x + 80, box.y + 180)
  await page.mouse.down()
  await page.mouse.move(box.x + 400, box.y + 180, { steps: 8 })
  await page.keyboard.press("Escape")
  await page.mouse.up()
  expect(await liveCount(page)).toBe(2)
})
```

- [ ] **Step 2: Run.** `pnpm --filter @excalidraw-clone/web exec playwright test e2e/eraser.spec.ts`. Expect 2 passed. To confirm the first test exercises interpolation, temporarily set `STEP_PX` to `1000` and watch it fail, then revert.

- [ ] **Step 3: Commit.**

```
test(e2e): eraser drag, single-step undo and Escape restore
```

---

### Task 7: Full gate

- [ ] **Step 1:** `pnpm build && pnpm lint && pnpm typecheck && pnpm test`. If lint cites paths from another worktree, use `pnpm turbo run build lint typecheck test --force`.
- [ ] **Step 2:** `pnpm --filter @excalidraw-clone/web exec playwright test` (full e2e; check port 3000 first). Pay particular attention to `locking.spec.ts`, `frames.spec.ts` and `escape-cancel.spec.ts`.
- [ ] **Step 3:** If anything needed fixing, commit with `fix: <what>`. Otherwise there is nothing to commit.
