# Multi-Point Arrows (Bend Points) — Design

**Date:** 2026-06-25
**Status:** Approved (design), pending implementation plan
**Builds on:** v1.5 smart arrows / element binding (41b0dab) and arrow endpoint editing + focus (bea4358).

## Goal

Let users add, drag, and remove intermediate **bend points** on arrows and lines via Excalidraw-style handles. Bends must survive on arrows that are **bound** to shapes — moving a connected shape reflows only the bound endpoint and leaves interior bends in place.

## Decisions (locked during brainstorming)

1. **Interaction model:** Excalidraw-style midpoint handles. A selected linear element shows a faint ghost handle at each segment midpoint; dragging one inserts a bend there and drags it. Existing interior points render as solid draggable handles.
2. **Bind + bends coexist (full coexistence):** a bound arrow keeps its bends. The reconciler recomputes only the bound endpoint(s) and leaves interior bend points at their absolute positions.
3. **Bend removal:** double-click a solid bend handle to delete it and rejoin its neighbors. No "selected point" sub-state, no drag-onto-neighbor threshold.
4. Straight segments only — no curved/rounded bends.

## Current-state findings (ground truth)

- The element model already stores `points: Point[]` of arbitrary length.
- **Already N-point-correct:** `packages/renderer/src/shapes/arrow.ts` (`gen.linearPath(pts)` over all points; arrowhead from the last segment), `packages/renderer/src/shapes/line.ts`, `packages/scene/src/hit-test.ts` (iterates `points.length - 1` segments), `packages/scene/src/bounds.ts`.
- **Two write paths flatten to exactly 2 points** and are the core of this work:
  - `packages/scene/src/bindings.ts` → `reconcileBindings` rebuilds `points: [start, end]` for any bound arrow, erasing bends.
  - `packages/tools/src/tools/linear.ts` → `linearPatch(start, end)` always emits 2 points; used by the draw tool **and** the shipped endpoint-move (`selection/endpoint.ts`).
- Endpoint editing chrome + the `endpointDragging` selection phase already exist (`selection/handles.ts`, `selection/endpoint.ts`, `selection/index.ts`, `overlay.ts` `drawLinearChrome`) and are the templates this feature extends.

## Architecture

### Layer 1 — Scene: model & reconciler

- **`reconcileBindings` (`bindings.ts`)** preserves interior points. For a bound arrow with `points.length >= 2`:
  - Compute new absolute start = bound? `computeBoundEndpoint(startTarget, toward, gap, focus)` : current absolute `points[0]`.
  - Compute new absolute end likewise for `points[last]`.
  - `toward` for each bound end is the **adjacent interior point** when one exists (i.e. `points[1]` for start, `points[n-2]` for end), falling back to the other endpoint / target center as today. This makes the bound segment aim along the actual arrow direction at the bend, not straight across.
  - Keep every interior point (`points[1..n-2]`) at its current **absolute** position.
  - Re-derive `x/y/width/height` and re-base all points from the full absolute set (shared helper — see `pointsPatch`).
  - The existing `pts.length < 2` early-out is unchanged.

### Layer 2 — Tools

- **`pointsPatch(absPoints: readonly Point[]): { x; y; width; height; points }`** in `linear.ts` — the N-point generalization of `linearPatch`: min-x/min-y bounding box, points re-based to it. `linearPatch(start, end)` becomes a thin wrapper: `pointsPatch([start, end])`. Exported for reuse by the reconciler and bend builders.
- **`HandleHit` (`selection/handles.ts`)** gains:
  - `| { kind: "bend"; elementId: string; index: number }`
  - `| { kind: "bendAdd"; elementId: string; segmentIndex: number; at: Point }`
  - Linear branch priority in `findHandleAt`: endpoints (`start`/`end`) → interior points (`index` in `1..n-2`) → segment midpoints (`bendAdd`, `at` = scene-space midpoint of segment `segmentIndex`). Hit radius reuses `HANDLE_HIT_HALF`.
- **`selection/bend.ts`** — effect builders, no binding logic (interior points never bind). All take an `elementId`:
  - `buildBendInsertEffect(elementId, insertIndex, at)` — splices `at` (scene-space) into `points` at `insertIndex`, re-bases via `pointsPatch`; skipHistory. Emitted once, by `reduceIdle`, when a `bendAdd` ghost is grabbed.
  - `buildBendMoveEffect(elementId, index, to)` — repositions the interior point at `index`; skipHistory. Emitted on each `pointerMove` during `bendDragging`.
  - `buildBendCommitEffect(elementId)` — a history-tracked re-write of the element to its current geometry, so the completed add/move lands as one undo step (mirrors how endpoint commit finalizes).
  - `buildBendRemoveEffect(elementId, index)` — removes `points[index]`, rejoins neighbors, re-bases via `pointsPatch`; history-tracked; guard `points.length > 2` (no-op otherwise).
  - `buildBendRevertEffect(elementId, origin: LinearSnapshot)` — restores geometry; skipHistory. Reuses the existing `LinearSnapshot` / `snapshotLinear` from `selection/endpoint.ts`.
