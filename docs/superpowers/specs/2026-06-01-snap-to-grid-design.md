# Snap-to-Grid — Design Spec

**Date:** 2026-06-01
**Status:** Approved for implementation
**Version target:** v1.3
**Related memory:** `project_v2_directions_backlog.md` (item 3)

## Goal

When the grid is enabled, pointer positions used by drawing and editing tools snap to the nearest grid intersection. Hold `Cmd/Ctrl` while interacting to bypass snap temporarily. Snap is purely an _input transform_ — element data has no concept of "snapped" vs "free", and disabling the grid leaves existing elements untouched.

## Non-goals

- Snap to other elements' edges, centers, or alignment guides ("smart guides"). Grid-only for v1.
- Adaptive grid size by zoom level.
- Per-element snap toggle.
- Snap for freedraw strokes, eraser hit-tests, or text caret positions.

## Scope (which interactions snap)

| Interaction                         | Snaps  | Notes                                                                           |
| ----------------------------------- | ------ | ------------------------------------------------------------------------------- |
| Shape draw (rect, ellipse, diamond) | Yes    | Both endpoints snap; box origin and size land on grid                           |
| Linear draw (line, arrow)           | Yes    | Both endpoints snap; Shift (45° constraint) wins over grid when both apply      |
| Selection drag                      | Yes    | First pointermove corrects off-grid start; subsequent deltas are grid-multiples |
| Selection resize handles            | Yes    | Dragged corner/edge lands on grid; anchor edge stays put                        |
| Text creation click                 | Yes    | New text's origin is on grid                                                    |
| Library placement click             | Yes    | Placement origin is on grid; relative offsets within the item preserved         |
| Freedraw stroke                     | **No** | Stair-stepping would distort strokes                                            |
| Eraser                              | **No** | Hit-tests follow raw pointer                                                    |
| Selection rotate                    | **No** | Rotation is an angle, not a position                                            |
| Panning / zooming                   | **No** | Viewport state is separate from element geometry                                |

## Architecture

One pure helper, one call site.

### The helper: `packages/geometry/src/snap.ts`

```ts
import type { Point } from "./types"

export interface GridSnap {
  enabled: boolean
  size: number
}

export interface SnapModifiers {
  ctrl: boolean
  meta: boolean
}

export const snapPointToGrid = (p: Point, grid: GridSnap, mods: SnapModifiers): Point => {
  if (!grid.enabled || grid.size <= 0 || mods.ctrl || mods.meta) return p
  return {
    x: Math.round(p.x / grid.size) * grid.size,
    y: Math.round(p.y / grid.size) * grid.size,
  }
}
```

Exported from `@excalidraw-clone/geometry`'s `index.ts` alongside the other transform helpers.

`SnapModifiers` is a structural subset of the existing `Modifiers` shape — keeps the geometry package free of a `tools` dependency.

### The call site: `apps/web/src/driver/events.ts`

`pointerEventToToolEvent` gains a `grid: GridSnap` parameter and applies `snapPointToGrid` to the scene point before returning the `ToolEvent`. Same change for `clientToScene` callers in `useDrawingDriver.ts` (double-click → text creation, library placement click).

```ts
export function pointerEventToToolEvent(
  type: "pointerDown" | "pointerMove" | "pointerUp",
  canvas: HTMLCanvasElement,
  view: ViewTransform,
  grid: GridSnap,
  e: PointerEvent,
): ToolEvent {
  const raw = clientToScene(canvas, view, e)
  const at = snapPointToGrid(raw, grid, modifiersOf(e))
  return { type, at }
}
```

A constant `SNAPPABLE_TOOLS` lives in `events.ts`:

```ts
const SNAPPABLE_TOOLS: ReadonlySet<ToolName> = new Set([
  "selection",
  "rectangle",
  "ellipse",
  "diamond",
  "line",
  "arrow",
  "text",
  "image",
])
```

The driver gates the `grid.enabled` flag passed into the helper:

```ts
const effectiveGrid: GridSnap = {
  enabled: store.gridEnabled && SNAPPABLE_TOOLS.has(store.activeTool),
  size: store.gridSize,
}
```

