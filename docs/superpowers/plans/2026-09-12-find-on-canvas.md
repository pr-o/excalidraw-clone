# Find on Canvas (Ctrl/Cmd+F) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Each task is self-contained: write the failing test first, watch it fail, implement the minimum, watch it pass, run the focused gate, commit. Steps use checkbox (`- [ ]`) syntax for tracking. **Do not integrate/merge/push** — branch integration is done by the controller after the final review (see the final task).

**Design source:** approved in-conversation spec (2026-09-12) — search text content across elements on the current page, live as you type, with animated jump-to-match and locked-element-aware selection.

---

## Goal

Add a Ctrl/Cmd+F "Find on canvas" feature:

- Searches `ExcalidrawTextElement.text` (covers free text plus labels bound to shapes/arrows/frames via `containerId`) and `ExcalidrawFrameElement.name` on the **current page only**.
- Case-insensitive substring match, live as you type (the match **count** updates on every keystroke; the camera does **not** animate on every keystroke — only on open and on explicit next/prev).
- A small floating `FindOverlay` in `packages/ui`, mounted by a new `FindHost` in `apps/web`, opened by Ctrl/Cmd+F, closed by Escape or its own close affordance.
- Jump-to-match pans/zooms the view to fit the single matched element, via the existing `fitToContent` + `animateView` + `setView` pipeline (the same one `PresentationHost` already uses).
- Selects the matched element unless it is locked (in which case the view still jumps, selection is left untouched).
- i18n keys in both locales, a `HelpDialog` row, and an e2e test.

## Architecture

### Call 1 — query and match state live in `FindHost` (apps/web), not inside `FindOverlay` (packages/ui)

`CommandPalette` keeps its `query` state **internal** (`useState` inside the component) and filters an already-fully-materialized `commands: PaletteCommand[]` prop — every `label`/`keywords` string is precomputed by `PaletteHost` with no dependency on live scene data beyond what's baked into the closures.

Find is different: what's searchable (`text`/frame `name`) must be **extracted from live `ExcalidrawElement[]`**, and the jump/selection side-effects need the **actual element** (for `getElementBounds` and the `.locked` check), not just a label string. If `FindOverlay` owned `query` internally, `FindHost` would have no way to know what to filter _by_ without either (a) re-implementing the input as a second controlled element, or (b) reading DOM state back out of the child — both worse than just lifting the state.

**Decision:** `FindHost` owns `query` (`useState`) and the derived `matches` (`useMemo`), and passes `FindOverlay` a fully-controlled, presentation-only prop set: `query`, `onQueryChange`, `matchIndex` (1-based, 0 when there are no matches), `matchCount`, `onNext`, `onPrev`, plus `open`/`onClose`/`t` (mirroring `CommandPalette`'s controlled-`open` shape exactly). `FindOverlay` itself stays completely generic — it never imports `@excalidraw-clone/scene`, even though `packages/ui` already depends on that package for other components (`LayersPanel`, `PropertiesPanel`). Note `packages/ui`'s existing precedent actually cuts both ways: `LayersPanel` _does_ take raw `ExcalidrawElement[]` directly because its entire job is rendering one row per element. `FindOverlay` renders no such list (just an input + an "N of M" counter + prev/next buttons per the approved design — no dropdown of results), so there is no rendering task that needs element types, and keeping it generic maximizes reuse of the exact `CommandPalette`-style component-test technique (plain string props, `t = (k) => k` identity translator, no `Scene`/factories needed in `packages/ui/test`).

**Cost if wrong:** low and reversible — if a future need arises for `FindOverlay` to render per-match rows, promoting it to take richer items (à la `LayersPanel`) is a local, additive change to one component's props.

### Call 2 — pure extraction/filtering logic lives in a new `apps/web/src/driver/findMatches.ts`, not inlined in `FindHost` and not inside `packages/ui`

`packages/ui`'s test suite is 100% `@testing-library/react` component tests (`packages/ui/test/*.test.tsx`) — there is no precedent there for a standalone pure-logic `.test.ts` file. `apps/web`, by contrast, has an established "driver module + plain `.test.ts`" convention (`driver/hitTest.ts` + `test/hitTest.test.ts`, `driver/pages.ts`, `driver/renameFrame.ts`, etc.) for exactly this kind of scene-touching pure logic. Since this plan's testing requirements explicitly call for **dedicated unit tests for match-filtering logic** (extraction + case-insensitivity + the locked-element predicate) as a deliverable **separate from** the `FindOverlay` component test, the natural home — matching existing conventions — is a new `apps/web/src/driver/findMatches.ts` with three small pure exports:

```ts
export interface SearchableItem {
  id: string
  label: string
}

export function collectSearchableItems(elements: readonly ExcalidrawElement[]): SearchableItem[]
export function filterMatches(items: readonly SearchableItem[], query: string): SearchableItem[]
export function isSelectableMatch(el: ExcalidrawElement): boolean // !el.locked
```

`collectSearchableItems` extracts `{ id: el.id, label: el.text }` for every non-deleted `text` element with non-blank `text`, and `{ id: el.id, label: el.name }` for every non-deleted `frame` element with a non-blank `name`. `filterMatches` does the case-insensitive substring filter (empty/whitespace query ⇒ `[]`, not "everything" — see Call 3). `isSelectableMatch` is the one-line `!el.locked` predicate, isolated so it has its own direct unit test rather than only being exercised indirectly through a full `FindHost` render — mirroring the same `!el.locked` convention already used in `shortcuts.ts` (Ctrl+A), `ContextMenuHost.tsx` (select-all), and `hitTest.ts`'s `includeLocked` guard.

**Cost if wrong:** low — these are three pure, dependency-free functions; relocating them later (e.g. if `packages/ui` ever grows a plain-`.test.ts` convention) is a pure file move.

### Call 3 — empty query yields zero matches (deviates from `CommandPalette`'s "empty query shows everything")

`CommandPalette`'s `useMemo` returns the **full** `commands` list when `query.trim() === ""`. Doing the analogous thing for Find — showing every text/frame-name element on the page as a "match" the moment the overlay opens with an empty box — would be surprising and not useful (a busy page could have hundreds of labels), and it conflicts with the explicit spec line "No matches: show '0 of 0'" being the natural, unforced empty-query state. **Decision:** `filterMatches` returns `[]` for an empty/whitespace query. This also keeps `FindHost`'s open-with-persisted-query behavior (Call 4) simple: opening on a truly fresh session (empty query, never searched) is a guaranteed no-op instead of a special case to guard against.

### Call 4 — the query (and current match position) persists across close/reopen; jump-on-open re-centers on it

`CommandPalette` resets its query to `""` every time `open` flips true (`useEffect` keyed on `open`). Find deliberately does **not** do this. Ctrl/Cmd+F is explicitly stealing the _native_ browser find shortcut (`e.preventDefault()` in `shortcuts.ts`), and the native browser find bar's own convention — preserving your last search term and re-highlighting/re-scrolling to it when you reopen it in the same tab — is exactly the UX this shortcut choice invites users to expect. It's also the only way the spec's "jump ... on open" wording means anything: if the query always reset to empty on open, "on open" would always be a no-op (0 matches) and the phrase would be redundant with "on next/prev". Concretely: `FindHost` keeps `query`/`matches`/`index` in state that outlives `open` toggling (it's the same mounted `FindHost` instance the whole session, matching `PaletteHost`/`ContextMenuHost` always being mounted), and has an effect keyed on `open` that re-jumps to the current match when `open` flips `false → true` and at least one match exists.

