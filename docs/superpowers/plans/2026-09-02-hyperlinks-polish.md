# Element Hyperlinks — Polish Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix five bounded rough edges in the just-shipped element-hyperlinks feature: off-screen popover/indicator, a sticky hover indicator, `Cmd/Ctrl+K` on a locked element, macOS `Ctrl`-click double-duty, and a dead `title` fallback.

**Architecture:** No new surface area. Fix 1 adds a pure clamp helper + named constants to `apps/web/src/driver/link.ts` and rewires both render branches of `LinkOverlay.tsx` through it (Fix 5 folds in here — a one-token change to the indicator `title`). Fix 2 adds a `pointerOverCanvas` boolean to the pointer store slice, fed by new `pointerenter`/`pointerleave` listeners in `useDrawingDriver`, and read by `LinkOverlay` to gate the pointer-fallback branch of `pickLinkIndicatorTarget` (whose signature is untouched). Fix 3 adds a locked-element guard to the `Cmd/Ctrl+K` branch of `attachShortcuts`. Fix 4 makes the `Cmd/Ctrl`-click-to-open guard in `useDrawingDriver` platform-aware inline.

**Tech Stack:** React 19, Zustand, TypeScript, Vitest (jsdom, `globals: false`, no jest-dom, no auto-cleanup in `apps/web`), Playwright e2e, Turborepo + pnpm.

**Spec:** `docs/superpowers/specs/2026-09-01-element-hyperlinks-design.md` (original feature). This polish pass has no separate spec doc; the five approved fixes are enumerated in the Self-Review spec-coverage table below and were approved by the user before planning.

## Global Constraints

- Branch: `feat/hyperlinks-polish`, off `develop` @ `c1dbc85`. Worktree: `/home/sung/excalidraw-clone/.worktrees/hyperlinks-polish`.
- **Every `turbo`/`pnpm` invocation MUST run from inside the worktree dir above.** Running from the main checkout silently tests the wrong tree.
- No new dependencies. No schema / document-format changes (`link` already lives on `ExcalidrawElementBase` — no migration).
- `pickLinkIndicatorTarget` signature is unchanged: `(elements, selectedIds, pointer)`.
- Do NOT touch: `apps/web/src/store/slices/clipboard.ts` (or any `clipboard.ts`), the `Cmd/Ctrl+K` modifier convention (`metaKey || ctrlKey`), or `apps/web/e2e/element-links.spec.ts` (it must keep passing unchanged).
- `apps/web` unit tests: import `describe/it/expect/vi/afterEach` from `"vitest"`. No jest-dom — use plain assertions and `container.querySelector` / `.getAttribute` / `.style`. No auto-cleanup — every `*.test.tsx` that renders must have `afterEach(() => cleanup())`.
- `useDrawingDriver` has no unit harness (native `addEventListener`). Its checkpoint is `typecheck` + the e2e spec.
- Full gate green before the final commit: `pnpm turbo run typecheck lint test` + `pnpm --filter web e2e`. If lint output references paths from another worktree, re-run with `pnpm turbo run lint --force` (known repo cache gotcha).
- Commit messages end with the two trailers configured for this repo (`Co-Authored-By:` / `Claude-Session:`).

---

### Task 1: Viewport-clamp the link popover and indicator (Fix 1 + Fix 5)

Both overlay boxes in `LinkOverlay.tsx` are absolutely positioned inside a `<main>` that is `overflow-hidden`. For an element near the top of the canvas the editor (`top - 40`) and indicator (`top - 22`) render at a negative `top` and are clipped; near the right edge `left` overflows too. This task adds a pure clamp helper with named constants and routes both render branches through it. Fix 5 (the unreachable `?? target.link` in the indicator `title`) is a one-line change folded into the same commit.

**Files:**

- Modify: `apps/web/src/driver/link.ts` (add constants + `clampLinkOverlayPos`, after `pickLinkIndicatorTarget`)
- Modify: `apps/web/src/components/LinkOverlay.tsx` (both render branches; indicator `title`)
- Test: `apps/web/test/link.test.ts` (new `describe("clampLinkOverlayPos")`)
- Test: `apps/web/test/LinkOverlay.test.tsx` (new positioning assertions)

**Interfaces:**

- Consumes: `sanitizeLinkHref(link: string | null | undefined): string | null`, `pickLinkIndicatorTarget(elements, selectedIds, pointer): ExcalidrawElement | null` (both existing, unchanged).
- Produces:
  - `LINK_EDITOR_WIDTH = 280`, `LINK_INDICATOR_WIDTH = 32`, `LINK_EDITOR_OFFSET = 40`, `LINK_INDICATOR_OFFSET = 22`, `LINK_FLIP_GAP = 4` — all `export const` numbers in `link.ts`.
  - `clampLinkOverlayPos(natural: { left: number; aboveTop: number; belowTop: number }, width: number, viewportW: number): { left: number; top: number }` — pure. `left` clamped to `[0, max(0, viewportW - width)]`. `top` is `aboveTop` when `aboveTop >= 0`, else `max(0, belowTop)`.

