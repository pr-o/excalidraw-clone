# Stats/Dimensions Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Each task is self-contained: write the failing test first, watch it fail, implement the minimum, watch it pass, commit. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a toggleable (Alt+/) bottom-left stats/dimensions panel showing live, editable x/y/width/height/angle for a single selected element, a read-only combined bounding box for a multi-element selection, and the scene element count when nothing is selected.

**Architecture:** A new pure function `computeStats(selectedElements, allElements)` in `packages/scene/src/stats.ts` composes the existing `getElementsBounds` (`packages/scene/src/bounds.ts`) into a three-case discriminated union (`Stats`). A new pure, props-in/callbacks-out `StatsPanel` component in `packages/ui/src/StatsPanel.tsx` (shaped like `LayersPanel`/`PropertiesPanel`) renders it, with commit-on-blur/Enter editing and Escape-revert for the single-selection case (mirroring `PagesTabBar`'s rename-input pattern — the only existing onBlur-commit precedent in the codebase). Visibility is local `useState` in `App.tsx`, toggled only by a new `onToggleStats` binding wired to Alt+/ in `apps/web/src/keyboard/shortcuts.ts`. No toolbar button, no Zustand store slice — matches real Excalidraw's keyboard-only stats panel. No renderer, factory, or bindings changes are needed anywhere.

**Tech Stack:** TypeScript, React 19, Vitest + `@testing-library/react` (unit/component), Playwright (`@playwright/test`, e2e), pnpm workspaces + Turbo.

**Spec:** `docs/superpowers/specs/2026-09-18-stats-panel-design.md`

## Global Constraints

- Package manager is **pnpm**; task runner is **Turbo**. Run turbo as `pnpm turbo run <tasks>` (never `npx turbo`). Full gate: `pnpm turbo run lint typecheck test build --force`.
- Package filter names are the scoped npm names, not the directory names: `@excalidraw-clone/scene`, `@excalidraw-clone/ui`, `@excalidraw-clone/web`.
- Playwright is invoked as `pnpm exec playwright test` from `apps/web/` (the CLI is not on PATH). Test import is `@playwright/test`.
- Scene localStorage key is `"excalidraw-scene"`. E2E helpers live in `apps/web/e2e/_helpers.ts` (`dragOnCanvas`, `parseStoredScene` — unwraps the v3 `pages[]` document to the active page's `elements`).
- Formatting: no semicolons, double quotes, trailing commas everywhere, 100-char print width (`.prettierrc`) — `format:check` is part of the full gate.
- i18n: every namespace key a component uses must exist in **both** `apps/web/src/locales/en/common.json` and `apps/web/src/locales/ko/common.json` (and `shortcuts.json` where applicable), or `apps/web/test/i18n-shortcuts.test.tsx` (and the real-i18n render path) fails.
- `angle` is stored on every `ExcalidrawElement` in **radians**; only the `StatsPanel`'s display/edit layer converts to/from degrees (`* 180 / Math.PI` and back).
- `getElementsBounds` (`packages/scene/src/bounds.ts`) returns `Bounds | null`, `null` only for an empty or fully-deleted input list — never reachable from `computeStats`'s `"multi"` branch, which only runs when 2+ selected (non-deleted, by construction of the app's selection state) elements are present.
- Commit after every task with a conventional-commit message. Branch is `feat/stats-panel`, created off **`main`** (not `develop` — `main` is currently one commit ahead of `develop`, holding the approved spec doc; see Task 1, Step 0).
- Final task: full gate + full e2e green, then integrate per **superpowers:finishing-a-development-branch**.

---

### Task 1: `computeStats` pure function in `packages/scene`

**Context for a fresh implementer (no prior context needed beyond this):** The stats panel needs one pure function that, given the current selection and the full element list, decides which of three display modes applies: no selection (scene-wide element count), one element selected (its editable geometry, with angle converted from the stored radians to degrees for display), or 2+ elements selected (their combined read-only bounding box, reusing the existing `getElementsBounds` helper — no new geometry math). This task adds that function and its unit tests only; nothing in `packages/ui` or `apps/web` is touched yet.

**Files:**

- Create: `packages/scene/src/stats.ts`
- Create: `packages/scene/test/stats.test.ts`
- Modify: `packages/scene/src/index.ts` (export `computeStats` + the `Stats` type)

**Interfaces:**

```ts
// packages/scene/src/stats.ts
export type Stats =
  | { kind: "scene"; elementCount: number }
  | {
      kind: "single"
      id: string
      x: number
      y: number
      width: number
      height: number
      angleDeg: number
    }
  | { kind: "multi"; count: number; x: number; y: number; width: number; height: number }

export function computeStats(
  selectedElements: readonly ExcalidrawElement[],
  allElements: readonly ExcalidrawElement[],
): Stats
```

- `selectedElements.length === 0` → `{ kind: "scene", elementCount: <non-deleted count of allElements> }`.
- `selectedElements.length === 1` → `{ kind: "single", id, x, y, width, height, angleDeg }` where `angleDeg = (element.angle * 180) / Math.PI`.
- `selectedElements.length >= 2` → `{ kind: "multi", count: selectedElements.length, x, y, width, height }` from `getElementsBounds(selectedElements)`.

**Steps:**

1. - [ ] **Step 0 (branch setup):** From a clean tree on `main` (`git switch main && git pull --ff-only` if a remote is configured, otherwise just confirm `git status` is clean on `main`), create the working branch: `git switch -c feat/stats-panel`. Confirm `git status` is clean.
2. - [ ] Write the failing tests, `packages/scene/test/stats.test.ts`:

   ```ts
   import { describe, expect, it } from "vitest"
   import { computeStats, getElementsBounds, newRectangle } from "../src"

   describe("computeStats — scene (no selection)", () => {
     it("returns the live, non-deleted element count when nothing is selected", () => {
       const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
       const deleted = {
         ...newRectangle({ x: 20, y: 0, width: 10, height: 10 }),
         isDeleted: true,
       }
       expect(computeStats([], [a, deleted])).toEqual({ kind: "scene", elementCount: 1 })
     })

     it("returns zero for an empty scene", () => {
       expect(computeStats([], [])).toEqual({ kind: "scene", elementCount: 0 })
     })
   })

   describe("computeStats — single selection", () => {
     it("returns the element's field values and converts angle from radians to degrees", () => {
       const el = newRectangle({ x: 10, y: 20, width: 30, height: 40, angle: Math.PI / 2 })
       expect(computeStats([el], [el])).toEqual({
         kind: "single",
         id: el.id,
         x: 10,
         y: 20,
         width: 30,
         height: 40,
         angleDeg: 90,
       })
     })

     it("a zero angle converts to 0 degrees", () => {
       const el = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
       const stats = computeStats([el], [el])
       expect(stats.kind).toBe("single")
       if (stats.kind === "single") expect(stats.angleDeg).toBe(0)
     })
   })

   describe("computeStats — multi selection", () => {
     it("matches getElementsBounds directly, including a rotated element", () => {
       const a = newRectangle({ x: 0, y: 0, width: 40, height: 20, angle: Math.PI / 2 })
       const b = newRectangle({ x: 100, y: 100, width: 10, height: 10 })
       const selected = [a, b]
       const bounds = getElementsBounds(selected)!
       expect(computeStats(selected, selected)).toEqual({
         kind: "multi",
         count: 2,
         x: bounds.x,
         y: bounds.y,
         width: bounds.width,
         height: bounds.height,
       })
     })

     it("count reflects the number of selected elements", () => {
       const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
       const b = newRectangle({ x: 20, y: 0, width: 10, height: 10 })
       const c = newRectangle({ x: 40, y: 0, width: 10, height: 10 })
       const stats = computeStats([a, b, c], [a, b, c])
       expect(stats.kind).toBe("multi")
       if (stats.kind === "multi") expect(stats.count).toBe(3)
     })
   })
   ```

3. - [ ] Run `pnpm --filter @excalidraw-clone/scene test -- stats` — confirm it FAILS (`computeStats` doesn't exist / isn't exported from `../src`).
4. - [ ] Create `packages/scene/src/stats.ts`:

   ```ts
   import { getElementsBounds } from "./bounds"
   import type { ExcalidrawElement } from "./types"

   export type Stats =
     | { kind: "scene"; elementCount: number }
     | {
         kind: "single"
         id: string
         x: number
         y: number
         width: number
         height: number
         angleDeg: number
       }
     | { kind: "multi"; count: number; x: number; y: number; width: number; height: number }

   export function computeStats(
     selectedElements: readonly ExcalidrawElement[],
     allElements: readonly ExcalidrawElement[],
   ): Stats {
     if (selectedElements.length === 0) {
       return {
         kind: "scene",
         elementCount: allElements.filter((e) => !e.isDeleted).length,
       }
     }
     if (selectedElements.length === 1) {
       const el = selectedElements[0]!
       return {
         kind: "single",
         id: el.id,
         x: el.x,
         y: el.y,
         width: el.width,
         height: el.height,
         angleDeg: (el.angle * 180) / Math.PI,
       }
     }
     // 2+ selected, none deleted (selection state never references deleted
     // elements) — getElementsBounds only returns null for an empty or
     // fully-deleted input, neither of which is reachable here.
     const bounds = getElementsBounds(selectedElements)!
     return {
       kind: "multi",
       count: selectedElements.length,
       x: bounds.x,
       y: bounds.y,
       width: bounds.width,
       height: bounds.height,
     }
   }
   ```

5. - [ ] Add the export to `packages/scene/src/index.ts`, immediately after the existing `export { getElementBounds, getElementsBounds } from "./bounds"` line (line 46):

   ```ts
   export { computeStats } from "./stats"
   export type { Stats } from "./stats"
   ```

6. - [ ] Re-run `pnpm --filter @excalidraw-clone/scene test -- stats` — confirm ALL tests PASS.
7. - [ ] Run `pnpm --filter @excalidraw-clone/scene test` (full package suite) — confirm nothing else regressed.
8. - [ ] Focused gate: `pnpm turbo run lint typecheck test --filter @excalidraw-clone/scene --force` — green.
9. - [ ] Commit: `feat(scene): add computeStats for the stats/dimensions panel`.

---

### Task 2: `StatsPanel` component in `packages/ui`

**Context for a fresh implementer (no prior context needed beyond this):** This is a pure, props-in/callbacks-out component shaped like `LayersPanel`/`PropertiesPanel` — no store access, no scene access. It renders `Stats` (from Task 1, already merged) in three shapes: `"scene"` shows just an element count; `"multi"` shows a read-only (disabled) x/y/width/height box; `"single"` shows editable x/y/width/height/angle fields. Editing follows `PagesTabBar.tsx`'s existing onBlur/Enter-commit, Escape-revert input pattern (`packages/ui/src/PagesTabBar.tsx`, its rename `<input>`) — the only existing precedent for this interaction in the codebase. Each field keeps its own local "draft" string while being typed; committing (blur or Enter) parses it to a number and calls `onChange` with a single-field patch; Escape clears the draft without calling `onChange`, snapping the displayed value back to the live prop. Width/height typed values are clamped to a minimum of 1 before being passed to `onChange` (so a typed `0` or negative can't collapse or invert the element); x/y/angle are unconstrained. A typed angle (displayed in degrees) is converted back to radians before calling `onChange`.

