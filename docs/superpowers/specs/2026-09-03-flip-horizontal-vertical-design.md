# Flip Horizontal / Vertical — Design Spec

**Date:** 2026-09-03
**Status:** Approved (brainstorming)
**Feature:** Mirror selected elements across a horizontal or vertical axis.

---

## Goal

Add "Flip horizontal" and "Flip vertical" to the editor, matching upstream
Excalidraw. Works on a single element or a multi-element selection, reachable via
keyboard (`Shift+H` / `Shift+V`), the PropertiesPanel, and the element context
menu. Flips persist to the `.excalidraw` document and round-trip through reload.

---

## 1. Data model

Add one **optional** field to `ExcalidrawElementBase` (`packages/scene/src/types.ts`):

```ts
/** Per-axis mirror sign; absent ⟺ [1, 1] (unflipped). */
mirror?: readonly [1 | -1, 1 | -1]
```

- **Optional** ⇒ no `SCENE_FORMAT_VERSION` bump, no migration, no change to
  factories, default fixtures, or existing test data. Precedent: `PointBinding.fixedPoint?`,
  `ExcalidrawImageElement.crop` (nullable), `roundness` (nullable).
- Helper `mirrorOf(el: ExcalidrawElement): readonly [number, number]` returns
  `el.mirror ?? [1, 1]`. Exported from `@excalidraw-clone/scene`.
- **Normalization:** a `mirror` equal to `[1, 1]` is stored as the field omitted
  (`flipElements` deletes the key when both signs return to `1`). Keeps exports
  lean and structural equality simple.
- `image.scale` is **not** used for flipping (it is currently unread by the
  renderer); flipping images goes through `mirror` like everything else.

---

## 2. Flip semantics — single element

A flip is a reflection across the axis (`x` = vertical mirror line, `y` =
horizontal mirror line) passing through **the element's own bounding-box centre**.
Position and size never change for a single-element flip; only orientation fields.

| Element class                                                 | Behaviour on flip(axis)                                                                                                                                     |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `triangle`, `parallelogram`, `hexagon`, `pentagon`, `octagon` | toggle the axis sign in `mirror`; `angle → -angle`                                                                                                          |
| `image`, `text`                                               | toggle the axis sign in `mirror`; `angle → -angle`. Pixels / glyphs visibly mirror (backwards text is expected, matches Excalidraw).                        |
| `rectangle`, `ellipse`, `diamond`, `frame`                    | toggle the axis sign in `mirror` for representational uniformity, but the shape is symmetric so render and hit-test ignore it. Explicitly a no-op visually. |
| `freedraw`, `line`, `arrow`                                   | **baked into geometry** — see below. `mirror` is never set on these.                                                                                        |
| bound-text label whose container is flipped                   | **not** flipped — the label is a separate element and stays readable. It only flips when itself directly selected and flipped.                              |

### Why `angle → -angle`

Reflection conjugates rotation: `reflect ∘ R(θ) = R(-θ) ∘ reflect`. Storing the
flip as `mirror` sign + negated angle keeps the render transform a plain
`rotate(angle)` then `scale(mx, my)` with no cross terms, and keeps flip∘flip an
exact identity.

### Linear / freedraw baking

`line`, `arrow`, `freedraw` carry `points` consumed directly by the endpoint-drag
overlay, bend-point handles, elbow routing, and binding-endpoint math. Threading a
mirror transform through all of those is error-prone, so instead the flip is baked
in at flip time:

- Mirror every entry in `points` across the local bbox centre on the flip axis:
  for axis `x`, `p.x → width - p.x`; for axis `y`, `p.y → height - p.y`.
- `x`, `y`, `width`, `height` are unchanged (a centred reflection preserves the
  AABB).
- `angle → -angle`.
- `startBinding.focus → -startBinding.focus`, same for `endBinding` (focus is a
  signed offset along the bound edge; the mirror flips its sign).
- Start/end are **not** swapped (a centred reflection maps the start endpoint to
  the mirrored start position, still the start). Arrowheads stay on their ends.
- Elbow arrows: re-routed by the post-flip `reconcileBindings` pass (§7).

Baked flips are still exact involutions modulo floating-point (mirroring the same
points twice returns the originals).

---

