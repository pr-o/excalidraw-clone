# Smart Arrows / Connectors — Design

**Date:** 2026-06-23
**Status:** Approved (design)
**Feature:** Arrows that bind to shapes and follow them when the shape moves or resizes.

## Summary

Arrows can attach ("bind") to shapes. A bound arrow endpoint stays glued to the
edge of its target shape, so when the shape is moved or resized the arrow follows
automatically. Binding is created by drawing an arrow so that an endpoint is
released over a shape. This is the headline value of v1.5.

The element data model **already** carries the full binding infrastructure
(`PointBinding`, `startBinding`/`endBinding` on linear elements, `boundElements`
back-references on every element) — these fields are currently dormant. This
feature populates and honors them.

## Scope

**In scope:**

- **Bind on draw** — releasing an arrow endpoint over a bindable shape binds it.
- **Follow on move / resize** — moving or resizing a bound shape updates the
  arrow's endpoints automatically, even when the arrow is not selected.
- **Unbind on arrow-body move** — dragging the whole arrow away from a shape
  breaks the binding (unless the target moves with it).
- **Candidate highlight** — while drawing, the shape under the endpoint is
  highlighted as a binding candidate.
- **Cascade on delete** — deleting a bound shape clears the binding; the arrow
  keeps its last endpoint.

**Out of scope (deferred):**

- **Endpoint-drag rebinding** — re-binding/unbinding an existing arrow by
  dragging an endpoint handle. Requires per-point handle editing for linear
  elements, which does not exist yet. Separate future feature.
- **Re-reconcile on load** — `loadFromJSON` uses `setElements`, not `mutate`, so
  bindings are not re-applied on load. Newly drawn arrows reconcile on the next
  mutation. Acceptable for now.
- **Focus offset** — the perpendicular "focus" offset of real Excalidraw. We use
  a center-anchored edge+gap model; `focus` stays `0`.

## Attach model: edge + gap

For a bound endpoint with target `T`:

1. `C` = center of `T`'s bounding box.
2. `O` = the "toward" reference for the other end:
   - if the other end is free, its absolute point;
   - if the other end is also bound, the center of that end's target.
3. `P` = intersection of the ray `C → O` with `T`'s edge.
4. endpoint = `P + gap * unit(C → O)` (pulled `gap` px outward from the edge).

Edge kinds by element type:

- `rect` — rectangle, image, text, sticky-note container.
- `ellipse` — ellipse.
- `diamond` — diamond.

`gap` (default `BINDING_GAP = 4`) is stored in the `PointBinding`. `focus = 0`,
`fixedPoint` unused.

## Bindable targets

`BINDABLE_TYPES = { rectangle, diamond, ellipse, image, text }`. Sticky-note
containers are rectangles and qualify. Excluded: `line`, `arrow`, `freedraw`,
`frame`.

`canBindTo(el)` returns true when `el.type ∈ BINDABLE_TYPES` and `!el.isDeleted`.

## Architecture

Three layers, following existing conventions.

### `packages/geometry` — edge intersection primitives

Pure functions, no element knowledge:

```ts
type EdgeKind = "rect" | "ellipse" | "diamond"
// Where a ray from the box center toward `toward` crosses the shape edge.
edgePointToward(bounds: Bounds, kind: EdgeKind, toward: Point): Point
```

Internally: ray–rectangle, ray–ellipse, and ray–diamond intersection. The box
center is the ray origin; returns the first edge crossing along `center → toward`.

### `packages/scene/src/bindings.ts` — binding domain logic

Sibling to `reconcile-bound-text.ts`.

```ts
export const BINDING_GAP = 4
export const BINDABLE_TYPES: ReadonlySet<ElementType>
export function canBindTo(el: ExcalidrawElement): boolean
// Topmost bindable element under `point` within a small tolerance, else null.
export function bindingTargetAt(
  point: Point,
  elements: readonly ExcalidrawElement[],
): ExcalidrawElement | null
// Edge+gap absolute endpoint for one bound end.
export function computeBoundEndpoint(target: ExcalidrawElement, toward: Point, gap: number): Point
// Recompute every bound arrow's endpoints; cascade-clear missing/deleted
// targets; keep boundElements back-references in sync. Idempotent, O(n·m).
export function reconcileBindings(draft: ExcalidrawElement[]): void
```

`edgeKindFor(type)` maps element type → `EdgeKind` (rect/ellipse/diamond),
defaulting to `rect`.

### `packages/scene/src/scene.ts` — pipeline hook

`mutate()` runs reconciliation after the caller's mutation. Add
`reconcileBindings` **after** `reconcileBoundText` so note containers are
final-sized before arrows attach to them:

```
mutate(fn):
  draft = [...elements]
  fn(draft)
  reconcileBoundText(draft)   // existing
  reconcileBindings(draft)    // NEW
  setElements(draft); pushHistory unless skipHistory
```

Export `BINDING_GAP`, `BINDABLE_TYPES`, `canBindTo`, `bindingTargetAt`,
`computeBoundEndpoint`, `reconcileBindings` from the scene package index.