- [ ] **Step 1: Write the failing helper tests**

Append to `apps/web/test/link.test.ts` (the file already imports from `../src/driver/link` — extend that import list with `clampLinkOverlayPos`):

```ts
describe("clampLinkOverlayPos", () => {
  it("keeps a natural position that already fits", () => {
    expect(clampLinkOverlayPos({ left: 100, aboveTop: 60, belowTop: 140 }, 280, 1024)).toEqual({
      left: 100,
      top: 60,
    })
  })

  it("clamps left into the viewport near the right edge", () => {
    expect(clampLinkOverlayPos({ left: 1000, aboveTop: 60, belowTop: 140 }, 280, 1024)).toEqual({
      left: 744,
      top: 60,
    })
  })

  it("never returns a negative left", () => {
    expect(clampLinkOverlayPos({ left: -50, aboveTop: 60, belowTop: 140 }, 280, 1024).left).toBe(0)
  })

  it("pins left to 0 when the box is wider than the viewport", () => {
    expect(clampLinkOverlayPos({ left: 30, aboveTop: 60, belowTop: 140 }, 400, 320).left).toBe(0)
  })

  it("flips below the anchor when the position above is off the top edge", () => {
    expect(clampLinkOverlayPos({ left: 100, aboveTop: -12, belowTop: 74 }, 32, 1024)).toEqual({
      left: 100,
      top: 74,
    })
  })

  it("clamps the flipped-below top to 0 as a last resort", () => {
    expect(clampLinkOverlayPos({ left: 100, aboveTop: -12, belowTop: -4 }, 32, 1024).top).toBe(0)
  })
})
```

- [ ] **Step 2: Run the helper tests to verify they fail**

Run: `cd /home/sung/excalidraw-clone/.worktrees/hyperlinks-polish && pnpm --filter web test -- link.test.ts`
Expected: FAIL — `clampLinkOverlayPos is not a function` / import error.

- [ ] **Step 3: Implement the constants and helper**

Append to `apps/web/src/driver/link.ts`:

```ts
/** Layout constants for the link overlay (editor popover + corner indicator). */
export const LINK_EDITOR_WIDTH = 280
export const LINK_INDICATOR_WIDTH = 32
export const LINK_EDITOR_OFFSET = 40
export const LINK_INDICATOR_OFFSET = 22
export const LINK_FLIP_GAP = 4

/** Clamp an absolutely-positioned overlay box into the viewport. `<main>` is
 *  `overflow-hidden`, so a box at a negative offset is clipped rather than
 *  scrolled to. `left` is clamped to `[0, viewportW - width]`. `top` uses the
 *  natural position above the anchor (`aboveTop`) when that is on-screen; when
 *  it is negative the box flips to `belowTop` (just under the anchor), itself
 *  clamped to `>= 0`. This is clamp-only — no true scroll-into-view. */
export function clampLinkOverlayPos(
  natural: { left: number; aboveTop: number; belowTop: number },
  width: number,
  viewportW: number,
): { left: number; top: number } {
  const left = Math.max(0, Math.min(natural.left, Math.max(0, viewportW - width)))
  const top = natural.aboveTop >= 0 ? natural.aboveTop : Math.max(0, natural.belowTop)
  return { left, top }
}
```

- [ ] **Step 4: Run the helper tests to verify they pass**

Run: `cd /home/sung/excalidraw-clone/.worktrees/hyperlinks-polish && pnpm --filter web test -- link.test.ts`
Expected: PASS (all `clampLinkOverlayPos` cases plus the pre-existing suites).

- [ ] **Step 5: Write the failing component positioning tests**

Add to `apps/web/test/LinkOverlay.test.tsx`. In `describe("LinkOverlay — editor mode")`:

```ts
it("clamps the editor popover to a non-negative top for an element at the canvas top", () => {
  const scene = new Scene()
  const rect = newRectangle({ x: 0, y: 0, width: 40, height: 30 })
  scene.mutate((d) => d.push(rect))
  useAppStore.getState().setLinkEditorElementId(rect.id)

  renderOverlay(scene)

  const top = parseFloat(screen.getByTestId("link-editor").style.top)
  expect(top).toBeGreaterThanOrEqual(0)
})

it("clamps the editor popover left within the viewport near the right edge", () => {
  const scene = new Scene()
  const rect = newRectangle({ x: 5000, y: 200, width: 40, height: 30 })
  scene.mutate((d) => d.push(rect))
  useAppStore.getState().setLinkEditorElementId(rect.id)

  renderOverlay(scene)

  const left = parseFloat(screen.getByTestId("link-editor").style.left)
  expect(left).toBeGreaterThanOrEqual(0)
  expect(left).toBeLessThanOrEqual(window.innerWidth)
})
```

