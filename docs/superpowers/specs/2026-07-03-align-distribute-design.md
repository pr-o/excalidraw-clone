# Align & Distribute — Design

**Date:** 2026-07-03
**Status:** Approved (design), pending implementation plan
**Builds on:** v1.4 style controls / PropertiesPanel (a39e305), existing multi-select (marquee) and z-order/duplicate handlers.

## Goal

Let a user tidy a multi-selection: **align** selected elements to a shared edge or center (6 ways) and **distribute** them with equal spacing (2 axes), via a new **Arrange** section in the PropertiesPanel.

## Decisions (locked during brainstorming)

1. **Scope is Align + Distribute only.** Z-order, duplicate, and delete already ship in the PropertiesPanel — not re-implemented here. **Grouping is deferred** to its own later spec (it rewires the selection state machine; align/distribute do not).
2. **Delivery surface:** a new `Arrange` `<Section>` in `PropertiesPanel`, shown only when 2+ elements are selected — mirrors the existing `Layers`/`Actions` sections.
3. **Pure geometry lives in the scene package**; the web layer applies patches through `scene.mutate`, exactly like the existing z-order handlers.
4. **No keyboard shortcuts** this version (panel-only, matching upstream Excalidraw). **No live alignment guides** during drag (separate feature).

## Current-state findings (ground truth)

- **Multi-select works** (`packages/tools/src/tools/selection/marquee.ts`, `selectedIds: string[]`); multi-element move already works via `buildDragMoveEffect(movedIds, dx, dy)`.
- **Z-order already ships.** `PropertiesPanel` declares `onSendToBack/onSendBackward/onBringForward/onBringToFront`, `onDuplicate`, `onDelete`; all wired in `App.tsx:264-331` by mutating the `draft` array inside `scene.mutate`. The panel renders a `properties.layers` section (`PropertiesPanel.tsx:206-237`) and `properties.actions` section.
- **`groupIds` is a dead field** — declared on `ExcalidrawElementBase` (`types.ts:63`), only ever `[]`. No grouping logic anywhere. (Confirms grouping is a separate effort.)
- `PropertiesPanel` renders `null` when `selectedElements.length === 0` (`PropertiesPanel.tsx:50`); it takes `selectedElements: readonly ExcalidrawElement[]` and calls typed `on*` callbacks. UI package convention: `t: (key: string) => string`.
- `getElementBounds(el): Bounds` exists (`packages/scene/src/bounds.ts`) — returns axis-aligned `Bounds = { x, y, width, height }` (from `@excalidraw-clone/geometry`), rotation-aware. Confirmed.
- `scene.mutate((draft) => …)` runs `reconcileBoundText` then `reconcileBindings` after every mutation (`scene.ts:54-55`), so a moved bound arrow reflows to its targets automatically.
- Linear element points are **relative** to the element's `x`/`y`; changing only `x`/`y` translates the whole element (including its points). So align/distribute can operate purely on `x`/`y`.
- i18n lives in `apps/web/src/locales/{en,ko}/common.json` under a `properties` block.

## Architecture

### Layer 1 — Scene: pure arrange geometry

**`packages/scene/src/arrange.ts`**

```ts
export type AlignEdge = "left" | "centerX" | "right" | "top" | "centerY" | "bottom"
export type DistributeAxis = "horizontal" | "vertical"
export interface PositionPatch {
  id: string
  x: number
  y: number
}

export function alignElements(
  elements: readonly ExcalidrawElement[],
  edge: AlignEdge,
): PositionPatch[]

export function distributeElements(
  elements: readonly ExcalidrawElement[],
  axis: DistributeAxis,
): PositionPatch[]
```

- **`alignElements`**: union every element's `getElementBounds` into a group box. For each element, compute the new **top-left** `x`/`y` so its requested edge/center lands on the group box's corresponding edge/center:
  - `left` → `x = groupMinX`; `right` → `x = groupMaxX - elBounds.width`; `centerX` → `x = groupCenterX - elBounds.width/2`; analogous for `top`/`bottom`/`centerY` on the y-axis.
  - Because an element's stored `x`/`y` may differ from its bounds' top-left (rotation, linear points), compute the delta on the **bounds** and apply it to the element's `x`/`y`: `newX = el.x + (targetBoundsX - elBounds.x)`. This keeps arrows/lines correct.
  - Returns a patch for every input element (a patch equal to the current position is fine). Requires ≥2 elements to be meaningful; for <2 returns `[]`.