## 3. Flip semantics — multi-selection

Input: the flip axis and the selection's combined bounds `B` (from
`getElementsBounds` over the selection closure — frame members included, exactly
like nudge and align).

For each element in the closure:

1. **Reposition:** reflect the element's own centre across `B`'s mid-axis.
   For axis `x`: `newCenterX = 2 * (B.x + B.width/2) - oldCenterX`, then derive
   `x` from the new centre and the (unchanged) width. Axis `y` symmetric.
2. **Reorient:** apply the single-element flip from §2 to that element in place.

`groupIds` are unchanged (a group flips as a rigid mirrored unit). A selected
`frame` reflects its members' positions; the frame rectangle itself is symmetric.

---

## 4. Pure function — new `packages/scene/src/flip.ts`

```ts
import type { ExcalidrawElement } from "./types"

export type FlipAxis = "x" | "y"

/** Full replacement elements for a flip of `ids` across `axis`.
 *  Single vs. group behaviour is chosen by the count of directly-selected
 *  `ids` (not the expanded closure). Locked elements are excluded.
 *  Returns [] when nothing flippable is selected. */
export function flipElements(
  elements: readonly ExcalidrawElement[],
  ids: readonly string[],
  axis: FlipAxis,
): ExcalidrawElement[]
```

- Returns **whole elements** (not `{id,x,y}` patches) because a flip touches many
  fields — mirrors the `groupElements` / `ungroupElements` contract.
- Expands `ids` to the frame-member closure with `expandIdsToFrameMembers` before
  computing group bounds, same as the nudge path.
- Filters out `el.locked` elements from the result.
- `flipElements` owns the `[1,1] → omit` normalization of the `mirror` key.
- Exported from `packages/scene/src/index.ts`.

App wires it into `scene.mutate` the same way `onAlign` / `onGroup` are wired in
`apps/web/src/components/App.tsx`, followed by a `reconcileBindings` pass.

---

## 5. Geometry — new `mirroredShapeVertices` in `@excalidraw-clone/geometry`

```ts
export const mirroredShapeVertices = (
  kind: PolygonShapeKind,
  b: Bounds,
  mirror: readonly [number, number],
): Point[]
```

`shapeVertices(kind, b)` output reflected around `boundsCenter(b)` on each axis
whose sign is `-1`. When `mirror` is `[1, 1]` it returns the same vertices as
`shapeVertices` (cheap identity path). Exported from
`packages/geometry/src/index.ts`.

**Single source of truth** for mirrored polygon geometry. Consumers:

- `packages/renderer/src/shapes/polygon.ts` — `polygonShape` builds its rough
  drawable from `mirroredShapeVertices(e.type, {0,0,w,h}, mirrorOf(e))`. No canvas
  transform needed; the sketch is generated already-mirrored.
- `packages/scene/src/hit-test.ts` — polygon branch passes
  `mirroredShapeVertices(...)` to `pointInConvexPolygon`.
- `packages/scene/src/bindings.ts` — wherever it feeds polygon edge points
  (`polygonEdgePointToward`), it passes mirrored vertices.

`packages/geometry/src/binding-edge.ts` (`edgePointToward`, rect/ellipse/diamond
only) needs no change — all three kinds are symmetric.

---

## 6. Rendering

### Canvas — `packages/renderer/src/draw-element.ts`

In the existing `ctx.save()` transform block, **after** the rotate handling, add a
mirror step **only for `image` and `text`**:

```ts
const [mx, my] = mirrorOf(element)
if (mx !== 1 || my !== 1) {
  ctx.translate(element.width / 2, element.height / 2)
  ctx.scale(mx, my)
  ctx.translate(-element.width / 2, -element.height / 2)
}
```

Polygons are mirrored in their vertices (§5). `rectangle`, `ellipse`, `diamond`,
`frame` do nothing (symmetric).

### ShapeCache — `packages/renderer/src/shape-cache.ts`

No cache-key change. Polygon drawables already differ by vertex coordinates;
image/text produce no drawables. Verify the cache key derivation and add a note if
it turns out to key on a shallow field list that would collide a flipped vs.
unflipped polygon — if so, include `mirror` in the key.

### SVG — `packages/renderer/src/svg.ts`

