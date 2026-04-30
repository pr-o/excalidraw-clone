# Phase 5: `@excalidraw-clone/tools` Implementation Plan

> Inline execution. Each task ends with a commit on `develop`. TDD-style: failing test first, then implementation.

**Goal:** Build the pointer/keyboard → scene-mutation pipeline as a collection of pure, unit-testable tool reducers. Each tool is a discriminated-union state machine. The package owns no React, no Zustand, no listeners — just `(state, event, ctx) → [nextState, effects]` functions that the `apps/web` driver loop will wire to real pointer events.

**Spec reference:** `docs/superpowers/specs/2026-04-28-excalidraw-clone-design.md` § 6 (tool state machines), § 4 (tools may import only `geometry` + `scene`), § 7 (selection lives in UI store, not scene), § 11 (testing: every tools reducer has a fixture file), § 12 step 5 (build order: selection first as hardest, then shape tools, text, eraser, frame).

**Working branch:** `develop`. Every task ends with a commit.

**No new runtime deps.** Tools imports only `@excalidraw-clone/scene` and `@excalidraw-clone/geometry`.

---

## Architectural decisions (locked in for this phase)

### Effects, not mutations alone

The spec example shows reducers returning `[state, SceneMutation | null]`. We extend this to a small effect union, because real tools need to do more than mutate scene state — they need to update the UI selection set, signal "open the text editor on this element", and so on.

```ts
export type ToolEffect =
  | { kind: "mutation"; apply: (draft: ExcalidrawElement[]) => void; skipHistory?: boolean }
  | { kind: "select"; ids: readonly string[] } // replace selection
  | { kind: "addToSelection"; ids: readonly string[] }
  | { kind: "removeFromSelection"; ids: readonly string[] }
  | { kind: "startTextEdit"; elementId: string }
  | { kind: "switchTool"; tool: ToolName } // for "create rect → switch to selection"

export type ToolReducer<S, E> = (
  state: S,
  event: E,
  ctx: ToolContext,
) => [nextState: S, effects: readonly ToolEffect[]]
```

The driver in `apps/web` interprets each effect:

- `mutation` → `scene.mutate(apply, { skipHistory })`
- `select` / `addToSelection` / `removeFromSelection` → update Zustand selection slice
- `startTextEdit` → mount the text-editing overlay (Phase 7/8 concern)
- `switchTool` → swap the active tool reducer

### ToolContext

Read-only views the reducer needs to make decisions:

```ts
export interface Modifiers {
  shift: boolean
  alt: boolean
  ctrl: boolean
  meta: boolean
}

export interface ToolContext {
  /** Live element list, deletions filtered. */
  readElements(): readonly ExcalidrawElement[]
  /** Topmost non-deleted element under `at` (scene coords), or null. */
  hitTest(at: Point): ExcalidrawElement | null
  /** Current view transform — used by tools that need to convert between scene and viewport coords (e.g. handle hit-testing). */
  viewTransform: ViewTransform
  /** Active modifier keys at the moment of the event. */
  modifiers: Modifiers
  /** Current UI selection (read-only — written via effects). */
  selectedIds: readonly string[]
}
```

`hitTest` is provided by the driver, which composes `hitTestElement` from `@excalidraw-clone/scene`. We don't import `hitTestElement` here; the test fixtures stub `hitTest` directly.

### Events

A common pointer event shape, plus a few keyboard events:

```ts
export type ToolEvent =
  | { type: "pointerDown"; at: Point }
  | { type: "pointerMove"; at: Point }
  | { type: "pointerUp"; at: Point }
  | { type: "doubleClick"; at: Point }
  | { type: "escape" }
  | { type: "delete" }
```

Modifiers travel on `ctx.modifiers`, not on the event, matching the spec.

### What `apps/web` is responsible for (out of this phase)

