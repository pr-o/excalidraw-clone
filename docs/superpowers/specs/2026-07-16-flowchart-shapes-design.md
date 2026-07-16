# Design: Flowchart shapes — triangle, parallelogram, hexagon

**Date:** 2026-07-16
**Status:** Approved
**Approach:** Three first-class element types; exact polygon edge binding; direct toolbar buttons

## Background

The v2 backlog item "more shape variants" is the last unshipped direction from
2026-05-20. Its other candidates (stroke styles, arrowheads, sticky notes,
connectors/binding) have all shipped since, so what remains is genuinely new
shape _types_. Decisions made during brainstorming:

- **Flowchart set** (triangle, parallelogram, hexagon) over the expressive set
  (star/cloud/bubble), a picker of both, or a generic n-gon tool — these pair
  with smart arrows and the flowchart template story.
- **Exact edge binding**: arrow endpoints land on the actual slanted edges
  (like diamond today), not the bounding box.
- **Three direct toolbar buttons** (no flyout), shortcuts `3` / `G` / `6`.

## 1. Shape conventions

Fixed geometry, no new element options. For a box `w × h`:

- **Triangle** — up-pointing isosceles: `(w/2, 0), (w, h), (0, h)`.
- **Parallelogram** — right-leaning, skew fixed at 25% of width:
  `(w/4, 0), (w, 0), (3w/4, h), (0, h)`.
- **Hexagon** — flowchart style (flat top/bottom, left/right points), inset
  25% of width: `(w/4, 0), (3w/4, 0), (w, h/2), (3w/4, h), (w/4, h), (0, h/2)`.

All three are plain box-drawn shapes: they inherit every base style (stroke,
background, fill style, stroke width/style, opacity, roughness), support
Shift-drag (square box) and Alt-drag (from center) via the shared
`shapeReduce`, and work with every generic element feature — select, drag,
resize, rotate, group, lock, align/distribute, z-order, duplicate, library,
export. Roundness has no effect on them (same as diamond today).

## 2. Geometry package — single source of truth for vertices

New `packages/geometry/src/polygon.ts`, exported from the package index:

```ts
type PolygonShapeKind = "triangle" | "parallelogram" | "hexagon"
shapeVertices(kind: PolygonShapeKind, bounds: Bounds): Point[]
pointInConvexPolygon(point: Point, vertices: readonly Point[], center: Point, angle: number): boolean
polygonEdgePointToward(vertices: readonly Point[], bounds: Bounds, toward: Point): Point
```

- `shapeVertices` returns absolute vertices (bounds origin + the offsets in §1).
- `pointInConvexPolygon` un-rotates the point around `center` by `-angle`,
  then same-side half-plane tests against each edge (vertices are in
  consistent winding order).
- `polygonEdgePointToward` casts a ray from the bounds center toward `toward`
  and returns its intersection with the polygon boundary (the analogue of
  `edgePointToward` for `rect`/`ellipse`/`diamond`); falls back to the center
  when the direction is degenerate or no edge is hit.

Hit-testing, canvas rendering, SVG export, and arrow binding all consume
these helpers — the vertex math lives in exactly one place. `EdgeKind` and
`edgePointToward` are untouched.

## 3. Scene

- `ElementType` union + `ExcalidrawTriangleElement` /
  `ExcalidrawParallelogramElement` / `ExcalidrawHexagonElement` interfaces
  (plain `ExcalidrawElementBase` extensions, like rectangle/diamond) +
  `ExcalidrawElement` union members.
- Factories `newTriangle`, `newParallelogram`, `newHexagon` (mirror
  `newDiamond`; same `NewElementInput`).
- `hitTestElement` gains one case for the three types:
  `pointInConvexPolygon(point, shapeVertices(type, bounds), center, angle)`.
- **Binding:** all three join `BINDABLE_TYPES`. `computeBoundEndpoint`
  computes the edge point via `polygonEdgePointToward(shapeVertices(...))`
  for the new types and keeps `edgePointToward` for the rest; `gap` and
  `focus` behave unchanged (applied along/perpendicular to the ray as today).

## 4. Renderer

- `shapes/triangle.ts`, `shapes/parallelogram.ts`, `shapes/hexagon.ts` —
  each mirrors `diamondShape`: `gen.polygon(vertices-relative-to-origin,
options)` with the shared stroke/fill/dash options. Wired into
  `generateShape`.
- SVG export emits the same polygons, so canvas, themed SVG/PNG export, and
  library thumbnails all match.
- ShapeCache, culling, overlay/selection handles are bounds-based and need
  no changes.

## 5. Tools + UI

- `triangleTool` / `parallelogramTool` / `hexagonTool`: 10-line
  `shapeReduce` wrappers (mirror `diamondTool`); added to `ToolName`, the
  `TOOLS` registry, and package exports.
- Toolbar: three buttons after `diamond`, testids `toolbar-triangle` /
  `toolbar-parallelogram` / `toolbar-hexagon`, shortcuts `3`, `G`, `6`
  (plain keys — `Ctrl+G` group is unaffected); new `iconHTML` SVG glyphs.
- Web: `TOOL_KEYS` gains `"3"`, `"g"`, `"6"`.
- i18n (`en`/`ko`): `toolbar.triangle|parallelogram|hexagon` in
  `common.json`, matching entries in `shortcuts.json` (Help dialog).

## 6. Testing

- **Geometry:** vertex tables for all three kinds; point-in-polygon inside/
  outside/rotated; edge intersection returns a boundary point in the right
  direction (e.g. hexagon right-point, triangle slanted side).
- **Scene:** factory defaults; hit test hits inside the triangle and misses
  its empty corner (inside bbox, outside shape); binding endpoint for a
  hexagon lies on the slanted edge, not the bbox.
- **Renderer:** generateShape returns polygon drawables for the new types;
  SVG export contains the shapes.
- **Tools:** draw via pointerDown/move/up creates the element; escape and
  zero-size cancel (mirror existing shape-tool tests).
- **e2e:** draw each of the three shapes and verify persisted types; bind an
  arrow to a hexagon and verify the persisted binding.

## Out of scope

Shape picker flyout, star/cloud/speech-bubble, configurable skew/inset,
roundness on polygon shapes, upstream-Excalidraw file compatibility for the
new types (clone-only), and template updates using the new shapes.