`elementTransform(el)` appends ` scale(mx my)` wrapped around the element centre
(`translate(cx cy) scale(mx my) translate(-cx -cy)`), composed after the existing
`rotate`, **only for `image` and `text`**. Polygons export from mirrored vertices
via the shared `generateShape` path.

---

## 7. Hit-test / bounds / bindings

- **`hit-test.ts`** — polygon branch swaps `shapeVertices` for
  `mirroredShapeVertices`. `rectangle` / `ellipse` / `diamond` / `image` / `text`
  / `frame` stay on the current symmetric tests (no change). `line` / `arrow` /
  `freedraw` are baked — no change.
- **`bounds.ts`** — a centred reflection preserves the axis-aligned bounding box
  for closed shapes; linear/freedraw bounds recompute from the (already mirrored)
  points. **No change.**
- **`bindings.ts`** — after any flip, `App` runs the existing `reconcileBindings`
  pass over the affected elements (the established pattern after a geometry
  mutation). This fixes bound-arrow endpoints against flipped containers and
  re-routes elbow arrows.

---

## 8. Surfaces

### Keyboard — `apps/web/src/keyboard/shortcuts.ts`

Add handlers **before** the `TOOL_KEYS` dispatch (because `v` = selection tool,
`h` is currently unbound):

```ts
if (!isMeta && e.shiftKey && (key === "h" || key === "v")) {
  const ids = useAppStore.getState().selectedIds
  if (ids.length === 0) return // fall through to nothing
  e.preventDefault()
  const axis = key === "h" ? "x" : "y"
  patchScene(scene, flipElements(scene.getElements(), ids, axis))
  return
}
```

- Input/textarea/contentEditable already guarded at the top of the handler.
- With a non-empty selection, `Shift+V` flips and does **not** switch to the
  selection tool. With an empty selection, `Shift+V` falls through (today's
  behaviour: nothing, since selection tool needs bare `v`).
