# Sloppiness (Roughness) Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Each task is self-contained: write the failing test first, watch it fail, implement the minimum, watch it pass, commit. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the already-wired `roughness` element property as a three-button "Sloppiness" control (Architect / Artist / Cartoonist) in the `PropertiesPanel`, so users can switch a shape's hand-drawn rendering style.

**Architecture:** This is a **UI-only** change. The rough.js hand-drawn rendering is _already_ fully wired through both canvas (`packages/renderer/src/draw-element.ts` → `shape-cache.ts` → `shapes/index.ts` `generateShape`) and SVG (`packages/renderer/src/svg.ts`). Every element already carries a `roughness: 0 | 1 | 2` field (`packages/scene/src/types.ts:65`), created with `DEFAULT_ROUGHNESS = 1` (`packages/scene/src/defaults.ts:8`) by the factories (`packages/scene/src/factories.ts:68`), and the `Roughness` type is already exported from `@excalidraw-clone/scene` (`packages/scene/src/index.ts:110`). Style copy/paste already carries `roughness` (`apps/web/src/keyboard/styleClipboard.ts:16,48`). The `App.tsx` `PropertiesPanel` `onChange` handler already spreads any partial patch onto every selected element and persists it (`apps/web/src/components/App.tsx:458-462`). **No renderer, scene, factory, store, or App.tsx changes are needed** — the only gap is a control that emits `onChange({ roughness })`. The new section mirrors the existing Fill style section exactly and is _not_ gated by element type, matching its neighbours.

**Tech Stack:** TypeScript, React 19, Zustand store, Vitest + Testing Library (unit), Playwright (e2e), pnpm workspaces + Turbo.

## Global Constraints

