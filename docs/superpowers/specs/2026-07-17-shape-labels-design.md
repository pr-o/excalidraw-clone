# Shape Labels (Bound Text in Shapes) — Design

**Date:** 2026-07-17
**Status:** Approved
**Scope:** Double-click any bindable shape to add a centered text label that moves, resizes, and deletes with its container.

## Problem

The container↔bound-text machinery exists (sticky notes use it: `text.containerId`, `container.boundElements`, `reconcileBoundText`), and selection double-click already opens the editor for shapes that _have_ a bound text. But there is no way to add a label to a plain shape — double-clicking a bare rectangle or hexagon does nothing. Flowchart shapes without labels are half a flowchart.

## Decisions

- **Scope:** the six bindable shapes only — rectangle, ellipse, diamond, triangle, parallelogram, hexagon. Arrow labels and frame labels are out of scope (follow-up candidates).
- **Fitting:** shape-aware inscribed text box per container type; labels never visually cross the shape outline.
- **Placement of logic:** scene factory + tools effect (the pattern every prior feature used). No new element types; no `label` field on shapes; the label is a regular `text` element bound via `containerId`/`boundElements`, matching the Excalidraw format.
- **Empty labels:** committing (or escaping) an empty label deletes the text element and strips the container's `boundElements` ref.

## Design

### 1. Geometry: `labelInnerBox`

New pure function in `packages/geometry` (alongside `polygon.ts`):

```ts
labelInnerBox(type: ContainerShapeType, box: Box): Box
```

Inscribed axis-aligned text box per container type:

| Container                  | Inner box                                                               |
| -------------------------- | ----------------------------------------------------------------------- |
| rectangle                  | full box inset by 8px (today's `NOTE_PADDING` behavior)                 |
| ellipse                    | inscribed rect: `w/√2 × h/√2`, centered                                 |
| diamond                    | `w/2 × h/2`, centered                                                   |
| triangle (apex-top)        | largest inscribed rect: `w/2 × h/2`, bottom half, centered horizontally |
| parallelogram (25% skew)   | x inset 25% each side, full height                                      |
| hexagon (25% inset points) | x inset 25% each side, full height                                      |

All results additionally respect a minimum 8px inset on every edge and clamp width/height to ≥ 0. Factors may be fine-tuned during implementation; the invariant is _inner box ⊆ shape interior_.

### 2. Scene

- **`newLabelFor(container)`** factory (mirrors the text half of `newNote`): returns an `ExcalidrawTextElement` with empty `text`, `textAlign: "center"`, `verticalAlign: "middle"`, `containerId` set, and box from `labelInnerBox`.
- **`reconcileBoundText`** switches from the uniform `NOTE_PADDING` inset to `labelInnerBox(container.type, containerBox)`. Sticky-note containers are rectangles, so notes keep their exact current behavior — no regression. The function's other invariants (delete cascade, center/middle enforcement, idempotence, O(n)) are unchanged.

### 3. Tools (selection double-click)

In the selection tool's `doubleClick` branch, after the existing "hit has a text ref → `startTextEdit`" case: if the hit is one of the six bindable shape types and has no text ref, emit

1. a `skipHistory` mutation that pushes `newLabelFor(hit)` into the draft and adds `{ id, type: "text" }` to the container's `boundElements`, then
2. `startTextEdit` for the new text element.

Locked shapes are already excluded (hit-test skips them). The skipHistory-create → commit-records pattern matches the note tool, so undo after typing removes a fresh label atomically instead of leaving an empty text element.

### 4. Web (`TextEditingOverlay`)

The close path (blur-commit and Escape alike) gains cleanup: if the element's committed text is empty **and** it has a non-null `containerId`, the mutation deletes the text element and strips the ref from its container's `boundElements`. Sticky notes get this cleanup for free.

### 5. UI / i18n

No toolbar or PropertiesPanel changes. One HelpDialog line — "Double-click a shape to add a label" — with `en` and `ko` strings.

## Testing (TDD throughout)

- **geometry:** `labelInnerBox` per-shape tests — containment inside the shape polygon/ellipse, minimum inset, degenerate (tiny) boxes clamp to zero.
- **scene:** `newLabelFor` shape/field tests; `reconcileBoundText` uses shape-aware boxes for each container type; note (rectangle) behavior byte-identical to today.
- **tools:** double-click on a bare shape creates a bound label and emits `startTextEdit`; second double-click reuses the existing label (no duplicate); double-click on non-shape types unchanged.
- **web:** empty-commit cleanup removes the text element and the container ref; non-empty commit keeps both.
- **e2e:** double-click a diamond, type a label — text renders inside the outline, follows the shape when dragged, persists across reload; committing an empty label leaves the scene label-free.

## Out of scope

- Arrow/linear labels (midpoint-anchored text).
- Frame labels (frames already have `name`).
- Text auto-shrink / font scaling to fit; long labels wrap or overflow vertically exactly as note text does today.
