# Elements/Layers Panel — Design

**Date:** 2026-07-22
**Status:** Approved
**Scope:** A toggleable left-side panel listing every scene element in z-order (front-to-back), with per-row reorder buttons and two-way selection sync with the canvas. Extracts the existing inline z-order logic (currently four lambdas in `App.tsx`) into reusable `packages/scene` utilities used by both the panel and the existing `PropertiesPanel` reorder actions (which the panel replaces).

## Problem

`PropertiesPanel.tsx` already has a "Layers" section with four reorder buttons (`sendToBack`/`sendBackward`/`bringForward`/`bringToFront`), wired to inline callbacks in `App.tsx` (`App.tsx:318-357`) that mutate the scene array directly via `scene.mutate()`. There is no scene-level reorder utility (`grep packages/scene/src -e sendToBack` etc. returns zero matches) and no way to see or select elements except by clicking them on canvas — with overlapping shapes this makes precise z-order control and selection difficult. There's also no dedicated view of the full element stack.

## Decisions

- **Extract z-order logic to `packages/scene/src/z-order.ts`**: four pure functions, `sendToBack`, `sendBackward`, `bringForward`, `bringToFront`, each `(elements: ExcalidrawElement[], selectedIds: string[]) => ExcalidrawElement[]`, ported verbatim from the current `App.tsx` semantics (move-to-front/back = filter+concat; forward/backward = adjacent swap skipping already-selected neighbors). `App.tsx`'s callbacks become thin wrappers: `scene.mutate(draft => draft.splice(0, draft.length, ...sendToBack(draft, selectedIds)))`. New `packages/scene/test/z-order.test.ts` unit-tests all four directly (multi-select gaps, adjacent-selected no-ops, single element, empty selection).
- **New `LayersPanel` component** in `packages/ui/src/LayersPanel.tsx`, props-driven with no internal store — same convention as `LibraryPanel`/`PropertiesPanel`:
  - Props: `elements: ExcalidrawElement[]` (scene order), `selectedIds: string[]`, `open: boolean`, `onToggle: () => void`, `onSelect: (id: string, opts: { additive: boolean }) => void`, `onSendToBack/onSendBackward/onBringForward/onBringToFront: (id: string) => void`.
  - Renders `elements` reverse-iterated (last array index = top row = front-most, matching the panel's front-to-back reading order).
  - Each row: a type icon + label (element type name, e.g. "Rectangle"; text elements show their text content instead), a lock icon when `element.locked`, selected-state highlight driven by `selectedIds`, and the four reorder buttons scoped to that row's single element id (not the full multi-selection).
  - Elements sharing a `groupId` get a subtle adjacent visual bracket/indent — no collapsing, no expand/collapse interaction (flat list, matching the existing flat-grouping model).
  - Frames render as ordinary rows in z-order — no special nesting for frame membership in this pass.
- **Wiring in `App.tsx`**: new `layersOpen` state (mirrors `libraryOpen`), toggle button positioned on the left below the `HamburgerMenu`. `onSelect` calls the existing `useAppStore.getState().setSelection(...)` path used by canvas click/shift-click, so list-driven selection is indistinguishable from canvas-driven selection. `selectedIds` (already read from the store for `PropertiesPanel`) is passed straight through.
- **`PropertiesPanel` simplification**: remove the "Layers" section (4 buttons) and its `onSendToBack`/`onSendBackward`/`onBringForward`/`onBringToFront` props — the new panel is the sole reorder surface, avoiding two call sites for the same action.
- **YAGNI**: no visibility/hide toggle (would need a new `hidden` field on the element model — explicitly deferred), no drag-and-drop row reordering (buttons only), no collapsible groups, no element renaming/thumbnails.

## Testing

Unit TDD: `packages/scene/test/z-order.test.ts` for the four extracted functions. Component test for `LayersPanel` in `packages/ui` (render order matches reversed scene array, row click invokes `onSelect` with correct `additive` flag, each button invokes its matching callback with the row's id). E2e `apps/web/e2e/layers-panel.spec.ts`: toggle panel open/closed, row order reflects z-order, clicking a row selects the element on canvas, per-row reorder button changes visual paint order (pixel-scan or element-array assertion consistent with existing z-order e2e conventions). Full gate (`tsc` + unit + e2e) before merge.

## Out of scope (follow-up candidates)

- Per-element visibility/hide toggle (needs a data model change)
- Drag-and-drop reordering in the panel
- Collapsible/nested group rows
- Element renaming or live thumbnails in rows
- Frame-aware nesting in the layer list
