# Right-Click Context Menu — Design

**Date:** 2026-08-02
**Status:** Approved
**Scope:** A right-click context menu on the canvas: one action set when the target is an element/selection, another when the target is empty canvas. Extracts the pointerdown hit-test into a shared, reusable function; adds element-level duplicate and zoom-to-fit, neither of which exist today.

## Problem

The app has no right-click menu — the browser's native context menu currently shows on canvas right-click. Common actions (copy/cut/paste, duplicate, delete, z-order, group/ungroup, lock/unlock, select-all, zoom-to-fit) exist only via keyboard shortcuts or the command palette (`Cmd+/`), several of which are non-discoverable without reading `HelpDialog`. Two capabilities don't exist at all yet: element-level duplicate (only `duplicatePage` exists, in `apps/web/src/driver/pages.ts`) and zoom-to-fit (only reset-to-100%, `Cmd+0`, exists).

Element-picking for the existing `pointerdown` handler lives as an inline closure in `apps/web/src/driver/useDrawingDriver.ts:156-173` — it is not reusable as-is by a second event handler.

## Decisions

- **Extract hit-testing**: pull the `hitTest` closure out of `useDrawingDriver.ts` into an exported `pickElementAtPoint(scene: Scene, point: Point, options?: { includeLocked?: boolean }): HitResult`. Preserves existing semantics exactly (back-to-front iteration, skip bound text, frame is lowest-priority / only wins on empty interior) and adds one new capability: `includeLocked` (default `false`, so `pointerdown` behavior is byte-for-byte unchanged) lets the new `contextmenu` handler hit locked elements, which `pointerdown` intentionally never does.
- **New Zustand slice** `apps/web/src/store/slices/contextMenu.ts`, matching the existing `dialog.ts`/`palette.ts` shape convention:
  ```ts
  type ContextMenuState =
    | { x: number; y: number; target: "canvas" }
    | { x: number; y: number; target: "element"; elementIds: string[]; locked: boolean }
    | null
  { contextMenu: ContextMenuState; setContextMenu: (s: ContextMenuState) => void }
  ```
- **New `contextmenu` listener** registered next to the existing `pointerdown` listener in `useDrawingDriver.ts`. On fire: `e.preventDefault()` (suppresses the native menu everywhere on the canvas), calls `pickElementAtPoint(scene, point, { includeLocked: true })`, applies the selection rule — right-clicking an unselected element replaces the selection with just that element; right-clicking inside an existing multi-selection leaves the multi-selection intact — then calls `setContextMenu(...)` with cursor position and resolved target.
- **`ContextMenu` presentational component** (`packages/ui/src/ContextMenu.tsx`), same convention as `CommandPalette`: props `{ x, y, items, onClose }`, `items: { id, label, hint?, perform: () => void, disabled?: boolean }[]`. Absolutely positioned at `(x, y)`, clamped/flipped so it never overflows the viewport. Closes on `Escape`, on outside pointerdown, or after any item's `perform()` runs.
- **`ContextMenuHost`** (`apps/web/src/components/ContextMenuHost.tsx`), same convention as `PaletteHost`: reads `contextMenu` from the store, builds the `items` array per target state, and wires each action to existing driver functions via `patchScene` — no new mutation logic beyond the two additions below.
  - **Canvas target**: Paste, Select all, Zoom to fit (hidden — not just disabled — when the scene has zero non-deleted elements).
  - **Element target, locked**: Unlock, Copy only. All mutating actions (duplicate/delete/z-order/group) are hidden — locked elements are unlock-only from this menu, matching the app's existing "locked = protected from mutation" invariant.
  - **Element target, unlocked**: Copy, Cut, Paste, Duplicate, Delete, then Bring to Front / Bring Forward / Send Backward / Send to Back, then Group **or** Ungroup (Group shown only when `elementIds.length >= 2`; Ungroup shown only when at least one selected element has a `groupId`), then Lock.
- **Paste from the menu** (canvas target) uses `navigator.clipboard.readText()` (Async Clipboard API — works from a menu-click user gesture) rather than the native `paste` event `attachClipboard` already listens for (that stays as the `Cmd+V` path, unchanged). On rejection (permission denied, unsupported browser, insecure context) the promise is caught and the menu simply closes with no mutation — same "swallow and no-op" pattern already used for thumbnail render failures (`App.tsx`).
- **New: `duplicateElements(elements, ids)`** in `packages/scene`. Reuses the same primitives `clipboard.ts` already uses for copy (`expandIdsToCopyClosure` + `cloneElementsWithNewIds`), but instead of centering clones at a paste cursor, offsets them by a fixed `+10, +10` and appends in place. Internally it's copy+paste without touching the OS clipboard. Returns the new elements' ids so the host can select them post-duplicate.
- **New: `fitToContent(elements, viewportSize)`** alongside `zoomToPoint` in `packages/geometry`. Computes the union bounding box of all non-deleted elements via the existing `getElementBounds`, picks the zoom level that fits that box in the viewport with ~10% padding, and centers scroll on it. No-op (menu item hidden) on an empty scene.
- **Menu-open guard**: while `contextMenu` is non-null, the existing `onPointerDown` handler's first check closes the menu (`setContextMenu(null)`) instead of also processing the click as a canvas deselect/drag-start — one event, one effect.
- **YAGNI**: no submenus, no keyboard arrow-navigation within the menu (Escape + click only, matching the menu's modest action count), no per-item icons beyond what `CommandPalette` already does (plain labels + hint text), no "paste here" positional offset beyond the existing cursor-position paste logic, no context menu inside text-editing mode (native browser menu still applies there, unchanged).

## Testing

Unit TDD: extend the existing driver hit-test tests for the new `includeLocked` param on `pickElementAtPoint`; new `packages/scene/test/duplicate.test.ts` (offset, fresh ids, frame/group closure carried over — same closure semantics already proven by clipboard tests); new `packages/geometry/test/fit-to-content.test.ts` (bounds math, empty-scene no-op, padding); new store slice test for `contextMenu`.

Component tests: `ContextMenu` (position clamping/flipping, Escape closes, outside-click closes, item click calls `perform` then closes); `ContextMenuHost` (item-list construction across canvas/element/locked/multi-select/grouped states).

E2E (`apps/web/e2e/context-menu.spec.ts`): right-click an element opens the menu with expected items and Delete removes it; right-click empty canvas shows the canvas menu; right-click a locked element shows only Unlock (+Copy) and Unlock actually unlocks; Escape and outside-click both close the menu without side effects.

Full gate (`tsc` + unit + e2e) before merge, per this repo's established convention.

## Out of scope (follow-up candidates)

- Submenus / nested actions
- Keyboard arrow-key navigation inside the menu
- Context menu while actively editing text
- Multi-page-aware actions (e.g. "move to page") in the menu
- Custom/configurable menu items