In `describe("LinkOverlay — indicator mode")`:

```ts
it("clamps the indicator to a non-negative top for an element at the canvas top", () => {
  const scene = new Scene()
  const rect = { ...newRectangle({ x: 0, y: 0, width: 10, height: 10 }), link: "https://a.com" }
  scene.mutate((d) => d.push(rect))
  useAppStore.getState().setSelection([rect.id])

  renderOverlay(scene)

  const top = parseFloat(screen.getByTestId("link-indicator").style.top)
  expect(top).toBeGreaterThanOrEqual(0)
})
```

- [ ] **Step 6: Run the component tests to verify they fail**

Run: `cd /home/sung/excalidraw-clone/.worktrees/hyperlinks-polish && pnpm --filter web test -- LinkOverlay.test.tsx`
Expected: FAIL — current `top` is `-40` / `-22` (parses to a negative number).

- [ ] **Step 7: Rewire both render branches through the helper and fix the dead title fallback**

In `apps/web/src/components/LinkOverlay.tsx`:

Extend the `link` import:

```ts
import {
  clampLinkOverlayPos,
  commitElementLink,
  LINK_EDITOR_OFFSET,
  LINK_EDITOR_WIDTH,
  LINK_FLIP_GAP,
  LINK_INDICATOR_OFFSET,
  LINK_INDICATOR_WIDTH,
  normalizeLinkInput,
  openLink,
  pickLinkIndicatorTarget,
  sanitizeLinkHref,
} from "../driver/link"
```

In the editor branch, replace:

```ts
const left = (el.x + scrollX) * zoom
const top = (el.y + scrollY) * zoom
```

with:

```ts
const anchorLeft = (el.x + scrollX) * zoom
const anchorTop = (el.y + scrollY) * zoom
const { left, top } = clampLinkOverlayPos(
  {
    left: anchorLeft,
    aboveTop: anchorTop - LINK_EDITOR_OFFSET,
    belowTop: anchorTop + el.height * zoom + LINK_FLIP_GAP,
  },
  LINK_EDITOR_WIDTH,
  window.innerWidth,
)
```

and change the editor's `style` prop from `top: \`${top - 40}px\`` to `top: \`${top}px\``(and`left`stays`\`${left}px\``):

```ts
        style={{ position: "absolute", left: `${left}px`, top: `${top}px` }}
```

In the indicator branch, replace:

```ts
const left = (target.x + scrollX) * zoom
const top = (target.y + scrollY) * zoom
```

with:

```ts
const anchorLeft = (target.x + scrollX) * zoom
const anchorTop = (target.y + scrollY) * zoom
const { left, top } = clampLinkOverlayPos(
  {
    left: anchorLeft,
    aboveTop: anchorTop - LINK_INDICATOR_OFFSET,
    belowTop: anchorTop + LINK_FLIP_GAP,
  },
  LINK_INDICATOR_WIDTH,
  window.innerWidth,
)
```

and change the indicator's `style` prop from `top: \`${top - 22}px\`` to `top: \`${top}px\``:

```ts
      style={{ position: "absolute", left: `${left}px`, top: `${top}px` }}
```

Fix 5 — change the indicator `title` from:

```ts
      title={sanitizeLinkHref(target.link) ?? target.link ?? ""}
```

to:

```ts
      title={sanitizeLinkHref(target.link) ?? ""}
```

(`pickLinkIndicatorTarget` only returns elements whose `link` passes `sanitizeLinkHref`, so `sanitizeLinkHref(target.link)` is always non-null here; the `?? ""` stays only to satisfy the `title: string` type.)

- [ ] **Step 8: Run the LinkOverlay + link suites to verify they pass**

Run: `cd /home/sung/excalidraw-clone/.worktrees/hyperlinks-polish && pnpm --filter web test -- LinkOverlay.test.tsx link.test.ts`
Expected: PASS. The existing `title` assertion (`toBe("https://a.com/")`) still holds.

- [ ] **Step 9: Typecheck the web package**