Tools not in `SNAPPABLE_TOOLS` (freedraw, eraser, frame) see raw pointer points even when grid is on.

### Reducers

All reducers stay pure and store-free. They continue to operate on whatever `at` they receive. **One** reducer change is required:

**`selection/index.ts` — `reduceDragging` first-move correction.**
The existing math `dx = at.x - last.x` preserves whatever fractional offset the element had at drag start. With snapping on, a snapped delta plus an off-grid origin still produces an off-grid position. Fix: on the first `pointerMove` after the drag enters `phase: "dragging"`, snap each moved element's top-left to the nearest grid intersection (using the same `snapPointToGrid` helper, but with the _element's_ top-left as the input). Subsequent moves use the standard delta math.

State addition: `firstMove: true` on the `dragging` phase, flipped to `false` after first correction. The reducer needs access to grid info — added to `ToolContext` as `grid: GridSnap`. The context already carries `viewTransform` and `modifiers`, so this fits.

Note: `ToolContext.grid` is the _one_ piece of snap state visible to reducers. Only `reduceDragging` reads it. All other reducers ignore it. This is a deliberately narrow contract — drag is the only case where snapping the input point doesn't fully solve the on-grid-output problem.

## Per-tool behavior with snapped input

- **Shape (rect / ellipse / diamond):** `computeBox(start, at, mods)` produces on-grid origin and on-grid size when both `start` and `at` are on-grid. Shift (aspect lock) and Alt (center-anchor) compose: aspect lock divides by integer ratios derived from on-grid values, center-anchor uses `Math.abs(dx) * 2` which preserves grid-multiplicity. Edge case: when Shift's aspect-lock produces a non-integer height for a given width, the result may be off-grid — accepted, Shift's intent wins.

- **Linear (line / arrow):** `constrainAngle` rotates `at` around `start` to the nearest 45°. With Shift + grid both on, the constrained endpoint typically lands off-grid. Resolution: reducer applies `constrainAngle` to the already-snapped `at`, and uses the result directly. Shift wins.

- **Selection drag:** Covered above (first-move correction).

- **Selection resize:** `computeResize` uses `dx = at.x - start.x` on the dragged corner. With both points on-grid, the resulting edge lands on a grid line. Anchor edges are untouched per question 4's "anchor stays put" semantics — if the shape was off-grid before the resize, the anchor remains off-grid.

- **Text creation:** `pointerDown` lands on a grid intersection; the text element's `x`/`y` are on-grid.

- **Image placement:** Same as text — placement click lands on grid.

- **Library placement:** Snap applies to the placement origin, not to individual elements within the library item. Relative offsets are preserved exactly.

## UI surface

### Keyboard shortcut

`Cmd/Ctrl + Shift + G` toggles `gridEnabled`. The HelpDialog row, the i18n key `shortcuts.toggleGrid`, and the Korean translation `격자 토글` all already exist (`packages/ui/src/HelpDialog.tsx:38`, `apps/web/src/locales/{en,ko}/shortcuts.json`). The actual keyboard handler is missing — this spec adds it in `apps/web/src/keyboard/shortcuts.ts`.

### Modifier bypass

Holding `Cmd/Ctrl` during any pointer event bypasses snap (`snapPointToGrid` returns the raw point). No persistent state — purely transient based on `e.ctrlKey || e.metaKey`.

Note: this _only_ affects snap. It does not interfere with existing shortcuts because `Cmd/Ctrl` is a key modifier, not a key itself, and the keyboard handler only fires on key down events with a specific key.

### HelpDialog

One new row added to `EDITOR_SHORTCUTS` in `packages/ui/src/HelpDialog.tsx` (the toggle-grid row already exists in `VIEW_SHORTCUTS`):

| Action                         | Shortcut        |
| ------------------------------ | --------------- |
| Bypass snap (while grid is on) | Hold `Cmd/Ctrl` |

New i18n key: `shortcuts.bypassSnap` in both `en/shortcuts.json` ("Bypass snap") and `ko/shortcuts.json` ("스냅 해제").

### PropertiesPanel

