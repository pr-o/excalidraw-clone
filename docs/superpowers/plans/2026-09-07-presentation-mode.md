# Presentation Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Each task is self-contained: write the failing test first, watch it fail, implement the minimum, watch it pass, run focused lint/typecheck, commit. Steps use checkbox (`- [ ]`) syntax for tracking. **Do not integrate/merge/push** — branch integration is done by the controller after the final review (see Task 8).

**Spec:** docs/superpowers/specs/2026-09-07-presentation-mode-design.md

---

## Goal

Let a user step through the frames on the current page as fullscreen slides: the camera animates to fit each frame, arrow keys / space / click advance, Esc exits. The canvas is read-only while presenting, except the laser pointer stays usable as a presentation aid. Entry is a "Start presentation" item in the `HamburgerMenu`, disabled when the active page has no frames.

## Architecture

Presentation is a **transient view-layer mode**. Nothing touches `Scene`, persistence, undo, export, or the `CanvasRenderer`. A new `presentation` Zustand slice holds two flags (`presenting`, `slideIndex`) plus enter/exit/next/prev actions. A `PresentationHost` component is mounted by `App.tsx` **only while `presenting`** — so its mount effect is presentation entry (snapshot viewport, request fullscreen, animate to slide 0) and its cleanup is presentation exit (cancel animation, exit fullscreen, restore the viewport snapshot, reset the tool if it was `laser`). The camera moves purely by calling the existing `store.setView()` with `ViewTransform`s produced by `fitToContent()` and interpolated by a new pure `animateView()` util. Slides are derived from the page scene the same way `App.tsx` already derives `layerElements` — via `useSceneRevision(scene)` — so frames added/removed mid-presentation re-derive and the index is clamped (or auto-exits at zero frames). Read-only is enforced by early-returns in `useDrawingDriver` (`dispatchPointer`, `onWheel`, Space-pan) and a top guard in `attachShortcuts`, with the host's `window` capture-phase key listener swallowing all navigation keys before they reach either.

## Tech Stack

TypeScript, React 19, Zustand (`create()`, no middleware), Vitest + `@testing-library/react` (unit/component), Playwright (`@playwright/test`, e2e), pnpm workspaces + Turbo. Geometry helpers (`fitToContent`, `ViewTransform`, `Bounds`) from `@excalidraw-clone/geometry`.

## Global Constraints

Copied from the spec's "Global constraints for implementation" block, with additions:

