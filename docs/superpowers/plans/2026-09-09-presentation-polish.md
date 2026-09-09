# Presentation Mode — Polish Backlog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Each task is self-contained: write the failing test first, watch it fail, implement the minimum, watch it pass, run the focused gate, commit. Steps use checkbox (`- [ ]`) syntax for tracking. **Do not integrate/merge/push** — branch integration is done by the controller after the final review (see the final task).

**Source review:** `.superpowers/sdd/2026-09-07-presentation-mode/final-review.md` — "FOLLOW-UP backlog" + Part 2 triage table (items #2 #3 #5 #9 #11).
**Binding spec:** `docs/superpowers/specs/2026-09-07-presentation-mode-design.md` (§3 PresentationHost, §4 PresentationOverlay).

---

## Goal

Close the four non-blocking follow-ups deferred by the Presentation Mode final review:

- **A (#3)** — the presentation overlay's laser-toggle button shows the literal glyph `✦`; swap it for the real `laser` SVG from the shared icon set, rendered the way every other icon in the app is rendered.
- **B (#2)** — add a unit test that pins the 3-second idle-fade _timing_ of `PresentationOverlay` (fade-out after exactly `IDLE_FADE_MS`, `mousemove` re-arms the full timer).
- **C (#11)** — add an e2e assertion that proves the viewport does **not** drift when the wheel is used while presenting (today the wheel guard only has a "nothing persisted" signal).
- **D (optional)** — bundled micro-cleanups (#5 dead `snapshotRef` guard, #9 `rootRef` hardening). Implementer may skip any that turn out non-trivial.

Nothing else changes. No new feature behaviour, no i18n keys, no store shape changes, no spec decisions revisited.

## Architecture

All four items are cosmetic / test-only and touch code that already shipped on `main`.

**A — icon plumbing.** `PresentationOverlay` lives in `apps/web`; the icon helpers (`ICONS`, `iconHTML`) live in `packages/ui/src/shared/icons.ts` and are currently **package-internal** — consumed only within `packages/ui` (`Toolbar.tsx`, `HamburgerMenu.tsx`, `MoreShapesMenu.tsx`, `LayersPanel.tsx`) via `<span aria-hidden dangerouslySetInnerHTML={{ __html: iconHTML(name) }} />`. `packages/ui/src/index.ts` re-exports every public component + its Props type but nothing from `shared/`.

> **Architecture call: add `iconHTML` (and `ICONS`) to `packages/ui/src/index.ts` and import `iconHTML` in the overlay (Option 1).**
>
> Rationale:
>
> - Single source of truth. Option 2 (inline the one `laser` SVG string as a `const` in the overlay) duplicates a string that already exists; a future tweak to the `laser` glyph in `icons.ts` would silently not reach the overlay. The review explicitly frames this item as removing a _cosmetic inconsistency with the toolbar_ — re-using the same source keeps them consistent by construction.
> - Matches the established consumption pattern. `apps/web` already imports many things from `@excalidraw-clone/ui` (see `App.tsx`), and the app has no icon module of its own — every icon it shows today is rendered inside a `packages/ui` component via `iconHTML`. Rendering `iconHTML("laser")` through a `dangerouslySetInnerHTML` span in `apps/web` is the same mechanism, just at the app layer.
> - `packages/ui` has no build step for consumers (`main`/`types` point straight at `./src/index.ts`, `build` is `tsc --noEmit`), so the export is the entire change on the package side.
> - **Cost if wrong:** the public surface of `@excalidraw-clone/ui` grows by one function + one `Record` (both already stable, both pure, zero deps). Fully reversible — if a future maintainer wants icons out of the barrel, they move `iconHTML` back and inline at the one call site. Low and bounded.
>
> Ride-along: export **both** `iconHTML` and `ICONS` (the record is what `Toolbar`/`LayersPanel` iterate; exporting only the function would force a re-export later). Do **not** convert the existing `packages/ui` internal call sites to import from the barrel — they are in-package, relative imports are correct there; leave them.

`PresentationOverlay` keeps its button's `aria-label`, `title`, and `aria-pressed` exactly as they are (`t("presentation.laser")` / `laserActive`). Only the visible child changes: the bare `✦` text node becomes `<span aria-hidden="true" dangerouslySetInnerHTML={{ __html: iconHTML("laser") }} />`.

**B — timing test.** `apps/web/test/PresentationOverlay.test.tsx` already has `it("fades out after 3s of inactivity and wakes on a plain keydown")` (added in `db1bc6d`) and `it("wakes on a nav key the host swallows in the capture phase")`. Neither exercises the `mousemove` wake path or the timer-boundary behaviour. The new test adds exactly that and nothing that duplicates the existing two. The file already has `afterEach(() => { cleanup(); vi.useRealTimers() })` and helper patterns (`renderOverlay`, `overlay()`, `act(() => void vi.advanceTimersByTime(...))`) to follow.

**C — e2e viewport-drift signal.** Investigated:

- **Is the Zustand store on `window` for tests?** No. `grep` for `window.__` / `import.meta.env.DEV` / `__appStore` across `apps/web/src` and `apps/web/e2e` returns nothing. A `window.__appStore` hook was added _temporarily_ during the context-menu feature (memory: "Temporary `window.__appStore` Exposure Added for Task 7 Manual Smoke-Check") and then **reverted** ("Temp Scaffolding Reverted, Working Tree Clean"). So there is a precedent that it is _not_ kept. No e2e spec relies on such a hook — every spec reads state via `localStorage` (`parseStoredScene`), visible DOM (`zoom-reset` text), or **canvas pixels** (`zoom-pan.spec.ts` `maxChannelIn` → `getImageData`).
- **Dev-only `window.__appStore` hook:** rejected. It would be the codebase's _first_ permanent test-only production hook, cutting against a consistent existing convention (state is asserted through user-observable surfaces). It was tried and pulled once already. Not the lowest-footprint option given a zero-production-code option exists.
- **`PresentationHost`-rendered `data-testid` carrying the live transform:** rejected. Adds permanent production DOM whose only consumer is one e2e test.
- **Read the zoom widget text before entering, wheel while presenting, exit, re-read:** rejected — the zoom widget is unmounted while presenting (no live signal _during_), and on exit `PresentationHost`'s cleanup calls `setView(snapshot)`, which **erases any drift** before the widget remounts. The post-exit read can never observe drift.

> **Recommended: assert on canvas pixels — zero production code, matches `zoom-pan.spec.ts`.**
>
> In dark theme (strokes are invisible against the light-theme white background — same constraint `zoom-pan.spec.ts` documents), draw a frame with a rectangle inside it, enter presentation, let the 400 ms camera glide settle, then take a **screenshot of the main `<canvas>` element** (`page.locator("canvas").first().screenshot()` → PNG `Buffer`). Fire wheel events. Take a second canvas screenshot. Assert `Buffer.compare(before, after) === 0`.
>
> Why this is reliable here: canvas rendering is **state-driven, not a persistent rAF loop** (`grep` confirms no render-loop `requestAnimationFrame` in `apps/web/src/canvas` — only export/thumbnail one-shots and the laser trail, which is inactive here). With no state change between the two shots the framebuffer is byte-identical. If the wheel guard were broken, the view transform would change → strokes render at new screen positions → the buffers differ. No false positives (idle ⇒ identical), no false negatives (drift moves pixels regardless of roughjs seed stability).
>
> Fallback if the screenshot compare is somehow flaky in CI (e.g. devicePixelRatio quirk): drop to the `zoom-pan.spec.ts` `maxChannelIn(page, x, y, w, h)` helper — sample a box straddling a rectangle edge before and after the wheel and assert the max channel value is unchanged. Same pattern, coarser assertion.

**D — cleanups.** Both are in `PresentationHost.tsx` / `App.tsx`, both optional, both independently skippable.

## Tech Stack

TypeScript, React 19, Zustand (`create()`, no middleware), Vitest + `@testing-library/react` (unit/component), Playwright (`@playwright/test`, e2e), pnpm workspaces + Turbo. Icon helpers from `@excalidraw-clone/ui` (after Task 1).

## Global Constraints

- Package manager is **pnpm**; task runner is **Turbo** (`pnpm turbo run <tasks>`, never `npx turbo`).
- **Focused gate per task:** `pnpm turbo run lint typecheck test --filter @excalidraw-clone/web --filter @excalidraw-clone/ui --force`. The web package filter is `@excalidraw-clone/web` (NOT `web`).
- Playwright is invoked as `pnpm exec playwright test` from `apps/web/`. Test import is `@playwright/test`.
- Scene localStorage key is `"excalidraw-scene"`. E2E helpers live in `apps/web/e2e/_helpers.ts` (`dragOnCanvas`, `parseStoredScene`).
- The Zustand store is a module singleton shared across a test file's cases. Component tests that flip `presenting` reset it (`useAppStore.getState().exitPresentation()`) in `afterEach`. (Only Task 4's optional host-test edit is affected; the overlay tests are pure-prop.)
- **No i18n changes.** No `menu.*` / `presentation.*` / `shortcuts.json` keys are added or touched. `PresentationOverlay`'s laser button keeps `aria-label`/`title` = `t("presentation.laser")`.
- Commit after every task with a conventional-commit message. Branch is `feat/presentation-polish` (already created off `main` @ `db1bc6d` — **do not re-create it**).
- **Final task: full monorepo gate + full e2e green, then STOP.** Do NOT integrate/merge/push. Branch integration is the controller's job after the final review.

---

### Task 1 (Item A): swap the overlay laser glyph for the real `laser` icon

**Files:**

- Modify: `packages/ui/src/index.ts` (add `iconHTML` + `ICONS` to the public barrel)
- Modify: `apps/web/src/presentation/PresentationOverlay.tsx` (import `iconHTML`, replace the `✦` text node)
- Modify: `apps/web/test/PresentationOverlay.test.tsx` (new assertion)

**Interfaces / changes:**

- `packages/ui/src/index.ts` — append, after the last component export block:
  ```ts
  export { ICONS, iconHTML } from "./shared/icons"
  ```
  (No type export needed — `iconHTML` is `(name: string) => string`, `ICONS` is `Record<string, string>`; both inferred.)
- `PresentationOverlay.tsx`:
  - add `import { iconHTML } from "@excalidraw-clone/ui"` (top, with the other imports).
  - the laser `<button>` currently has the bare text child `✦` (line ~122). Replace **only** that child with:
    ```tsx
    <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: iconHTML("laser") }} />
    ```
  - leave the button's `type`, `data-testid="presentation-laser"`, `aria-label={t("presentation.laser")}`, `title={t("presentation.laser")}`, `aria-pressed={laserActive}`, `onClick={onToggleLaser}`, and `className` (incl. the `laserActive ? "bg-accent-soft" : ""` toggle) **exactly as they are**.
- This is the first `dangerouslySetInnerHTML` in `apps/web/src` — that is fine; it is the identical mechanism `packages/ui` uses for every icon, and the content is a static, hard-coded SVG string from our own module (no interpolation, no user data).

**Steps:**

1. - [ ] In `apps/web/test/PresentationOverlay.test.tsx`, add a case (e.g. after "reflects the laser state via aria-pressed"):
         `it("renders the laser icon SVG rather than a text glyph")` —
         `renderOverlay()`, then
         `const laser = button("presentation-laser")`;
         `expect(laser.querySelector("svg")).not.toBeNull()`;
         `expect(laser.textContent ?? "").not.toContain("✦")`.
2. - [ ] Run `pnpm --filter @excalidraw-clone/web test -- PresentationOverlay` — confirm the new case FAILS (`querySelector("svg")` is `null`; the button still holds the `✦` text node).
3. - [ ] Add the `export { ICONS, iconHTML } from "./shared/icons"` line to `packages/ui/src/index.ts`.
4. - [ ] Edit `PresentationOverlay.tsx`: add the import, replace the `✦` child with the `<span aria-hidden dangerouslySetInnerHTML>`.
5. - [ ] Re-run `pnpm --filter @excalidraw-clone/web test -- PresentationOverlay` — the new case PASSES; the pre-existing aria-pressed / click / idle-fade cases still PASS (the click handler is unchanged; `userEvent.click` on the button still fires `onToggleLaser` even though the click target may be the inner `<span>` — event bubbles to the button).
6. - [ ] Focused gate: `pnpm turbo run lint typecheck test --filter @excalidraw-clone/web --filter @excalidraw-clone/ui --force` — green. (Confirms the new barrel export typechecks from both packages and no `packages/ui` test regressed.)
7. - [ ] Commit: `fix(web): use the laser icon in the presentation overlay; export iconHTML from @excalidraw-clone/ui`.

---

### Task 2 (Item B): unit test for the 3s idle-fade timing

**Files:**

- Modify: `apps/web/test/PresentationOverlay.test.tsx` (one new case — **no implementation change**)

**Interfaces / changes:** none. This is a characterization test of already-shipped behaviour (`IDLE_FADE_MS = 3000`, root `[data-testid="presentation-overlay"]` toggles `opacity-100` ↔ `opacity-0 pointer-events-none`; a `window` `mousemove`/`keydown` capture listener calls `wake()` → `setVisible(true)` + reschedule). It must pass immediately on the current code — that is the point (it locks the timing so a future refactor can't silently change it).

**Steps:**

1. - [ ] Add `it("fades after exactly IDLE_FADE_MS and a mousemove re-arms the full timer")` to `apps/web/test/PresentationOverlay.test.tsx`. Follow the existing fake-timer case's shape:

   ```ts
   vi.useFakeTimers()
   renderOverlay()

   // visible on mount
   expect(overlay().className).toContain("opacity-100")

   // fades after the full idle window
   act(() => void vi.advanceTimersByTime(3000))
   expect(overlay().className).toContain("opacity-0")
   expect(overlay().className).toContain("pointer-events-none")

   // a plain mousemove wakes it
   act(() => {
     document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }))
   })
   expect(overlay().className).toContain("opacity-100")

   // ...and re-arms the FULL 3s window: 2999ms is not enough
   act(() => void vi.advanceTimersByTime(2999))
   expect(overlay().className).toContain("opacity-100")

   // one more ms tips it over
   act(() => void vi.advanceTimersByTime(1))
   expect(overlay().className).toContain("opacity-0")
   ```

   Notes:
   - `afterEach` in the file already does `vi.useRealTimers()` — do not add a local one.
   - The `wake` listener is registered on `window` with `{ capture: true }`; dispatching a bubbling `MouseEvent` from `document` reaches it. (Dispatching a `keydown` here would overlap the existing "wakes on a plain keydown" case — use `mousemove` to keep this case distinct.)
   - Assert on `.className` substrings (`opacity-0` / `pointer-events-none` / `opacity-100`), exactly like the existing cases — do not assert computed style (jsdom does not run the CSS transition).

2. - [ ] Run `pnpm --filter @excalidraw-clone/web test -- PresentationOverlay` — the new case PASSES on the first run (characterization). If it fails, STOP and reconcile against the current `PresentationOverlay.tsx` before touching anything — a red here means the shipped behaviour differs from the review's description.
3. - [ ] Focused gate: `pnpm turbo run lint typecheck test --filter @excalidraw-clone/web --filter @excalidraw-clone/ui --force` — green.
4. - [ ] Commit: `test(web): pin presentation overlay idle-fade timing (3s fade-out + mousemove re-arm)`.

---

### Task 3 (Item C): e2e assertion that the viewport does not drift on wheel while presenting

**Files:**

- Modify: `apps/web/e2e/presentation.spec.ts` (one new `test(...)`; optionally a small `setDarkTheme` local helper)

**Interfaces / changes:** none in `apps/web/src`. Pure e2e. Uses the file's existing helpers (`freshCanvas`, `drawFrame`, `startPresentation`, `counter`) plus a dark-theme step (same two clicks `zoom-pan.spec.ts` uses: `button[aria-label="Menu"]` → `[data-testid="theme-dark"]`).

**Steps:**

1. - [ ] Add to `apps/web/e2e/presentation.spec.ts`:

   ```ts
   test("wheel does not drift the viewport while presenting", async ({ page }) => {
     await freshCanvas(page)

     // Dark theme: strokes are invisible against the light-theme white canvas,
     // so pixel comparisons must run in dark mode (same constraint as zoom-pan.spec.ts).
     await page.locator('button[aria-label="Menu"]').click()
     await page.locator('[data-testid="theme-dark"]').click()
     await page.waitForTimeout(200)

     // A frame with a rectangle inside it — a strong stroke signal to compare.
     await drawFrame(page, { x: 80, y: 80 }, { x: 420, y: 340 })
     await page.locator('[data-testid="toolbar-rectangle"]').click()
     await dragOnCanvas(page, { x: 150, y: 150 }, { x: 340, y: 280 })
     await page.waitForTimeout(150)
     await page.locator('[data-testid="toolbar-selection"]').click()

     await startPresentation(page)
     await expect(counter(page)).toHaveText("1 / 1")
     await page.waitForTimeout(700) // let the 400ms camera glide settle

     const canvas = page.locator("canvas").first()
     const before = await canvas.screenshot()

     // Wheel while presenting must be inert — the viewport is owned by the slide fit.
     const box = await canvas.boundingBox()
     if (!box) throw new Error("canvas not found")
     await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
     await page.mouse.wheel(0, 240)
     await page.mouse.wheel(0, -120)
     await page.waitForTimeout(250)

     const after = await canvas.screenshot()
     expect(Buffer.compare(before, after)).toBe(0)

     await page.keyboard.press("Escape")
     await expect(page.locator('[data-testid="toolbar-selection"]')).toBeVisible()
   })
   ```

   - `dragOnCanvas` is already imported in the file. `Buffer` is a Node global available in Playwright specs (no import).
   - If `Buffer.compare` proves flaky in CI, replace the two screenshot lines + assertion with a `maxChannelIn`-style `getImageData` sample (port the helper from `zoom-pan.spec.ts`): sample a ~30×30 box over a known rectangle edge before and after the wheel and assert the returned max channel value is identical. Leave a code comment pointing at `zoom-pan.spec.ts` as the source pattern.

2. - [ ] From `apps/web/`, run `pnpm exec playwright test presentation` — the new test PASSES (and the existing three presentation tests still pass). The new test would fail today only if the wheel guard regressed — it is a guard-regression sentinel.
3. - [ ] Commit: `test(web): e2e — wheel does not drift the viewport while presenting`.

---

### Task 4 (Item D — OPTIONAL cleanups, bundled): dead `snapshotRef` guard + `rootRef` hardening

> **This whole task is optional.** The implementer may land it whole, land one half, or skip it entirely. Each sub-item below is independent. Skip any sub-item that cannot be done without a type cast, a non-null assertion, or a new stale-closure risk — note the skip in the commit body (or skip the commit).
>
> **Explicitly EXCLUDED from this plan** (the final review ruled both out of scope here):
>
> - **#4** — `setOpenDialog(null)` on presentation entry. The review ruled it _unreachable_: every entry point (HamburgerMenu, `?`, `Cmd+/`) is gated off while presenting, and a pre-open modal blocks reaching the menu. No code change.
> - **#8** — `aria-disabled`-only menu-item pattern for the disabled "Start presentation" item. The review ruled it an _app-wide pattern question_, not this feature's; the implementation matches the binding spec (`disabled` + `title` + `aria-disabled` + muted styling) exactly. No code change.

**Files:**

- Modify (sub-item #5): `apps/web/src/presentation/PresentationHost.tsx`
- Modify (sub-item #9): `apps/web/src/presentation/PresentationHost.tsx`, `apps/web/src/components/App.tsx`, `apps/web/test/PresentationHost.test.tsx`

**Sub-item #5 — drop the dead `if (snapshotRef.current)` guard (~line 80).**

`snapshotRef.current` is unconditionally populated in the render body (lines ~60-63: `if (snapshotRef.current === null) { … snapshotRef.current = { scrollX, scrollY, zoom } }`), so the cleanup's `if (snapshotRef.current) store.setView(snapshotRef.current)` guard is dead.

- **Interfaces / changes:** the ref is typed `useRef<ViewTransform | null>(null)`, so a bare `store.setView(snapshotRef.current)` will not typecheck. The **only** acceptable removal (no `!`, no cast): capture a guaranteed-non-null local in the render body right after the lazy-init block —
  ```ts
  const entrySnapshot: ViewTransform = snapshotRef.current
  ```
  — TypeScript narrows `snapshotRef.current` to `ViewTransform` immediately after the `if (… === null) { … = … }` block (definite assignment), so this const is `ViewTransform` with no cast. Then the entry effect's cleanup uses `store.setView(entrySnapshot)` and the `snapshotRef`/`if` guard both go away.
  - Verify the narrowing actually holds under the repo's `tsconfig` (`strict`) before committing — if `tsc` still complains, this removal is **not** clean; skip sub-item #5.
  - The effect is keyed `[]`; `entrySnapshot` is stable for the component's life (the ref only ever takes one value), so closing over it in the cleanup is equivalent to reading the ref and carries no stale-closure risk. The comment at lines ~56-58 (why the snapshot is captured in render, not in an effect) stays accurate — update it to mention the local if helpful.
- **Test:** `apps/web/test/PresentationHost.test.tsx` already asserts snapshot restore on exit (the "Escape exits + restores snapshot" case). It must still pass unchanged.

**Sub-item #9 — `rootRef` hardening in `App.tsx`.**

`App.tsx:737` passes `rootEl={rootRef.current}` — a non-reactive ref `.current` read in the render body. `PresentationHost` already copies `rootEl` into an internal ref and reads `rootElRef.current ?? document.documentElement` in its entry effect, so this works today (the `<main>` is mounted long before `presenting` can flip true). Optional hardening: pass the **ref object** instead of its current value.

- **Interfaces / changes:**
  - `PresentationHostProps.rootEl` type: `rootEl?: HTMLElement | null` → `rootEl?: React.RefObject<HTMLElement | null>`.
  - `PresentationHost.tsx`: drop the `const rootElRef = useRef(rootEl); rootElRef.current = rootEl` copy (no longer needed — the caller's ref object is already stable across renders). In the entry effect: `const target = rootEl?.current ?? document.documentElement`. Keep the effect keyed `[]` — `rootEl` (the ref object identity) is stable, so it can be safely omitted from deps (add an eslint-disable-next-line only if the repo's `react-hooks/exhaustive-deps` is set to error; check first).
  - `App.tsx:737`: `<PresentationHost scene={scene} rootEl={rootRef} />`.
  - `apps/web/test/PresentationHost.test.tsx:60`: `rootEl={document.body}` → `rootEl={{ current: document.body }}`.
- Only land this if all four edits are clean. If `react-hooks/exhaustive-deps` forces an ugly disable or the test rework cascades, skip sub-item #9.

**Steps:**

1. - [ ] Decide per sub-item whether it lands clean (see the skip criteria above). If both are skipped, skip this task entirely (no commit) and note it in the final report.
2. - [ ] **#5:** capture the non-null local, remove the `if` guard + the `ViewTransform | null` widening if the narrowing typechecks. Run `pnpm --filter @excalidraw-clone/web test -- PresentationHost` — all cases (esp. "Escape exits + restores snapshot") still PASS.
3. - [ ] **#9:** apply the four edits. Run `pnpm --filter @excalidraw-clone/web test -- PresentationHost` — all cases still PASS (fullscreen-attempted-on-mount, counter, nav, snapshot restore, auto-exit).
4. - [ ] Full web + ui unit suites: `pnpm turbo run lint typecheck test --filter @excalidraw-clone/web --filter @excalidraw-clone/ui --force` — green.
5. - [ ] Commit whatever landed: `refactor(web): drop dead snapshotRef guard and harden rootRef threading in PresentationHost` (trim the message to match what actually landed).

---

### Task 5: full gate + full e2e, then STOP

**Files:** none — verification only.

**Steps:**

1. - [ ] From repo root: `pnpm turbo run lint typecheck test build --force` — every package green. Fix any fallout on this branch and re-run until clean.
2. - [ ] From `apps/web/`: `pnpm exec playwright test` — the **entire** suite passes, not just `presentation.spec.ts`. Pay attention to `laser.spec.ts` and `zoom-pan.spec.ts` (both touch icon rendering / wheel behaviour adjacent to these changes) and `theme.spec.ts` (dark-mode toggle path reused by the new e2e test).
3. - [ ] If the `presentation.spec.ts` screenshot-buffer assertion flaked in the full run, switch it to the `maxChannelIn` fallback described in Task 3, re-run `pnpm exec playwright test presentation` and the full suite, amend the Task 3 commit or add a follow-up commit.
4. - [ ] **STOP.** Do not integrate, merge, push, or delete the branch. Report the final commit SHA, the gate result, and the full e2e result (passed/total). Branch integration is the controller's job after the final review.

---

## Self-Review — coverage map

| Backlog item                                       | Plan coverage                                                                                                                                                                                                                                                                                                                                                                                                   | Test signal                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A (#3)** overlay laser glyph → real `laser` icon | Task 1 — `export { ICONS, iconHTML }` from `packages/ui/src/index.ts` (Option 1, justified in Architecture); overlay renders `<span aria-hidden dangerouslySetInnerHTML={{ __html: iconHTML("laser") }} />`; `aria-label`/`title`/`aria-pressed`/`onClick`/`className` untouched                                                                                                                                | New `PresentationOverlay.test.tsx` case: laser button contains an `<svg>`, no `✦` text; existing aria-pressed + click cases still green; focused gate proves the barrel export typechecks from both packages                                                                                                                          |
| **B (#2)** 3s idle-fade timing unit test           | Task 2 — one new characterization case; **no implementation change**                                                                                                                                                                                                                                                                                                                                            | Fake timers: visible on mount → `advance(3000)` → faded (`opacity-0` + `pointer-events-none`) → `mousemove` → visible → `advance(2999)` still visible → `advance(1)` faded. Distinct from the shipped "wakes on a plain keydown" (uses `mousemove`) and "wakes on a nav key the host swallows" (no capture-listener simulation) cases |
| **C (#11)** e2e viewport-does-not-drift-on-wheel   | Task 3 — new `presentation.spec.ts` test; **zero production code**. Investigation recorded in Architecture: no `window` store hook exists (one was added then reverted historically), a dev-only hook rejected as a new one-off convention, a `data-testid` transform rejected as permanent prod DOM for tests, the read-widget-after-exit approach rejected because cleanup's `setView(snapshot)` erases drift | Dark theme + frame + inner rectangle + settle → `canvas.screenshot()` `Buffer` before/after wheel, `Buffer.compare === 0`. `maxChannelIn`/`getImageData` fallback documented (matches `zoom-pan.spec.ts`). Canvas is state-driven, not a rAF loop (grep-confirmed) → idle framebuffer is byte-stable                                  |
| **D #5** dead `snapshotRef` guard                  | Task 4 sub-item — optional; clean removal path spelled out (definite-assignment-narrowed local const, no `!`/cast); skip criteria stated                                                                                                                                                                                                                                                                        | Existing `PresentationHost.test.tsx` "Escape exits + restores snapshot" case must stay green                                                                                                                                                                                                                                          |
| **D #9** `rootRef` hardening                       | Task 4 sub-item — optional; pass the ref _object_, change `PresentationHostProps.rootEl` to `RefObject<HTMLElement \| null>`, dereference in the entry effect; 4 edits listed; skip criteria stated                                                                                                                                                                                                             | Existing `PresentationHost.test.tsx` cases (fullscreen-on-mount, nav, snapshot restore, auto-exit) stay green with `rootEl={{ current: document.body }}`                                                                                                                                                                              |
| **#4** (`setOpenDialog(null)` on entry)            | **Explicitly excluded** — review ruled it unreachable; stated in Task 4                                                                                                                                                                                                                                                                                                                                         | —                                                                                                                                                                                                                                                                                                                                     |
| **#8** (`aria-disabled`-only menu item)            | **Explicitly excluded** — review ruled it an app-wide pattern question; stated in Task 4                                                                                                                                                                                                                                                                                                                        | —                                                                                                                                                                                                                                                                                                                                     |
| No i18n drift                                      | Global Constraints — no key added/changed; laser button keeps `t("presentation.laser")`                                                                                                                                                                                                                                                                                                                         | `i18n-shortcuts` test unaffected (not touched)                                                                                                                                                                                                                                                                                        |
| Full gate + full e2e, no integration               | Task 5                                                                                                                                                                                                                                                                                                                                                                                                          | `pnpm turbo run lint typecheck test build --force` + `pnpm exec playwright test` (whole suite), then STOP                                                                                                                                                                                                                             |

### Flagged — items deliberately without a dedicated automated assertion

1. **Barrel export of `ICONS`** (Task 1) — `iconHTML` gets exercised by the new overlay test; `ICONS` rides along for future use and is only covered by `typecheck`. Acceptable — it is a re-export of an already-tested constant.
2. **`rootRef` object threading** (Task 4 #9, if landed) — the "reads the caller's live ref" behaviour is covered only indirectly (the host test passes `{ current: document.body }` and still asserts `requestFullscreen` was attempted on that element). A dedicated "ref populated after mount" test is not worth it: the whole point of #9 is that the value is read in an effect, after mount, where `.current` is always set.