No grid UI exists in `PropertiesPanel` today — `gridEnabled` is currently store-only. This spec deliberately does **not** add a UI toggle or `gridSize` input. The keyboard shortcut is the sole user-facing toggle for v1.3. A future UI surface can be added without changing snap semantics.

## Data flow

```
PointerEvent
  → clientToScene (raw scene point)
  → snapPointToGrid (gated on grid + tool + modifiers)
  → ToolEvent { at }
  → tool.reduce
  → ToolEffect[]
  → applyEffects → Scene.mutate
```

The store snapshot is read at dispatch time inside `useDrawingDriver`'s `dispatchPointer`. No new subscriptions, no new memoization.

## Testing

### Unit

- `packages/geometry/test/snap.test.ts`
  - disabled → passthrough
  - `size <= 0` → passthrough
  - `mods.ctrl` → passthrough
  - `mods.meta` → passthrough
  - positive coords round to nearest
  - negative coords round to nearest; JavaScript `Math.round` rounds half-values toward positive infinity, so `-30` with `size: 20` → `Math.round(-1.5) * 20 === -20` (not `-40`). The test pins this behavior explicitly.
  - half-grid boundary rounds toward positive infinity (`Math.round(0.5) === 1`, `Math.round(-0.5) === 0`)

- `packages/tools/test/shape-tools.test.ts` — extend
  - rect drawn with on-grid start + on-grid end → box has on-grid origin and size

- `packages/tools/test/linear-tools.test.ts` — extend
  - line drawn with shift + on-grid points → endpoint may be off-grid (45° wins)

- `packages/tools/test/selection-drag.test.ts` — extend
  - drag with `ctx.grid.enabled: true` starting from off-grid element → first pointerMove snaps to grid
  - subsequent moves preserve grid-multiplicity

### E2E

- `apps/web/e2e/snap-to-grid.spec.ts` — one happy-path test:
  - enable grid via shortcut
  - draw a rectangle
  - assert final element's `x % 20 === 0`, `y % 20 === 0`, `width % 20 === 0`, `height % 20 === 0`

## Files touched

**New:**

- `packages/geometry/src/snap.ts`
- `packages/geometry/test/snap.test.ts`
- `apps/web/e2e/snap-to-grid.spec.ts`

**Modified:**

- `packages/geometry/src/index.ts` — export `snapPointToGrid`, `GridSnap`, `SnapModifiers`
- `packages/tools/src/types.ts` — add `grid: GridSnap` to `ToolContext`
- `packages/tools/src/tools/selection/types.ts` — add `firstMove: boolean` to `dragging` phase
- `packages/tools/src/tools/selection/index.ts` — first-move correction in `reduceDragging`; `firstMove: true` in initial dragging state
- `apps/web/src/driver/events.ts` — `pointerEventToToolEvent` takes `grid` param; add `SNAPPABLE_TOOLS`
- `apps/web/src/driver/useDrawingDriver.ts` — pass `grid` through; snap `onDoubleClick` and library placement clicks
- `apps/web/src/keyboard/shortcuts.ts` — add `isMeta && e.shiftKey && key === "g"` → `useAppStore.getState().toggleGrid()` (sits alongside existing undo / redo / palette handlers)
- `packages/ui/src/HelpDialog.tsx` — two new rows
- `apps/web/src/i18n/en.json` and `ko.json` — `shortcut.toggleGrid`, `shortcut.bypassSnap`
- `packages/tools/test/selection-drag.test.ts` — extend
- `packages/tools/test/shape-tools.test.ts` — extend
- `packages/tools/test/linear-tools.test.ts` — extend

## Risks / open items

- **`ToolContext.grid` adds a new field every test fixture must provide.** Mitigation: add a default `{ enabled: false, size: 20 }` in the shared test-utils builder so existing tests stay one-line.
- **Cmd/Ctrl bypass may conflict with platform conventions.** macOS Cmd is the standard modifier for app shortcuts; using it for "bypass snap" is a momentary hold, not a key-down event, so it shouldn't conflict — verified by upstream Excalidraw using the same pattern.
- **First-move correction means the first drag pointermove visibly "jumps" off-grid elements onto grid.** This is the intended UX (matches upstream Excalidraw); document in the keyboard help if needed.
