# Smart Alignment Guides — Design

**Date:** 2026-09-21
**Status:** Approved
**Scope:** Dragging (moving) a selection shows dashed alignment guides and snaps against other elements' edges/centers on both axes, continuously for the duration of the drag. No equal-spacing/distribution guides, no resize-time guides (follow-up candidates).

## Problem

The app has grid-snap (`packages/geometry/src/snap.ts`) but nothing that helps align an element against _other elements_ while dragging — real Excalidraw's signature "smart guides" feature. This was one of three gaps identified in the stats-panel design audit (2026-09-18) and deferred at the time; the user picked it up now that undo/redo history and multi-element resize are both shipped.

## Decisions

- **New pure function `computeAlignmentSnap(movingBounds, candidateBounds, thresholdWorld)` in `packages/geometry/src/alignment-guides.ts`**, alongside `snap.ts` (a related but distinct concern — grid-snap rounds to a fixed lattice; this snaps against other elements' actual positions):
  ```ts
  export interface AlignmentGuide {
    axis: "x" | "y"
    position: number // world coordinate of the guide line
    start: number // perpendicular-axis extent start, world coords
    end: number // perpendicular-axis extent end, world coords
  }
  export interface AlignmentSnapResult {
    dx: number
    dy: number
    guides: readonly AlignmentGuide[]
  }
  export function computeAlignmentSnap(
    movingBounds: Bounds,
    candidateBounds: readonly Bounds[],
    thresholdWorld: number,
  ): AlignmentSnapResult
  ```
  For each axis independently, compares the moving bbox's near-edge, center, and far-edge (3 values) against each candidate's same 3 values; the closest match within `thresholdWorld` wins per axis (X and Y snap independently, so an edge-snap on X and a center-snap on Y can both be active at once). No match on an axis leaves that axis's correction at 0 and contributes no guide.
- **Multi-selection uses the combined bounding box** (`getElementsBounds`) as `movingBounds`, matching the just-shipped multi-element resize feature's precedent for treating a multi-selection as one box.
- **Candidates** = every non-deleted, non-locked element on the active page except the ones being dragged. Frames count as plain boxes (same precedent as multi-resize).
- **Threshold**: 8 screen pixels, converted to world units as `8 / ctx.viewTransform.zoom` so the feel is zoom-independent.
- **Grid interaction**: when `ctx.grid.enabled` is true, alignment-guide snapping is suppressed entirely for that drag (no computation, no guides) — avoids the two snap systems fighting over the final position, matching real Excalidraw's behavior.
- **Bypass**: held Ctrl/Meta disables alignment snapping, reusing the exact modifier check `snapPointToGrid` already uses and the existing `shortcuts:bypassSnap` ("Hold Cmd/Ctrl") HelpDialog entry — no new shortcut is added; that entry's meaning just expands to cover this feature too.
- **Continuous, not one-shot**: `packages/tools/src/tools/selection/index.ts`'s `reduceDragging` calls `computeAlignmentSnap` on every `pointerMove` (unlike the existing grid-snap block, which only applies its correction on the drag's first move) — guides must track which candidate the pointer is currently near as the drag continues. The correction folds into `buildDragMoveEffect`'s `dx`/`dy` the same way the grid-snap correction already does.
- **Guide flow to rendering**: a new `ToolEffect` kind `{ kind: "setGuides"; guides: readonly AlignmentGuide[] }`, emitted every `pointerMove` during a drag (empty array on `pointerUp`/`escape` to clear), routed through `apps/web/src/driver/effects.ts`'s `applyEffects` — mirroring exactly how the laser tool's `laserMove` effect already flows. Lands in a new `apps/web/src/store/slices/guides.ts` slice (`activeGuides: readonly AlignmentGuide[]`).
- **Renderer wiring**: `CanvasRenderer` (`packages/renderer/src/renderer.ts`) gains `setGuides(guides)` + a private field, mirroring its existing `setSelection`/`setMarquee` methods exactly. A new `drawAlignmentGuides(ctx, guides, view, theme)` in `overlay.ts` draws dashed lines (accent color, matching existing chrome styling conventions) for each active guide, called from `render()` alongside `drawSelectionChrome`. `apps/web/src/driver/useDrawingDriver.ts` — which already keeps the live renderer in sync with store diffs this exact way (`if (s.selectedIds !== prev.selectedIds) renderer.setSelection(s.selectedIds)`) — gets one more line for `activeGuides`. No new component, no new render loop.

## Testing

Unit TDD: `packages/geometry/test/alignment-guides.test.ts` (new) — edge-to-edge and center-to-center matches on both axes independently, threshold boundary (just-inside vs. just-outside), multiple candidates picking the closest match per axis, no-match case (zero correction, no guides). `packages/tools/test/selection-drag.test.ts` (extend existing) — grid-enabled suppresses guides entirely, Ctrl/Meta bypasses, multi-selection uses the combined bbox as the moving bounds.

E2E (`apps/web/e2e/alignment-guides.spec.ts`, new): drag one rectangle near another's edge and verify (a) the dragged element's persisted position snaps exactly to the aligned coordinate, (b) enabling the grid suppresses the snap/guide for the same drag, (c) holding Ctrl during the drag bypasses the snap.

Full gate (`typecheck`, `test`, `format:check`, `lint`) before merge, per this repo's established convention. Because this feature's snap correction folds into the shared drag-commit path used by every element move, the implementation plan must call for a **full** e2e suite run (not a scoped one) before merge — the history-panel feature's final review found a regression in a shared path that only the full suite caught, and that lesson applies directly here.

## Out of scope (follow-up candidates)

- Equal-spacing/distribution guides ("equal gap" indicators across 3+ elements) — a distinct, more complex feature (gap-matching across multiple neighbors, not pairwise edge/center comparison) — declined for this pass.
- Resize-time guides (a resized element's moving edge snapping to other elements) — a separate interaction with its own math (`resize.ts`/`resize-group.ts`); a natural, smaller follow-up once move-time guides are proven out.
- Rotation-aware alignment (guides for rotated elements' actual rotated bounding box rather than axis-aligned bounds) — out of scope; matches how the existing `getElementsBounds`/multi-resize precedent already treats bounds as axis-aligned AABBs.
- Any new keyboard shortcut — the existing "Hold Cmd/Ctrl" bypass shortcut's documented meaning simply expands to cover this feature.