- Package manager is **pnpm**; task runner is **Turbo**. Run turbo as `pnpm turbo run <tasks>` (never `npx turbo`). Full gate: `pnpm turbo run lint typecheck test build --force`.
- Playwright is invoked as `pnpm exec playwright test` from `apps/web/` (the CLI is not on PATH). Test import is `@playwright/test`.
- Scene localStorage key is `"excalidraw-scene"`. E2E helpers live in `apps/web/e2e/_helpers.ts` (`dragOnCanvas`, `parseStoredScene` — unwraps the v3 `pages[]` document to the active page's `elements`).
- i18n: **every** key used by a component must exist in **both** `apps/web/src/locales/en/*.json` and `apps/web/src/locales/ko/*.json`, or `apps/web/test/i18n-shortcuts.test.tsx` (and the real-i18n render paths) fail. Add keys to both files in the same task.
- Commit after every task with a conventional-commit message. Branch is `feat/presentation-mode`, created off `develop` (see Task 1, Step 0).
- **Final task (Task 8): full gate + full e2e green, then STOP.** Do NOT integrate/merge/push. Branch integration is done by the controller after the final review, not by this plan.

Additions specific to this feature:

- **Tool reducers / pure-function notes are N/A here** — this feature adds no tool and no scene mutation. The only "pure function" is `animateView` (Task 2), which is DOM/store-free and fake-timer testable.
- The `ViewTransform` type is imported from `@excalidraw-clone/geometry` (`{ readonly scrollX; readonly scrollY; readonly zoom }`); `Bounds` is `{ readonly x; y; width; height }` from the same package. `store.setView(v: ViewTransform)` already exists (`apps/web/src/store/slices/view.ts:18`) and writes `scrollX/scrollY/zoom`.
- The store uses plain `create<AppState>()((...a) => ({...}))` — **no persist middleware**. View state (`scrollX/scrollY/zoom`) is not persisted, and **presentation state must not be persisted either**.
- **DO NOT TOUCH `apps/web/src/driver/autoSave.ts` or `apps/web/src/driver/hydration.ts`.** The `presentation` slice is deliberately absent from the `saveUI`/`loadUI` round-trip (called out again in Task 1). Presentation never survives a reload.
- The Zustand store is a module singleton shared across a test file's cases. Unit/component tests that flip `presenting` must reset it (`useAppStore.getState().exitPresentation()`) in `afterEach`/`beforeEach`.

---

### Task 1: `presentation` store slice + wire into `store/index.ts`

**Files:**

- Create: `apps/web/src/store/slices/presentation.ts`
- Modify: `apps/web/src/store/index.ts` (add to the `AppState` intersection and the `useAppStore` spread)
- Test: `apps/web/test/presentation-slice.test.ts` (new)

**Interfaces:**

```ts
// apps/web/src/store/slices/presentation.ts
import type { StateCreator } from "zustand"

export interface PresentationSlice {
  presenting: boolean
  slideIndex: number
  enterPresentation: () => void
  exitPresentation: () => void
  goToSlide: (i: number) => void // stores i as given; caller clamps
  nextSlide: () => void // slideIndex + 1 (no upper clamp in the slice)
  prevSlide: () => void // Math.max(0, slideIndex - 1)
}

export const createPresentationSlice: StateCreator<PresentationSlice, [], [], PresentationSlice> = (
  set,
) => ({
  presenting: false,
  slideIndex: 0,
  enterPresentation: () => set({ presenting: true, slideIndex: 0 }),
  exitPresentation: () => set({ presenting: false, slideIndex: 0 }),
  goToSlide: (i) => set({ slideIndex: i }),
  nextSlide: () => set((s) => ({ slideIndex: s.slideIndex + 1 })),
  prevSlide: () => set((s) => ({ slideIndex: Math.max(0, s.slideIndex - 1) })),
})
```

- `store/index.ts`: add `PresentationSlice` to the `AppState` type intersection (line 19-34) and `...createPresentationSlice(...a),` to the object literal (line 36-53). Match the existing import style (line 1-17, alphabetical-ish — insert `import { createPresentationSlice, type PresentationSlice } from "./slices/presentation"` between `pointer` and `selection`).
- **Do NOT add anything to `apps/web/src/driver/autoSave.ts` (`saveUI` payload, line 17-25) or `apps/web/src/driver/hydration.ts` (`hydrateUI`, line 19-31).** Presentation state is transient and must never persist or round-trip a reload. Leave both files untouched.

**Steps:**

1. - [ ] **Step 0 (branch setup):** From a clean tree, `git switch develop && git pull --ff-only`, then `git switch -c feat/presentation-mode`. Confirm `git status` is clean and the branch point matches the spec (`develop`).
2. - [ ] Write failing test `apps/web/test/presentation-slice.test.ts` (follow `apps/web/test/store-tool.test.ts` / `store-pointer.test.ts`: import `{ describe, expect, it, beforeEach } from "vitest"`, `{ useAppStore } from "../src/store"`). `beforeEach(() => useAppStore.getState().exitPresentation())`. Cases:
   - defaults: `presenting === false`, `slideIndex === 0`.
   - `enterPresentation()` → `presenting === true`, `slideIndex === 0` (also set `slideIndex` to `3` first via `goToSlide(3)` to prove entry resets it).
   - `nextSlide()` twice from 0 → `slideIndex === 2` (no upper clamp — the slice does not know the count).
   - `prevSlide()` from 0 → stays `0`; from 2 → `1`.
   - `goToSlide(5)` → `slideIndex === 5` (stores as given).
   - `exitPresentation()` after `enterPresentation()` + `nextSlide()` → `presenting === false` and `slideIndex === 0`.
3. - [ ] Run the web unit suite for this file (`pnpm --filter web test -- presentation-slice`) — confirm it FAILS (`enterPresentation` is not a function).
4. - [ ] Implement `apps/web/src/store/slices/presentation.ts` exactly as above.
5. - [ ] Wire into `apps/web/src/store/index.ts` (type intersection + spread + import).
6. - [ ] Re-run the test — confirm it PASSES. Run the full web unit suite (`pnpm --filter web test`) to confirm no store-shape regressions.
7. - [ ] Run `pnpm turbo run lint typecheck --filter web --force` — confirm green.
8. - [ ] **Verify no persistence leak:** `git diff --name-only` must NOT list `autoSave.ts` or `hydration.ts`. `grep -n "presenting\|slideIndex" apps/web/src/driver/autoSave.ts apps/web/src/driver/hydration.ts` must return nothing.
9. - [ ] Commit: `feat(store): presentation slice (presenting + slideIndex + nav actions)`.

---

### Task 2: `animateView` util

**Files:**

- Create: `apps/web/src/presentation/animateView.ts`
- Test: `apps/web/test/animateView.test.ts` (new)

**Interfaces:**

```ts
// apps/web/src/presentation/animateView.ts
import type { ViewTransform } from "@excalidraw-clone/geometry"

export function animateView(
  from: ViewTransform,
  to: ViewTransform,
  durationMs: number,
  onFrame: (v: ViewTransform) => void,
): () => void // returns a cancel fn
```

Behaviour (from spec §2):

- `requestAnimationFrame` loop. Cubic ease-in-out on `t ∈ [0, 1]` where `t = elapsed / durationMs`. Lerp `scrollX`, `scrollY`, `zoom` independently.
- Calls `onFrame` every frame. The final frame is **exactly `to`** (not the interpolated near-value) — when `t >= 1`, emit `onFrame(to)` and stop.
- `durationMs <= 0` → a single synchronous `onFrame(to)`, **no** `requestAnimationFrame` scheduled.
- The returned cancel fn cancels the pending rAF and guarantees no further `onFrame` calls.
- No import of the store, `window`-globals beyond `requestAnimationFrame` / `cancelAnimationFrame` / `performance.now` (or `Date.now`), or DOM. Testable with fake timers + a stubbed `requestAnimationFrame`.

Ease fn: `t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2`.

**Steps:**

1. - [ ] Write failing test `apps/web/test/animateView.test.ts` (`import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"`). Setup: `vi.useFakeTimers()` in `beforeEach`, `vi.useRealTimers()` in `afterEach`. Stub rAF to a controllable clock, e.g.:
   ```ts
   let rafCbs: Array<(t: number) => void> = []
   let now = 0
   vi.stubGlobal("requestAnimationFrame", (cb: (t: number) => void) => {
     rafCbs.push(cb)
     return rafCbs.length
   })
   vi.stubGlobal("cancelAnimationFrame", () => {})
   const flush = (dt: number) => {
     now += dt
     const cbs = rafCbs
     rafCbs = []
     for (const cb of cbs) cb(now)
   }
   ```
   (Also stub `performance.now`/`Date.now` to read `now`, or have the impl accept the frame timestamp passed to the rAF callback — prefer the latter so the impl is timestamp-driven.) Cases:
   - **progress + exact final frame:** `from = { scrollX: 0, scrollY: 0, zoom: 1 }`, `to = { scrollX: 100, scrollY: 200, zoom: 2 }`, `durationMs = 400`. Collect every `onFrame` arg. Advance in ~5 steps of 80ms. Assert: `scrollX` is monotonically non-decreasing across frames; every intermediate frame is strictly between `from` and `to`; the **last** recorded frame `.toEqual(to)` exactly (all three fields).
   - **`durationMs = 0`:** `onFrame` called exactly once, synchronously, with `to`; `requestAnimationFrame` was never called (`rafCbs.length === 0` and the stub spy has 0 calls).
   - **cancel:** start a 400ms animation, flush one 80ms frame (1 `onFrame` call), call the returned cancel fn, flush another 400ms — assert `onFrame` call count did not increase.
2. - [ ] Run `pnpm --filter web test -- animateView` — confirm FAIL (module missing).
3. - [ ] Implement `apps/web/src/presentation/animateView.ts`.
4. - [ ] Re-run — confirm PASS.
5. - [ ] `pnpm turbo run lint typecheck --filter web --force` — green.
6. - [ ] Commit: `feat(web): animateView — cubic ease-in-out ViewTransform interpolation`.

---

### Task 3: `PresentationOverlay` component + `presentation.*` i18n

**Files:**

- Create: `apps/web/src/presentation/PresentationOverlay.tsx`
- Modify: `apps/web/src/locales/en/common.json` (new top-level `presentation` object)
- Modify: `apps/web/src/locales/ko/common.json` (same)
- Test: `apps/web/test/PresentationOverlay.test.tsx` (new)

**Interfaces:**

```ts
export interface PresentationOverlayProps {
  index: number // 0-based
  count: number
  onPrev: () => void
  onNext: () => void
  laserActive: boolean
  onToggleLaser: () => void
  t: (key: string) => string
}
```

- `position: fixed`, bottom-centered, `z-[60]` (above the hidden-chrome layer — chrome uses `z-30`/`z-40`/`z-50`). Themed with existing tokens (`bg-panel`, `text-*`, `hover:bg-panel-hover`), works light + dark.
- Elements:
  - prev button — `data-testid="presentation-prev"`, `aria-label={t("presentation.prev")}`, `disabled={index === 0}`, glyph `‹`, `onClick={onPrev}`.
  - counter — `data-testid="presentation-counter"`, text content exactly `` `${index + 1} / ${count}` ``.
  - next button — `data-testid="presentation-next"`, `aria-label={t("presentation.next")}`, `disabled={index >= count - 1}`, glyph `›`, `onClick={onNext}`.
  - laser toggle — `data-testid="presentation-laser"`, `aria-label={t("presentation.laser")}`, `aria-pressed={laserActive}`, `onClick={onToggleLaser}`.
  - root — `data-testid="presentation-overlay"`.
- Idle-fade: internal `visible` state, `true` on mount; a timer sets it `false` after 3000ms. A `window` `mousemove` and `keydown` listener resets the timer and sets `visible = true`. Apply `opacity` transition + `pointer-events: none` while `!visible` (keep it mounted/visible to the accessibility tree; only visually fade). Clean up timer + listeners on unmount.
- Disabled buttons: rely on the native `disabled` attribute (no bespoke styling contract needed; add `disabled:opacity-40 disabled:pointer-events-none` for polish).

New i18n keys (identical key names in both locales), under a **new top-level `presentation` object** in `common.json` (insert after the `pages` object, i.e. as the last top-level key):

| key     | en                  | ko              |
| ------- | ------------------- | --------------- |
| `prev`  | `Previous slide`    | `이전 슬라이드` |
| `next`  | `Next slide`        | `다음 슬라이드` |
| `laser` | `Laser pointer`     | `레이저 포인터` |
| `exit`  | `Exit presentation` | `발표 종료`     |

(`presentation.exit` is not consumed by the overlay itself but is part of the spec's §9 key set and is used by the host's aria / future affordances — add it now.)

**Steps:**

1. - [ ] Write failing test `apps/web/test/PresentationOverlay.test.tsx` (`import { render, screen } from "@testing-library/react"`, `userEvent`, `{ describe, expect, it, vi } from "vitest"`, identity `t = (k) => k`). Cases:
   - counter text: `index=0 count=3` → `getByTestId("presentation-counter")` has text `"1 / 3"`.
   - prev disabled at index 0: `getByTestId("presentation-prev")` is `disabled`; `next` is enabled.
   - next disabled at last: `index=2 count=3` → `presentation-next` is `disabled`; `prev` enabled.
   - middle slide: `index=1 count=3` → neither disabled.
   - clicks: `userEvent.click` on prev/next/laser fires the matching handler prop (`vi.fn()`).
   - laser aria-pressed: `laserActive={true}` → `presentation-laser` has `aria-pressed="true"`; `false` → `"false"`.
   - testids present: `presentation-overlay`, `-prev`, `-next`, `-counter`, `-laser` all in the document.
2. - [ ] Run `pnpm --filter web test -- PresentationOverlay` — confirm FAIL.
3. - [ ] Implement the component.
4. - [ ] Add the `presentation` object to `apps/web/src/locales/en/common.json` and `apps/web/src/locales/ko/common.json` (last top-level key, after `pages`). Keep 2-space indent + trailing-comma style; add the comma after the now-not-last `pages` object.
5. - [ ] Re-run the component test — PASS.
6. - [ ] Run `pnpm --filter web test -- i18n-shortcuts` (guards en/ko parity of the JSON files) — PASS.
7. - [ ] `pnpm turbo run lint typecheck --filter web --force` — green (also confirms JSON parses).
8. - [ ] Commit: `feat(web): PresentationOverlay (counter, edge-disabled nav, laser toggle, idle fade) + i18n`.

---

### Task 4: `PresentationHost` component

**Files:**

- Create: `apps/web/src/presentation/PresentationHost.tsx`
- Test: `apps/web/test/PresentationHost.test.tsx` (new, RTL)

**Interfaces:**

```ts
import type { Scene } from "@excalidraw-clone/scene"
export interface PresentationHostProps {
  scene: Scene
  rootEl?: HTMLElement | null // the App.tsx <main>; requestFullscreen target
}
```

Behaviour (from spec §3):

- **`slides`** — `const rev = useSceneRevision(scene)` then `const slides = useMemo(() => scene.getElements().filter((e) => e.type === "frame" && !e.isDeleted), [scene, rev])`. This mirrors `App.tsx`'s `layerElements` derivation exactly; do not invent a new subscription.
- **`slideIndex`** read from the store: `const slideIndex = useAppStore((s) => s.slideIndex)`. Actions: `useAppStore.getState().nextSlide()` etc. (or select them).
- **`frameBounds(f)`** = `{ x: f.x, y: f.y, width: f.width, height: f.height }` (frame elements carry `width`/`height` from `ExcalidrawElementBase`).
- **On mount:**
  - Snapshot `{ scrollX, scrollY, zoom }` from `useAppStore.getState()` into a `useRef` (restore target).
  - `void (rootEl ?? document.documentElement).requestFullscreen?.().catch(() => {})`.
  - Animate to `slides[0]` (see below). If `slides.length === 0` on mount, call `exitPresentation()` immediately (defensive — the menu item is disabled in that state, but a race is possible).
- **Camera effect** — `useEffect` keyed on `[slideIndex, slides, viewportSize]`: cancel any in-flight animation (stored in a ref), then
  ```ts
  const target = fitToContent(frameBounds(slides[clamped]), window.innerWidth, window.innerHeight)
  const cur = useAppStore.getState()
  cancelRef.current = animateView(
    { scrollX: cur.scrollX, scrollY: cur.scrollY, zoom: cur.zoom },
    target,
    400,
    (v) => useAppStore.getState().setView(v),
  )
  ```
  where `clamped = Math.min(slideIndex, slides.length - 1)`.
- **Clamp / auto-exit effect** — `useEffect` keyed on `[slides.length, slideIndex]`: if `slides.length === 0` → `exitPresentation()`; else if `slideIndex > slides.length - 1` → `goToSlide(slides.length - 1)`.
- **Keyboard** — `useEffect` adding a `window` `keydown` listener with `{ capture: true }`. For every handled key: `e.stopPropagation()` **and** `e.preventDefault()`, then act. Mapping:
  - next (`nextSlide()`, but only if `slideIndex < slides.length - 1`): `ArrowRight`, `ArrowDown`, `Space`/`" "`, `PageDown`
  - prev (`prevSlide()`): `ArrowLeft`, `ArrowUp`, `PageUp`
  - `Home` → `goToSlide(0)`; `End` → `goToSlide(slides.length - 1)`
  - `Escape` → `exitPresentation()`
  - No wrap: next is a no-op at the last slide, prev floors at 0 (the slice already floors prev).
- **`fullscreenchange` listener** — if `useAppStore.getState().presenting` and `document.fullscreenElement == null` → `exitPresentation()`.
- **`resize` listener** — recompute `fitToContent` for the current slide and `setView` **immediately** (no `animateView`). (Bump a `viewportSize` state so the camera effect also re-runs cleanly, or just call `setView` directly in the handler — direct call is simplest; keep the camera effect keyed on `slideIndex`/`slides` only then.)
- **On unmount / exit (cleanup fn):**
  - cancel in-flight animation (`cancelRef.current?.()`)
  - `if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {})`
  - `useAppStore.getState().setView(snapshotRef.current)` (instant restore)
  - `if (useAppStore.getState().activeTool === "laser") useAppStore.getState().setActiveTool("selection")`
- Renders `<PresentationOverlay index={clamped} count={slides.length} onPrev={...} onNext={...} laserActive={activeTool === "laser"} onToggleLaser={() => setActiveTool(activeTool === "laser" ? "selection" : "laser")} t={t} />`. Get `t` via `useTranslation()`.

**Steps:**

1. - [ ] Write failing test `apps/web/test/PresentationHost.test.tsx` (RTL). Harness:
   - `import { Scene, newFrame } from "@excalidraw-clone/scene"`, `render`, `screen`, `act`, `{ I18nextProvider } from "react-i18next"`, `{ ensureI18n } from "../src/i18n"`, `{ useAppStore } from "../src/store"`.
   - Build a scene with 3 frames: `new Scene([newFrame({ x: 0, y: 0, width: 400, height: 300 }), newFrame({ x: 1000, y: 0, width: 400, height: 300 }), newFrame({ x: 2000, y: 0, width: 400, height: 300 })])`.
   - Mock fullscreen: `HTMLElement.prototype.requestFullscreen = vi.fn().mockResolvedValue(undefined)`, `document.exitFullscreen = vi.fn().mockResolvedValue(undefined)`, and a getter for `document.fullscreenElement` returning `null` (or a mutable let).
   - Stub `requestAnimationFrame` to run synchronously: `vi.stubGlobal("requestAnimationFrame", (cb) => { cb(performance.now()); return 1 })` and `cancelAnimationFrame` to a noop. (With a synchronous rAF, `animateView` completes to `to` in one tick — good enough to assert `setView` was called with the fit transform.)
   - `beforeEach`: `useAppStore.getState().enterPresentation()`; `useAppStore.getState().setView({ scrollX: 7, scrollY: 9, zoom: 1 })` (a distinctive pre-entry snapshot). `afterEach`: `useAppStore.getState().exitPresentation()`.
   - Render `<I18nextProvider i18n={ensureI18n("en")}><PresentationHost scene={scene} rootEl={document.body} /></I18nextProvider>`.
     Cases:
   - **counter:** `getByTestId("presentation-counter")` shows `"1 / 3"`.
   - **ArrowRight advances + drives camera:** dispatch `new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })` on `window` inside `act()`. Counter → `"2 / 3"`. `useAppStore.getState().setView` (spy on it, or read state) was called such that final `zoom`/`scrollX` match `fitToContent(frameBounds(slides[1]), innerW, innerH)` (compute the expected transform in the test and assert `store.scrollX`/`zoom` ≈ it within a small epsilon).
   - **ArrowLeft floors:** from slide 0, dispatch `ArrowLeft` → counter stays `"1 / 3"`.
   - **Escape exits + restores snapshot:** dispatch `Escape` → `useAppStore.getState().presenting === false`; `useAppStore.getState()` view equals the `{ scrollX: 7, scrollY: 9, zoom: 1 }` snapshot. (The parent doesn't unmount the host in this isolated test — assert the cleanup path by unmounting via RTL `unmount()` after `enterPresentation` was reset, OR structure the test so `exitPresentation()` + rerender-less unmount runs cleanup. Simplest: call `unmount()` and assert `setView` was last called with the snapshot.)
   - **all frames deleted auto-exits:** `act(() => scene.mutate((d) => d.forEach((e, i) => (d[i] = { ...e, isDeleted: true }))))` → `useAppStore.getState().presenting === false`.
   - **requestFullscreen attempted on mount:** `expect(document.body.requestFullscreen).toHaveBeenCalled()` (or the prototype spy).
2. - [ ] Run `pnpm --filter web test -- PresentationHost` — confirm FAIL.
3. - [ ] Implement `apps/web/src/presentation/PresentationHost.tsx` per the interface above.
4. - [ ] Re-run — PASS. Run the full web unit suite to check for cross-test store pollution (ensure `afterEach` resets `presenting`).
5. - [ ] `pnpm turbo run lint typecheck --filter web --force` — green.
6. - [ ] Commit: `feat(web): PresentationHost — fullscreen entry, animated per-slide camera, key nav, clamp/auto-exit`.

---

### Task 5: `HamburgerMenu` "Start presentation" item + `menu.*` i18n

**Files:**

- Modify: `packages/ui/src/HamburgerMenu.tsx` (props interface + new menu item)
- Modify: `packages/ui/test/HamburgerMenu.test.tsx` (baseProps + new cases)
- Modify: `apps/web/src/locales/en/common.json` (`menu` object)
- Modify: `apps/web/src/locales/ko/common.json` (`menu` object)

**Interfaces:**

- `HamburgerMenuProps` gains two props (add to the interface, lines 9-27, and to `baseProps()` in the test):
  ```ts
  onStartPresentation: () => void
  canPresent: boolean
  ```
- New menu item, rendered as a `<MenuItem>` immediately **after** the "Export image…" item (`packages/ui/src/HamburgerMenu.tsx:66`), before the `<Separator />` on line 67:
  - `data-testid="menu-presentation"` (add `data-testid` support to the `MenuItem` helper via an optional prop, or inline a `<button role="menuitem">` for this one item — inline is lower-risk).
  - `canPresent === true` → enabled: `onClick={wrap(props.onStartPresentation)}`, label `props.t("menu.presentation")`.
  - `canPresent === false` → disabled: no `onClick` (or `onClick` undefined), `aria-disabled="true"`, `title={props.t("menu.presentationHint")}`, `disabled` attribute, muted styling. **No existing disabled pattern exists in this file** — use `opacity-50 cursor-not-allowed` added to the standard item className, and omit the `onClick`.
  - Same base classes as `MenuItem` (`block w-full rounded px-3 py-2 text-left text-sm hover:bg-panel-hover`), minus the hover when disabled.

New `menu.*` i18n keys (both locales), inserted into the `menu` object after `"export"`:

| key                | en                       | ko                               |
| ------------------ | ------------------------ | -------------------------------- |
| `presentation`     | `Start presentation`     | `발표 시작`                      |
| `presentationHint` | `Add a frame to present` | `발표하려면 프레임을 추가하세요` |

**Steps:**

1. - [ ] Write failing cases in `packages/ui/test/HamburgerMenu.test.tsx`:
   - First, extend `baseProps()` with `onStartPresentation: vi.fn()` and `canPresent: true`.
   - `it("canPresent true → menu-presentation is enabled and click fires onStartPresentation + closes")`: render `open`, `canPresent`, click `getByTestId("menu-presentation")`, expect `onStartPresentation` called and `onOpenChange` called with `false`.
   - `it("canPresent false → menu-presentation is aria-disabled and click does nothing")`: render `open`, `canPresent={false}`, `onStartPresentation` fresh `vi.fn()`. Expect `getByTestId("menu-presentation")` has `aria-disabled="true"`. `await userEvent.click(...)` → `onStartPresentation` NOT called.
   - `it("canPresent false → the disabled item carries the hint as its title")`: expect `getByTestId("menu-presentation")` `toHaveAttribute("title", "menu.presentationHint")` (identity `t`).
   - Add `"menu.presentation"` to the existing "renders menu items when open" assertion list.
2. - [ ] Run `pnpm --filter @excalidraw-clone/ui test -- HamburgerMenu` — confirm FAIL.
3. - [ ] Implement the props + menu item in `packages/ui/src/HamburgerMenu.tsx`.
4. - [ ] Add the two `menu.*` keys to both locale files (after `"export"` in the `menu` object).
5. - [ ] Re-run `pnpm --filter @excalidraw-clone/ui test -- HamburgerMenu` — PASS. Run `pnpm --filter web test -- i18n-shortcuts` — PASS (en/ko parity).
6. - [ ] `pnpm turbo run lint typecheck --filter @excalidraw-clone/ui --filter web --force` — green.
7. - [ ] Commit: `feat(ui): HamburgerMenu "Start presentation" item + canPresent gate + i18n`.

---

### Task 6: read-only guards in `useDrawingDriver` + `shortcuts.ts`

**Files:**

- Modify: `apps/web/src/driver/useDrawingDriver.ts`
- Modify: `apps/web/src/keyboard/shortcuts.ts`
- Test: `apps/web/test/keyboard-shortcuts.test.ts` (add cases)

**Interfaces:** no signature changes. Pure guard insertions.

`shortcuts.ts` — in `handler` (line 50), immediately after the typing-target guard (`}` on line 57, before `const isMeta` on line 59):

```ts
if (useAppStore.getState().presenting) return
```

`useDrawingDriver.ts`:

- `dispatchPointer` (line 193) — at the very top of the fn body (before `const store = useAppStore.getState()` on line 197):
  ```ts
  const st = useAppStore.getState()
  if (st.presenting && st.activeTool !== "laser") return
  ```
- `onWheel` (line 209) — at the top, before `e.preventDefault()` (line 210):
  ```ts
  if (useAppStore.getState().presenting) return
  ```
- Space-hold pan — gate on `!presenting`:
  - `onKeyDown` (line 225): add `|| useAppStore.getState().presenting` to the early-return condition on line 226.
  - `onPointerDown` (line 256) `if (spaceHeldRef.current)` branch: also require `&& !useAppStore.getState().presenting` (or check `presenting` first and `return` — but a bare return here would fall through to `dispatchPointer("pointerDown", e)` which is itself already guarded, so simplest is to add `!useAppStore.getState().presenting &&` to the `if` on line 256).
- No change to `dispatch` (line 162) or `onDoubleClick`/`onContextMenu` — the host swallows keys, and pointer double-click / contextmenu already route through paths that are inert without a live tool interaction; but for belt-and-braces add the same `if (useAppStore.getState().presenting) return` at the top of `onDoubleClick` (line 358) and `onContextMenu` (line 369). (Laser has no double-click / contextmenu behaviour, so no `!== "laser"` exception needed there.)

**Steps:**

1. - [ ] Write failing cases in `apps/web/test/keyboard-shortcuts.test.ts` (follow the existing `beforeEach`/`afterEach` — `attachShortcuts({ scene })`, dispatch `KeyboardEvent` on `window`). Add `afterEach(() => useAppStore.getState().exitPresentation())` or reset in the existing `beforeEach`.
   - `it("ignores all editor shortcuts while presenting")`: `useAppStore.getState().enterPresentation()`, then dispatch `keydown` `{ key: "r" }` → `activeTool` still `"selection"`; dispatch `{ key: "z", metaKey: true }` → assert `scene.undo` was not called (spy) / scene unchanged.
   - `it("resumes handling shortcuts after exitPresentation")`: `enterPresentation()` then `exitPresentation()`, dispatch `{ key: "r" }` → `activeTool === "rectangle"`.
2. - [ ] Run `pnpm --filter web test -- keyboard-shortcuts` — confirm the new cases FAIL.
3. - [ ] Implement the `shortcuts.ts` guard.
4. - [ ] Re-run — the shortcuts cases PASS.
5. - [ ] Implement the `useDrawingDriver.ts` guards (`dispatchPointer`, `onWheel`, Space handlers, `onDoubleClick`, `onContextMenu`). No unit test for the driver here — it is covered end-to-end by Task 8's e2e (chrome-hidden + scene-unchanged assertions). Note this explicitly in the commit body.
6. - [ ] Run the full web unit suite — green.
7. - [ ] `pnpm turbo run lint typecheck --filter web --force` — green.
8. - [ ] Commit: `feat(web): read-only guards for presentation mode (driver pointer/wheel/pan + shortcuts)`.

---

### Task 7: `App.tsx` wiring + `HelpDialog` rows + `shortcuts.json` keys

**Files:**

- Modify: `apps/web/src/components/App.tsx`
- Modify: `packages/ui/src/HelpDialog.tsx` (`VIEW_SHORTCUTS`)
- Modify: `apps/web/src/locales/en/shortcuts.json`
- Modify: `apps/web/src/locales/ko/shortcuts.json`
- Modify: `apps/web/test/i18n-shortcuts.test.tsx` (assert the new labels resolve)

**Interfaces / changes:**

`App.tsx`:

- Add a ref for the root `<main>`: `const rootRef = useRef<HTMLElement>(null)` and `<main ref={rootRef} ...>` (line 402).
- Read `presenting`: `const presenting = useAppStore((s) => s.presenting)`.
- Compute `frames` in the same render pass as `selectedElements` / `layerElements` (after line 276):
  ```ts
  const frames = useMemo(
    () => scene.getElements().filter((e) => e.type === "frame" && !e.isDeleted),
    [scene, sceneRevision],
  )
  ```
- Chrome gate: change `{!zenMode && (` (line 409) to `{!zenMode && !presenting && (`.
- After the chrome block (`)}` on line 725), before `<Dialogs .../>` (line 727):
  ```tsx
  {
    presenting && <PresentationHost scene={scene} rootEl={rootRef.current} />
  }
  ```
- `HamburgerMenu` (line 412) gets two new props:
  ```tsx
  canPresent={frames.length > 0}
  onStartPresentation={() => useAppStore.getState().enterPresentation()}
  ```
- Import `PresentationHost` from `../presentation/PresentationHost`.

`HelpDialog.tsx` — append to `VIEW_SHORTCUTS` (after line 61, `Alt+PageUp`):

```ts
{ keys: "→ / Space", label: "shortcuts:presentNext" },
{ keys: "←", label: "shortcuts:presentPrev" },
{ keys: "Esc", label: "shortcuts:presentExit" },
```

`shortcuts.json` (flat file, both locales) — add keys:

| key           | en                  | ko              |
| ------------- | ------------------- | --------------- |
| `presentNext` | `Next slide`        | `다음 슬라이드` |
| `presentPrev` | `Previous slide`    | `이전 슬라이드` |
| `presentExit` | `Exit presentation` | `발표 종료`     |

**Steps:**

1. - [ ] Write failing assertions in `apps/web/test/i18n-shortcuts.test.tsx`: add `expect(screen.getByText("Next slide")).toBeDefined()`, `"Previous slide"`, `"Exit presentation"` to the en render test.
2. - [ ] Run `pnpm --filter web test -- i18n-shortcuts` — confirm FAIL (labels render as raw keys).
3. - [ ] Add the three keys to `apps/web/src/locales/en/shortcuts.json` and `apps/web/src/locales/ko/shortcuts.json` (after `flipVertical`, keeping the flat structure + trailing-comma style).
4. - [ ] Append the three rows to `VIEW_SHORTCUTS` in `packages/ui/src/HelpDialog.tsx`.
5. - [ ] Re-run `i18n-shortcuts` — PASS.
6. - [ ] Wire `App.tsx`: `rootRef` on `<main>`, `presenting` selector, `frames` memo, chrome gate `!zenMode && !presenting`, mount `<PresentationHost>`, pass `canPresent` + `onStartPresentation` to `HamburgerMenu`, add the import.
7. - [ ] `pnpm turbo run lint typecheck test build --filter web --filter @excalidraw-clone/ui --force` — green. (`build` catches any App.tsx type error the unit run misses.)
8. - [ ] Manual smoke (optional but recommended): `pnpm --filter web dev`, draw two frames, open the hamburger menu, click "Start presentation", verify chrome hides, overlay shows "1 / 2", ArrowRight → "2 / 2", ArrowRight again stays "2 / 2", Escape restores chrome and the pre-entry viewport.
9. - [ ] Commit: `feat(web): wire PresentationHost + menu props into App; HelpDialog + shortcuts.json rows`.

---

### Task 8: e2e `presentation.spec.ts` + full gate + full e2e

**Files:**

- Create: `apps/web/e2e/presentation.spec.ts`
- (verification only) full monorepo gate + full Playwright suite

**Interfaces:** e2e follows `apps/web/e2e/frames.spec.ts` + `laser.spec.ts` patterns — `page.goto("/")`, `localStorage.clear()`, `page.reload()`, wait for `[data-testid="toolbar-frame"]`, draw frames with `dragOnCanvas`, `page.waitForTimeout(~150)` between actions. Read the stored scene via `parseStoredScene` on `localStorage.getItem("excalidraw-scene")`.

Do **not** assert real fullscreen — headless Chromium may not grant it. Assert the overlay path only.

**Steps:**

1. - [ ] Write `apps/web/e2e/presentation.spec.ts`:

   ```ts
   import { expect, test } from "@playwright/test"
   import { dragOnCanvas, parseStoredScene } from "./_helpers"

   test("presentation mode steps through frames, hides chrome, no wrap, Escape restores", async ({
     page,
   }) => {
     await page.goto("/")
     await page.evaluate(() => localStorage.clear())
     await page.reload()
     await page.locator('[data-testid="toolbar-frame"]').waitFor({ state: "visible" })

     // two frames
     await page.locator('[data-testid="toolbar-frame"]').click()
     await dragOnCanvas(page, { x: 80, y: 80 }, { x: 280, y: 240 })
     await page.waitForTimeout(150)
     await page.locator('[data-testid="toolbar-frame"]').click()
     await dragOnCanvas(page, { x: 360, y: 80 }, { x: 560, y: 240 })
     await page.waitForTimeout(150)

     const before = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
     const framesBefore = parseStoredScene<{ type: string; isDeleted?: boolean }>(
       before,
     ).elements.filter((e) => e.type === "frame" && !e.isDeleted)
     expect(framesBefore.length).toBe(2)

     // enter via the menu
     await page.locator('button[aria-label="Menu"]').click()
     await page.locator('[data-testid="menu-presentation"]').click()

     // overlay up, chrome gone
     await expect(page.locator('[data-testid="presentation-overlay"]')).toBeVisible()
     await expect(page.locator('[data-testid="presentation-counter"]')).toHaveText("1 / 2")
     await expect(page.locator('[data-testid="toolbar-selection"]')).toBeHidden()

     // advance, then hit the wall
     await page.keyboard.press("ArrowRight")
     await expect(page.locator('[data-testid="presentation-counter"]')).toHaveText("2 / 2")
     await page.keyboard.press("ArrowRight")
     await expect(page.locator('[data-testid="presentation-counter"]')).toHaveText("2 / 2")

     // exit restores chrome
     await page.keyboard.press("Escape")
     await expect(page.locator('[data-testid="toolbar-selection"]')).toBeVisible()
     await expect(page.locator('[data-testid="presentation-overlay"]')).toHaveCount(0)

     // scene never mutated by the whole flow
     await page.waitForTimeout(700)
     const after = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
     const framesAfter = parseStoredScene<{ type: string; isDeleted?: boolean }>(
       after,
     ).elements.filter((e) => e.type === "frame" && !e.isDeleted)
     expect(framesAfter.length).toBe(2)
   })
   ```

   (If the idle-fade makes the overlay's `toBeVisible` flaky, move the mouse first or assert `toHaveCount(1)` / `toHaveText` instead — `toHaveText` on the counter is the reliable signal. The counter element stays in the DOM even when visually faded.)

2. - [ ] From `apps/web/`, run `pnpm exec playwright test presentation` — confirm it PASSES against the fully-implemented branch. (If run before Tasks 1-7, it fails at `menu-presentation`.)
3. - [ ] Commit: `test(web): e2e coverage for presentation mode`.
4. - [ ] **Full gate:** from repo root, `pnpm turbo run lint typecheck test build --force` — every package green. Fix any fallout on this branch and re-run until clean.
5. - [ ] **Full e2e:** from `apps/web/`, `pnpm exec playwright test` — the entire suite passes (not just `presentation.spec.ts`). Pay attention to `frames.spec.ts`, `zoom-pan.spec.ts`, `laser.spec.ts` for interaction regressions.
6. - [ ] **STOP.** Do not integrate, merge, push, or delete the branch. Report the final commit SHA and gate/e2e results. **Branch integration is done by the controller after the final review, not by this task.**

---

## Self-Review — spec coverage map

| Spec item                                                                                                                                                                                                                                                                 | Covered by                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **§1 Store slice** (`presenting`, `slideIndex`, enter/exit/goToSlide/next/prev; wired into `store/index.ts`; NOT in autoSave/hydration)                                                                                                                                   | Task 1                                                                                                                                                                                                                          |
| **§2 `animateView`** (rAF cubic ease-in-out, exact `to` final frame, `durationMs<=0` single call, cancel fn)                                                                                                                                                              | Task 2                                                                                                                                                                                                                          |
| **§3 `PresentationHost`** (slides from scene rev; mount = snapshot + requestFullscreen + animate to slide 0; slideIndex effect cancels + re-animates; clamp + auto-exit; capture keydown w/ stop+prevent; fullscreenchange; resize; unmount cleanup restores view + tool) | Task 4 (impl), Task 7 (mount point)                                                                                                                                                                                             |
| **§4 `PresentationOverlay`** (fixed bottom-center z-60; prev/counter/next/laser; testids; edge-disabled; `aria-pressed`; idle fade; themed tokens)                                                                                                                        | Task 3                                                                                                                                                                                                                          |
| **§5 `App.tsx` wiring** (root ref; `presenting` read; chrome gate `!zenMode && !presenting`; mount `<PresentationHost>`; `canPresent` + `onStartPresentation` props)                                                                                                      | Task 7                                                                                                                                                                                                                          |
| **§6 `HamburgerMenu`** (new props; item after Export; enabled vs disabled+hint+aria-disabled; `data-testid="menu-presentation"`)                                                                                                                                          | Task 5                                                                                                                                                                                                                          |
| **§7 `useDrawingDriver` read-only guard** (`dispatchPointer` non-laser return; `onWheel` return; Space-pan gate)                                                                                                                                                          | Task 6                                                                                                                                                                                                                          |
| **§8 `shortcuts.ts` guard** (`if (presenting) return` after typing-target guard)                                                                                                                                                                                          | Task 6                                                                                                                                                                                                                          |
| **§9 i18n `menu.presentation` / `menu.presentationHint` + `presentation.{prev,next,laser,exit}` (en+ko)**                                                                                                                                                                 | `menu.*` → Task 5; `presentation.*` → Task 3                                                                                                                                                                                    |
| **§10 `shortcuts.json` `presentNext/presentPrev/presentExit` + `HelpDialog` VIEW_SHORTCUTS rows (en+ko)**                                                                                                                                                                 | Task 7                                                                                                                                                                                                                          |
| **Data flow** (menu click → enter → chrome hide + host mount → snapshot/fullscreen/animate → ArrowRight → nextSlide → re-animate → Escape → exit → cleanup → chrome restore)                                                                                              | Tasks 4, 7 (impl); Task 8 (e2e end-to-end)                                                                                                                                                                                      |
| **Edge: frame added/removed while presenting → clamp / auto-exit**                                                                                                                                                                                                        | Task 4 (clamp/auto-exit effect + test "all frames deleted auto-exits")                                                                                                                                                          |
| **Edge: window resize while presenting → recompute fit, instant setView**                                                                                                                                                                                                 | Task 4 (resize listener) — _no dedicated unit assertion; flagged below_                                                                                                                                                         |
| **Edge: user exits OS fullscreen → fullscreenchange → exitPresentation**                                                                                                                                                                                                  | Task 4 (fullscreenchange listener) — _no dedicated unit assertion; flagged below_                                                                                                                                               |
| **Edge: requestFullscreen rejects → `.catch(noop)`, overlay-only still works**                                                                                                                                                                                            | Task 4 (mount uses `.catch(() => {})`; test mocks resolve; e2e in Task 8 runs headless where fullscreen may be denied and still asserts the overlay path)                                                                       |
| **Edge: Alt+PageUp/Down while presenting**                                                                                                                                                                                                                                | Task 6 (`shortcuts.ts` early-return) + Task 4 (host swallows `PageUp`/`PageDown`)                                                                                                                                               |
| **Edge: rapid slide advance**                                                                                                                                                                                                                                             | Task 4 (camera effect cancels prior `animateView` before starting the next, from the _current_ store view)                                                                                                                      |
| **Edge: laser toggle flips `activeTool` between `laser`/`selection`; driver lets laser pointer events through**                                                                                                                                                           | Task 3 (overlay button) + Task 4 (`onToggleLaser`) + Task 6 (`dispatchPointer` `activeTool !== "laser"` exception)                                                                                                              |
| **Edge: enter with a non-selection tool active → nothing forced on entry; driver blocks non-laser; on exit reset to selection only if it was laser**                                                                                                                      | Task 4 (no entry tool mutation; cleanup resets only when `activeTool === "laser"`) + Task 6 (driver block)                                                                                                                      |
| **Testing: `animateView.test.ts`** (fake timers, monotonic progress, exact `to`, `durationMs=0`, cancel)                                                                                                                                                                  | Task 2                                                                                                                                                                                                                          |
| **Testing: `presentation-slice.test.ts`** (enter, next/prev math, prev floors at 0, exit resets)                                                                                                                                                                          | Task 1                                                                                                                                                                                                                          |
| **Testing: `PresentationHost.test.tsx`** (3-frame scene, counter "1 / 3", ArrowRight → "2 / 3" + setView near fit, ArrowLeft floors, Escape → not presenting + snapshot restore, delete all frames → not presenting; mock requestFullscreen/exitFullscreen, stub rAF)     | Task 4                                                                                                                                                                                                                          |
| **Testing: `HamburgerMenu.test.tsx`** (canPresent true → enabled + fires; false → aria-disabled + inert)                                                                                                                                                                  | Task 5                                                                                                                                                                                                                          |
| **Testing: `presentation.spec.ts` e2e** (two frames, menu → present, overlay visible, counter "1 / 2", toolbar hidden, ArrowRight → "2 / 2", ArrowRight → still "2 / 2", Escape → toolbar back, scene unchanged; fullscreen NOT asserted)                                 | Task 8                                                                                                                                                                                                                          |
| **Global: pnpm + Turbo full gate**                                                                                                                                                                                                                                        | Task 8, Step 4                                                                                                                                                                                                                  |
| **Global: Playwright from `apps/web/`**                                                                                                                                                                                                                                   | Task 8, Steps 2, 5                                                                                                                                                                                                              |
| **Global: i18n both en+ko or `i18n-shortcuts.test.tsx` fails**                                                                                                                                                                                                            | Tasks 3, 5, 7 each add to both locales + assert via `i18n-shortcuts`                                                                                                                                                            |
| **Global: commit after every task**                                                                                                                                                                                                                                       | Every task's final step                                                                                                                                                                                                         |
| **Global: branch `feat/presentation-mode` off `develop`**                                                                                                                                                                                                                 | Task 1, Step 0                                                                                                                                                                                                                  |
| **Global (spec §"Final task"): integrate per finishing-a-development-branch**                                                                                                                                                                                             | **Deliberately NOT in this plan.** Per the controller's instructions, Task 8 stops at green gate + green e2e; integration (ff → develop → main, push, delete branch, update memory) is the controller's job after final review. |

### Flagged — spec items without a dedicated automated assertion

1. **Resize while presenting** (§3, edge table): implemented as a `resize` listener in Task 4 but not unit-tested (jsdom `resize` + `window.innerWidth` mutation is awkward and low-value). Acceptable — the code path is a direct `fitToContent` + `setView`, identical to the mount path which _is_ tested. A reviewer may add a jsdom test that sets `window.innerWidth` and dispatches `new Event("resize")` if desired.
2. **`fullscreenchange` → auto-exit** (§3, edge table): implemented in Task 4 but not asserted (jsdom has no Fullscreen API; the listener + `document.fullscreenElement == null` check would need heavy mocking). Covered indirectly: the `Escape` test exercises the same `exitPresentation()` + cleanup path. A reviewer may add a test that dispatches `new Event("fullscreenchange")` with `document.fullscreenElement` mocked to `null`.
3. **Idle-fade timing** (§4): the 3s fade is implemented and the overlay stays in the DOM (so testids/counter remain assertable), but the actual opacity transition after 3s of idle is not asserted (would require fake timers in the component test). Low-risk cosmetic behaviour; a reviewer may add a `vi.useFakeTimers()` case asserting a `pointer-events: none` / opacity class flips after `vi.advanceTimersByTime(3000)`.

None of these three gaps affect a locked spec decision or a data-flow guarantee — they are cosmetic or environment-limited. All §1-§10 architecture points and all "Testing" section items have explicit task coverage.