### `packages/tools` — arrow tool & selection drag

**Arrow tool (bind on draw).** `ToolContext` already exposes `readElements()`
and `hitTest(at)`, so no plumbing changes. The linear reducer used by the arrow
tool gains binding awareness (arrow-only; the `line` tool keeps current
behavior):

- On `pointerDown`: record `startCandidate = bindingTargetAt(at, elements)?.id`.
- On `pointerMove`: track `endCandidate` for the highlight (carried in
  `LinearState.drawing`).
- On `pointerUp` (non-zero arrow): set `startBinding`/`endBinding`
  (`{ elementId, focus: 0, gap: BINDING_GAP }`) for whichever ends are over a
  target, and push a `{ id: arrowId, type: "arrow" }` back-reference into each
  target's `boundElements`. The post-mutation `reconcileBindings` then snaps the
  endpoints to edge+gap.

**Selection drag (unbind on arrow-body move).** In `translateElements` /
the drag commit, for each moved arrow: if a bound end's target is **not** also in
the moved id set, clear that binding and remove its back-reference. If the target
moves too, keep the binding (reconcile recomputes both ends consistently).

### Candidate highlight (transient overlay)

The highlight is transient UI, not committed state, so it does **not** map to a
`ToolEffect` (those all describe committed changes) and `drawSelectionChrome` has
no highlight concept today. Chosen approach:

- The arrow tool's `drawing` state carries `endCandidate: string | null`.
- The app's render loop already reads live tool state each frame to draw the
  in-progress arrow; it passes the candidate id to the overlay.
- `drawSelectionChrome` gains an optional `highlightIds?: readonly string[]`
  (or a small dedicated `drawBindingHighlight`) that strokes the candidate
  shape's bounds in the binding-highlight color.

Exact overlay signature is finalized in the implementation plan; the contract is:
candidate id flows from arrow-tool state → render loop → overlay, with no new
`ToolEffect` kind.

## Data flow (follow on move)

1. User drags a bound shape → `translateElements` shifts the shape's `x/y`.
2. `scene.mutate` → `reconcileBoundText` → `reconcileBindings`.
3. `reconcileBindings` finds arrows bound to the shape and recomputes the bound
   endpoint(s) via `computeBoundEndpoint`, rewriting the arrow's `points` and
   bounding box (`x/y/width/height`).
4. Listeners re-render; the arrow follows. Resize flows through the same path.

## Edge cases

- **Both ends bound to the same shape** — allowed; edge+gap still resolves (each
  end uses the other end's anchor/center as `toward`).
- **Both ends bound to two shapes** — each end's `toward` is the other target's
  center; resolved in a single `reconcileBindings` pass.
- **Target deleted** — `reconcileBindings` clears the binding and leaves the last
  computed endpoint; no dangling reference remains in `boundElements`.
- **Zero-length arrow on pointerUp** — removed as today; no binding created.
- **Move arrow + its target together** — bindings preserved; both ends recompute.

## Testing (TDD)

- **geometry/edgePointToward** — rect, ellipse, diamond across the 8 compass
  directions; off-axis rays; degenerate (toward == center).
- **scene/bindings**
  - `canBindTo` / `bindingTargetAt` topmost-hit and tolerance.
  - `computeBoundEndpoint` per shape kind (edge + gap).
  - `reconcileBindings`: follows a moved target; follows a resized target;
    cascades on delete; clears binding when target id is missing; keeps
    `boundElements` back-references consistent; idempotent.
- **tools**
  - arrow `pointerUp` over a shape sets the binding + back-reference; not over a
    shape sets none.
  - arrow-alone move clears bindings; arrow + target move keeps them.
- **e2e (Playwright, localStorage scene assertion — established pattern)**
  - Draw two rectangles and an arrow from one to the other; move one rectangle;
    assert the arrow's bound endpoint moved with it.

## Files

**New**

- `packages/geometry/src/binding-edge.ts` (+ test) — `edgePointToward`.
- `packages/scene/src/bindings.ts` (+ test) — binding domain logic.

**Modified**

- `packages/geometry/src/index.ts` — export `edgePointToward`, `EdgeKind`.
- `packages/scene/src/scene.ts` — call `reconcileBindings` in `mutate`.
- `packages/scene/src/index.ts` — export new binding API.
- `packages/tools/src/tools/linear.ts` — bind-on-draw for the arrow tool;
  `endCandidate` in drawing state.
- `packages/tools/src/tools/arrow.ts` — opt into binding behavior.
- `packages/tools/src/tools/selection/drag.ts` (and/or `index.ts`) — unbind on
  arrow-body move.
- `packages/renderer/src/overlay.ts` — candidate highlight in selection chrome.
- `apps/web/src/**` — pass arrow-tool candidate id into the render/overlay path.
- e2e spec under the web app's Playwright suite.

## Non-goals recap

Endpoint-drag rebinding, re-reconcile on load, and the focus offset are
explicitly deferred. The feature is intentionally a single coherent slice:
bind on draw, follow on move/resize, unbind on arrow-body move.