- Package manager is **pnpm**; task runner is **Turbo**. Run turbo as `pnpm turbo run <tasks>` (never `npx turbo`). Full gate: `pnpm turbo run lint typecheck test build --force`.
- Playwright is invoked as `pnpm exec playwright test` from `apps/web/` (the CLI is not on PATH). The test import is `@playwright/test`.
- Scene localStorage key is `"excalidraw-scene"`. E2E helpers live in `apps/web/e2e/_helpers.ts` (`parseStoredScene` — unwraps the v3 `pages[]` document to the active page's `elements`; `dragOnCanvas`).
- i18n: **every** namespace key used by a component must exist in **both** `apps/web/src/locales/en/common.json` and `apps/web/src/locales/ko/common.json`, or `apps/web/test/i18n-shortcuts.test.tsx` (and the real-i18n render path) fails. Add keys to both files in the same task.
- The PropertiesPanel unit test (`packages/ui/test/PropertiesPanel.test.tsx`) uses an identity `t = (key) => key` and a shared `handlers` object where `onChange` is a `vi.fn()`; individual tests override `onChange` with a fresh `vi.fn()`. Follow that pattern — do **not** restructure the file.
- Commit after every task with a conventional-commit message. Branch is `feat/sloppiness-control`, created off `develop` (see Task 1, Step 0).
- Final task: full gate + full e2e green, then integrate the branch per **superpowers:finishing-a-development-branch** (fast-forward `feat/sloppiness-control` → `develop` → `main`, push both, delete the branch, update memory).

---

### Task 1: i18n keys for the Sloppiness control

**Files:**

- Modify: `apps/web/src/locales/en/common.json` (insert into the `properties` object, immediately after `"fillStyle_solid"` on line 37, before `"roundness"` on line 38)
- Modify: `apps/web/src/locales/ko/common.json` (same location — after `"fillStyle_solid"` on line 37, before `"roundness"` on line 38)
- Test: `apps/web/test/i18n-roughness.test.tsx` (new) — a focused real-i18n resolution test

**Interfaces:**

New `properties.*` keys (identical key names in both locales):

| key           | en           | ko       |
| ------------- | ------------ | -------- |
| `roughness`   | `Sloppiness` | `거칠기` |
| `roughness_0` | `Architect`  | `건축가` |
| `roughness_1` | `Artist`     | `예술가` |
| `roughness_2` | `Cartoonist` | `만화가` |

**Steps:**

1. - [ ] **Step 0 (branch setup):** From a clean tree on `develop` (`git switch develop && git pull --ff-only`), create the working branch: `git switch -c feat/sloppiness-control`. Confirm `git status` is clean.
2. - [ ] Write a failing test `apps/web/test/i18n-roughness.test.tsx`: use `ensureI18n("en")` (see `apps/web/test/i18n-shortcuts.test.tsx` for the import + provider pattern) and assert `i18n.t("properties.roughness") === "Sloppiness"`, `i18n.t("properties.roughness_0") === "Architect"`, `_1 === "Artist"`, `_2 === "Cartoonist"`. Add a second `describe`/`it` doing the same with `ensureI18n("ko")` asserting the Korean strings above. (This also guards en/ko parity for these four keys.)
3. - [ ] Run `pnpm --filter web test -- i18n-roughness` (or the repo's vitest invocation) — confirm it FAILS because the keys resolve to the raw key string.
4. - [ ] Add the four keys to the `properties` object in `apps/web/src/locales/en/common.json` after line 37 (`"fillStyle_solid": "Solid",`) and before line 38 (`"roundness": "Edges",`). Keep the file's 2-space indentation and trailing commas consistent.
5. - [ ] Add the same four keys, with the Korean values, to `apps/web/src/locales/ko/common.json` at the matching location (after `"fillStyle_solid": "단색",`, before `"roundness": "모서리",`).
6. - [ ] Re-run the test — confirm it PASSES.
7. - [ ] Run `pnpm turbo run lint typecheck --filter web --force` to confirm the JSON still parses and lints.
8. - [ ] Commit: `i18n(web): add Sloppiness (roughness) control strings for en + ko`.

---

### Task 2: PropertiesPanel Sloppiness section + unit tests

**Files:**

- Modify: `packages/ui/src/PropertiesPanel.tsx`
- Modify: `packages/ui/test/PropertiesPanel.test.tsx`

**Interfaces:**

- `PropertiesPanel` gains no new props. It reads `roughness` off the selection via the existing `commonValue<T>` helper and renders a `<Section label={t("properties.roughness")}>` with three full-width buttons, emitting `onChange({ roughness: r })` for `r ∈ [0, 1, 2]`.
- Button contract (mirrors the Fill style section exactly, lines 193–208):
  - `data-testid={`roughness-${r}`}` → `roughness-0`, `roughness-1`, `roughness-2`
  - `type="button"`
  - `aria-pressed={roughness === r}`
  - `onClick={() => onChange({ roughness: r })}`
  - `className={`h-8 flex-1 rounded border text-xs ${roughness === r ? "border-accent bg-accent-soft" : "border-panel"}`}`
  - text content: `t(`properties.roughness\_${r}`)`
  - wrapper: `<div className="flex gap-1">` inside the `<Section>`

**Steps:**

1. - [ ] **Write failing tests** in `packages/ui/test/PropertiesPanel.test.tsx` (add after the existing `fillStyle` / `roundness` tests, ~line 90), following the existing render pattern (`newRectangle`, spread `handlers`, override `onChange`):
   - `it("emits onChange({ roughness: 2 }) when the Cartoonist button is clicked")`: render one `newRectangle`, `await userEvent.click(screen.getByTestId("roughness-2"))`, expect `onChange` called with `{ roughness: 2 }`.
   - `it("marks the common roughness level as pressed (default 1)")`: render one `newRectangle` (its `roughness` is `DEFAULT_ROUGHNESS = 1`), assert `getByTestId("roughness-1")` has `aria-pressed="true"` and `roughness-0` / `roughness-2` have `aria-pressed="false"`.
   - (optional, matches the mixed-selection tests elsewhere) `it("no roughness button pressed for a mixed selection")`: two rectangles with `roughness: 0` and `roughness: 2`, assert all three buttons `aria-pressed="false"`.
2. - [ ] Run `pnpm --filter @excalidraw-clone/ui test -- PropertiesPanel` — confirm the new tests FAIL (`Unable to find an element by: [data-testid="roughness-2"]`).
3. - [ ] **Implement** in `packages/ui/src/PropertiesPanel.tsx`:
   - Add `Roughness` to the type import from `@excalidraw-clone/scene` (lines 1–10), alphabetically between `FillStyle` and `Roundness`.
   - Add a module constant after `FILL_STYLES` (line 16): `const ROUGHNESS_LEVELS: readonly Roughness[] = [0, 1, 2]`.
   - Add a selection read after the `fillStyle` read (lines 100–103):
     ```ts
     const roughness = commonValue<Roughness>(
       selectedElements as unknown as readonly { [k: string]: unknown }[],
       "roughness",
     )
     ```
   - Insert a new `<Section>` immediately after the Fill style `</Section>` (line 208), before the `{allLinear && (` block (line 210):
     ```tsx
     <Section label={t("properties.roughness")}>
       <div className="flex gap-1">
         {ROUGHNESS_LEVELS.map((r) => (
           <button
             key={r}
             type="button"
             data-testid={`roughness-${r}`}
             aria-pressed={roughness === r}
             onClick={() => onChange({ roughness: r })}
             className={`h-8 flex-1 rounded border text-xs ${roughness === r ? "border-accent bg-accent-soft" : "border-panel"}`}
           >
             {t(`properties.roughness_${r}`)}
           </button>
         ))}
       </div>
     </Section>
     ```
   - Do **not** gate the section by element type.
4. - [ ] Re-run `pnpm --filter @excalidraw-clone/ui test -- PropertiesPanel` — confirm ALL tests PASS (new + pre-existing).
5. - [ ] Run `pnpm turbo run lint typecheck --filter @excalidraw-clone/ui --force` — confirm green.
6. - [ ] Commit: `feat(ui): add Sloppiness (roughness) control to PropertiesPanel`.

---

### Task 3: e2e spec + full gate + integrate

**Files:**

- Create: `apps/web/e2e/roughness.spec.ts`
- (verification only) full monorepo gate + full e2e suite

**Interfaces:**

- e2e test mirrors `apps/web/e2e/style-clipboard.spec.ts`: `page.goto("/")`, clear + reload localStorage, wait for `[data-testid="toolbar-rectangle"]`, draw a rectangle with `dragOnCanvas`, switch to `[data-testid="toolbar-selection"]`, click the rectangle at its centre, click `[data-testid="roughness-2"]` in the panel, wait for the debounced persist (~900 ms, as in style-clipboard), then read `localStorage.getItem("excalidraw-scene")` and assert via `parseStoredScene`.

**Steps:**

1. - [ ] **Write the failing e2e** `apps/web/e2e/roughness.spec.ts`:

   ```ts
   import { expect, test } from "@playwright/test"
   import { dragOnCanvas, parseStoredScene } from "./_helpers"

   test("the Cartoonist sloppiness button sets roughness = 2 on the selected shape", async ({
     page,
   }) => {
     await page.goto("/")
     await page.evaluate(() => localStorage.clear())
     await page.reload()
     await page.locator('[data-testid="toolbar-rectangle"]').waitFor({ state: "visible" })

     await page.locator('[data-testid="toolbar-rectangle"]').click()
     await dragOnCanvas(page, { x: 120, y: 120 }, { x: 260, y: 220 })
     await page.waitForTimeout(120)

     await page.locator('[data-testid="toolbar-selection"]').click()
     await page
       .locator("canvas")
       .first()
       .click({ position: { x: 190, y: 170 } })
     await page.waitForTimeout(120)

     // default is Artist (roughness 1)
     await expect(page.locator('[data-testid="roughness-1"]')).toHaveAttribute(
       "aria-pressed",
       "true",
     )

     await page.locator('[data-testid="roughness-2"]').click()
     await expect(page.locator('[data-testid="roughness-2"]')).toHaveAttribute(
       "aria-pressed",
       "true",
     )

     await page.waitForTimeout(900)
     const sceneJson = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
     const data = parseStoredScene<{ type: string; roughness?: number; isDeleted?: boolean }>(
       sceneJson,
     )
     const rects = data.elements.filter((e) => e.type === "rectangle" && !e.isDeleted)
     expect(rects.length).toBe(1)
     expect(rects[0]?.roughness).toBe(2)
   })
   ```

2. - [ ] From `apps/web/`, run `pnpm exec playwright test roughness` against the **current** branch state _before_ Task 2's implementation would be missing — i.e. Task 2 is already merged into this branch, so this should PASS on the first proper run. If run in isolation before Task 2, confirm it FAILS (`roughness-2` locator times out). Then, with Task 2 in place, confirm it PASSES.
3. - [ ] Commit: `test(web): e2e coverage for the Sloppiness control`.
4. - [ ] **Full gate:** from repo root run `pnpm turbo run lint typecheck test build --force` — confirm every package is green. Fix any fallout on this branch and re-run until clean.
5. - [ ] **Full e2e:** from `apps/web/` run `pnpm exec playwright test` — confirm the entire suite passes (not just `roughness.spec.ts`).
6. - [ ] **Integrate** per **superpowers:finishing-a-development-branch**:
   - `git switch develop && git merge --ff-only feat/sloppiness-control`
   - `git switch main && git merge --ff-only develop`
   - `git push origin develop main`
   - `git branch -d feat/sloppiness-control` (and delete the remote branch if one was pushed)
   - Update `/home/sung/.claude/projects/-home-sung-excalidraw-clone/memory/MEMORY.md` with a one-line "Sloppiness control SHIPPED" entry (final commit SHA, all refs aligned, full gate green).

---

## Self-Review — spec scope → task mapping

| Spec scope item                                                                                               | Task                   | Notes                                                                                           |
| ------------------------------------------------------------------------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------- |
| Add `Roughness` to the `@excalidraw-clone/scene` type import in `PropertiesPanel.tsx`                         | Task 2, Step 3         | Alphabetical, between `FillStyle` and `Roundness`                                               |
| Add `const ROUGHNESS_LEVELS: readonly Roughness[] = [0, 1, 2]` near the other constants                       | Task 2, Step 3         | Inserted after `FILL_STYLES` (line 16)                                                          |
| Add `const roughness = commonValue<Roughness>(…, "roughness")` alongside the `fillStyle` read                 | Task 2, Step 3         | Immediately after the `fillStyle` read (lines 100–103)                                          |
| New `<Section label={t("properties.roughness")}>` immediately after the Fill style `<Section>`                | Task 2, Step 3         | Inserted after line 208, before the `{allLinear && (` block                                     |
| Three full-width buttons mirroring Fill style exactly (testid, type, aria-pressed, onClick, className, label) | Task 2, Step 3         | className `h-8 flex-1 rounded border text-xs` + `border-accent bg-accent-soft` / `border-panel` |
| NOT gated by element type                                                                                     | Task 2, Step 3         | Matches adjacent Fill style / Stroke style sections                                             |
| i18n `properties.roughness` / `roughness_0..2` in **both** en and ko, after the `fillStyle_*` keys            | Task 1, Steps 4–5      | en: after line 37, before line 38; ko: matching location                                        |
| Korean values chosen                                                                                          | Task 1                 | `거칠기` / `건축가` / `예술가` / `만화가`                                                       |
| Unit test (a): clicking `roughness-2` calls `onChange` with `{ roughness: 2 }`                                | Task 2, Step 1         | Fresh `vi.fn()` override, `userEvent.click`                                                     |
| Unit test (b): all elements `roughness: 1` → `roughness-1` pressed, others not                                | Task 2, Step 1         | `newRectangle` default is `DEFAULT_ROUGHNESS = 1`                                               |
| E2E `apps/web/e2e/roughness.spec.ts`: draw rect, select, click Cartoonist, assert stored `roughness === 2`    | Task 3, Steps 1–2      | Follows `style-clipboard.spec.ts` + `_helpers.ts` patterns                                      |
| Branch `feat/sloppiness-control` off `develop`                                                                | Task 1, Step 0         |                                                                                                 |
| Commit after every task                                                                                       | Tasks 1–3, final steps |                                                                                                 |
| Final: full gate + full e2e green, then integrate per finishing-a-development-branch                          | Task 3, Steps 4–6      | ff feat → develop → main, push both, delete branch, update memory                               |

**No-change confirmation:** no files under `packages/renderer/`, `packages/scene/` (types, defaults, factories, index), the Zustand store, `styleClipboard.ts`, or `App.tsx` are modified — the property, its default, its persistence, its rendering (canvas + SVG), and its style copy/paste are all already wired. Verified line references: `packages/scene/src/types.ts:22` (`export type Roughness = 0 | 1 | 2`) and `:65` (`roughness: Roughness`); `packages/scene/src/defaults.ts:8` (`DEFAULT_ROUGHNESS: Roughness = 1`); `packages/scene/src/index.ts:110` (`Roughness` re-export); `apps/web/src/keyboard/styleClipboard.ts:16,48`; `apps/web/src/components/App.tsx:455-462` (PropertiesPanel `onChange` spreads patch onto every selected element).
