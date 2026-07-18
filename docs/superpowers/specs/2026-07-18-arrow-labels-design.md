# Arrow & Line Labels (Bound Text on Linear Elements) — Design

**Date:** 2026-07-18
**Status:** Approved
**Scope:** Double-click an arrow or line to add a text label pinned to the midpoint of its path; the label follows every edit of the linear element and renders over a canvas-colored backing so the stroke never runs through the text.

## Problem

Shape labels shipped at `7b7b551`: double-clicking any of the six bindable shapes creates a bound text label. Arrows and lines — the connectors those shapes exist for — still can't be annotated. Double-clicking an arrow body today is a no-op (unless a bend handle is hit). A flowchart whose edges can't say "yes"/"no" is still half a flowchart.

## Decisions

- **Scope:** both linear types — `arrow` and `line`. They share `ExcalidrawLinearBase`, so one code path covers both. Freedraw is out of scope.
- **Position:** the point at 50% of the polyline's total path length ("midpoint"). Always visually on the middle of the arrow, even with uneven bend segments. Matches upstream Excalidraw. A user-draggable position ratio is explicitly out of scope (YAGNI).
- **Readability:** the renderer paints a padded rectangle in the theme canvas-background color behind linear-element labels, occluding the stroke under the text. SVG export gets the same backing for parity.
- **Reuse over new machinery:** the label is a regular `text` element bound via `containerId`/`boundElements` — the same pipeline as shape labels. No new element types, no fields added to arrows.
- **Empty labels:** identical to shape labels — committing or escaping an empty label deletes the text element and strips the container's `boundElements` ref, with `skipHistory` so the round trip is invisible to undo.

## Design

### 1. Geometry: `polylineMidpoint`

`packages/geometry/src/polyline.ts` (new file, exported from index):

```ts
polylineMidpoint(points: readonly Point[]): Point
```

Returns the point at half the polyline's cumulative segment length.

- 0 points → `{x: 0, y: 0}` (defensive; callers never pass this)
- 1 point → that point
- 2+ points → walk segments accumulating length; interpolate within the segment where the running total crosses `total / 2`. Zero-total-length polylines (all points coincident) return the first point.

Points are in the linear element's local space (relative to element `x`/`y`), same convention as `points` on the element. Pure function; no new dependencies.

### 2. Scene: `LINEAR_LABELABLE_TYPES`, `newLabelForLinear`, reconcile branch

In `reconcile-bound-text.ts` (same home as `LABELABLE_TYPES`, avoiding the factories circular-import trap):

```ts
export const LINEAR_LABELABLE_TYPES: ReadonlySet<ElementType> = new Set(["arrow", "line"])
```

In `factories.ts`:

```ts
newLabelForLinear(container: ExcalidrawLinearElementLike): ExcalidrawTextElement
```

Empty text, `textAlign: "center"`, `verticalAlign: "middle"`, `containerId` set. Box: width 0, height = `fontSize * lineHeight`, positioned so its center sits at `container.{x,y} + polylineMidpoint(container.points)`. Caller adds the `{ id, type: "text" }` back-reference to the container's `boundElements` (same contract as `newLabelFor`).

`reconcileBoundText` gains a linear branch ahead of the inner-box path: when the container's type is in `LINEAR_LABELABLE_TYPES`, compute the midpoint in scene space and **recenter the label's existing box** on it — `x = mid.x - text.width / 2`, `y = mid.y - text.height / 2` — never resizing, since a linear element has no inner box to fit. Alignment is still forced to center/middle. Delete-cascade (container deleted → text deleted) and idempotency (no-op write when nothing changed) behave exactly as the existing branch; the shape/note paths are byte-identical to today.

The renderer draws center-aligned text from the box's center, so recentering the box is sufficient for correct rendering regardless of the text's actual measured width.

### 3. Tools: selection double-click creation branch