**Important implementation detail — commit must have exactly one source of truth:** Enter should behave like blur (per the spec, both commit), so its handler must call `e.currentTarget.blur()` and let the existing `onBlur` handler do the actual commit — it must **not** also call `commit()` directly, or the value would be committed twice (once synchronously in the keydown handler, once again in the blur handler that fires from `.blur()`, both reading the same stale pre-`setState` draft). Likewise, Escape must **not** call `.blur()` — it should only clear the local draft state — otherwise the same double-fire hits the value that Escape is supposed to discard, and `onChange` would incorrectly fire with the reverted value. Only `onBlur` ever calls the commit function.

**Files:**

- Create: `packages/ui/src/StatsPanel.tsx`
- Modify: `packages/ui/src/index.ts` (export `StatsPanel` + `StatsPanelProps`)
- Create: `packages/ui/test/StatsPanel.test.tsx`

**Interfaces:**

```ts
// packages/ui/src/StatsPanel.tsx
export interface StatsPanelProps {
  t: (key: string) => string
  open: boolean
  stats: Stats // from @excalidraw-clone/scene
  onChange: (
    patch: Partial<Pick<ExcalidrawElement, "x" | "y" | "width" | "height" | "angle">>,
  ) => void
  className?: string
}
```

`StatsPanel` returns `null` when `open` is `false` (mirrors `FindOverlay`'s `if (!open) return null`). `onChange` is called only from fields rendered in the `"single"` case.

**Steps:**

1. - [ ] Write the failing tests, `packages/ui/test/StatsPanel.test.tsx`:

   ```tsx
   import type { Stats } from "@excalidraw-clone/scene"
   import { fireEvent, render, screen } from "@testing-library/react"
   import userEvent from "@testing-library/user-event"
   import { describe, expect, it, vi } from "vitest"
   import { StatsPanel } from "../src/StatsPanel"

   const t = (key: string): string => key

   const sceneStats: Stats = { kind: "scene", elementCount: 3 }
   const singleStats: Stats = {
     kind: "single",
     id: "el1",
     x: 10,
     y: 20,
     width: 30,
     height: 40,
     angleDeg: 0,
   }
   const multiStats: Stats = { kind: "multi", count: 2, x: 0, y: 0, width: 100, height: 50 }

   describe("StatsPanel", () => {
     it("renders nothing when closed", () => {
       render(<StatsPanel t={t} open={false} stats={sceneStats} onChange={vi.fn()} />)
       expect(screen.queryByTestId("stats-panel")).not.toBeInTheDocument()
     })

     it("scene kind shows the live element count and no numeric fields", () => {
       render(<StatsPanel t={t} open stats={sceneStats} onChange={vi.fn()} />)
       expect(screen.getByTestId("stats-element-count")).toHaveTextContent("3")
       expect(screen.queryByTestId("stats-x")).not.toBeInTheDocument()
     })

     it("multi kind shows a read-only bounding box; inputs are disabled", () => {
       render(<StatsPanel t={t} open stats={multiStats} onChange={vi.fn()} />)
       expect(screen.getByTestId("stats-multi-count")).toHaveTextContent("2")
       const widthInput = screen.getByTestId("stats-width")
       expect(widthInput).toBeDisabled()
       expect(widthInput).toHaveValue("100")
       expect(screen.queryByTestId("stats-angle")).not.toBeInTheDocument()
     })

     it("single kind shows all five editable fields with the element's live values", () => {
       render(<StatsPanel t={t} open stats={singleStats} onChange={vi.fn()} />)
       expect(screen.getByTestId("stats-x")).toHaveValue("10")
       expect(screen.getByTestId("stats-y")).toHaveValue("20")
       expect(screen.getByTestId("stats-width")).toHaveValue("30")
       expect(screen.getByTestId("stats-height")).toHaveValue("40")
       expect(screen.getByTestId("stats-angle")).toHaveValue("0")
       expect(screen.getByTestId("stats-width")).not.toBeDisabled()
     })

     it("typing a new width and blurring commits onChange with the typed value", async () => {
       const onChange = vi.fn()
       render(<StatsPanel t={t} open stats={singleStats} onChange={onChange} />)
       const input = screen.getByTestId("stats-width")
       await userEvent.clear(input)
       await userEvent.type(input, "75")
       fireEvent.blur(input)
       expect(onChange).toHaveBeenCalledWith({ width: 75 })
     })

     it("Enter commits the same way as blur", async () => {
       const onChange = vi.fn()
       render(<StatsPanel t={t} open stats={singleStats} onChange={onChange} />)
       const input = screen.getByTestId("stats-x")
       await userEvent.clear(input)
       await userEvent.type(input, "99{Enter}")
       expect(onChange).toHaveBeenCalledTimes(1)
       expect(onChange).toHaveBeenCalledWith({ x: 99 })
     })

     it("Escape reverts the typed value without committing", async () => {
       const onChange = vi.fn()
       render(<StatsPanel t={t} open stats={singleStats} onChange={onChange} />)
       const input = screen.getByTestId("stats-height")
       await userEvent.clear(input)
       await userEvent.type(input, "999")
       await userEvent.keyboard("{Escape}")
       expect(onChange).not.toHaveBeenCalled()
       expect(input).toHaveValue("40")
     })

     it("typing 0 or a negative width clamps to a minimum of 1 before committing", async () => {
       const onChange = vi.fn()
       render(<StatsPanel t={t} open stats={singleStats} onChange={onChange} />)
       const input = screen.getByTestId("stats-width")
       await userEvent.clear(input)
       await userEvent.type(input, "-5")
       fireEvent.blur(input)
       expect(onChange).toHaveBeenCalledWith({ width: 1 })
     })

     it("committing the angle field converts typed degrees back to radians", async () => {
       const onChange = vi.fn()
       render(<StatsPanel t={t} open stats={singleStats} onChange={onChange} />)
       const input = screen.getByTestId("stats-angle")
       await userEvent.clear(input)
       await userEvent.type(input, "90")
       fireEvent.blur(input)
       expect(onChange).toHaveBeenCalledWith({ angle: Math.PI / 2 })
     })
   })
   ```

2. - [ ] Run `pnpm --filter @excalidraw-clone/ui test -- StatsPanel` — confirm it FAILS (module doesn't exist).
3. - [ ] Create `packages/ui/src/StatsPanel.tsx`:

   ```tsx
   import type { ExcalidrawElement, Stats } from "@excalidraw-clone/scene"
   import { useState } from "react"

   export interface StatsPanelProps {
     t: (key: string) => string
     open: boolean
     stats: Stats
     onChange: (
       patch: Partial<Pick<ExcalidrawElement, "x" | "y" | "width" | "height" | "angle">>,
     ) => void
     className?: string
   }

   interface FieldProps {
     testId: string
     label: string
     value: number
     disabled: boolean
     onCommit: (n: number) => void
   }

   function Field({ testId, label, value, disabled, onCommit }: FieldProps): React.ReactElement {
     const [draft, setDraft] = useState<string | null>(null)
     const display = draft ?? String(value)

     const commit = (): void => {
       if (draft === null) return
       const n = Number(draft)
       if (Number.isFinite(n)) onCommit(n)
       setDraft(null)
     }

     return (
       <label className="flex items-center justify-between gap-1 py-0.5">
         <span className="text-muted">{label}</span>
         <input
           type="text"
           inputMode="decimal"
           data-testid={testId}
           value={display}
           disabled={disabled}
           onChange={(e) => setDraft(e.target.value)}
           onBlur={commit}
           onKeyDown={(e) => {
             if (e.key === "Enter") {
               e.currentTarget.blur()
             } else if (e.key === "Escape") {
               setDraft(null)
             }
           }}
           className="w-16 rounded border border-panel px-1 text-right disabled:opacity-50"
         />
       </label>
     )
   }

   export function StatsPanel({
     t,
     open,
     stats,
     onChange,
     className,
   }: StatsPanelProps): React.ReactElement | null {
     if (!open) return null

     const container = `fixed bottom-16 left-3 z-30 w-52 rounded-lg bg-panel p-3 text-xs shadow-lg ${className ?? ""}`

     if (stats.kind === "scene") {
       return (
         <aside aria-label={t("stats.title")} data-testid="stats-panel" className={container}>
           <div className="mb-2 font-medium">{t("stats.title")}</div>
           <div data-testid="stats-element-count">
             {t("stats.elements")}: {stats.elementCount}
           </div>
         </aside>
       )
     }

     const isSingle = stats.kind === "single"

     return (
       <aside aria-label={t("stats.title")} data-testid="stats-panel" className={container}>
         <div className="mb-2 font-medium">{t("stats.title")}</div>
         {stats.kind === "multi" && (
           <div data-testid="stats-multi-count" className="mb-2 text-muted">
             {t("stats.selected")}: {stats.count}
           </div>
         )}
         <div>
           <Field
             testId="stats-x"
             label={t("stats.x")}
             value={stats.x}
             disabled={!isSingle}
             onCommit={(n) => onChange({ x: n })}
           />
           <Field
             testId="stats-y"
             label={t("stats.y")}
             value={stats.y}
             disabled={!isSingle}
             onCommit={(n) => onChange({ y: n })}
           />
           <Field
             testId="stats-width"
             label={t("stats.width")}
             value={stats.width}
             disabled={!isSingle}
             onCommit={(n) => onChange({ width: Math.max(1, n) })}
           />
           <Field
             testId="stats-height"
             label={t("stats.height")}
             value={stats.height}
             disabled={!isSingle}
             onCommit={(n) => onChange({ height: Math.max(1, n) })}
           />
           {stats.kind === "single" && (
             <Field
               testId="stats-angle"
               label={t("stats.angle")}
               value={stats.angleDeg}
               disabled={false}
               onCommit={(n) => onChange({ angle: (n * Math.PI) / 180 })}
             />
           )}
         </div>
       </aside>
     )
   }
   ```

   Note the `stats.kind === "single"` check guarding the angle `<Field>` (not the `isSingle` boolean) — TypeScript needs the literal comparison in the JSX condition to narrow `stats` to the `"single"` member and allow `stats.angleDeg` access; `isSingle` alone doesn't narrow the type.

4. - [ ] Add the export to `packages/ui/src/index.ts`, appended after the last export block (after the `FindOverlay` export, before the trailing `ICONS`/`iconHTML` line):

   ```ts
   export { StatsPanel } from "./StatsPanel"
   export type { StatsPanelProps } from "./StatsPanel"
   ```

5. - [ ] Re-run `pnpm --filter @excalidraw-clone/ui test -- StatsPanel` — confirm ALL tests PASS.
6. - [ ] Run `pnpm --filter @excalidraw-clone/ui test` (full package suite) — confirm nothing else regressed.
7. - [ ] Focused gate: `pnpm turbo run lint typecheck test --filter @excalidraw-clone/ui --filter @excalidraw-clone/scene --force` — green.
8. - [ ] Commit: `feat(ui): add StatsPanel component`.

---

### Task 3: Alt+/ keyboard wiring (`Bindings.onToggleStats`)

**Context for a fresh implementer (no prior context needed beyond this):** `apps/web/src/keyboard/shortcuts.ts` exports `attachShortcuts(bindings: Bindings): () => void`, which attaches one `window` `keydown` listener and dispatches on parsed key combos, calling optional callback bindings for app-level concerns it doesn't own directly (see the existing `onNextPage`/`onPrevPage` pattern, called on `Alt+PageDown`/`Alt+PageUp`). This task adds a new optional `onToggleStats` binding, called on `Alt+/`. Note the codebase already has **two** existing `/`-key bindings that must not be confused with this one: `Cmd/Ctrl+/` opens the command palette (`isMeta && key === "/"`), and `Shift+/` (or bare `?`) opens the help dialog (`key === "?" || (e.shiftKey && key === "/")`). `Alt+/` is a third, distinct combo (`e.altKey`, no `isMeta`, no `shiftKey`) and doesn't collide with either.

**Files:**

- Modify: `apps/web/src/keyboard/shortcuts.ts`
- Modify: `apps/web/test/keyboard-shortcuts.test.ts`

**Interfaces:**

`Bindings` gains one new optional field:

```ts
interface Bindings {
  scene: Scene
  onNextPage?: () => void
  onPrevPage?: () => void
  onToggleStats?: () => void
}
```

`attachShortcuts`'s destructured parameter list gains `onToggleStats`. A new branch is inserted in the handler immediately after the existing `e.altKey && key === "pageup"` block (currently lines 176–180) and before `if (key === "escape")` (currently line 181):

```ts
if (e.altKey && key === "/") {
  e.preventDefault()
  onToggleStats?.()
  return
}
```

**Steps:**

1. - [ ] In `apps/web/test/keyboard-shortcuts.test.ts`, add three new `it` blocks inside the top `describe("keyboard shortcuts", ...)` block, immediately after the existing `"Alt+PageDown without a handler does not throw"` test (currently the last case before the block's closing `})`, around line 216–218):

   ```ts
   it("Alt+/ calls onToggleStats when provided", () => {
     detach()
     const onToggleStats = vi.fn()
     detach = attachShortcuts({ scene, onToggleStats })
     window.dispatchEvent(new KeyboardEvent("keydown", { key: "/", altKey: true }))
     expect(onToggleStats).toHaveBeenCalledTimes(1)
   })

   it("Alt+/ without a handler does not throw", () => {
     window.dispatchEvent(new KeyboardEvent("keydown", { key: "/", altKey: true }))
   })

   it("Shift+/ still opens the help dialog (not confused with Alt+/)", () => {
     useAppStore.getState().setOpenDialog(null)
     window.dispatchEvent(new KeyboardEvent("keydown", { key: "/", shiftKey: true }))
     expect(useAppStore.getState().openDialog).toBe("help")
   })
   ```

2. - [ ] Run `pnpm --filter @excalidraw-clone/web test -- keyboard-shortcuts` — confirm the first two new cases FAIL (`onToggleStats` is never called; `Bindings` doesn't even have the field yet, so it's silently ignored, meaning the mock is never invoked). The third case (`Shift+/`) should already PASS — it's pre-existing behavior this task must not break; note this so a false "still failing" reading of that one case isn't mistaken for a real regression.
3. - [ ] Implement in `apps/web/src/keyboard/shortcuts.ts`:
   - Add `onToggleStats?: () => void` to the `Bindings` interface (after `onPrevPage?: () => void`).
   - Add `onToggleStats` to `attachShortcuts`'s destructured parameter: `export function attachShortcuts({ scene, onNextPage, onPrevPage, onToggleStats }: Bindings): () => void {`.
   - Insert the new branch shown in Interfaces above, immediately after the `e.altKey && key === "pageup"` block and before `if (key === "escape")`.
4. - [ ] Re-run `pnpm --filter @excalidraw-clone/web test -- keyboard-shortcuts` — confirm ALL cases PASS (new + pre-existing, including every other `describe` block in the file — `presentation mode read-only guard`, `zoom keyboard shortcuts`, `style clipboard shortcuts`).
5. - [ ] Focused gate: `pnpm turbo run lint typecheck test --filter @excalidraw-clone/web --force` — green.
6. - [ ] Commit: `feat(web): wire Alt+/ to toggle the stats panel`.

---

### Task 4: Wire `StatsPanel` into `App.tsx`

**Context for a fresh implementer (no prior context needed beyond this):** `apps/web/src/components/App.tsx` is the app's single top-level component. It already computes `selectedElements` and `layerElements` (both `useMemo`s keyed on a `sceneRevision` that bumps on every scene mutation — see lines 272–281) and already calls `attachShortcuts({ scene, onNextPage, onPrevPage })` in a `useEffect` (lines 194–200). This task adds local `statsOpen` state, computes `Stats` from the already-existing `selectedElements`/`layerElements`, mounts `<StatsPanel>` as a plain sibling alongside the other fixed-position panels (`LayersPanel`, `PagesTabBar`, the zoom widget), and wires its `onChange` to mutate the single selected element it targets (found by the `id` `computeStats` puts on the `"single"` case — not by broadcasting to every selected id, unlike `PropertiesPanel`'s `onChange`, since `StatsPanel`'s `onChange` only ever fires for a single-element selection). There is no dedicated App.tsx-level unit test file in this codebase (confirmed: no `App.test.tsx` exists under `apps/web/test/`) — this wiring is verified by the focused gate (typecheck + the existing test suite, which must keep passing) and by the e2e spec in Task 6.

**Files:**

- Modify: `apps/web/src/components/App.tsx`

**Interfaces:**

- Consumes: `computeStats` and the `Stats` type (from `@excalidraw-clone/scene`, Task 1); `StatsPanel` (from `@excalidraw-clone/ui`, Task 2); `onToggleStats` binding (from `attachShortcuts`, Task 3).
- Produces: nothing new consumed by later tasks — this is the final integration point for the panel itself. `<StatsPanel>` is mounted and functional after this task; only the i18n strings (Task 5) and e2e coverage (Task 6) remain.

**Steps:**

1. - [ ] Add `computeStats` to the existing `@excalidraw-clone/scene` import block (lines 5–24 today), inserted alphabetically immediately after `BUILTIN_TEMPLATES,` and before `distributeElements,`:

   ```ts
   import {
     alignElements,
     bringForward,
     bringToFront,
     BUILTIN_TEMPLATES,
     computeStats,
     distributeElements,
     duplicateElements,
     expandIdsToGroups,
     type ExcalidrawElement,
     flipElements,
     groupElements,
     type LibraryItem,
     lockElements,
     normalizeToOrigin,
     Scene,
     sendBackward,
     sendToBack,
     ungroupElements,
     unlockAll,
   } from "@excalidraw-clone/scene"
   ```

2. - [ ] Add `StatsPanel` to the existing `@excalidraw-clone/ui` import block (lines 25–32 today), inserted alphabetically between `PropertiesPanel` and `Toolbar`:

   ```ts
   import {
     HamburgerMenu,
     LayersPanel,
     LibraryPanel,
     PagesTabBar,
     PropertiesPanel,
     StatsPanel,
     Toolbar,
   } from "@excalidraw-clone/ui"
   ```

3. - [ ] Add `statsOpen` state, immediately after the existing `const [moreShapesOpen, setMoreShapesOpen] = useState(false)` line (currently line 233):

   ```ts
   const [statsOpen, setStatsOpen] = useState(false)
   ```

4. - [ ] Add the `stats` computation, immediately after the existing `layerElements` `useMemo` (currently line 281, right before the `frames` `useMemo`):

   ```ts
   const stats = useMemo(
     () => computeStats(selectedElements, layerElements),
     [selectedElements, layerElements],
   )
   ```

5. - [ ] Update the existing `attachShortcuts` call (currently lines 194–200) to pass the new binding:

   ```ts
   useEffect(() => {
     return attachShortcuts({
       scene,
       onNextPage: () => switchToPage(cyclePageId(pages, activePageId, "next")),
       onPrevPage: () => switchToPage(cyclePageId(pages, activePageId, "prev")),
       onToggleStats: () => setStatsOpen((v) => !v),
     })
   }, [scene, pages, activePageId, switchToPage])
   ```

   (`setStatsOpen` is a stable `useState` setter identity — it does not need to be added to the dependency array, matching how the existing `onNextPage`/`onPrevPage` closures are handled.)

6. - [ ] Mount `<StatsPanel>`, immediately after the closing `/>` of the `<PagesTabBar ... />` block (currently ending at line 666) and before the `{hasLockedElements && (` block (currently line 668):

   ```tsx
   <StatsPanel
     t={t}
     open={statsOpen}
     stats={stats}
     onChange={(patch) => {
       if (stats.kind !== "single") return
       const id = stats.id
       scene.mutate((draft) => {
         const i = draft.findIndex((e) => e.id === id)
         if (i >= 0) draft[i] = { ...draft[i]!, ...patch } as ExcalidrawElement
       })
     }}
   />
   ```

   Note the `stats.kind !== "single"` guard: `StatsPanel` only ever calls `onChange` while it's rendering the `"single"` case (per Task 2), so this is a defensive no-op path, not a reachable branch under normal operation.

7. - [ ] Run `pnpm --filter @excalidraw-clone/web test` (full package suite) — confirm everything still PASSES (in particular `keyboard-shortcuts.test.ts` and `i18n-shortcuts.test.tsx`, which touch code adjacent to this change).
8. - [ ] Focused gate: `pnpm turbo run lint typecheck test --filter @excalidraw-clone/web --filter @excalidraw-clone/ui --filter @excalidraw-clone/scene --force` — green. (`lint`/`typecheck` matter most here — this task has no new dedicated test of its own.)
9. - [ ] Commit: `feat(web): mount StatsPanel, wire Alt+/ toggle and single-element edits`.

---

### Task 5: i18n strings + `HelpDialog` entry

**Files:**

- Modify: `apps/web/src/locales/en/shortcuts.json`, `apps/web/src/locales/ko/shortcuts.json`
- Modify: `apps/web/src/locales/en/common.json`, `apps/web/src/locales/ko/common.json`
- Modify: `packages/ui/src/HelpDialog.tsx`
- Modify: `apps/web/test/i18n-shortcuts.test.tsx`

**Interfaces / changes:**

- `en/shortcuts.json`: insert `"stats": "Toggle stats panel",` immediately after the existing `"find": "Find on canvas",` entry and before `"help": "Help",` (mirrors the existing `"toggleGrid": "Toggle grid"` naming style).
- `ko/shortcuts.json`: insert `"stats": "통계 패널 토글",` at the matching position (after `"find": "캔버스에서 찾기",`, before `"help": "도움말",`).
- `en/common.json`: insert a new top-level `"stats"` block, immediately after the existing `"find": { ... }` block (currently ending at line 118) and before `"export": { ... }`:
  ```json
  "stats": {
    "title": "Stats",
    "x": "X",
    "y": "Y",
    "width": "W",
    "height": "H",
    "angle": "Angle",
    "elements": "Elements",
    "selected": "Selected"
  },
  ```
- `ko/common.json`: same position (after the `"find"` block, before `"export"`):
  ```json
  "stats": {
    "title": "통계",
    "x": "X",
    "y": "Y",
    "width": "W",
    "height": "H",
    "angle": "각도",
    "elements": "요소",
    "selected": "선택됨"
  },
  ```
- `packages/ui/src/HelpDialog.tsx`: add `{ keys: "Alt+/", label: "shortcuts:stats" }` to the `VIEW_SHORTCUTS` array, immediately after the existing `{ keys: "Cmd/Ctrl+F", label: "shortcuts:find" },` entry (currently line 59) and before `{ keys: "?", label: "shortcuts:help" },` (currently line 60).
- `apps/web/test/i18n-shortcuts.test.tsx`: add one assertion to the existing `it("renders translated shortcut row labels, not raw i18n keys", ...)` test — the file's existing `expect(screen.queryByText(/^shortcuts\./)).toBeNull()` line at the end already guards against a raw-key leak for the new row, so no separate negative-case test is needed.

**Steps:**

1. - [ ] Add the assertion `expect(screen.getByText("Toggle stats panel")).toBeDefined()` to `apps/web/test/i18n-shortcuts.test.tsx`, alongside the file's other `getByText` assertions (e.g. right after the existing `expect(screen.getByText("Find on canvas")).toBeDefined()` line).
2. - [ ] Run `pnpm --filter @excalidraw-clone/web test -- i18n-shortcuts` — confirm it FAILS (`"Toggle stats panel"` isn't rendered yet — neither the locale key nor the `HelpDialog` row exist).
3. - [ ] Add the `"stats"` keys to `en/shortcuts.json` and `ko/shortcuts.json` at the positions specified above.
4. - [ ] Add the `VIEW_SHORTCUTS` entry to `packages/ui/src/HelpDialog.tsx` at the position specified above.
5. - [ ] Add the `"stats"` blocks to `en/common.json` and `ko/common.json` at the positions specified above — not exercised by the `i18n-shortcuts` test itself, but needed so Task 4's already-mounted `StatsPanel` shows real strings instead of raw `stats.*` keys; landing them here keeps all locale work for this feature in one task.
6. - [ ] Re-run `pnpm --filter @excalidraw-clone/web test -- i18n-shortcuts` — confirm it PASSES.
7. - [ ] Run `pnpm --filter @excalidraw-clone/ui test -- HelpDialog` — confirm still green (no regressions from the new row).
8. - [ ] Focused gate: `pnpm turbo run lint typecheck test --filter @excalidraw-clone/web --filter @excalidraw-clone/ui --force` — green (also confirms both JSON files still parse).
9. - [ ] Commit: `feat(web,ui): add stats-panel i18n strings and HelpDialog entry`.

---

### Task 6: E2E coverage + full gate + integrate

**Context for a fresh implementer (no prior context needed beyond this):** Tasks 1–5 land the full feature on this branch. This task adds browser-level proof via Playwright, covering the four behaviors the spec's Testing section calls for: Alt+/ toggles the panel open/closed; a single selected rectangle shows editable x/y/width/height/angle, and typing a new width + blurring both updates the on-canvas element and persists to `localStorage`; a two-element selection shows a read-only combined box (inputs disabled, no commit possible); deselecting shows the scene element count. It follows the existing `apps/web/e2e/roughness.spec.ts` / `apps/web/e2e/group.spec.ts` conventions (`dragOnCanvas`/`parseStoredScene` from `_helpers.ts`, `[data-testid="toolbar-rectangle"]`/`[data-testid="toolbar-selection"]`, marquee-drag for multi-select, `page.keyboard.press("Alt+/")` mirroring `palette.spec.ts`'s `page.keyboard.press("Control+/")`).

**Files:**

- Create: `apps/web/e2e/stats-panel.spec.ts`
- (verification only) full monorepo gate + full e2e suite

**Steps:**

1. - [ ] Write `apps/web/e2e/stats-panel.spec.ts`:

   ```ts
   import { expect, test } from "@playwright/test"
   import { dragOnCanvas, parseStoredScene } from "./_helpers"

   test("Alt+/ toggles the stats panel; scene/single/multi states all show the right stats", async ({
     page,
   }) => {
     await page.goto("/")
     await page.evaluate(() => localStorage.clear())
     await page.reload()
     await page.locator('[data-testid="toolbar-rectangle"]').waitFor()

     // Nothing on the canvas yet: opening shows the scene element count (0).
     await page.keyboard.press("Alt+/")
     await expect(page.locator('[data-testid="stats-panel"]')).toBeVisible()
     await expect(page.locator('[data-testid="stats-element-count"]')).toHaveText("Elements: 0")

     // Alt+/ again closes it.
     await page.keyboard.press("Alt+/")
     await expect(page.locator('[data-testid="stats-panel"]')).toHaveCount(0)

     // Draw two rectangles.
     const draw = async (from: { x: number; y: number }, to: { x: number; y: number }) => {
       await page.locator('[data-testid="toolbar-rectangle"]').click()
       await dragOnCanvas(page, from, to)
       await page.waitForTimeout(120)
     }
     await draw({ x: 100, y: 100 }, { x: 200, y: 160 })
     await draw({ x: 300, y: 100 }, { x: 340, y: 130 })

     await page.keyboard.press("Alt+/")
     await expect(page.locator('[data-testid="stats-panel"]')).toBeVisible()
     await expect(page.locator('[data-testid="stats-element-count"]')).toHaveText("Elements: 2")

     // Select the first rectangle: single stats, editable width.
     await page.locator('[data-testid="toolbar-selection"]').click()
     await page
       .locator("canvas")
       .first()
       .click({ position: { x: 150, y: 130 } })
     await page.waitForTimeout(120)

     const widthInput = page.locator('[data-testid="stats-width"]')
     await expect(widthInput).toHaveValue("100")
     await expect(widthInput).toBeEnabled()

     await widthInput.fill("150")
     await widthInput.blur()
     await page.waitForTimeout(900)

     let sceneJson = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
     let data = parseStoredScene<{ type: string; width?: number; isDeleted?: boolean }>(sceneJson)
     let rects = data.elements.filter((e) => e.type === "rectangle" && !e.isDeleted)
     expect(rects.some((r) => r.width === 150)).toBe(true)

     // Select both rectangles: read-only combined box, no commit possible.
     await dragOnCanvas(page, { x: 80, y: 80 }, { x: 360, y: 180 })
     await page.waitForTimeout(150)
     await expect(page.locator('[data-testid="stats-multi-count"]')).toHaveText("Selected: 2")
     await expect(page.locator('[data-testid="stats-width"]')).toBeDisabled()

     // Deselect: back to the scene element count (still 2 rectangles).
     await page.keyboard.press("Escape")
     await expect(page.locator('[data-testid="stats-element-count"]')).toHaveText("Elements: 2")

     sceneJson = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
     data = parseStoredScene<{ type: string; width?: number; isDeleted?: boolean }>(sceneJson)
     rects = data.elements.filter((e) => e.type === "rectangle" && !e.isDeleted)
     expect(rects.length).toBe(2)
   })
   ```

2. - [ ] From `apps/web/`, run `pnpm exec playwright test stats-panel` — confirm it PASSES (all wiring from Tasks 1–5 is already in place on this branch). If the width-commit assertion flakes, check that `widthInput.blur()` actually fires a blur event in this Playwright version (fall back to clicking elsewhere on the page, e.g. `await page.locator('[data-testid="stats-panel"]').click({ position: { x: 5, y: 5 } })`, if needed) — do not weaken the assertion itself.
3. - [ ] Commit: `test(web): e2e coverage for the stats/dimensions panel`.
4. - [ ] **Full gate:** from the repo root, run `pnpm turbo run lint typecheck test build --force` — confirm every package is green. Fix any fallout on this branch and re-run until clean.
5. - [ ] **Full e2e:** from `apps/web/`, run `pnpm exec playwright test` — confirm the **entire** suite passes, not just `stats-panel.spec.ts`. Pay particular attention to `help.spec.ts` (new `HelpDialog` row) and `palette.spec.ts`/`find.spec.ts` (both bind `/`-based combos that must remain unaffected by the new `Alt+/` branch).
6. - [ ] **Integrate** — this branch was created off `main` (Task 1, Step 0), which is currently one commit ahead of `develop` (the approved spec doc). Fast-forward `main` to this branch's tip first, then bring `develop` up to the same point:
   - `git switch main && git merge --ff-only feat/stats-panel`
   - `git switch develop && git merge --ff-only main`
   - `git push origin main develop`
   - `git branch -d feat/stats-panel` (and delete the remote branch if one was pushed)
   - Update `/home/sung/.claude/projects/-home-sung-excalidraw-clone/memory/MEMORY.md` with a one-line "Stats/dimensions panel SHIPPED" entry (final commit SHA, all refs aligned, full gate green).

---

## Self-Review — spec scope → task mapping

| Spec scope item                                                                                                         | Task              | Notes                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------- |
| `computeStats(selectedElements, allElements)` in `packages/scene/src/stats.ts`, three-case `Stats` union                | Task 1            | TDD; composes existing `getElementsBounds`, no new geometry math                                                      |
| `"scene"` = non-deleted count of `allElements` when nothing selected                                                    | Task 1            | `stats.test.ts` covers empty scene + deleted-element filtering                                                        |
| `"single"` converts stored radians → `angleDeg` for display                                                             | Task 1            | `stats.test.ts` covers 90° and 0° cases                                                                               |
| `"multi"` = `getElementsBounds(selectedElements)`, no angle field                                                       | Task 1            | `stats.test.ts` asserts exact equality against `getElementsBounds` directly, including a rotated element              |
| New `StatsPanel.tsx` in `packages/ui`, shaped like `LayersPanel`/`PropertiesPanel` (props in, callbacks out)            | Task 2            | No store/scene access inside the component itself                                                                     |
| Editing is single-selection only; `onChange` fires only in the `"single"` case; inputs disabled for `"multi"`/`"scene"` | Task 2, Task 4    | `StatsPanel.test.tsx` covers disabled state directly; Task 4's `onChange` wrapper additionally guards on `stats.kind` |
| Commit semantics: onBlur/Enter, not per-keystroke; Escape reverts without committing                                    | Task 2            | Mirrors `PagesTabBar`'s rename-input pattern; single-source-of-truth commit design documented in the task context     |
| Width/height clamp to a minimum of 1; x/y/angle unconstrained                                                           | Task 2            | `StatsPanel.test.tsx` "typing 0 or a negative width clamps to 1" case                                                 |
| Typed `angleDeg` converted back to radians before `onChange`                                                            | Task 2            | `StatsPanel.test.tsx` "committing the angle field" case                                                               |
| `Bindings.onToggleStats` in `shortcuts.ts`, mirroring `onNextPage`/`onPrevPage`; `Alt+/` handler with `preventDefault`  | Task 3            | Placed alongside the other top-level shortcut checks; verified not to collide with `Cmd/Ctrl+/` or `Shift+/`          |
| `App.tsx`: `statsOpen` state, `onToggleStats: () => setStatsOpen((v) => !v)` passed into `attachShortcuts`              | Task 4            | No dedicated App-level unit test exists in this codebase; verified via focused gate + Task 6 e2e                      |
| `stats.toggle`/`stats.title` locale strings in `en`/`ko` `shortcuts.json` and `common.json`                             | Task 5            | `i18n-shortcuts.test.tsx` real-resolution assertion                                                                   |
| New `HelpDialog.tsx` entry, discoverable                                                                                | Task 5            | `VIEW_SHORTCUTS` row + `HelpDialog.test.tsx` regression run                                                           |
| E2E: Alt+/ toggles open/closed; single-element edit persists; multi-select read-only; deselect shows scene count        | Task 6            | One consolidated spec walking all four states in sequence                                                             |
| Full gate (`typecheck`, `test`, `format:check`, `lint`) + full e2e before merge                                         | Task 6, Steps 4–5 | `format:check` runs as part of `pnpm turbo run lint typecheck test build --force`'s `lint` step in this repo's setup  |

**Out-of-scope confirmation (per spec):** no multi-select group-scale/group-move transform is added anywhere in this plan (the `"multi"` case stays strictly read-only, per Task 2/4); no smart/alignment guides or comments/annotations work is included; no toolbar button or menu entry for the panel is added (`Alt+/` and the `HelpDialog` row are the only discovery paths, per Task 3/5); no unit conversion beyond degrees for angle is implemented.

**No-change confirmation:** no files under `packages/renderer/`, the Zustand store (`apps/web/src/store/`), `packages/tools/`, or the resize/rotate drag-handle code (`packages/tools/src/tools/selection/{resize,rotate}.ts`) are modified — this feature is additive (a new pure function, a new pure component, one new keyboard binding, and `App.tsx` wiring) and does not touch how elements are dragged, resized, or rotated by mouse.