- Translating real DOM `PointerEvent` / `KeyboardEvent` into `ToolEvent`s.
- Maintaining `ToolContext` (e.g. wiring `hitTest` to `scene` + `hitTestElement`).
- Persisting reducer state across events in a Zustand `toolStateSlice`.
- The pan / hand tool (spacebar pan, mouse-wheel zoom). Pan does not produce scene mutations and lives outside the tool-reducer abstraction.
- The image tool (deferred to Phase 6 — needs `persistence`).
- The text-editing chrome itself (cursor, IME). Phase 5 only wires the `startTextEdit` signal.

### Out of scope

- **Snap-to-grid.** v1 ships without snapping; the grid is purely visual. Field reserved.
- **Group selection / un-group.** v1.1 (per spec § 13). `groupIds` is in the element type but tools don't add/remove from it.
- **Arrow ↔ shape binding logic.** v1.1.
- **Multi-stroke freedraw smoothing.** Each `pointerMove` while drawing pushes a raw point. Smoothing happens at render time (already handled in renderer Phase 4 via rough's `gen.curve`).

---

## Task 1: Tool API — types, ToolContext, ToolEffect, barrel

A single types file plus an index that re-exports. No reducer logic yet.

**Files:**

- Create: `packages/tools/src/types.ts`
- Modify: `packages/tools/src/index.ts`
- Create: `packages/tools/test/types.test.ts`

**Type surface to ship:**

```ts
import type { Point, ViewTransform } from "@excalidraw-clone/geometry"
import type { ExcalidrawElement } from "@excalidraw-clone/scene"

export type ToolName =
  | "selection"
  | "rectangle"
  | "ellipse"
  | "diamond"
  | "line"
  | "arrow"
  | "freedraw"
  | "text"
  | "eraser"
  | "frame"

export interface Modifiers {
  shift: boolean
  alt: boolean
  ctrl: boolean
  meta: boolean
}

export interface ToolContext {
  readElements(): readonly ExcalidrawElement[]
  hitTest(at: Point): ExcalidrawElement | null
  viewTransform: ViewTransform
  modifiers: Modifiers
  selectedIds: readonly string[]
}

export type ToolEvent =
  | { type: "pointerDown"; at: Point }
  | { type: "pointerMove"; at: Point }
  | { type: "pointerUp"; at: Point }
  | { type: "doubleClick"; at: Point }
  | { type: "escape" }
  | { type: "delete" }

export type SceneMutation = (draft: ExcalidrawElement[]) => void

export type ToolEffect =
  | { kind: "mutation"; apply: SceneMutation; skipHistory?: boolean }
  | { kind: "select"; ids: readonly string[] }
  | { kind: "addToSelection"; ids: readonly string[] }
  | { kind: "removeFromSelection"; ids: readonly string[] }
  | { kind: "startTextEdit"; elementId: string }
  | { kind: "switchTool"; tool: ToolName }

export interface Tool<S, E = ToolEvent> {
  readonly name: ToolName
  readonly initial: S
  reduce(state: S, event: E, ctx: ToolContext): [S, readonly ToolEffect[]]
}

/** Convenience for callers that want a no-op result. */
export const NO_EFFECTS: readonly ToolEffect[] = []
```

**Tests:**

- `NO_EFFECTS` is the empty array.
- `ToolEvent` discriminated union narrows correctly given a `type` literal.
- `ToolEffect` discriminated union narrows correctly given a `kind` literal.

```bash
git add packages/tools
git commit -m "Phase 5.1: tool API (types, ToolContext, ToolEffect)"
```

---

## Task 2: Shape creation tools — rectangle, ellipse, diamond

These three tools share a creation pattern: `pointerDown` starts an element at the down-point, each `pointerMove` resizes it via the current point, `pointerUp` commits. With shift held, the shape is constrained to a square (`max(|dx|,|dy|)` for both width and height).

We build one generic reducer parameterized by element type, plus three thin wrappers.

**Files:**

- Create: `packages/tools/src/tools/shape.ts` — generic shape-creation reducer
- Create: `packages/tools/src/tools/rectangle.ts`
- Create: `packages/tools/src/tools/ellipse.ts`
- Create: `packages/tools/src/tools/diamond.ts`
- Modify: `packages/tools/src/index.ts`
- Create: `packages/tools/test/shape-tools.test.ts`

**Shape reducer states:**

```ts
type ShapeState =
  | { phase: "idle" }
  | { phase: "drawing"; start: Point; current: Point; elementId: string }
```

**Reducer rules:**

- `idle + pointerDown` → create the element via the matching factory at `(at.x, at.y, width=0, height=0)`, push it as a `mutation` effect (with `skipHistory: true` — we'll commit history once at `pointerUp`), enter `drawing` state.
- `drawing + pointerMove` → emit a `mutation` (skipHistory) that replaces the in-progress element with updated x/y/width/height. With shift, constrain to square. With alt, treat the down-point as the center and grow symmetrically.
- `drawing + pointerUp` → emit a final `mutation` (history-tracked), then `select` effect with the new id, then `switchTool: "selection"` (matches upstream "tool snap-back" — switchable later via a "keep tool active" flag in apps/web). Return to `idle`.
- `drawing + escape` → emit a `mutation` that removes the in-progress element (no history). Return to `idle`.
- Zero-area elements at `pointerUp` are dropped: if `width === 0 || height === 0`, fire the remove-mutation and stay idle (no select, no switch).

**Geometry helper** (in shape.ts):

```ts
const computeBox = (down: Point, at: Point, modifiers: Modifiers): {
  x: number; y: number; width: number; height: number
}
```

Handles shift-square + alt-from-center.

**Tests:** (exhaustive event-fixture style — every reducer task includes this format)

For each of rectangle/ellipse/diamond:

- `pointerDown` from idle creates an element at the down-point.
- `pointerMove` after down updates width/height.
- Shift + diagonal drag produces a square.
- Alt + drag treats the down-point as center.
- `pointerUp` with non-zero area emits final mutation, `select`, `switchTool: "selection"`, returns to idle.
- `pointerUp` with zero area drops the element, no select/switch, returns to idle.
- `escape` mid-draw removes the element and returns to idle.
- Two consecutive draws produce two distinct elements.

```bash
git commit -m "Phase 5.2: shape creation tools (rectangle / ellipse / diamond)"
```

---

## Task 3: Linear tools — line, arrow

Linear tools draw a 2-point polyline by default: `pointerDown` plants the start, drag to second point, `pointerUp` commits. Shift constrains to 0° / 45° / 90° increments.

(We're deferring **multi-point linear creation** — click, click, click, double-click-to-end — to v1.1. v1 ships single-segment lines and arrows, matching the most common use.)

**Files:**

- Create: `packages/tools/src/tools/linear.ts` — generic 2-point drawing reducer
- Create: `packages/tools/src/tools/line.ts`
- Create: `packages/tools/src/tools/arrow.ts`
- Modify: `packages/tools/src/index.ts`
- Create: `packages/tools/test/linear-tools.test.ts`

**State:**

```ts
type LinearState =
  | { phase: "idle" }
  | { phase: "drawing"; start: Point; current: Point; elementId: string }
```

**Constraint helper:**

```ts
const constrainAngle = (start: Point, at: Point): Point
```

Rounds the angle to the nearest 45° around `start`.

**Reducer rules:** Same shape as Task 2 — `pointerDown` plants, `pointerMove` updates the second point (and recomputes element x/y/width/height as the bbox of the two points), `pointerUp` commits and switches to selection. Element `points` are stored relative to element origin.

**Tests:**

- Line: down/move/up creates a 2-point line; element `points = [(0,0), (dx,dy)]`.
- Arrow: same, with `endArrowhead: "arrow"`.
- Shift + drag at 30° snaps to 45°.
- Zero-length on pointerUp is dropped.
- Escape removes the element.

```bash
git commit -m "Phase 5.3: linear tools (line / arrow)"
```

---

## Task 4: Freedraw + text tools

### Freedraw

- `pointerDown` creates an empty freedraw element, push first point, enter drawing.
- Each `pointerMove` while drawing appends a point.
- `pointerUp` commits the element with history, computes the element AABB from points, dropping the placeholder if fewer than 2 points were drawn. Switch to selection.
- `escape` removes the in-progress element.

Each `pointerMove` emits a `mutation` (skipHistory) that replaces the element with `{ ...prev, points: [...prev.points, at] }`. We pay an O(n) shallow-copy per move; for v1's freedraw lengths (a few hundred points typically) this is fine.

### Text

The text tool only **creates** an empty text element and emits `startTextEdit`. Editing happens in `apps/web`.

- `pointerDown` creates an empty text element at the down-point with `width: 0, height: 0` and emits `startTextEdit`. Enters `editing` state.
- Subsequent events while editing are no-ops at the tools level — the text editor in apps/web manages keystrokes.
- The driver explicitly resets the tool state when the text editor closes.

To keep the reducer clean, text returns to `idle` on `escape`. The driver also sends `escape` when the editor closes.

**Files:**

- Create: `packages/tools/src/tools/freedraw.ts`
- Create: `packages/tools/src/tools/text.ts`
- Modify: `packages/tools/src/index.ts`
- Create: `packages/tools/test/freedraw-tool.test.ts`
- Create: `packages/tools/test/text-tool.test.ts`

**Tests:**

- Freedraw: 1 down + 5 moves + up → element has 6 points (or 5? define and assert), is committed once.
- Freedraw: 1 down + 0 moves + up → element dropped (single point isn't a stroke).
- Text: pointerDown creates element + emits `startTextEdit` with the new id.
- Text: events while editing are ignored.

```bash
git commit -m "Phase 5.4: freedraw + text creation tools"
```

---

## Task 5: Eraser + frame tools

### Eraser

- `pointerDown` enters `erasing`, soft-deletes the element under the down-point (sets `isDeleted: true` via mutation, skipHistory until pointerUp).
- Each `pointerMove` while erasing soft-deletes the element under the move-point.
- `pointerUp` commits the accumulated soft-deletes as one history entry: emits a final `mutation` (history-tracked) — we re-apply the same soft-delete diff so undo restores everything in one step. Implementation: track the set of erased ids in state; at pointerUp, emit a single final mutation that re-asserts `isDeleted = true` for those ids (idempotent).
- `escape` un-erases (set `isDeleted: false` for the tracked ids) and returns to idle.

### Frame

A frame is a special rectangle. The frame tool reuses Task 2's shape logic but creates `frame` elements and (post-create) populates `frameId` on every existing element whose AABB intersects the frame's. (The intersection rule is straightforward via `boundsIntersect`.)

The `frameId`-population step is the only tools-package logic that _reads other elements_ during a creation. It's deterministic and idempotent.

**Files:**

- Create: `packages/tools/src/tools/eraser.ts`
- Create: `packages/tools/src/tools/frame.ts`
- Modify: `packages/tools/src/index.ts`
- Create: `packages/tools/test/eraser-tool.test.ts`
- Create: `packages/tools/test/frame-tool.test.ts`

**Tests:**

- Eraser: pointerDown over an element soft-deletes it; pointerMove over a second element soft-deletes that one; pointerUp emits one history-tracked mutation.
- Eraser: escape mid-erase un-soft-deletes everything erased so far.
- Eraser: pointerDown over empty space is a no-op (no mutation).
- Frame: dragging out a frame creates a `frame` element + assigns its `id` to every element fully contained in the frame.
- Frame: elements partially overlapping the frame are NOT included (use `boundsContains`, not `boundsIntersect`, for membership).

```bash
git commit -m "Phase 5.5: eraser + frame tools"
```

---

## Task 6: Selection — drag

Phases 6–9 build the selection tool. We split it across four tasks because it's where most of the complexity lives.

The selection tool's state must encode "what am I doing right now": idle, dragging selected elements, resizing, rotating, marquee-selecting. Each sub-phase has its own logic file; the top-level reducer (Task 9) dispatches into them.

**Files:**

- Create: `packages/tools/src/tools/selection/types.ts`
- Create: `packages/tools/src/tools/selection/handles.ts` — `findHandleAt(at, selectedIds, elements, viewTransform)`
- Create: `packages/tools/src/tools/selection/drag.ts`
- Create: `packages/tools/src/tools/selection/index.ts` — minimal top-level that handles only idle + drag (full logic in Task 9)
- Create: `packages/tools/test/selection-drag.test.ts`

**State for drag:**

```ts
export type SelectionState =
  | { phase: "idle" }
  | { phase: "dragging"; start: Point; last: Point; movedIds: readonly string[] }
  | { phase: "resizing" /* …Task 7 */ }
  | { phase: "rotating" /* …Task 8 */ }
  | { phase: "marquee"; start: Point; current: Point }
```

**Drag rules:**

- `idle + pointerDown` over a selected element → enter `dragging`, capture which ids will be dragged.
- `idle + pointerDown` over an unselected element → first emit `select [hitId]` (or `addToSelection [hitId]` if shift), THEN enter `dragging` for that id (single-event UX).
- `idle + pointerDown` over empty space (no hit) → enter `marquee` (Task 9 will handle marquee tail; in Task 6 we just stop here for now).
- `dragging + pointerMove` → emit a mutation that translates each `movedIds` element by `(at - last)` (delta from previous move). Update `state.last`.
- `dragging + pointerUp` → emit a final history-tracked mutation (re-apply zero-delta? simpler: emit one cumulative move at pointerUp — see implementation note below). Return to idle.
- `escape` while dragging → revert: emit a single mutation that translates the dragged elements by `-(last - start)` to restore their original positions, no history. Return to idle.

**Implementation note — history correctness during continuous drag:**

We don't want every `pointerMove` to push a history entry. The clean approach:

- Each `pointerMove` mutation is `skipHistory: true`.
- `pointerUp` mutation is `skipHistory: false` and is a _no-op_ — it serves only to push a history snapshot of the final state.

A no-op final mutation might feel weird, but it's the minimal way to get one undo-step per drag. Alternative considered: cache the original positions, undo on pointerUp via skipHistory, then reapply with history — this triggers two listener notifications and a redraw, so it's worse.

**`findHandleAt` (handles.ts):**

Given `at` (scene coords), `selectedIds`, the element list, and `viewTransform`, returns one of:

- `null` — no handle hit.
- `{ kind: "resize"; elementId; handle: "nw" | "ne" | "sw" | "se" | "n" | "s" | "e" | "w" }`
- `{ kind: "rotate"; elementId }`

Handle hit-testing is in viewport coords (per renderer Phase 4.6 — handles are 8×8 viewport-space squares). Convert `at` via `sceneToViewport`, compute element corners + mid-edges + rotation handle in viewport coords, do simple AABB containment per handle.

**Tests (drag-only):**

- Click-empty → marquee phase entered (we'll cover marquee mutations in Task 9).
- Click-on-element-not-selected → emits `select`, enters dragging.
- Click-on-element-already-selected → no select effect, enters dragging directly.
- Shift-click on unselected element → emits `addToSelection`, enters dragging.
- Drag: pointerMove translates all dragged elements by the delta.
- Drag escape: positions revert.
- Drag pointerUp: positions stick; history entry pushed (single mutation with `skipHistory: false`).

```bash
git commit -m "Phase 5.6: selection — drag sub-reducer + handle finder"
```

---

## Task 7: Selection — resize

Eight resize handles: 4 corners + 4 mid-edges. Each handle's behavior is determined by which corners/edges of the element AABB stay anchored.

**Files:**

- Create: `packages/tools/src/tools/selection/resize.ts`
- Modify: `packages/tools/src/tools/selection/index.ts` — wire resize entry from `idle + pointerDown over a handle`
- Create: `packages/tools/test/selection-resize.test.ts`

**State:**

```ts
type ResizingState = {
  phase: "resizing"
  handle: "nw" | "ne" | "sw" | "se" | "n" | "s" | "e" | "w"
  elementId: string
  /** Snapshot of the element at the start of the resize (so we can recompute from `at` instead of accumulating drift). */
  origin: { x: number; y: number; width: number; height: number; angle: number }
}
```

**Rules:**

- `idle + pointerDown` over a resize handle → enter `resizing`, snapshot the element's box.
- `resizing + pointerMove` → recompute the box based on current `at` and the anchor implied by `handle`. Emit `mutation` (skipHistory) that updates the element. Shift constrains aspect ratio.
- `resizing + pointerUp` → emit history-noop final mutation. Return to idle.
- `escape` → mutation restores `origin`, no history. Return to idle.

**v1 simplification:** resize ignores rotation (`angle === 0` is assumed). For rotated elements, `findHandleAt` returns the rotated handle position and we still compute the new box using local space — but for v1 we explicitly defer rotated-element resize to v1.1; resizing a rotated element can produce inconsistent results, and upstream Excalidraw handles this with a more involved transform that we're not implementing in v1. Document this in the README's known-limitations list during Phase 8.

**Multi-element resize** (drag a handle while several are selected): also v1.1. v1's resize tool only operates on a single element at a time — if `selectedIds.length > 1`, we don't show resize handles (the renderer's Phase 4.6 already only draws chrome per element; we'll keep multi-handle hiding here in `findHandleAt`).

**Tests:**

- Each of the 8 handles produces the expected new box for a known drag.
- Shift constrains the aspect ratio.
- Escape restores the origin box.
- pointerUp commits to history.

```bash
git commit -m "Phase 5.7: selection — resize sub-reducer"
```

---

## Task 8: Selection — rotate

Single rotation handle (above the top-edge midpoint, per renderer Phase 4.6).

**Files:**

- Create: `packages/tools/src/tools/selection/rotate.ts`
- Modify: `packages/tools/src/tools/selection/index.ts`
- Create: `packages/tools/test/selection-rotate.test.ts`

**State:**

```ts
type RotatingState = {
  phase: "rotating"
  elementId: string
  origin: { angle: number }
  /** Element center at the start of the rotation; used to compute the angle from pointer position. */
  center: Point
  /** The angle from `center` to the initial pointerDown — we subtract this so the element doesn't jump. */
  pointerAngleAtStart: number
}
```

**Rules:**

- `idle + pointerDown` on the rotation handle → enter `rotating`, snapshot the original angle and pointerAngleAtStart.
- `rotating + pointerMove` → newAngle = origin.angle + (currentPointerAngle - pointerAngleAtStart). Shift snaps newAngle to 15° increments. Emit a `mutation` (skipHistory) that sets `element.angle = newAngle`.
- `rotating + pointerUp` → history-noop final mutation. Return to idle.
- `escape` → mutation restores `origin.angle`. Return to idle.

**Tests:**

- Rotate 90° clockwise: pointer at 90° from center after a 0° start → element angle == 90° (in radians: `Math.PI / 2`).
- Shift snaps to 15°.
- Escape restores the original angle.

```bash
git commit -m "Phase 5.8: selection — rotate sub-reducer"
```

---

## Task 9: Selection — marquee + click-select + double-click-text + composition

The top-level selection reducer that dispatches into Tasks 6/7/8 plus handles:

- Click on empty space → marquee.
- Click on element → select / addToSelection (already wired in Task 6 — cover edge cases here).
- Double-click on a text element → emit `startTextEdit`.
- `delete` event → mutation that soft-deletes every selected element + emits `select []`.

**Files:**

- Modify: `packages/tools/src/tools/selection/index.ts` — full top-level reducer
- Create: `packages/tools/src/tools/selection/marquee.ts`
- Create: `packages/tools/test/selection-marquee.test.ts`
- Create: `packages/tools/test/selection-keyboard.test.ts`
- Create: `packages/tools/test/selection-doubleclick.test.ts`

**Marquee rules:**

- `idle + pointerDown` over empty space → enter `marquee` with `start = current = at`. Emit `select []` (clearing) unless shift held.
- `marquee + pointerMove` → update `current`, emit no mutation effect, but emit a `setMarquee`-style effect... wait. The renderer wants to draw the marquee box, but the renderer's `setMarquee` API is on the renderer, not on the scene. The driver in apps/web is responsible for piping `state.phase === "marquee"` to `renderer.setMarquee(...)`. **The reducer doesn't emit a marquee-draw effect**; the driver reads the reducer state directly. (One state, two consumers: the scene mutations come from effects, the marquee chrome comes from state inspection.)
- `marquee + pointerUp` → compute the marquee bbox in scene coords, find every element whose `getElementBounds` is fully contained, emit `select [those ids]` (or `addToSelection` if shift). Return to idle.

**Keyboard:**

- `delete` while idle → mutation that sets `isDeleted: true` on every selected element + `select []`.
- `escape` while idle → emit `select []`.

**Double-click:**

- `doubleClick` on a text element → emit `startTextEdit`.
- `doubleClick` on a non-text element → no-op (group-edit semantics deferred).

**Tests:**

- Marquee: drag from empty space; pointerUp emits `select` with all enclosed element ids.
- Marquee with shift held adds to existing selection.
- Marquee fully outside any element selects nothing.
- Marquee that partially overlaps an element does NOT select it (full-containment rule).
- `delete` with two selected elements emits one mutation that flips `isDeleted` on both.
- `escape` while idle clears selection.
- Double-click on a text element emits `startTextEdit` with that id.
- Double-click on a rectangle is a no-op.

```bash
git commit -m "Phase 5.9: selection — marquee + click + keyboard + composition"
```

---

## Task 10: Final integration + push

**Step 1: Tool registry.**

```ts
// packages/tools/src/registry.ts
export const TOOLS: Record<ToolName, Tool<unknown, ToolEvent>> = {
  selection: selectionTool,
  rectangle: rectangleTool,
  ellipse: ellipseTool,
  diamond: diamondTool,
  line: lineTool,
  arrow: arrowTool,
  freedraw: freedrawTool,
  text: textTool,
  eraser: eraserTool,
  frame: frameTool,
}
```

The `unknown` state is unfortunate but tractable: the driver in apps/web will key the active tool's state on `ToolName`. The state is opaque to the registry.

**Step 2: Full pipeline.**

```bash
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

All exit 0. Tools adds ~80–120 new tests (every reducer has a fixture file per spec § 11).

**Step 3: Boundary check.**

```bash
pnpm --filter @excalidraw-clone/tools lint
```

Tools imports only `@excalidraw-clone/scene` and `@excalidraw-clone/geometry`. **No React, no Zustand, no roughjs.**

**Step 4: Push.**

```bash
git push origin develop
```

```bash
git commit -m "Phase 5.10: tool registry + final integration"
```

---

## Done criteria

Phase 5 is complete when:

1. `@excalidraw-clone/tools` exports each of: `selectionTool`, `rectangleTool`, `ellipseTool`, `diamondTool`, `lineTool`, `arrowTool`, `freedrawTool`, `textTool`, `eraserTool`, `frameTool`, plus the `Tool`, `ToolEvent`, `ToolEffect`, `ToolContext`, `ToolName`, `Modifiers`, `SceneMutation` types.
2. Every reducer is pure: same `(state, event, ctx)` always returns the same `[next, effects]`. No `Date.now()` (factories handle their own timestamps), no `Math.random()` (factories handle their own ids/seeds).
3. Continuous-input flows (drag, resize, rotate, freedraw, eraser) emit one history entry per gesture, not one per `pointerMove`.
4. `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` all green.
5. Tools imports nothing outside `@excalidraw-clone/scene`, `@excalidraw-clone/geometry`, and TypeScript's standard library.
6. All Phase 5 commits land on `origin/develop`.

## Not in Phase 5

- **Pan / hand tool.** Lives in apps/web; doesn't fit the reducer abstraction (changes view, not scene).
- **Image tool.** Phase 6 (needs persistence for binary upload).
- **Text editing chrome** (cursor, IME, overflow). apps/web Phase 8.
- **Snap-to-grid.** Deferred — visual grid only.
- **Group selection / un-group.** v1.1.
- **Arrow ↔ shape binding logic.** v1.1.
- **Multi-point linear creation** (click-click-click polylines). v1.1.
- **Resizing rotated elements** (single-element only, axis-aligned only). Documented limitation; v1.1.
- **Multi-element resize** (resizing several at once with one handle). v1.1.