- Reuses `patchScene` + a `reconcileBindings` follow-up (match how other
  geometry-mutating shortcuts already reconcile, if any; otherwise fold the
  reconcile into `patchScene`'s call site here).

### PropertiesPanel — `packages/ui/src/PropertiesPanel.tsx`

New flip row, always rendered when `selectedElements.length >= 1` and not all
locked (place it near the existing `panel-lock` button, independent of the
`>= 2`-gated Arrange section):

```tsx
<div className="flex gap-1">
  <button
    type="button"
    data-testid="flip-x"
    aria-label={t("properties.flip_horizontal")}
    onClick={() => onFlip("x")}
    className="flex-1 rounded border border-panel p-1 text-xs"
  >
    ⇋
  </button>
  <button
    type="button"
    data-testid="flip-y"
    aria-label={t("properties.flip_vertical")}
    onClick={() => onFlip("y")}
    className="flex-1 rounded border border-panel p-1 text-xs"
  >
    ⥯
  </button>
</div>
```

- New prop `onFlip: (axis: "x" | "y") => void`.
- i18n keys `properties.flip_horizontal` / `properties.flip_vertical` in
  `apps/web/src/locales/en/common.json` and `.../ko/common.json`.
- HelpDialog: add `Shift+H` / `Shift+V` rows.

### Context menu — `apps/web/src/components/ContextMenuHost.tsx`

Two items in the **element** context menu (not the canvas menu): "Flip horizontal"
/ "Flip vertical", i18n under the `properties.*` namespace (context-menu actions
already live there per existing convention). Disabled/hidden when the sole target
is locked. Calls the same `flipElements` path.

### App wiring — `apps/web/src/components/App.tsx`

```tsx
onFlip={(axis) => {
  const flipped = flipElements(scene.getElements(), selectedIds, axis)
  if (flipped.length === 0) return
  const byId = new Map(flipped.map((el) => [el.id, el]))
  scene.mutate((draft) => {
    for (let i = 0; i < draft.length; i += 1) {
      const p = byId.get(draft[i]!.id)
      if (p) draft[i] = p
    }
  })
  // reconcile bindings for flipped containers + their bound arrows
}}
```

---

## 9. Testing

### `packages/geometry`

- `mirroredShapeVertices`: `[1,1]` identity; `[-1,1]` reflects x around centre;
  `[1,-1]` reflects y; `[-1,-1]` both; triangle apex moves top→bottom on y-flip.

### `packages/scene` — new `test/flip.test.ts`

- Single triangle, `x`: `mirror` becomes `[-1,1]`, `angle` negated, `x/y/w/h`
  unchanged.
- Single triangle, `y`: `mirror` `[1,-1]`.
- flip∘flip on the same axis restores the original element (incl. `mirror` key
  omitted again).
- `parallelogram` x-flip toggles sign.
- `freedraw`: points mirrored across local centre, bbox unchanged.
- `arrow` with `startBinding.focus = 0.3`: becomes `-0.3` after flip.
- Multi-select of two rects: centres reflected across combined-bounds mid-axis.
- Multi-select mixed shapes: each repositioned **and** individually flipped.
- Locked element in the selection is absent from the result.
- Empty / no-flippable selection returns `[]`.

### `packages/renderer`

- `polygonShape` for a mirrored triangle produces vertices matching
  `mirroredShapeVertices`.
- `svg.ts`: `elementTransform` emits a `scale(-1 1)` term for a mirrored image;
  none for a mirrored rectangle.

### `apps/web`

- `keyboard-shortcuts.test.ts`: `Shift+H` on a selected element calls the flip
  path; `Shift+V` with a non-empty selection flips and does **not** set the active
  tool to `selection`; `Shift+V` with empty selection is a no-op.
- `PropertiesPanel` test: `flip-x` / `flip-y` buttons present for a single
  selected element and invoke `onFlip`.
- e2e `e2e/flip.spec.ts`: draw a triangle, select it, press `Shift+V`, reload the
  page, assert the element persists with `mirror` `[1,-1]` (via the same
  localStorage/scene assertion helper the element-links specs use).

### Full gate

`pnpm turbo run typecheck lint test` + `pnpm --filter @excalidraw-clone/web exec
playwright test` all green; diff scope limited to the files named in this spec
plus their tests.

---

## 10. Out of scope

- Flip as an animated transition.
- Flipping the in-progress tool preview / draft element.
- Per-vertex or per-handle flip affordances on the selection chrome.
- Using `image.scale` for anything (left unread as today).
- `Shift+H` / `Shift+V` when a text editor or dialog has focus (already guarded).

---

## File touch list

| File                                          | Change                                                          |
| --------------------------------------------- | --------------------------------------------------------------- |
| `packages/scene/src/types.ts`                 | add optional `mirror` to `ExcalidrawElementBase`                |
| `packages/scene/src/flip.ts`                  | **new** — `flipElements`, `FlipAxis`                            |
| `packages/scene/src/index.ts`                 | export `flipElements`, `FlipAxis`, `mirrorOf`                   |
| `packages/scene/src/hit-test.ts`              | polygon branch → `mirroredShapeVertices`                        |
| `packages/scene/src/bindings.ts`              | polygon edge points honour `mirror`                             |
| `packages/geometry/src/polygon.ts`            | **new** `mirroredShapeVertices` (+ a `mirrorOf`-free signature) |
| `packages/geometry/src/index.ts`              | export `mirroredShapeVertices`                                  |
| `packages/renderer/src/shapes/polygon.ts`     | build from mirrored vertices                                    |
| `packages/renderer/src/draw-element.ts`       | `image`/`text` mirror transform                                 |
| `packages/renderer/src/svg.ts`                | `elementTransform` scale term for `image`/`text`                |
| `packages/renderer/src/shape-cache.ts`        | verify key; add `mirror` only if it collides                    |
| `packages/ui/src/PropertiesPanel.tsx`         | flip row + `onFlip` prop                                        |
| `packages/ui/src/HelpDialog.tsx`              | `Shift+H` / `Shift+V` rows                                      |
| `apps/web/src/keyboard/shortcuts.ts`          | `Shift+H` / `Shift+V` handlers                                  |
| `apps/web/src/components/App.tsx`             | wire `onFlip` + reconcile                                       |
| `apps/web/src/components/ContextMenuHost.tsx` | element-menu flip items                                         |
| `apps/web/src/locales/{en,ko}/common.json`    | `properties.flip_horizontal` / `_vertical`                      |
| tests as enumerated in §9                     | new + updated                                                   |