- **`distributeElements`**: requires ≥3 elements; for <3 returns `[]`. Sort elements by bounds-center along the axis. Keep the first and last fixed. Distribute so the **gaps between successive bounding boxes are equal**: total span = (last.center or edge) − (first …); the standard approach is equal edge-to-edge gaps — `gap = (spanBetweenInnerEdges − sumOfInteriorWidths) / (n−1)`, then lay interior boxes left-to-right. Returns patches (only the interior elements need to move, but returning all is fine).
- Both are **pure**, touch only `x`/`y`, and never mutate inputs. Exported from `packages/scene/src/index.ts` along with the types.

### Layer 2 — Web: apply handlers

In `apps/web/src/components/App.tsx`, add two handlers passed to `PropertiesPanel`:

```ts
onAlign={(edge) => {
  const patches = alignElements(selectedElements, edge)
  const byId = new Map(patches.map((p) => [p.id, p]))
  scene.mutate((draft) => {
    for (let i = 0; i < draft.length; i += 1) {
      const p = byId.get(draft[i]!.id)
      if (p) draft[i] = { ...draft[i]!, x: p.x, y: p.y }
    }
  })
}}
onDistribute={(axis) => { /* same shape, distributeElements */ }}
```

Selection is preserved (we only change positions). Mirrors the existing `onChange`/z-order handler style exactly.

### Layer 3 — UI: Arrange section

In `packages/ui/src/PropertiesPanel.tsx`:

- Extend `PropertiesPanelProps` with `onAlign: (edge: AlignEdge) => void` and `onDistribute: (axis: DistributeAxis) => void` (import the types from `@excalidraw-clone/scene`).
- Add `<Section label={t("properties.arrange")}>` rendered **only when `selectedElements.length >= 2`**:
  - A 6-button grid for align (`grid-cols-3`), testids `align-left`, `align-centerX`, `align-right`, `align-top`, `align-centerY`, `align-bottom`; each has an `aria-label` via `t("properties.align_<edge>")`.
  - A 2-button row for distribute, testids `distribute-horizontal`, `distribute-vertical`, **disabled when `selectedElements.length < 3`**.
- Buttons use short glyph/text content consistent with the existing panel button styling (no new icon system).
- i18n additions (en + ko) under `properties`: `arrange`, `align_left`, `align_centerX`, `align_right`, `align_top`, `align_centerY`, `align_bottom`, `distribute_horizontal`, `distribute_vertical`.

## Data flow (align top)

1. User marquee-selects 3 rectangles → `selectedIds` set; `selectedElements` derived.
2. Arrange section appears (≥2 selected). User clicks `align-top`.
3. `onAlign("top")` → `alignElements(selectedElements, "top")` returns per-element `{id,x,y}`.
4. `scene.mutate` applies the new x/y by id; `reconcile*` runs (bound arrows reflow to their nodes).
5. Elements render at their aligned positions; selection unchanged.

## Testing strategy

- **Unit (scene, `packages/scene/test/arrange.test.ts`):**
  - `alignElements`: for two rects at different positions, `left` gives both the same min-x; `right` the same max-x (x = maxRight − width); `centerX` the same center; analogous for `top`/`centerY`/`bottom`. `<2` elements → `[]`.
  - `distributeElements`: three rects with unequal horizontal gaps → equal edge-to-edge gaps after; first and last unmoved; `<3` → `[]`. Vertical axis analogous.
- **Unit (ui, `packages/ui/test/PropertiesPanel.test.tsx` — add cases):** Arrange section absent with 1 selected, present with 2; clicking `align-left` calls `onAlign("left")`; `distribute-horizontal` disabled with 2 selected, enabled with 3 and calls `onDistribute("horizontal")`.
- **E2e (`apps/web/e2e/align-distribute.spec.ts`):** draw 3 rectangles at varied x/y → switch to selection → marquee-select all → click `align-top` → read persisted scene and assert the three elements share the same top edge (within 1px). Optionally then `distribute-horizontal` and assert equal gaps.

## Scope guards (YAGNI)

- Align + distribute only. **No grouping** (separate spec), **no z-order** (already ships), **no shortcuts**, **no drag-time alignment guides**.
- Pure functions handle only the fields that exist today (`x`, `y` via bounds delta). No rotation-aware bounding beyond what `getElementBounds` already returns.
- Reuse the existing `Section`/button styling; no new icon library.

## Risks / notes

- A **bound arrow** in the selection will reflow to its targets after the mutation, visually overriding its aligned position — expected behavior (connectors follow their nodes). Documented, not worked around.
- The delta-on-bounds approach (`newX = el.x + (targetBoundsX − elBounds.x)`) is safe for rotated elements because `getElementBounds` returns the rotation-aware axis-aligned box; we translate `x`/`y` by the same delta the bounds need.