In the selection tool's `doubleClick` handler, after the existing checks (bend-handle removal → group drill-in → text hit → **has bound text → edit**, which already covers editing an existing arrow label with zero changes), extend the creation branch: if the hit element's type is in `LABELABLE_TYPES` **or** `LINEAR_LABELABLE_TYPES`, create the label — `newLabelFor` for shapes, `newLabelForLinear` for linear elements — via the same effect shape: mutation (`skipHistory: true`) appending the label and back-reference, `select` the container, `startTextEdit` the label.

Bend-handle double-click (remove bend) is checked first and only fires on an actual handle hit with the arrow selected, so it is unaffected. Locked elements never reach this code — the web driver's `hitTest` (`useDrawingDriver.ts`) skips locked elements and bound text — unchanged.

### 4. Renderer: occlusion backing + SVG parity

`drawText` gains an optional `occlude?: { background: string }` parameter. When set and the text is non-empty:

1. Measure the text (`measureText` in `text-metrics.ts` — already exists) to get its true width/height.
2. Fill a rect of that size + 4px padding per side, centered on the text box's center, in the theme canvas-background color (from `theme-colors.ts`).
3. Draw the text as today.

The canvas renderer (`renderer.ts`) iterates the full element list; it builds a `Map<id, element>` once per frame (or reuses an existing lookup if one is present) and passes the flag for text elements whose `containerId` resolves to an `arrow`/`line` container. Shape and note labels are unaffected — no backing.

`svg.ts` mirrors the behavior: a `<rect>` in the canvas background color behind the label text, same measurement and padding, only for linear-element labels.

### 5. Web/UI: no changes required, one help-text touch

`commitTextEdit` (empty-label cleanup keys off `containerId`, which is set), `TextEditingOverlay`, the store, and keyboard handling all work as-is. The HelpDialog "Double-click" entry's copy is generalized to mention arrows/lines (en + ko locale strings updated).

## Behavior summary

- Double-click an arrow or line body → empty label appears at the path midpoint, editor open.
- Double-click a labeled arrow → edits the existing label (already works today via the bound-text branch).
- Drag endpoints, rebind, add/move/remove bend points, drag the whole arrow → label re-centers on the new midpoint via `reconcileBoundText` after every mutation.
- Escape/blur with empty text → label deleted, back-reference stripped, undo history untouched.
- Delete the arrow → label cascades to deleted.
- Label text renders over a canvas-colored backing rect; the stroke never crosses the glyphs. Same in SVG export.

## Testing

- **geometry** (`polyline.test.ts`): 2-point midpoint; 3-point uneven segments (midpoint lands inside the longer segment at exactly half total length); single point; coincident points.
- **scene** (`labels.test.ts` extension): `newLabelForLinear` box centered on midpoint; reconcile recenters after container move and after `points` change; resize never occurs; delete cascade; idempotent no-op leaves array entries reference-equal; shape-label reconcile output byte-identical to before.
- **tools** (`selection-doubleclick.test.ts` extension): double-click bare arrow → mutation + select + startTextEdit effects with a text element bound to the arrow; bare line → same; arrow with existing label → startTextEdit only; bend-handle double-click still removes the bend and creates no label.
- **renderer**: text with linear container → backing rect fill call in canvas bg color precedes text draw; shape-label text → no backing; empty text → no backing; SVG export contains the backing `<rect>` for a labeled arrow only.
- **e2e** (`arrow-labels.spec.ts`): (1) draw two shapes, connect with arrow, double-click arrow, type label, commit → label exists at midpoint; drag one shape → label midpoint follows; reload → label persists. (2) double-click a line, Escape without typing → no text element remains, line's `boundElements` is null.
- **Full gate:** lint, typecheck, unit, all e2e green before merge.

## Out of scope (follow-up candidates)

- Draggable label position along the arrow (position ratio on the element)
- Frame labels
- Text auto-shrink for long labels
- Freedraw labels