- **Selection state (`selection/types.ts`)** gains a `bendDragging` phase:
  `| { phase: "bendDragging"; elementId: string; index: number; origin: LinearSnapshot }`.
  `index` is the live array index of the point being dragged (for an added point, the index it was inserted at).
- **`selection/index.ts`**:
  - `reduceIdle`: on a `bend` hit → enter `bendDragging` with that index and a snapshot. On a `bendAdd` hit → emit `buildBendInsertEffect` and enter `bendDragging` at the inserted index (`segmentIndex + 1`). On a `doubleClick` that resolves to a `bend` hit → emit `buildBendRemoveEffect` (stay idle).
  - `reduceBend`: `pointerMove` → `buildBendMoveEffect`; `pointerUp` → `buildBendCommitEffect`, back to idle; `escape` → `buildBendRevertEffect`, back to idle.

### Layer 3 — Renderer chrome

- **`overlay.ts` `drawLinearChrome`** draws, for a selected linear element:
  - Solid dots at the two endpoints (today).
  - **Solid dots at each interior point** (`points[1..n-2]`).
  - **Faint/hollow ghost dots at each segment midpoint** (the add affordance).
  - Still no bounding box / rotation handle (unchanged linear-chrome decision).

## Data flow (add a bend on a bound arrow, then move the target)

1. User selects a bound arrow → overlay shows endpoint dots, interior dots, and midpoint ghosts.
2. pointerDown on a midpoint ghost → `findHandleAt` returns `bendAdd` → `reduceIdle` inserts a point, enters `bendDragging`.
3. pointerMove → `buildBendMoveEffect` repositions the new point (skipHistory).
4. pointerUp → `buildBendCommitEffect` (history) → idle. Element now has 3 points.
5. User drags the connected shape → `Scene.mutate` runs `reconcileBindings` → bound endpoint reflows to the shape's edge; the interior bend stays at its absolute position.

## Testing strategy

- **Unit (`packages/tools/test`, `packages/scene/test`):**
  - `pointsPatch` round-trip (abs → patch → abs) for 2 and 3 points.
  - `reconcileBindings`: 3-point arrow bound at one end; moving the target reflows the bound end, interior point absolute position unchanged; `points.length` stays 3.
  - `findHandleAt` bend priority: interior point → `bend`; segment midpoint → `bendAdd`; endpoints still win over midpoints.
  - bend builders: insert grows array by 1 at the right index; move repositions; remove shrinks and rejoins; remove is a no-op at 2 points; revert restores.
  - `bendDragging` state machine: add→move→commit yields 3 points; move existing; double-click removes; escape reverts.
- **Renderer (`packages/renderer/test/overlay.test.ts`):** a selected 3-point arrow draws expected dot counts — 3 solid point dots + N segment-midpoint ghosts, 0 arcs, 0 bbox stroke.
- **E2e (`apps/web/e2e/arrow-bend.spec.ts`):** draw an arrow; drag a midpoint ghost to add a bend (assert `points.length === 3` via `localStorage`); bind an end to a rectangle; move the rectangle; assert the bound end's x moved while the interior bend point's absolute position is unchanged.

## Scope guards (YAGNI)

- No curved/rounded bends (straight segments only).
- No per-point selection/focus concept; double-click removes.
- Arrowhead stays on the last segment (already handled by the renderer).
- Lines get the same add/move/remove chrome; binding-coexistence logic runs for arrows only (lines aren't bindable; `reconcileBindings` already skips non-arrows).
- Minimum 2 points always enforced.

## Risks / notes

- `bendDragging` is deliberately a **separate phase** from `endpointDragging` rather than a merge: interior points never bind, so sharing the binding-aware commit path would add conditionals for no benefit. The two share `LinearSnapshot`/`snapshotLinear` and `pointsPatch`.
- The `toward = adjacent interior point` change to the reconciler subtly alters the bound-segment angle for arrows that already have bends; arrows with no bends are unaffected (adjacent point == other endpoint), so existing binding tests stay green.
