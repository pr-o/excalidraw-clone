# More Shapes (Pentagon, Octagon) + Overflow Flyout — Design

**Date:** 2026-07-25
**Status:** Approved
**Scope:** Add pentagon and octagon as new drawable shapes, continuing the convex-polygon pipeline established by triangle/parallelogram/hexagon. Introduce them via a new "more shapes" overflow flyout in the toolbar rather than flat buttons, without touching the existing 6 shape buttons or any existing e2e test.

## Problem

The v2 backlog calls for more shapes. The existing flowchart-shape batch (triangle, parallelogram, hexagon) proved the convex-polygon pipeline (`shapeVertices` in `packages/geometry`, generic `polygonShape` renderer, generic `pointInConvexPolygon`/`polygonEdgePointToward` hit-testing and binding) generalizes cleanly to any convex polygon — pentagon and octagon need no new geometry/rendering machinery, only new vertex formulas and element-type plumbing.

Separately, the toolbar already has 15 flat buttons. Appending shapes indefinitely as flat buttons doesn't scale, but a full migration of all 8 shapes into a flyout would require rewriting ~20 existing e2e specs that click `toolbar-rectangle`/`toolbar-triangle`/etc. directly (confirmed via grep — none of them go through any open-menu step first). That migration cost is out of proportion to this feature.

## Decisions

- **Pentagon and octagon join the convex-polygon pipeline:**
  - `packages/geometry/src/polygon.ts`: extend `PolygonShapeKind` with `"pentagon" | "octagon"`; add regular-polygon vertex formulas (5-gon / 8-gon inscribed in the element's bounding box), same style as the existing `hexagon` case.
  - `packages/scene/src/types.ts`: add `"pentagon" | "octagon"` to `ElementType`.
  - `packages/renderer/src/shapes/polygon.ts`: widen the `PolygonElement` union to include the two new element types. No changes to `polygonShape` itself.
  - `packages/tools/src/tools/pentagon.ts`, `octagon.ts`: mirror `hexagon.ts` exactly (drag-to-size tool, same factory shape).
  - `packages/tools/src/registry.ts`, `packages/tools/src/index.ts`, `packages/tools/src/types.ts`: register both new tools, same pattern as hexagon.
  - Hit-testing and arrow edge-binding require **no changes** — `pointInConvexPolygon` and `polygonEdgePointToward` already operate generically over any vertex array.
  - `packages/scene/src/reconcile-bound-text.ts`: add `"pentagon"`, `"octagon"` to the bound-text-eligible element type allowlist, enabling double-click-to-label on both, consistent with the other 6 shapes.
  - `packages/ui/src/shared/icons.ts`: new SVG icons for `pentagon` and `octagon`, following the existing per-element-type icon convention.

- **Keyboard shortcuts, direct (bypass the flyout):** `5` selects pentagon, `8` selects octagon — continuing the numeric-sides convention (`3`=triangle, `6`=hexagon; both digits confirmed unused). Registered in `apps/web/src/keyboard/shortcuts.ts`, documented in `HelpDialog`, and added to both `apps/web/src/locales/{en,ko}/shortcuts.json`. Shortcuts select the tool directly and do not require the flyout to be open.

- **New `MoreShapesMenu` component** (`packages/ui/src/MoreShapesMenu.tsx`), modeled directly on the existing `HamburgerMenu` pattern for consistency and lower risk:
  - Controlled from `App.tsx` via `open: boolean` / `onOpenChange: (open: boolean) => void` state (mirrors `menuOpen`/`HamburgerMenu`).
  - `relative`-positioned wrapper; a single toggle button (`data-testid="toolbar-more-shapes"`) with a new static "more shapes" icon (a UI-only icon in `icons.ts`, not tied to an element type — same category as the existing `hamburger` icon). The button shows `active` styling whenever the current tool is pentagon or octagon.
  - Clicking the button toggles a `role="menu"` popout (`absolute`, `z-50`, same visual shell as `HamburgerMenu`'s panel) containing two `IconButton`s — `data-testid="toolbar-pentagon"` and `data-testid="toolbar-octagon"`. Selecting either sets the active tool and closes the popout. Escape closes the popout (same `useEffect` keydown pattern as `HamburgerMenu`).
  - No "remembers last-selected shape" behavior and no split-button/caret — deliberately simplified relative to a full 8-shape flyout design, since there are only 2 items today. This also keeps the component reusable as a general "more shapes" overflow home for future shapes.

- **Toolbar wiring:** `packages/ui/src/Toolbar.tsx` gains one new slot — `MoreShapesMenu` — appended immediately after the hexagon button. The existing 6 shape buttons (`rectangle`, `ellipse`, `diamond`, `triangle`, `parallelogram`, `hexagon`) are **unchanged**: same `IconButton`s, same testids, same position. This is a purely additive change to the toolbar.

- **YAGNI:** no caret/split-button, no "last selected shape" memory, no migration of the existing 6 shapes into any flyout, no generalized "shape picker" abstraction beyond what 2 items need today.

## Testing

Unit TDD:

- `packages/geometry/test`: vertex-formula tests for pentagon/octagon (vertex count, bounding-box containment).
- `packages/renderer/test`: extend existing polygon shape test to cover the two new element types.
- `packages/tools/test`: factory/tool tests for pentagon and octagon, mirroring hexagon's.
- `packages/scene/test`: `reconcile-bound-text` allowlist test extended for both.
- `packages/ui/test`: new `MoreShapesMenu.test.tsx` (open/close toggle, Escape closes, selecting an item calls the right callback and closes); `Toolbar.test.tsx` updated for the new slot.

E2e: new `apps/web/e2e/more-shapes.spec.ts` covering — open the flyout via click, select pentagon and octagon, draw each and verify element type/geometry on the scene, keyboard shortcuts `5`/`8` select directly without opening the flyout, Escape closes the open flyout, and a label case (double-click pentagon/octagon to add a bound text label, consistent with `shape-labels.spec.ts` conventions).

Full gate (`tsc` + unit + e2e) before merge. No changes required to any of the ~20 existing e2e specs that reference the existing 6 shape toolbar buttons.

## Out of scope (follow-up candidates)

- Migrating the existing 6 shapes into the flyout (deferred — would require rewriting ~20 e2e specs)
- Caret/split-button + "last selected shape" memory on the flyout button
- Additional shapes beyond pentagon/octagon (star, cloud, cylinder — each needs concave/curved geometry beyond the convex-polygon pipeline)