### Call 5 — "first Enter selects match 1, not match 2" (`hasJumpedForQuery` tracking)

Because the camera does not animate on every keystroke (per the approved design), the display counter ("N of M") can show `1 of 2` purely from `filterMatches` + a `0` default index, **before** any jump has happened. If `onNext` naively always computed `(index + 1) % length`, the very first Enter after typing a fresh query would skip straight to match **2**, which is wrong — the first Enter should land on the match already implied by the counter (match 1). `FindHost` tracks this with a ref, reset whenever `query` changes:

```ts
const hasJumpedRef = useRef(false)
useEffect(() => {
  setIndex(0)
  hasJumpedRef.current = false
}, [query])

const advance = (direction: 1 | -1): void => {
  if (matches.length === 0) return
  if (!hasJumpedRef.current) {
    hasJumpedRef.current = true
    jumpTo(index) // show the match the counter already implies, don't skip it
    return
  }
  const next = (index + direction + matches.length) % matches.length
  setIndex(next)
  hasJumpedRef.current = true
  jumpTo(next)
}
const onNext = (): void => advance(1)
const onPrev = (): void => advance(-1)
```

The "jump on open" effect (Call 4) also sets `hasJumpedRef.current = true` after it fires, so a subsequent Enter advances rather than re-showing the same match. This is a small, easy-to-invert-by-accident piece of state-machine logic — it gets its own dedicated test case in Task 5 (do not skip it).

### Call 6 — e2e signal: pixel-sampling for "did it move at all", zoom-percentage readout for "did the _second_ jump go somewhere different"

Both patterns named in the brief were evaluated:

- **Screenshot-diff** (`presentation.spec.ts`'s wheel-drift test, `Buffer.compare`) proves **equality** — "nothing changed." That's the wrong shape of assertion here: Find's whole point is that something _did_ change. Using it would only prove "the two screenshots differ," with no guarantee the animation landed in the _right_ place, and it can't cleanly distinguish "jumped to match 1" from "jumped to match 2" when both jumps center their target in the viewport (see below).
- **`maxChannelIn` pixel-sampling** (`zoom-pan.spec.ts`) is the right tool for "an off-screen element became visible": sample a box at the viewport **center** (not wherever the element originally was) — because `fitToContent` always centers the matched element's bounding box in the viewport, _any_ successful jump renders its target near dead-center, regardless of where it started. This gives a location-independent, coordinate-math-free assertion: sample-before (background only, low channel value) vs. sample-after (element's stroke rendered center-screen, high channel value). Requires the same dark-theme setup `zoom-pan.spec.ts` and `presentation.spec.ts`'s wheel-drift test use (light-theme strokes are invisible against the white background).
- **New for this plan — the `[data-testid="zoom-reset"]` percentage readout** (already used as a DOM assertion target in `zoom-pan.spec.ts`) is used to prove the _second_ jump (cycling to match 2 via Enter) actually moved the camera to a **different** transform than the first jump. Center-box pixel sampling alone can't distinguish "jumped to match 1" from "jumped to match 2" once both are centered — but `fitToContent`'s computed `zoom` depends on the matched element's bounding-box size, so two text labels of deliberately different lengths (hence different auto-sized widths) produce two different `zoom` percentages. Reading the existing zoom widget's text is simpler and less flake-prone than a second round of pixel sampling (no dark-theme dependency, no stroke-rendering timing, just a text assertion already proven reliable in `zoom-pan.spec.ts`), and it directly attests to a changed `ViewTransform` — the exact thing under test.

Task 7 below uses pixel-sampling for the first jump (off-screen → visible, matching the letter of "the viewport visibly moves") and the zoom-percentage readout for the second jump (cycling proof).

## Tech Stack

