# Undo/Redo History Panel — Design

**Date:** 2026-09-21
**Status:** Approved
**Scope:** A toggleable, docked-right panel listing the active page's undo/redo history as human-readable entries (inferred from diffing consecutive snapshots), with click-to-jump to any point in history. No new global state, no thumbnails, no cross-page history.

## Problem

`packages/scene/src/scene.ts` already implements linear undo/redo: `Scene` holds `history: readonly (readonly ExcalidrawElement[])[]` and `historyIndex`, capped at 100 entries, stepped one at a time via `undo()`/`redo()`. There is no way to see the history, no way to jump more than one step at once, and no record of _what_ each step changed — snapshots are raw element arrays with no action metadata. This spec adds a visual panel on top of the existing engine state; it does not change how history is recorded (`pushHistory`/`mutate` are untouched).

`Scene` is instantiated once per page (`apps/web/src/driver/pages.ts`), so history — and this panel — is scoped to the active page, matching how `LayersPanel`/`StatsPanel`/`PropertiesPanel` already read from the active page's `scene`.

## Decisions

- **Scene API additions** (`packages/scene/src/scene.ts`), all additive, no change to existing `undo`/`redo`/`mutate`/`pushHistory` behavior:
  - `getHistory(): readonly (readonly ExcalidrawElement[])[]` — exposes the currently-`private` `history` array read-only.
  - `getHistoryIndex(): number` — exposes the currently-`private` `historyIndex`.
  - `jumpToHistory(index: number): void` — validates `0 <= index < history.length` (no-op if out of range, same defensive style as `canUndo`/`canRedo`), sets `historyIndex = index`, calls `setElements(history[index])` (mirrors `undo()`/`redo()`, parameterized instead of ±1).
- **New pure function `describeHistoryChange(prev, next)` in `packages/scene/src/describe-history-change.ts`**, independently unit-testable, no UI dependency. Diffs two consecutive snapshots (`history[i-1]` → `history[i]`) by element `id`, including soft-deleted elements (snapshots include them; `getElements()` filters, `getElementsIncludingDeleted()` doesn't):
  - id missing in `prev`, present + non-deleted in `next` → **added**
  - id present + non-deleted in `prev`, deleted or missing in `next` → **removed**
  - id in both, only `x`/`y`/`points` translated → **moved**
  - id in both, `width`/`height` (or points bbox) changed → **resized**
  - id in both, only style fields changed (`strokeColor`, `backgroundColor`, `strokeWidth`, `opacity`, `roughness`, etc.) → **restyled**
  - same id set, same field values, only array order changed → **reordered**
  - anything else, or a mixture of categories within one transition → **modified** (generic fallback)
  - Returns a discriminated result e.g. `{ category: "moved" | "added" | ... ; count: number } | { category: "initial" }` (index 0 is always `"initial"`) for the UI layer to map to an i18n string; the function itself returns no display text.
- **New pure component `HistoryPanel.tsx` in `packages/ui`**, shaped like `LayersPanel` (props in, callbacks out, no store access inside).
  - Props: `t`, `history: readonly (readonly ExcalidrawElement[])[]`, `currentIndex: number`, `open: boolean`, `onToggle: () => void`, `onJump: (index: number) => void`.
  - Collapsed state: fixed toggle button, same visual language as `LayersPanel`'s `‹›` button.
  - Open state: `<aside>` list, one row per history entry, newest first (reverse chronological). Each row's label comes from `describeHistoryChange(history[i-1], history[i])` (computed once for the whole array on render, not per-row-per-render), mapped to an i18n string.
  - The entry where `index === currentIndex` gets the same `bg-accent-soft` highlight `LayersPanel` uses for selected rows.
  - Clicking a row calls `onJump(index)`. No thumbnails/previews — text label only, matching `LayersPanel`'s plain-list density.
  - **Docked right, offset below `PropertiesPanel`** (which floats `top-3 right-3`) to avoid overlap: `fixed right-0 top-16 h-[calc(100%-5rem)]`, mirroring `LayersPanel`'s left-dock geometry (`top-16`/`h-[calc(100%-5rem)]`) but on the opposite edge. Exact offset gets a visual pass in final smoke-check, consistent with how past panels' layout/contrast issues were caught late (e.g. the dark-mode `LayersPanel`/dialog-shell contrast fixes).
- **Wiring** (`apps/web/src/components/App.tsx`): `const [historyOpen, setHistoryOpen] = useState(false)` (mirrors `layersOpen`); mount `<HistoryPanel>` fed by the same `scene` already used for `LayersPanel`/`StatsPanel`: `history={scene.getHistory()}`, `currentIndex={scene.getHistoryIndex()}`, `onJump={(i) => scene.jumpToHistory(i)}`. **No new keyboard shortcut** — toggle button only, matching `LayersPanel` (not `StatsPanel`'s `Alt+/` overlay pattern, since this docks rather than overlays).
- **i18n**: `history.title`, `history.toggle`, `history.initial` ("Initial state"), and one count-pluralized key per category — `history.added`, `history.removed`, `history.moved`, `history.resized`, `history.restyled`, `history.reordered`, `history.modified` — using i18next v24's `_one`/`_other` suffix convention with `{{count}}` interpolation. Added to both `en/common.json` and `ko/common.json`.
- **`HelpDialog.tsx`**: one entry noting the panel exists (no shortcut to document).

## Testing

Unit TDD:

- `packages/scene/test/describe-history-change.test.ts` (new) — each category in isolation, mixed-category → `modified` fallback, index-0 → `initial`.
- `packages/scene/test/scene.test.ts` (extend existing) — `jumpToHistory` bounds-checking (no-op below 0 / at-or-above length), correct `setElements`/`notify` on a valid jump, `getHistory`/`getHistoryIndex` expose current state.
- `packages/ui/test/HistoryPanel.test.tsx` (new) — renders one row per history entry, current-entry highlight, click → `onJump` callback with correct index, collapsed/expanded toggle (mirrors `LayersPanel.test.tsx`'s structure).

E2E (`apps/web/e2e/history-panel.spec.ts`, new): toggle panel open/closed; make a few distinct edits (add, move, delete) and verify entries appear with the expected labels; click an older entry and verify the canvas reflects that historical state; make a new edit after jumping back and verify the truncated-future entries are gone (existing `pushHistory` truncation behavior, now visible in the panel).

Full gate (`typecheck`, `test`, `format:check`, `lint`) before merge, per this repo's established convention.

## Out of scope (follow-up candidates)

- Cross-page history (jumping to a state on a different page) — history stays per-page, matching the existing per-page `Scene` model.
- Thumbnails/visual previews per history entry.
- A keyboard shortcut to toggle the panel (button-only, matching `LayersPanel`).
- Branching/tree history (only linear undo/redo exists today; jumping back and editing still truncates the future, as it does now).
- Changing how/when history entries are recorded (`skipHistory`, `MAX_HISTORY` cap) — this spec only visualizes existing recording behavior.