Run: `cd /home/sung/excalidraw-clone/.worktrees/hyperlinks-polish && pnpm turbo run typecheck --filter web`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
cd /home/sung/excalidraw-clone/.worktrees/hyperlinks-polish
git add apps/web/src/driver/link.ts apps/web/src/components/LinkOverlay.tsx apps/web/test/link.test.ts apps/web/test/LinkOverlay.test.tsx
git commit -m "web: viewport-clamp the link popover and indicator"
```

---

### Task 2: `pointerOverCanvas` flag — stop the sticky hover indicator (Fix 2)

`pickLinkIndicatorTarget`'s pointer fallback reads `store.lastScenePointer`, which `dispatchPointer` sets but nothing ever clears. So after the pointer leaves the canvas the corner indicator lingers over wherever the pointer last was. `lastScenePointer` is also consumed by `clipboard.ts` for paste-at-cursor and must keep its exact current meaning. Fix: a separate `pointerOverCanvas` boolean, driven by canvas `pointerenter`/`pointerleave`, read by `LinkOverlay` to decide whether to pass `lastScenePointer` or `null` into the helper.

**Files:**

- Modify: `apps/web/src/store/slices/pointer.ts` (add field + setter to `PointerSlice`)
- Modify: `apps/web/src/driver/useDrawingDriver.ts` (two listeners in the existing effect + cleanup)
- Modify: `apps/web/src/components/LinkOverlay.tsx` (read flag, gate the pointer arg)
- Test: `apps/web/test/store-pointer.test.ts` (new file)
- Test: `apps/web/test/LinkOverlay.test.tsx` (sticky-indicator cases + reset existing pointer test)

**Interfaces:**

- Consumes: `PointerSlice` (existing: `lastScenePointer`, `setLastScenePointer`).
- Produces:
  - `PointerSlice.pointerOverCanvas: boolean` (default `false`).
  - `PointerSlice.setPointerOverCanvas: (v: boolean) => void`.
  - `useDrawingDriver` registers `pointerenter` → `setPointerOverCanvas(true)` and `pointerleave` → `setPointerOverCanvas(false)` on `canvas`.

- [ ] **Step 1: Write the failing pointer-slice test**

Create `apps/web/test/store-pointer.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest"
import { useAppStore } from "../src/store"