TypeScript, React 19, Zustand (`create()`, no middleware), Vitest + `@testing-library/react` (unit/component), Playwright (`@playwright/test`, e2e), pnpm workspaces + Turbo. `fitToContent`/`ZOOM_MIN`/`ZOOM_MAX`/`ViewTransform` from `@excalidraw-clone/geometry`; `getElementBounds` from `@excalidraw-clone/scene`; `animateView` from `apps/web/src/presentation/animateView.ts` (reused as-is — it's already a pure, feature-agnostic view-layer helper per its own docstring; no move/rename).

## Global Constraints

- Package manager is **pnpm**; task runner is **Turbo** (`pnpm turbo run <tasks>`, never `npx turbo`).
- **Focused gate per task:** `pnpm turbo run lint typecheck test --filter @excalidraw-clone/web --filter @excalidraw-clone/ui --force`. The web package filter is `@excalidraw-clone/web` (NOT `web`).
- Playwright is invoked as `pnpm exec playwright test` from `apps/web/`. Test import is `@playwright/test`.
- Scene localStorage key is `"excalidraw-scene"`. E2E helpers live in `apps/web/e2e/_helpers.ts` (`dragOnCanvas`, `parseStoredScene`).
- The Zustand store is a module singleton shared across a test file's cases. Reset any slice state you touch (`findOpen`, `selectedIds`, `scrollX`/`scrollY`/`zoom`) in `afterEach`/`beforeEach`, matching the pattern in `apps/web/test/keyboard-shortcuts.test.ts` and `apps/web/test/PresentationHost.test.tsx`.
- Branch is `feat/find-on-canvas` (already created off `main` @ `4ee5166`, currently checked out at `/home/sung/excalidraw-clone` — **do not re-create it, do not create a worktree**).
- Commit after every task with a conventional-commit message.
- **Final task: full monorepo gate + full e2e green, then STOP.** Do NOT integrate/merge/push. Branch integration is the controller's job after the final review.
- Do **not** create `.superpowers/sdd/` ledger files — that's the execution skill's job, not this plan's.

---

### Task 1: `find` Zustand slice

**Files:**

- Create: `apps/web/src/store/slices/find.ts`
- Modify: `apps/web/src/store/index.ts` (wire `FindSlice` into `AppState` + `useAppStore`)
- Create: `apps/web/test/store-find.test.ts`

**Interfaces:**

```ts
// apps/web/src/store/slices/find.ts — exact shape of palette.ts
import type { StateCreator } from "zustand"

export interface FindSlice {
  findOpen: boolean
  setFindOpen: (b: boolean) => void
}

export const createFindSlice: StateCreator<FindSlice, [], [], FindSlice> = (set) => ({
  findOpen: false,
  setFindOpen: (b) => set({ findOpen: b }),
})
```

`store/index.ts`: add `import { createFindSlice, type FindSlice } from "./slices/find"`; add `FindSlice` to the `AppState` intersection type; add `...createFindSlice(...a)` to the `create<AppState>()((...a) => ({ ... }))` object body (append alongside the other slices, order doesn't matter).

**Steps:**

1. - [ ] Write `apps/web/test/store-find.test.ts` (mirror `apps/web/test/store-pointer.test.ts`'s shape): a `describe("findSlice — findOpen")` block asserting `findOpen` defaults to `false`, and `setFindOpen(true)`/`setFindOpen(false)` toggle it. Include a `beforeEach(() => useAppStore.getState().setFindOpen(false))`.
2. - [ ] Run `pnpm --filter @excalidraw-clone/web test -- store-find` — confirm it FAILS (`setFindOpen` doesn't exist yet / `findOpen` is `undefined`).
3. - [ ] Create `apps/web/src/store/slices/find.ts` per the interface above.
4. - [ ] Wire it into `apps/web/src/store/index.ts`.
5. - [ ] Re-run `pnpm --filter @excalidraw-clone/web test -- store-find` — PASSES.
6. - [ ] Focused gate: `pnpm turbo run lint typecheck test --filter @excalidraw-clone/web --filter @excalidraw-clone/ui --force` — green.
7. - [ ] Commit: `feat(web): add findOpen store slice`.

---

### Task 2: Ctrl/Cmd+F opens Find (shortcut wiring only, no search logic yet)

**Files:**

- Modify: `apps/web/src/keyboard/shortcuts.ts`
- Modify: `apps/web/test/keyboard-shortcuts.test.ts`

**Interfaces / changes:**

In `attachShortcuts`'s `handler`, insert a new `isMeta && key === "f"` branch immediately after the existing `isMeta && key === "/"` block (command palette, lines ~152–156) and before the `isMeta && key === "k"` block (line 157):

```ts
if (isMeta && key === "f") {
  e.preventDefault()
  useAppStore.getState().setFindOpen(true)
  return
}
```

This must come before the `TOOL_KEYS[key]` dispatch at the bottom of the handler (it already does, since every branch in the handler `return`s early) — so plain `f` still selects the frame tool while Ctrl/Cmd+F opens Find, exactly like `g`/`a`/`k`/`0` already coexist with their meta-prefixed siblings. `e.preventDefault()` is required to suppress the native browser find bar (this is the whole reason for stealing this shortcut).

**Steps:**

1. - [ ] In `apps/web/test/keyboard-shortcuts.test.ts`, add (near the existing `"Cmd+/ opens command palette"` case):
   ```ts
   it("Cmd+F opens find", () => {
     useAppStore.getState().setFindOpen(false)
     window.dispatchEvent(new KeyboardEvent("keydown", { key: "f", metaKey: true }))
     expect(useAppStore.getState().findOpen).toBe(true)
   })
   ```
   Also add a case confirming plain `f` still selects the frame tool is unaffected: `"'f' switches to frame tool"` (`window.dispatchEvent(new KeyboardEvent("keydown", { key: "f" }))`, expect `activeTool` to be `"frame"`) if no such case already exists in the file (grep first — the file already covers several `TOOL_KEYS` letters; add this one only if missing).
2. - [ ] Run `pnpm --filter @excalidraw-clone/web test -- keyboard-shortcuts` — confirm the new Cmd+F case FAILS.
3. - [ ] Add the `isMeta && key === "f"` branch to `shortcuts.ts` at the location specified above.
4. - [ ] Re-run — PASSES; all pre-existing cases in the file still PASS (in particular, plain `f` still hits `TOOL_KEYS`).
5. - [ ] Focused gate: `pnpm turbo run lint typecheck test --filter @excalidraw-clone/web --filter @excalidraw-clone/ui --force` — green.
6. - [ ] Commit: `feat(web): wire Cmd/Ctrl+F to open find`.

---

### Task 3: pure match-filtering logic (`findMatches.ts`)

**Files:**

- Create: `apps/web/src/driver/findMatches.ts`
- Create: `apps/web/test/findMatches.test.ts`

**Interfaces:** see Architecture Call 2 for the full signatures (`SearchableItem`, `collectSearchableItems`, `filterMatches`, `isSelectableMatch`). Use `newText`, `newFrame`, `newRectangle` factories from `@excalidraw-clone/scene` (already used this way in `apps/web/test/keyboard-shortcuts.test.ts`) to build fixtures; locked elements can be constructed with an object-spread override, e.g. `{ ...newRectangle({ x: 0, y: 0 }), locked: true }`.

**Steps:**

1. - [ ] Write `apps/web/test/findMatches.test.ts` covering, at minimum:
   - `collectSearchableItems`: a `text` element's `.text` is included; a `frame`'s non-null `.name` is included; a `frame` with `name: null` is excluded; a `text` element with `text: ""` (or whitespace-only) is excluded; a non-text/non-frame element (e.g. `rectangle`) contributes nothing; a `text` element with `isDeleted: true` is excluded; a bound label (`text` element with a non-null `containerId`) IS included (the design explicitly wants shape/arrow/frame labels searchable — this is automatic since `collectSearchableItems` doesn't look at `containerId` at all, but assert it anyway so the behavior is pinned, not accidental).
   - `filterMatches`: case-insensitive substring match (`"Hello World"` matches query `"hello"`); empty query (`""`) and whitespace-only query (`"   "`) both return `[]`; a query matching nothing returns `[]`; a query matching multiple items returns all of them, preserving input order.
   - `isSelectableMatch`: returns `true` for an unlocked element, `false` for `{ ...el, locked: true }`.
2. - [ ] Run `pnpm --filter @excalidraw-clone/web test -- findMatches` — confirm it FAILS (module doesn't exist).
3. - [ ] Create `apps/web/src/driver/findMatches.ts` implementing the three functions.
4. - [ ] Re-run — PASSES.
5. - [ ] Focused gate: `pnpm turbo run lint typecheck test --filter @excalidraw-clone/web --filter @excalidraw-clone/ui --force` — green.
6. - [ ] Commit: `feat(web): add pure search/filter logic for find-on-canvas`.

---

### Task 4: `FindOverlay` component in `packages/ui`

**Files:**

- Create: `packages/ui/src/FindOverlay.tsx`
- Modify: `packages/ui/src/index.ts` (export `FindOverlay` + `FindOverlayProps`)
- Create: `packages/ui/test/FindOverlay.test.tsx`

**Interfaces:**

```ts
export interface FindOverlayProps {
  t: (key: string) => string
  open: boolean
  onClose: () => void
  query: string
  onQueryChange: (q: string) => void
  matchIndex: number // 1-based; 0 when matchCount is 0
  matchCount: number
  onNext: () => void
  onPrev: () => void
  className?: string
}
```

Render shape (a small floating bar, not a full-screen modal like `CommandPalette` — there's no backdrop, since Find must let the canvas underneath stay interactive/visible while open):

- `if (!open) return null`.
- Outer container: `fixed right-4 top-4 z-50 ...` (no `fixed inset-0` backdrop), `role="dialog"`, `aria-label={t("find.title")}`.
- `<input>` — `ref`-focused on open (mirror `CommandPalette`'s `useEffect(() => { if (open) queueMicrotask(() => inputRef.current?.focus()) }, [open])`, but **without** the `setQuery("")` reset — there is no internal query state to reset; `query` is a controlled prop, per Architecture Call 4, `FindHost` decides whether/when it resets), `value={query}`, `onChange={(e) => onQueryChange(e.target.value)}`, `placeholder={t("find.placeholder")}`, `data-testid="find-input"`, its own `onKeyDown`:
  ```tsx
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "Enter" && e.shiftKey) {
      e.preventDefault()
      onPrev()
    } else if (e.key === "Enter") {
      e.preventDefault()
      onNext()
    } else if (e.key === "Escape") {
      e.preventDefault()
      onClose()
    }
  }
  ```
  This handler lives on the `<input>` only — it must NOT be routed through the global `attachShortcuts` window handler (matches `CommandPalette`'s existing pattern exactly; also, `attachShortcuts` already early-returns whenever `e.target` is an `INPUT`/`TEXTAREA`, so this is the only way Enter/Escape reach Find while it's focused).
- Counter, `data-testid="find-counter"`: text content is `${matchCount === 0 ? 0 : matchIndex} of ${matchCount}` (so `"0 of 0"` when there are no matches, `"1 of 2"` etc. otherwise).
- Prev button: `data-testid="find-prev"`, `aria-label={t("find.prev")}`, `onClick={onPrev}`, `disabled={matchCount === 0}`.
- Next button: `data-testid="find-next"`, `aria-label={t("find.next")}`, `onClick={onNext}`, `disabled={matchCount === 0}`.

**Steps:**

1. - [ ] Write `packages/ui/test/FindOverlay.test.tsx` mirroring `packages/ui/test/CommandPalette.test.tsx`'s structure (`t = (key) => key` identity translator, `render`/`screen` from `@testing-library/react`, `userEvent` where typing is needed). Cover:
   - renders nothing when `open={false}`.
   - shows the query in the input, and the counter text, when open (`matchIndex={1} matchCount={2}` → `"1 of 2"`; `matchIndex={0} matchCount={0}` → `"0 of 0"`).
   - typing into the input calls `onQueryChange` with the new value (does NOT filter internally — there's nothing to filter, the parent owns that).
   - `Enter` calls `onNext` (and not `onPrev`); `Shift+Enter` calls `onPrev` (and not `onNext`).
   - `Escape` calls `onClose`.
   - clicking the next/prev buttons calls `onNext`/`onPrev` respectively.
   - next/prev buttons are `disabled` when `matchCount={0}`.
2. - [ ] Run `pnpm --filter @excalidraw-clone/ui test -- FindOverlay` — confirm it FAILS (component doesn't exist).
3. - [ ] Create `packages/ui/src/FindOverlay.tsx` per the interfaces/render shape above.
4. - [ ] Add `export { FindOverlay, type FindOverlayProps } from "./FindOverlay"` to `packages/ui/src/index.ts` (append after the last export block, same convention as every other component export there).
5. - [ ] Re-run — PASSES.
6. - [ ] Focused gate: `pnpm turbo run lint typecheck test --filter @excalidraw-clone/web --filter @excalidraw-clone/ui --force` — green.
7. - [ ] Commit: `feat(ui): add FindOverlay component`.

---

### Task 5: `FindHost` — wire scene search, jump-to-match, and locked-aware selection

**Files:**

- Create: `apps/web/src/components/FindHost.tsx`
- Modify: `apps/web/src/components/App.tsx` (mount `<FindHost scene={scene} />`)
- Create: `apps/web/test/FindHost.test.tsx`

**Interfaces:**

```tsx
// apps/web/src/components/FindHost.tsx
"use client"
import { fitToContent } from "@excalidraw-clone/geometry"
import { getElementBounds, type Scene } from "@excalidraw-clone/scene"
import { FindOverlay } from "@excalidraw-clone/ui"
import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { collectSearchableItems, filterMatches, isSelectableMatch } from "../driver/findMatches"
import { useSceneRevision } from "../hooks/useSceneRevision"
import { animateView } from "../presentation/animateView"
import { useAppStore } from "../store"

/** Duration of the camera glide to a matched element. Shorter than
 *  presentation's slide glide (400ms) — this is a "snap to" jump, not a
 *  scripted slide transition. */
const JUMP_ANIMATION_MS = 300

export function FindHost({ scene }: { scene: Scene }): React.ReactElement {
  const { t } = useTranslation()
  const open = useAppStore((s) => s.findOpen)
  const setOpen = useAppStore((s) => s.setFindOpen)
  const sceneRevision = useSceneRevision(scene)

  const [query, setQuery] = useState("")
  const [index, setIndex] = useState(0)
  const hasJumpedRef = useRef(false)
  const cancelRef = useRef<(() => void) | null>(null)

  const items = useMemo(() => collectSearchableItems(scene.getElements()), [scene, sceneRevision])
  const matches = useMemo(() => filterMatches(items, query), [items, query])

  useEffect(() => {
    setIndex(0)
    hasJumpedRef.current = false
  }, [query])

  const clampedIndex = matches.length === 0 ? 0 : Math.min(index, matches.length - 1)

  const jumpTo = (i: number): void => {
    const match = matches[i]
    if (!match) return
    const el = scene.getElements().find((e) => e.id === match.id)
    if (!el) return
    const target = fitToContent(getElementBounds(el), window.innerWidth, window.innerHeight)
    cancelRef.current?.()
    const { scrollX, scrollY, zoom } = useAppStore.getState()
    cancelRef.current = animateView({ scrollX, scrollY, zoom }, target, JUMP_ANIMATION_MS, (v) =>
      useAppStore.getState().setView(v),
    )
    if (isSelectableMatch(el)) useAppStore.getState().setSelection([el.id])
  }

  const advance = (direction: 1 | -1): void => {
    if (matches.length === 0) return
    if (!hasJumpedRef.current) {
      hasJumpedRef.current = true
      jumpTo(clampedIndex)
      return
    }
    const next = (clampedIndex + direction + matches.length) % matches.length
    setIndex(next)
    hasJumpedRef.current = true
    jumpTo(next)
  }

  // Re-center on the persisted current match whenever Find (re)opens with an
  // existing query — browser-Ctrl+F parity (Architecture Call 4).
  useEffect(() => {
    if (open && matches.length > 0) {
      hasJumpedRef.current = true
      jumpTo(clampedIndex)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire only on the open transition
  }, [open])

  return (
    <FindOverlay
      t={t}
      open={open}
      onClose={() => setOpen(false)}
      query={query}
      onQueryChange={setQuery}
      matchIndex={matches.length === 0 ? 0 : clampedIndex + 1}
      matchCount={matches.length}
      onNext={() => advance(1)}
      onPrev={() => advance(-1)}
    />
  )
}
```

(This is a fully worked skeleton, not a mandate to transcribe verbatim — reconcile it against whatever `findMatches.ts`/`FindOverlay` signatures actually landed in Tasks 3–4, and against `react-hooks/exhaustive-deps`'s actual configured severity in this repo before deciding whether the disable comment is needed at all.)

`App.tsx`: add `import { FindHost } from "./FindHost"` alongside the other host imports (~line 77), and mount `<FindHost scene={scene} />` immediately after `<PaletteHost scene={scene} />` (~line 740).

**Steps:**

1. - [ ] Write `apps/web/test/FindHost.test.tsx`, mirroring `apps/web/test/PresentationHost.test.tsx`'s rAF-stubbing setup (`vi.stubGlobal("requestAnimationFrame", (cb) => { cb(performance.now() + 10_000); return 1 })` so `animateView` lands on its final frame synchronously; `vi.stubGlobal("cancelAnimationFrame", () => {})`; `vi.unstubAllGlobals()` in `afterEach`) and its `expectViewToBe`/`currentView` helper style. Build a `Scene` with `newText`/`newFrame`/`newRectangle` fixtures. Cover:
   - typing a query that matches one text element updates the counter (`find-counter` text) but does **not** change `useAppStore.getState()`'s `scrollX`/`scrollY`/`zoom` (no jump on keystroke).
   - pressing `find-next` (or dispatching Enter on the input) jumps the view to `fitToContent(getElementBounds(match), window.innerWidth, window.innerHeight)` for the **first** match (Architecture Call 5 — assert this is match 1, not match 2, on the very first Enter with 2+ matches available) and calls `setSelection([match.id])`.
   - the matched element is **locked**: pressing next still jumps the view but `selectedIds` is left untouched (seed a pre-existing selection, assert it survives the jump).
   - a second `find-next` press (two total) with 2 matches advances to match 2, and `setSelection` reflects the new match.
   - `find-prev` cycles backward with wraparound (from match 1, prev goes to the last match).
   - closing Find (`onClose`) and reopening it with the same query re-jumps to the currently-tracked match (Architecture Call 4) without requiring another keystroke.
2. - [ ] Run `pnpm --filter @excalidraw-clone/web test -- FindHost` — confirm the new cases FAIL (component doesn't exist).
3. - [ ] Create `apps/web/src/components/FindHost.tsx` per the skeleton above (adjust as needed to satisfy the tests written in step 1 — the skeleton is a strong starting point, not gospel).
4. - [ ] Mount `<FindHost scene={scene} />` in `App.tsx`.
5. - [ ] Re-run `pnpm --filter @excalidraw-clone/web test -- FindHost` — PASSES.
6. - [ ] Focused gate: `pnpm turbo run lint typecheck test --filter @excalidraw-clone/web --filter @excalidraw-clone/ui --force` — green.
7. - [ ] Commit: `feat(web): wire FindHost — jump-to-match, locked-aware selection, mount in App`.

---

### Task 6: i18n keys + `HelpDialog` row

**Files:**

- Modify: `apps/web/src/locales/en/shortcuts.json`, `apps/web/src/locales/ko/shortcuts.json`
- Modify: `apps/web/src/locales/en/common.json`, `apps/web/src/locales/ko/common.json`
- Modify: `packages/ui/src/HelpDialog.tsx`
- Modify: `apps/web/test/i18n-shortcuts.test.tsx`

**Interfaces / changes:**

- `en/shortcuts.json`: add `"find": "Find on canvas"` (insert after `"commandPalette": "Command palette",` for locality with the other view-shortcut labels).
- `ko/shortcuts.json`: add `"find": "캔버스에서 찾기"` at the same position.
- `en/common.json`: add a new top-level block, mirroring the existing `"palette"` block's shape:
  ```json
  "find": {
    "title": "Find on canvas",
    "placeholder": "Find on canvas…",
    "prev": "Previous match",
    "next": "Next match"
  }
  ```
- `ko/common.json`:
  ```json
  "find": {
    "title": "캔버스에서 찾기",
    "placeholder": "캔버스에서 찾기…",
    "prev": "이전 검색 결과",
    "next": "다음 검색 결과"
  }
  ```
- `packages/ui/src/HelpDialog.tsx`: add `{ keys: "Cmd/Ctrl+F", label: "shortcuts:find" }` to `VIEW_SHORTCUTS`, immediately after the `{ keys: "Cmd/Ctrl+/", label: "shortcuts:commandPalette" }` entry (line ~58).
- `apps/web/test/i18n-shortcuts.test.tsx`: add `expect(screen.getByText("Find on canvas")).toBeDefined()` alongside the other `getByText` assertions (the file's existing `expect(screen.queryByText(/^shortcuts\./)).toBeNull()` line at the end already guards against a raw-key leak for the new row — no change needed there).

**Steps:**

1. - [ ] Add the assertion to `apps/web/test/i18n-shortcuts.test.tsx` first.
2. - [ ] Run `pnpm --filter @excalidraw-clone/web test -- i18n-shortcuts` — confirm it FAILS (`"Find on canvas"` isn't rendered yet).
3. - [ ] Add the `shortcuts.json` keys (en + ko).
4. - [ ] Add the `HelpDialog.tsx` `VIEW_SHORTCUTS` entry.
5. - [ ] Add the `common.json` `find` blocks (en + ko) — not exercised by this particular test, but needed before Task 5's `FindHost`/`FindOverlay` wiring can show real strings instead of raw keys; landing them here keeps all locale work in one task.
6. - [ ] Re-run `pnpm --filter @excalidraw-clone/web test -- i18n-shortcuts` — PASSES.
7. - [ ] Run the full `HelpDialog.test.tsx` in `packages/ui` too (`pnpm --filter @excalidraw-clone/ui test -- HelpDialog`) — still green (no regressions from the new row).
8. - [ ] Focused gate: `pnpm turbo run lint typecheck test --filter @excalidraw-clone/web --filter @excalidraw-clone/ui --force` — green.
9. - [ ] Commit: `feat(web,ui): add find-on-canvas i18n strings and HelpDialog entry`.

---

### Task 7: e2e — Ctrl+F finds an off-screen text element and cycling advances again

**Files:**

- Create: `apps/web/e2e/find.spec.ts`

**Interfaces / changes:** none in `apps/web/src`. Pure e2e, reusing `dragOnCanvas`/`parseStoredScene` from `_helpers.ts` where useful, plus the `maxChannelIn` pixel-sampling helper (port it from `zoom-pan.spec.ts`, same as `presentation.spec.ts`'s wheel-drift test did) and the `[data-testid="zoom-reset"]` percentage readout (see Architecture Call 6 for why both signals are used).

**Steps:**

1. - [ ] Add `apps/web/e2e/find.spec.ts`:

   ```ts
   import { expect, test, type Page } from "@playwright/test"

   const maxChannelIn = async (
     page: Page,
     x: number,
     y: number,
     w: number,
     h: number,
   ): Promise<number> =>
     page.evaluate(
       ([rx, ry, rw, rh]) => {
         const c = document.querySelector("canvas")!
         const ctx = c.getContext("2d")!
         const d = ctx.getImageData(rx!, ry!, rw!, rh!).data
         let max = 0
         for (let i = 0; i < d.length; i += 4) max = Math.max(max, d[i]!, d[i + 1]!, d[i + 2]!)
         return max
       },
       [x, y, w, h],
     )

   const setDarkTheme = async (page: Page): Promise<void> => {
     await page.locator('button[aria-label="Menu"]').click()
     await page.locator('[data-testid="theme-dark"]').click()
     await page.waitForTimeout(300)
   }

   const typeTextAt = async (
     page: Page,
     at: { x: number; y: number },
     text: string,
   ): Promise<void> => {
     await page.locator('[data-testid="toolbar-text"]').click()
     const canvas = page.locator("canvas").first()
     const box = await canvas.boundingBox()
     if (!box) throw new Error("canvas not found")
     await page.mouse.click(box.x + at.x, box.y + at.y)
     const editor = page.locator("textarea")
     await editor.waitFor({ state: "visible" })
     await editor.fill(text)
     await page.mouse.click(box.x + 20, box.y + box.height - 20) // blur elsewhere, commits
     await page.waitForTimeout(200)
   }

   const panAway = async (page: Page): Promise<void> => {
     const canvas = page.locator("canvas").first()
     const box = await canvas.boundingBox()
     if (!box) throw new Error("canvas not found")
     await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
     for (let i = 0; i < 4; i += 1) await page.mouse.wheel(1200, 1200)
     await page.waitForTimeout(200)
   }

   const zoomPercent = (page: Page) => page.locator('[data-testid="zoom-reset"]')

   test("Ctrl+F finds an off-screen text element and cycling to a second match moves the view again", async ({
     page,
   }) => {
     await page.goto("/")
     await page.evaluate(() => localStorage.clear())
     await page.reload()
     await page.locator('[data-testid="toolbar-text"]').waitFor({ state: "visible" })
     await setDarkTheme(page)

     // Two matches, deliberately different label lengths (see Architecture
     // Call 6) so fitToContent computes two different zoom levels.
     await typeTextAt(page, { x: 150, y: 120 }, "findtarget-one")
     await typeTextAt(page, { x: 500, y: 400 }, "findtarget-two-has-a-much-longer-label")
     await page.locator('[data-testid="toolbar-selection"]').click()

     // Pan far enough that neither element (nor the viewport center) shows anything.
     await panAway(page)
     const canvas = page.locator("canvas").first()
     const box = await canvas.boundingBox()
     if (!box) throw new Error("canvas not found")
     const cx = box.width / 2 - 30
     const cy = box.height / 2 - 15
     const before = await maxChannelIn(page, cx, cy, 60, 30)
     expect(before).toBeLessThan(50)

     // Open find, search, and jump to the first match.
     await page.keyboard.down("Control")
     await page.keyboard.press("f")
     await page.keyboard.up("Control")
     await page.locator('[data-testid="find-input"]').fill("findtarget")
     await expect(page.locator('[data-testid="find-counter"]')).toHaveText("1 of 2")

     await page.keyboard.press("Enter")
     await page.waitForTimeout(400) // let the 300ms jump animation settle

     const afterFirstJump = await maxChannelIn(page, cx, cy, 60, 30)
     expect(afterFirstJump).toBeGreaterThan(before)
     const zoomAfterFirst = await zoomPercent(page).textContent()

     // Cycle to the second (differently-sized) match — the view moves again.
     await page.keyboard.press("Enter")
     await expect(page.locator('[data-testid="find-counter"]')).toHaveText("2 of 2")
     await page.waitForTimeout(400)

     const zoomAfterSecond = await zoomPercent(page).textContent()
     expect(zoomAfterSecond).not.toBe(zoomAfterFirst)

     await page.keyboard.press("Escape")
     await expect(page.locator('[data-testid="find-input"]')).toHaveCount(0)
   })
   ```

   Notes:
   - If `typeTextAt`'s click-to-blur-elsewhere doesn't reliably commit the text (depends on exactly how the text tool's inline editor commits in this codebase — check `TextEditingOverlay.tsx`'s blur/commit path if this flakes), fall back to `editor.blur()` directly, as `sticky-note.spec.ts` does.
   - The `4 × wheel(1200, 1200)` pan magnitude is a starting point — adjust if the default Playwright viewport size makes it insufficient (or excessive) to clear both text elements from view; the invariant that matters is `before < 50` actually holding.
   - If the two matches happen to render close enough together at 100% zoom that panning away doesn't clear both from a single sampled center box, sample two boxes (one at each element's approximate post-jump center is unnecessary — just confirm `before` is a low reading; the exact pre-jump layout only needs to guarantee "nothing bright is at the sample box before any jump").

2. - [ ] From `apps/web/`, run `pnpm exec playwright test find` — confirm it PASSES. If the pixel or zoom-percentage assertions flake, adjust pan magnitude / sample box / wait times as noted above; do not weaken the assertions themselves (no swapping to a `window.__store` hook — see the precedent recorded in `docs/superpowers/plans/2026-09-09-presentation-polish.md`'s Architecture section for why that was rejected).
3. - [ ] Commit: `test(web): e2e — Ctrl+F finds an off-screen element and Enter cycles to a second match`.

---

### Task 8: full gate + full e2e, then STOP

**Files:** none — verification only.

**Steps:**

1. - [ ] From repo root: `pnpm turbo run lint typecheck test build --force` — every package green. Fix any fallout on this branch and re-run until clean.
2. - [ ] From `apps/web/`: `pnpm exec playwright test` — the **entire** suite passes, not just `find.spec.ts`. Pay particular attention to `zoom-pan.spec.ts` and `theme.spec.ts` (both touch the dark-theme toggle and the zoom-percentage readout this plan's e2e test reuses) and `help.spec.ts` (the new `HelpDialog` row).
3. - [ ] If any e2e assertion added in Task 7 flaked in the full run, tighten timing/sampling per the notes there, re-run `pnpm exec playwright test find` and the full suite, and amend with a follow-up commit.
4. - [ ] **STOP.** Do not integrate, merge, push, or delete the branch. Report the final commit SHA, the gate result, and the full e2e result (passed/total). Branch integration is the controller's job after the final review.

---

## Self-Review — coverage map

| Spec requirement                                                                                                                           | Plan coverage                                                                                                                                                                                                  | Test signal                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Search current-page-only text (`ExcalidrawTextElement.text` + `ExcalidrawFrameElement.name`), case-insensitive substring, live as you type | Task 3 (`collectSearchableItems`/`filterMatches`), Task 5 (`FindHost` wires `scene.getElements()` for the active page's `Scene` — cross-page search is out of scope by construction, same as every other Host) | `findMatches.test.ts` unit tests; `FindHost.test.tsx` counter-updates-on-keystroke case                                              |
| `FindOverlay` in `packages/ui` mirroring `CommandPalette`'s controlled `open`/`onClose` + own `onKeyDown`, not through `attachShortcuts`   | Task 4                                                                                                                                                                                                         | `FindOverlay.test.tsx`; Architecture Call 1 explains the one deviation (controlled `query`, not internal)                            |
| Input, "N of M" counter, prev/next controls; Enter = next, Shift+Enter = prev, Escape = close                                              | Task 4                                                                                                                                                                                                         | `FindOverlay.test.tsx` keydown cases                                                                                                 |
| `FindHost` mounted alongside `PaletteHost` et al. in `App.tsx`                                                                             | Task 5                                                                                                                                                                                                         | manual App.tsx diff review + `FindHost.test.tsx`; e2e Task 7 exercises the real mount                                                |
| New `find` Zustand slice, exact shape of `palette.ts`                                                                                      | Task 1                                                                                                                                                                                                         | `store-find.test.ts`                                                                                                                 |
| Ctrl/Cmd+F in `shortcuts.ts`, `preventDefault`, opens Find                                                                                 | Task 2                                                                                                                                                                                                         | `keyboard-shortcuts.test.ts`                                                                                                         |
| Jump via `getElementBounds` + `fitToContent` + `animateView` + `setView`, single matched element's bounds                                  | Task 5                                                                                                                                                                                                         | `FindHost.test.tsx` jump-transform assertions (mirrors `PresentationHost.test.tsx`'s `expectViewToBe` technique)                     |
| Select match unless locked; locked ⇒ still jump, no selection change                                                                       | Task 3 (`isSelectableMatch`) + Task 5 (wiring)                                                                                                                                                                 | `findMatches.test.ts` predicate test; `FindHost.test.tsx` locked-element case                                                        |
| No matches ⇒ "0 of 0", next/prev disabled/no-op                                                                                            | Task 4                                                                                                                                                                                                         | `FindOverlay.test.tsx`                                                                                                               |
| i18n: `shortcuts:find` + overlay strings in both locales                                                                                   | Task 6                                                                                                                                                                                                         | `i18n-shortcuts.test.tsx` real-resolution assertion                                                                                  |
| `HelpDialog` row                                                                                                                           | Task 6                                                                                                                                                                                                         | `HelpDialog.test.tsx` regression run + `i18n-shortcuts.test.tsx`                                                                     |
| e2e: open via Ctrl+F, find an off-screen match, viewport moves; cycling to a second match moves it again                                   | Task 7                                                                                                                                                                                                         | pixel-sampling (first jump) + zoom-percentage readout (second jump) — see Architecture Call 6 for why two different signals are used |
| Full gate + full e2e, no integration                                                                                                       | Task 8                                                                                                                                                                                                         | `pnpm turbo run lint typecheck test build --force` + `pnpm exec playwright test` (whole suite), then STOP                            |

### Flagged — deliberate design choices without a dedicated automated assertion

1. **Query/match-position persistence across close/reopen** (Architecture Call 4) is exercised by one `FindHost.test.tsx` case (re-jump on reopen), but there's no e2e coverage of the close→reopen path specifically — Task 7's e2e test only exercises a single open session. Acceptable: the unit-level coverage is direct and the mechanism (`useState` outliving `open` toggles) is simple enough that a component test is sufficient; adding e2e coverage for it would mostly be re-testing the same `animateView`/`setView` plumbing already covered by the "first jump" assertion.
2. **Cross-page search is explicitly out of scope** (deferred per the approved design) — no test asserts elements on _other_ pages are excluded, because `FindHost` never receives another page's `Scene` in the first place (the same structural guarantee `PaletteHost`/`ContextMenuHost` already rely on). Adding a page-switch test would be testing that `scene` prop threading works, which is already covered elsewhere in the test suite (e.g. `pages.spec.ts`).
