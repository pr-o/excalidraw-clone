# Elbow Arrows — Design

**Date:** 2026-07-20
**Status:** Approved
**Scope:** Arrows gain an `elbowed` mode: orthogonal right-angle routing between endpoints, side-snapping at bound shapes, recomputed on every mutation. Toggled per-arrow from a new PropertiesPanel "Arrow type" control. Lines are untouched.

## Problem

Arrows are straight polylines (optionally with manual bends). Flowcharts want orthogonal connectors that stay orthogonal while shapes move — today that requires hand-placing bends and re-fixing them after every drag.

## Decisions

- **Model:** `elbowed: boolean` on `ExcalidrawArrowElement` only; `newArrow` accepts `elbowed` (default `false`). Scene hydration backfills `elbowed: false` for saves that predate the field.
- **Router is a pure scene function** (`routeElbow` in `packages/scene/src/elbow.ts`): takes the two absolute endpoints plus an exit side per endpoint (`"top" | "right" | "bottom" | "left" | null`), returns absolute orthogonal waypoints including the endpoints. A 16px stub leaves each sided endpoint perpendicular to its side before any turn. Route shapes: opposite sides → Z through the midline corridor; perpendicular sides → single L corner; same side → U detour outside the stubs; `null` side (unbound endpoint) → no stub, approached on the dominant axis. Degenerate/collinear cases collapse to the minimal point list; consecutive duplicate points are removed.
- **Bound endpoints snap to side centers.** For an elbowed arrow, a bound endpoint's side is the dominant axis of (current endpoint − bound-shape center); the endpoint becomes that side's center pushed out by the existing `binding.gap`. `binding.focus` is ignored while elbowed (fields stay stored, so toggling back to sharp restores current behavior exactly).
- **The route is fully derived — a mutate invariant.** The elbowed branch lives inside `reconcileBindings`: after endpoint resolution, interior points are replaced wholesale by `routeElbow`'s waypoints (manual bends do not exist for elbowed arrows; any pre-existing bends are dropped on toggle). The branch also runs for elbowed arrows with no bindings, so drawing or dragging an unbound elbow arrow keeps it orthogonal. Reference-stable when the route is unchanged, like the other reconcilers.
- **Interaction:** endpoint dragging/rebinding unchanged. `findHandleAt` suppresses `bend` and `bendAdd` handles for elbowed arrows. Arrow labels keep working (midpoint of `points`). Toggling is a PropertiesPanel patch of `elbowed` on the selected arrows; the reconciler re-routes.
- **UI:** new "Arrow type" section in PropertiesPanel (sharp ⇄ elbow buttons), shown when the selection contains at least one arrow, following the arrowhead-picker pattern with en/ko i18n keys.
- **Rendering: zero changes.** Routed waypoints flow through the existing `linearPath` + arrowhead drawing in both canvas and SVG; corners stay sharp (fits the rough style).
- **YAGNI:** no obstacle avoidance beyond side stubs; no manual segment dragging; no per-tool "draw elbow by default" mode; no rounded corners.

## Testing

Unit TDD: router geometry per case (Z, L, U, unbound ends, stub length, side-center snapping, duplicate collapsing); reconcile integration (toggle → orthogonal points and bends dropped; dragging a bound shape re-routes; unbound elbow stays orthogonal; sharp arrows untouched); handle suppression for elbowed arrows; PropertiesPanel control patch. E2e `elbow-arrows.spec.ts`: bind an arrow between two rects, toggle elbow in the panel → every segment axis-aligned; drag one rect → still axis-aligned and bound; reload persists `elbowed` and the route. Full gate before merge.

## Out of scope (follow-up candidates)

- Obstacle-avoiding routing around shape bounding boxes
- Manual segment dragging with sticky offsets
- Elbow-by-default drawing mode / arrow-type memory for new arrows
- Rounded elbow corners