describe("pointerSlice — pointerOverCanvas", () => {
  beforeEach(() => useAppStore.getState().setPointerOverCanvas(false))

  it("defaults to false", () => {
    expect(useAppStore.getState().pointerOverCanvas).toBe(false)
  })

  it("setPointerOverCanvas toggles the flag", () => {
    useAppStore.getState().setPointerOverCanvas(true)
    expect(useAppStore.getState().pointerOverCanvas).toBe(true)
    useAppStore.getState().setPointerOverCanvas(false)
    expect(useAppStore.getState().pointerOverCanvas).toBe(false)
  })

  it("leaves lastScenePointer untouched", () => {
    useAppStore.getState().setLastScenePointer({ x: 1, y: 2 })
    useAppStore.getState().setPointerOverCanvas(true)
    expect(useAppStore.getState().lastScenePointer).toEqual({ x: 1, y: 2 })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd /home/sung/excalidraw-clone/.worktrees/hyperlinks-polish && pnpm --filter web test -- store-pointer.test.ts`
Expected: FAIL — `setPointerOverCanvas is not a function`.

- [ ] **Step 3: Add the field and setter to the pointer slice**

Replace `apps/web/src/store/slices/pointer.ts` in full:

```ts
import type { StateCreator } from "zustand"

export interface PointerSlice {
  lastScenePointer: { x: number; y: number } | null
  setLastScenePointer: (p: { x: number; y: number }) => void
  /** True while the OS pointer is physically over the canvas element. Distinct
   *  from `lastScenePointer` (a sticky last-known scene coordinate used for
   *  paste-at-cursor): this clears the moment the pointer leaves the canvas, so
   *  the hover link indicator does not linger. */
  pointerOverCanvas: boolean
  setPointerOverCanvas: (v: boolean) => void
}

export const createPointerSlice: StateCreator<PointerSlice, [], [], PointerSlice> = (set) => ({
  lastScenePointer: null,
  setLastScenePointer: (p) => set({ lastScenePointer: p }),
  pointerOverCanvas: false,
  setPointerOverCanvas: (v) => set({ pointerOverCanvas: v }),
})
```

- [ ] **Step 4: Run the pointer-slice test to verify it passes**

Run: `cd /home/sung/excalidraw-clone/.worktrees/hyperlinks-polish && pnpm --filter web test -- store-pointer.test.ts`
Expected: PASS.

- [ ] **Step 5: Register the enter/leave listeners in `useDrawingDriver`**

In `apps/web/src/driver/useDrawingDriver.ts`, inside the effect, next to the other named handlers (after `onContextMenu`, before the `canvas.addEventListener(...)` block), add:

```ts
const onPointerEnter = (): void => useAppStore.getState().setPointerOverCanvas(true)
const onPointerLeave = (): void => useAppStore.getState().setPointerOverCanvas(false)
```

In the registration block, add alongside the existing `canvas.addEventListener` calls:

```ts
canvas.addEventListener("pointerenter", onPointerEnter)
canvas.addEventListener("pointerleave", onPointerLeave)
```

In the cleanup `return () => { ... }`, add alongside the matching `removeEventListener` calls:

```ts
canvas.removeEventListener("pointerenter", onPointerEnter)
canvas.removeEventListener("pointerleave", onPointerLeave)
```

- [ ] **Step 6: Write the failing LinkOverlay sticky-indicator tests**

In `apps/web/test/LinkOverlay.test.tsx`:

Add `setPointerOverCanvas(false)` to `beforeEach` (right after the `lastScenePointer` reset):

```ts
useAppStore.getState().setPointerOverCanvas(false)
```

Update the existing test `"falls back to the linked element under the last scene pointer"` to opt in explicitly — add, right after the `useAppStore.setState({ lastScenePointer: { x: 50, y: 50 } })` line:

```ts
useAppStore.getState().setPointerOverCanvas(true)
```

Add two new cases to `describe("LinkOverlay — indicator mode")`:

```ts
it("hides the pointer-fallback indicator once the pointer has left the canvas", () => {
  const scene = new Scene()
  const rect = { ...newRectangle({ x: 0, y: 0, width: 100, height: 100 }), link: "https://a.com" }
  scene.mutate((d) => d.push(rect))
  useAppStore.setState({ lastScenePointer: { x: 50, y: 50 } })
  useAppStore.getState().setPointerOverCanvas(false)

  const { container } = renderOverlay(scene)

  expect(container.querySelector('[data-testid="link-indicator"]')).toBeNull()
})

it("shows the pointer-fallback indicator while the pointer is over the canvas", () => {
  const scene = new Scene()
  const rect = { ...newRectangle({ x: 0, y: 0, width: 100, height: 100 }), link: "https://a.com" }
  scene.mutate((d) => d.push(rect))
  useAppStore.setState({ lastScenePointer: { x: 50, y: 50 } })
  useAppStore.getState().setPointerOverCanvas(true)

  renderOverlay(scene)

  expect(screen.getByTestId("link-indicator")).toBeDefined()
})
```

- [ ] **Step 7: Run the LinkOverlay suite to verify the new cases fail**

Run: `cd /home/sung/excalidraw-clone/.worktrees/hyperlinks-polish && pnpm --filter web test -- LinkOverlay.test.tsx`
Expected: FAIL — `"hides the pointer-fallback indicator once the pointer has left the canvas"` fails (the indicator still renders; the flag is not read yet).

- [ ] **Step 8: Gate the pointer argument in `LinkOverlay`**

In `apps/web/src/components/LinkOverlay.tsx`, add a store read next to the others:

```ts
const pointerOverCanvas = useAppStore((s) => s.pointerOverCanvas)
```

Change the `pickLinkIndicatorTarget` call from:

```ts
const target = pickLinkIndicatorTarget(scene.getElements(), selectedIds, lastScenePointer)
```

to:

```ts
const target = pickLinkIndicatorTarget(
  scene.getElements(),
  selectedIds,
  pointerOverCanvas ? lastScenePointer : null,
)
```

(`pickLinkIndicatorTarget`'s signature is unchanged — the caller just passes `null` when the pointer is off-canvas.)

- [ ] **Step 9: Run the LinkOverlay + pointer suites to verify they pass**

Run: `cd /home/sung/excalidraw-clone/.worktrees/hyperlinks-polish && pnpm --filter web test -- LinkOverlay.test.tsx store-pointer.test.ts`
Expected: PASS (including the updated `"falls back to the linked element under the last scene pointer"`).

- [ ] **Step 10: Typecheck the web package**

Run: `cd /home/sung/excalidraw-clone/.worktrees/hyperlinks-polish && pnpm turbo run typecheck --filter web`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
cd /home/sung/excalidraw-clone/.worktrees/hyperlinks-polish
git add apps/web/src/store/slices/pointer.ts apps/web/src/driver/useDrawingDriver.ts apps/web/src/components/LinkOverlay.tsx apps/web/test/store-pointer.test.ts apps/web/test/LinkOverlay.test.tsx
git commit -m "web: add pointerOverCanvas flag; stop sticky hover link indicator"
```

---

### Task 3: Exclude locked elements from `Cmd/Ctrl+K` (Fix 3)

`attachShortcuts`' `Cmd/Ctrl+K` branch opens the link editor for the sole selected id without checking whether that element is locked. A locked element can still be the sole selection (e.g. via the Layers panel), and editing its link contradicts the lock. `scene` is already in the handler's closure. Guard on a real scene element that is not `locked`.

**Files:**

- Modify: `apps/web/src/keyboard/shortcuts.ts:118-123` (the `isMeta && key === "k"` branch)
- Test: `apps/web/test/keyboard-shortcuts.test.ts` (rewrite the two existing `Cmd+K` cases to use real scene elements; add a locked-element case)

**Interfaces:**

- Consumes: `scene.getElements()` (existing `Scene` API), `useAppStore.getState().selectedIds`, `setLinkEditorElementId(id: string | null)`.
- Produces: no new exports. Behavior: `Cmd/Ctrl+K` calls `setLinkEditorElementId(el.id)` only when `ids.length === 1` **and** `scene.getElements().find((x) => x.id === ids[0])` returns an element with `locked === false`.

- [ ] **Step 1: Rewrite the existing `Cmd+K` tests and add the locked case**

In `apps/web/test/keyboard-shortcuts.test.ts`, the suite already imports `newRectangle` and builds a `scene` per test via `beforeEach`. Replace the existing test `"Cmd+K opens the link editor for a single selected element"` with:

```ts
it("Cmd+K opens the link editor for a single selected unlocked element", () => {
  useAppStore.getState().setLinkEditorElementId(null)
  const r = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
  scene.mutate((draft) => {
    draft.push(r)
  })
  useAppStore.getState().setSelection([r.id])
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))
  expect(useAppStore.getState().linkEditorElementId).toBe(r.id)
})
```

Replace the existing test `"Cmd+K with a multi-selection is a no-op"` with:

```ts
it("Cmd+K with a multi-selection is a no-op", () => {
  useAppStore.getState().setLinkEditorElementId(null)
  const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
  const b = newRectangle({ x: 20, y: 0, width: 10, height: 10 })
  scene.mutate((draft) => {
    draft.push(a, b)
  })
  useAppStore.getState().setSelection([a.id, b.id])
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))
  expect(useAppStore.getState().linkEditorElementId).toBeNull()
})
```

Add a new test immediately after it:

```ts
it("Cmd+K on a locked element is a no-op", () => {
  useAppStore.getState().setLinkEditorElementId(null)
  const r = { ...newRectangle({ x: 0, y: 0, width: 10, height: 10 }), locked: true }
  scene.mutate((draft) => {
    draft.push(r)
  })
  useAppStore.getState().setSelection([r.id])
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))
  expect(useAppStore.getState().linkEditorElementId).toBeNull()
})
```

- [ ] **Step 2: Run the keyboard suite to verify the new/changed tests fail**

Run: `cd /home/sung/excalidraw-clone/.worktrees/hyperlinks-polish && pnpm --filter web test -- keyboard-shortcuts.test.ts`
Expected: FAIL — `"Cmd+K on a locked element is a no-op"` fails (handler still sets the id regardless of `locked`).

- [ ] **Step 3: Add the locked-element guard**

In `apps/web/src/keyboard/shortcuts.ts`, replace the `Cmd/Ctrl+K` branch:

```ts
if (isMeta && key === "k") {
  e.preventDefault()
  const ids = useAppStore.getState().selectedIds
  if (ids.length === 1) useAppStore.getState().setLinkEditorElementId(ids[0]!)
  return
}
```

with:

```ts
if (isMeta && key === "k") {
  e.preventDefault()
  const ids = useAppStore.getState().selectedIds
  if (ids.length === 1) {
    const el = scene.getElements().find((x) => x.id === ids[0])
    if (el && !el.locked) useAppStore.getState().setLinkEditorElementId(el.id)
  }
  return
}
```

- [ ] **Step 4: Run the keyboard suite to verify it passes**

Run: `cd /home/sung/excalidraw-clone/.worktrees/hyperlinks-polish && pnpm --filter web test -- keyboard-shortcuts.test.ts`
Expected: PASS (all cases, including the rewritten `Cmd+K` pair).

- [ ] **Step 5: Typecheck the web package**

Run: `cd /home/sung/excalidraw-clone/.worktrees/hyperlinks-polish && pnpm turbo run typecheck --filter web`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /home/sung/excalidraw-clone/.worktrees/hyperlinks-polish
git add apps/web/src/keyboard/shortcuts.ts apps/web/test/keyboard-shortcuts.test.ts
git commit -m "web: exclude locked elements from Cmd/Ctrl+K link editor"
```

---

### Task 4: Platform-aware modifier for `Cmd/Ctrl`-click link open (Fix 4)

`useDrawingDriver`'s open-link guard fires on `e.metaKey || e.ctrlKey`. On macOS, `Ctrl`-click is the system secondary (context) click and must not also open the link — only `Cmd`-click should. On non-Apple platforms `Ctrl`-click stays the trigger. One call site, inline check, no shared util. The `Cmd/Ctrl+K` **keyboard** handler and the Help dialog copy ("Cmd/Ctrl+click") are unchanged.

**Files:**

- Modify: `apps/web/src/driver/useDrawingDriver.ts:275` (the `store.activeTool === "selection" && (e.metaKey || e.ctrlKey)` condition in `onPointerDown`)

**Interfaces:**

- Consumes: `navigator.platform`, `PointerEvent.metaKey` / `.ctrlKey`.
- Produces: no exports. Behavior: the link-open guard triggers on `e.metaKey` when `navigator.platform` matches `/Mac|iPhone|iPad|iPod/`, else on `e.ctrlKey`.

- [ ] **Step 1: Make the guard platform-aware**

In `apps/web/src/driver/useDrawingDriver.ts`, in `onPointerDown`, replace:

```ts
      // Cmd/Ctrl-click on a linked element opens its link (selection tool only,
      // so drawing-tool modifier behavior is untouched; Cmd/Ctrl is otherwise
      // just "bypass snap" at drag time and does not change a plain click).
      if (store.activeTool === "selection" && (e.metaKey || e.ctrlKey)) {
```

with:

```ts
      // Cmd/Ctrl-click on a linked element opens its link (selection tool only,
      // so drawing-tool modifier behavior is untouched; Cmd/Ctrl is otherwise
      // just "bypass snap" at drag time and does not change a plain click).
      // Apple: Ctrl-click is the system secondary click, so require Cmd there;
      // elsewhere require Ctrl.
      const isApple = /Mac|iPhone|iPad|iPod/.test(navigator.platform)
      const openModifier = isApple ? e.metaKey : e.ctrlKey
      if (store.activeTool === "selection" && openModifier) {
```

- [ ] **Step 2: Typecheck the web package**

Run: `cd /home/sung/excalidraw-clone/.worktrees/hyperlinks-polish && pnpm turbo run typecheck --filter web`
Expected: PASS.

- [ ] **Step 3: Run the link e2e spec (unit harness does not cover the driver)**

Run: `cd /home/sung/excalidraw-clone/.worktrees/hyperlinks-polish && pnpm --filter web e2e element-links`
Expected: PASS. The Chromium/Linux runner has `navigator.platform === "Linux x86_64"`, so `isApple` is `false` and the guard stays on `e.ctrlKey` — exactly the path the spec's `"Cmd/Ctrl-click on a linked element opens it in a new tab"` test exercises via `ControlOrMeta` (→ `Control` on Linux).

- [ ] **Step 4: Commit**

```bash
cd /home/sung/excalidraw-clone/.worktrees/hyperlinks-polish
git add apps/web/src/driver/useDrawingDriver.ts
git commit -m "web: platform-aware modifier for Cmd/Ctrl+click link open"
```

---

### Task 5: Full gate

Run the complete gate from inside the worktree and fix any fallout before the tree is considered done.

**Files:** none (verification only).

- [ ] **Step 1: Typecheck + lint + unit tests across the monorepo**

Run: `cd /home/sung/excalidraw-clone/.worktrees/hyperlinks-polish && pnpm turbo run typecheck lint test`
Expected: PASS for every package. If lint output cites paths from a different worktree, re-run `pnpm turbo run lint --force` and confirm.

- [ ] **Step 2: Full e2e suite**

Run: `cd /home/sung/excalidraw-clone/.worktrees/hyperlinks-polish && pnpm --filter web e2e`
Expected: PASS — `apps/web/e2e/element-links.spec.ts` unchanged and green, no regressions elsewhere.

- [ ] **Step 3: Confirm the diff scope**

Run: `cd /home/sung/excalidraw-clone/.worktrees/hyperlinks-polish && git diff --stat develop...HEAD`
Expected: only these files changed — `apps/web/src/driver/link.ts`, `apps/web/src/components/LinkOverlay.tsx`, `apps/web/src/store/slices/pointer.ts`, `apps/web/src/driver/useDrawingDriver.ts`, `apps/web/src/keyboard/shortcuts.ts`, `apps/web/test/link.test.ts`, `apps/web/test/LinkOverlay.test.tsx`, `apps/web/test/store-pointer.test.ts`, `apps/web/test/keyboard-shortcuts.test.ts`, and this plan doc. No change to `clipboard.ts` or `element-links.spec.ts`.

- [ ] **Step 4: Commit (only if Steps 1–2 required fixes)**

```bash
cd /home/sung/excalidraw-clone/.worktrees/hyperlinks-polish
git add -A
git commit -m "web: full-gate fixes for hyperlinks polish pass"
```

If Steps 1–2 were green with no edits, skip this commit.

---

## Self-Review

### Spec coverage

| #   | Approved fix                                                                                                                                                 | Task                                | Notes                                                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Viewport-clamp the popover & indicator (`LinkOverlay.tsx`); named constants; flip-below when above is negative; clamp `left`; no true scroll-into-view       | Task 1                              | `clampLinkOverlayPos` + 5 constants in `link.ts`; both render branches rewired; helper unit-tested in `link.test.ts`, wiring asserted via inline `style` in `LinkOverlay.test.tsx` |
| 2   | Sticky hover indicator — separate `pointerOverCanvas` flag; `lastScenePointer` meaning preserved; `clipboard.ts` untouched; helper signature unchanged       | Task 2                              | Field+setter on `PointerSlice`; `pointerenter`/`pointerleave` in `useDrawingDriver`; `LinkOverlay` passes `pointerOverCanvas ? lastScenePointer : null`                            |
| 3   | `Cmd/Ctrl+K` on a locked element is a no-op (`shortcuts.ts`); existing `Cmd+K` tests kept passing                                                            | Task 3                              | `scene.getElements().find(...)` + `!el.locked` guard; two existing tests rewritten to use real scene elements, locked case added                                                   |
| 4   | Platform-aware `Cmd/Ctrl`-click (`useDrawingDriver.ts` only); inline `navigator.platform` check; keyboard `Cmd/Ctrl+K` and Help copy untouched               | Task 4                              | `isApple ? e.metaKey : e.ctrlKey`; verified by typecheck + `element-links` e2e (Linux path unchanged)                                                                              |
| 5   | Dead `title` fallback (`LinkOverlay.tsx`) → `sanitizeLinkHref(target.link) ?? ""`                                                                            | Task 1, Step 7                      | Folded into the Fix 1 commit per sequencing guidance                                                                                                                               |
| —   | Global: no new deps, no schema change, `pickLinkIndicatorTarget` signature unchanged, `clipboard.ts` / e2e spec / `Cmd/Ctrl+K` modifier convention untouched | Global Constraints + Task 5, Step 3 | `git diff --stat` check enumerates the allowed file set                                                                                                                            |

No gaps: every approved fix maps to a task; the final gate task covers verification.

### Placeholder scan

- No "TBD" / "TODO" / "implement later" / "handle edge cases" / "add validation" strings in any step.
- Every code step contains the literal code to write (constants, helper body, JSX edits, full test bodies).
- No "similar to Task N" — Task 1 and Task 2 each restate their own `newRectangle`/scene setup; Task 3 restates each rewritten test in full.
- All referenced identifiers are defined: `clampLinkOverlayPos`, `LINK_EDITOR_WIDTH`, `LINK_INDICATOR_WIDTH`, `LINK_EDITOR_OFFSET`, `LINK_INDICATOR_OFFSET`, `LINK_FLIP_GAP` (Task 1); `pointerOverCanvas`, `setPointerOverCanvas` (Task 2). `newRectangle`, `Scene`, `useAppStore`, `screen`, `cleanup`, `renderOverlay` are pre-existing imports in the touched test files.

### Type consistency

- `clampLinkOverlayPos(natural: { left: number; aboveTop: number; belowTop: number }, width: number, viewportW: number): { left: number; top: number }` — same shape in the `link.ts` definition (Task 1 Step 3), the `link.test.ts` calls (Step 1), and both `LinkOverlay.tsx` call sites (Step 7). Object keys `left` / `aboveTop` / `belowTop` used verbatim everywhere.
- `PointerSlice.pointerOverCanvas: boolean` / `setPointerOverCanvas: (v: boolean) => void` — identical in `pointer.ts` (Task 2 Step 3), `store-pointer.test.ts` (Step 1), `useDrawingDriver.ts` handlers (Step 5), and `LinkOverlay.tsx` selector (Step 8). No competing name (`isPointerOverCanvas`, `pointerOnCanvas`, …) appears.
- `setLinkEditorElementId(id: string | null)` — Task 3 passes `el.id` (a `string`); matches the existing slice signature used by `store-linkEditor.test.ts`.
- `el.locked` is `boolean` (non-optional, `ExcalidrawElementBase`), so `!el.locked` in Task 3 needs no nullish handling; `el.height` is `number` (non-optional), so `el.height * zoom` in Task 1 needs no `?? 0`.
- `pickLinkIndicatorTarget(elements, selectedIds, pointer)` — arity and parameter order unchanged; Task 2 only varies the third argument's value (`null` vs the stored point).

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-09-02-hyperlinks-polish.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
