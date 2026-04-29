# Phase 3: `@excalidraw-clone/scene` Implementation Plan

> Inline execution. Each task ends with a commit on `develop`. TDD-style: failing test first, then implementation.

**Goal:** Build the scene layer — element type definitions (mirroring upstream `.excalidraw`), element factories, element-aware bbox + hit-test, the `Scene` class with structural-shared immutable history, and JSON round-trip.

**Architecture constraint:** `scene` imports `@excalidraw-clone/geometry` only (per spec § 4). `nanoid` is added as `scene`'s first external runtime dependency for ID generation.

**Tech:** TypeScript strict, Vitest, `nanoid@^5.0.0`. No React.

**Spec reference:** `docs/superpowers/specs/2026-04-28-excalidraw-clone-design.md` § 2.1 (element types — mirror upstream), § 2.2 (Scene class signature, history strategy), § 8.3 (`.excalidraw` file format), § 11 (testing: "mutation + history correctness, JSON round-trips").

**Working branch:** `develop`. Every task ends with a commit.

**Out of scope:**

- Arrow-to-shape **binding logic** (deferred to v1.1 per spec § 13). The `boundElements`, `startBinding`, `endBinding` _fields_ exist on element types for forward compatibility, but no logic resolves them.
- Z-order via fractional indexing (v1 uses array order; the `index` field is deferred).
- Rendering — Phase 4.
- Tool reducers / pointer event handling — Phase 5.
- Image binary I/O / IndexedDB — Phase 6.

---

## Task 1: Element type definitions (mirror upstream)

A single `types.ts` defining `ExcalidrawElementBase`, every concrete element type, the `ExcalidrawElement` discriminated union, and the file-format types (`ExcalidrawData`, `ExcalidrawFiles`).

**Files:**

- Create: `packages/scene/src/types.ts`
- Modify: `packages/scene/src/index.ts`
- Create: `packages/scene/test/types.test.ts`

**Type surface to ship** (full upstream-compat fields; logic for some is deferred to later phases):

```ts
import type { Point } from "@excalidraw-clone/geometry"

// Core enums + literal unions
export type ElementType =
  | "rectangle"
  | "diamond"
  | "ellipse"
  | "arrow"
  | "line"
  | "freedraw"
  | "text"
  | "image"
  | "frame"

export type FillStyle = "hachure" | "cross-hatch" | "solid"
export type StrokeStyle = "solid" | "dashed" | "dotted"
export type StrokeWidth = 1 | 2 | 4
export type Roughness = 0 | 1 | 2
export type FontFamily = 1 | 2 | 3 // virgil / helvetica / cascadia
export type TextAlign = "left" | "center" | "right"
export type VerticalAlign = "top" | "middle" | "bottom"
export type Arrowhead =
  | "arrow"
  | "bar"
  | "dot"
  | "circle"
  | "cross"
  | "triangle"
  | "diamond"
  | "triangle_outline"
  | "circle_outline"
  | "diamond_outline"
export type Roundness = { type: 1 | 2 } | null

// Forward-compat binding (logic deferred to v1.1)
export interface PointBinding {
  elementId: string
  focus: number
  gap: number
  fixedPoint?: readonly [number, number]
}

export interface BoundElement {
  id: string
  type: "arrow" | "text"
}

// Base — every element extends this.
export interface ExcalidrawElementBase {
  id: string
  type: ElementType
  x: number
  y: number
  width: number
  height: number
  angle: number // radians

  strokeColor: string
  backgroundColor: string
  fillStyle: FillStyle
  strokeWidth: StrokeWidth
  strokeStyle: StrokeStyle
  roughness: Roughness
  opacity: number // 0–100

  groupIds: readonly string[]
  frameId: string | null
  roundness: Roundness

  seed: number
  versionNonce: number
  isDeleted: boolean

  boundElements: readonly BoundElement[] | null
  updated: number // ms epoch
  link: string | null
  locked: boolean
}

// Concrete element subtypes
export interface ExcalidrawRectangleElement extends ExcalidrawElementBase {
  type: "rectangle"
}

export interface ExcalidrawDiamondElement extends ExcalidrawElementBase {
  type: "diamond"
}

export interface ExcalidrawEllipseElement extends ExcalidrawElementBase {
  type: "ellipse"
}

export interface ExcalidrawLinearBase extends ExcalidrawElementBase {
  points: readonly Point[]
  lastCommittedPoint: Point | null
  startBinding: PointBinding | null
  endBinding: PointBinding | null
  startArrowhead: Arrowhead | null
  endArrowhead: Arrowhead | null
}

export interface ExcalidrawLineElement extends ExcalidrawLinearBase {
  type: "line"
}

export interface ExcalidrawArrowElement extends ExcalidrawLinearBase {
  type: "arrow"
}

export interface ExcalidrawFreedrawElement extends ExcalidrawElementBase {
  type: "freedraw"
  points: readonly Point[]
  pressures: readonly number[]
  simulatePressure: boolean
  lastCommittedPoint: Point | null
}

export interface ExcalidrawTextElement extends ExcalidrawElementBase {
  type: "text"
  text: string
  fontSize: number
  fontFamily: FontFamily
  textAlign: TextAlign
  verticalAlign: VerticalAlign
  containerId: string | null
  originalText: string
  autoResize: boolean
  lineHeight: number
  baseline: number
}

export interface ExcalidrawImageElement extends ExcalidrawElementBase {
  type: "image"
  fileId: string | null
  status: "pending" | "saved" | "error"
  scale: readonly [number, number]
  crop: { x: number; y: number; width: number; height: number } | null
}

export interface ExcalidrawFrameElement extends ExcalidrawElementBase {
  type: "frame"
  name: string | null
  isCollapsed: boolean
}

// Discriminated union
export type ExcalidrawElement =
  | ExcalidrawRectangleElement
  | ExcalidrawDiamondElement
  | ExcalidrawEllipseElement
  | ExcalidrawLineElement
  | ExcalidrawArrowElement
  | ExcalidrawFreedrawElement
  | ExcalidrawTextElement
  | ExcalidrawImageElement
  | ExcalidrawFrameElement

// File format (matches upstream .excalidraw v2)
export type ExcalidrawAppStateSnapshot = Record<string, unknown>

export interface ExcalidrawBinaryFile {
  id: string
  mimeType: string
  dataURL: string
  created: number
}

export type ExcalidrawFiles = Readonly<Record<string, ExcalidrawBinaryFile>>

export interface ExcalidrawData {
  type: "excalidraw"
  version: 2
  source: string
  elements: readonly ExcalidrawElement[]
  appState?: ExcalidrawAppStateSnapshot
  files?: ExcalidrawFiles
}
```

**Tests:**

- Type-level: every element variant is assignable; the discriminated union narrows correctly given a `type` literal.
- Empty `groupIds` and `null` boundElements / frameId / link all assign cleanly.
- `ExcalidrawData` literal with empty elements is valid.

```bash
git add packages/scene
git commit -m "Phase 3.1: scene element type definitions (upstream-compat)"
```

---

## Task 2: Element defaults + factories

Default styling values + per-type element factory helpers (`newRectangle`, `newEllipse`, etc.). Adds `nanoid` as a runtime dep.

**Files:**

- Modify: `packages/scene/package.json` (add `nanoid: ^5.0.0` to `dependencies`)
- Create: `packages/scene/src/defaults.ts`
- Create: `packages/scene/src/factories.ts`
- Modify: `packages/scene/src/index.ts`
- Create: `packages/scene/test/factories.test.ts`

**Defaults** — match upstream so files round-trip cleanly:

```ts
// defaults.ts
import type { FillStyle, FontFamily, Roughness, StrokeStyle, StrokeWidth } from "./types"

export const DEFAULT_STROKE_COLOR = "#1e1e1e"
export const DEFAULT_BG_COLOR = "transparent"
export const DEFAULT_FILL_STYLE: FillStyle = "solid"
export const DEFAULT_STROKE_WIDTH: StrokeWidth = 2
export const DEFAULT_STROKE_STYLE: StrokeStyle = "solid"
export const DEFAULT_ROUGHNESS: Roughness = 1
export const DEFAULT_OPACITY = 100
export const DEFAULT_FONT_FAMILY: FontFamily = 1
export const DEFAULT_FONT_SIZE = 20
```

**Factories** — each accepts the minimum required positional/dimensional fields; everything else takes a default. Returns a fully-formed element with a fresh id, seed, and `versionNonce`. ID generation uses `nanoid()` (default 21-char alphabet matches upstream's choice).

```ts
// factories.ts
import { nanoid } from "nanoid"
import type {
  ExcalidrawArrowElement,
  ExcalidrawDiamondElement,
  ExcalidrawElementBase,
  ExcalidrawEllipseElement,
  ExcalidrawFrameElement,
  ExcalidrawFreedrawElement,
  ExcalidrawImageElement,
  ExcalidrawLineElement,
  ExcalidrawRectangleElement,
  ExcalidrawTextElement,
} from "./types"
import {
  DEFAULT_BG_COLOR,
  DEFAULT_FILL_STYLE,
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_SIZE,
  DEFAULT_OPACITY,
  DEFAULT_ROUGHNESS,
  DEFAULT_STROKE_COLOR,
  DEFAULT_STROKE_STYLE,
  DEFAULT_STROKE_WIDTH,
} from "./defaults"

const newSeed = (): number => Math.floor(Math.random() * 2 ** 31)

interface NewElementInput {
  x: number
  y: number
  width?: number
  height?: number
  angle?: number
  strokeColor?: string
  backgroundColor?: string
  // ...optional overrides for any base field
}

const baseElement = (input: NewElementInput): Omit<ExcalidrawElementBase, "type"> => ({
  id: nanoid(),
  x: input.x,
  y: input.y,
  width: input.width ?? 0,
  height: input.height ?? 0,
  angle: input.angle ?? 0,
  strokeColor: input.strokeColor ?? DEFAULT_STROKE_COLOR,
  backgroundColor: input.backgroundColor ?? DEFAULT_BG_COLOR,
  fillStyle: DEFAULT_FILL_STYLE,
  strokeWidth: DEFAULT_STROKE_WIDTH,
  strokeStyle: DEFAULT_STROKE_STYLE,
  roughness: DEFAULT_ROUGHNESS,
  opacity: DEFAULT_OPACITY,
  groupIds: [],
  frameId: null,
  roundness: null,
  seed: newSeed(),
  versionNonce: newSeed(),
  isDeleted: false,
  boundElements: null,
  updated: Date.now(),
  link: null,
  locked: false,
})

export const newRectangle = (input: NewElementInput): ExcalidrawRectangleElement => ({
  ...baseElement(input),
  type: "rectangle",
})

// (likewise newDiamond, newEllipse, newLine, newArrow, newFreedraw, newText, newImage, newFrame)
```

**Tests:**

- Each factory returns the correct `type` literal.
- Default fields are populated (id is non-empty, seed/versionNonce are integers, `isDeleted` is false).
- Overrides via input win over defaults.
- Two consecutive `newRectangle` calls produce different ids.
- `newLine` / `newArrow` / `newFreedraw` start with `points: []` and `lastCommittedPoint: null`.
- `newText` defaults: `text: ""`, `fontSize: DEFAULT_FONT_SIZE`, `fontFamily: 1`, `textAlign: "left"`, `verticalAlign: "top"`.
- `newImage` defaults: `fileId: null`, `status: "pending"`, `scale: [1, 1]`, `crop: null`.
- `newFrame` defaults: `name: null`, `isCollapsed: false`.

```
Phase 3.2: element defaults + factories (adds nanoid)
```

---

## Task 3: Element bounding box

`getElementBounds(element): Bounds` — returns the AABB of an element in scene coords. For rotated rect/diamond/ellipse, this is the AABB of the rotated corners (so selection bounds, marquee, and frame containment match what the user sees).

For points-based elements (line, arrow, freedraw), the bounds wrap the absolute points (`element.x + p.x`, `element.y + p.y`).

For text/image/frame: AABB of `(x, y, width, height)`, rotation-aware.

**Files:**

- Create: `packages/scene/src/bounds.ts`
- Modify: `packages/scene/src/index.ts`
- Create: `packages/scene/test/bounds.test.ts`

```ts
import {
  type Bounds,
  type Point,
  boundsFromPoints,
  pointAdd,
  rotatePoint,
} from "@excalidraw-clone/geometry"
import type { ExcalidrawElement } from "./types"

const cornersOf = (e: ExcalidrawElement): readonly Point[] => [
  { x: e.x, y: e.y },
  { x: e.x + e.width, y: e.y },
  { x: e.x + e.width, y: e.y + e.height },
  { x: e.x, y: e.y + e.height },
]

const rotatedCorners = (e: ExcalidrawElement): readonly Point[] => {
  if (e.angle === 0) return cornersOf(e)
  const center: Point = { x: e.x + e.width / 2, y: e.y + e.height / 2 }
  return cornersOf(e).map((c) => rotatePoint(c, center, e.angle))
}

export const getElementBounds = (element: ExcalidrawElement): Bounds => {
  switch (element.type) {
    case "line":
    case "arrow":
    case "freedraw": {
      const origin: Point = { x: element.x, y: element.y }
      const absolute = element.points.map((p) => pointAdd(origin, p))
      // For rotated linear elements, also rotate around the origin's center.
      if (element.angle === 0) return boundsFromPoints(absolute)
      const center = element.points.length
        ? pointAdd(origin, {
            x: element.width / 2,
            y: element.height / 2,
          })
        : origin
      return boundsFromPoints(absolute.map((p) => rotatePoint(p, center, element.angle)))
    }
    default:
      return boundsFromPoints(rotatedCorners(element))
  }
}
```

**Tests:**

- Axis-aligned rectangle: bounds equal `(x, y, width, height)`.
- Rectangle rotated 90° around its center: bounds shrink/expand if width ≠ height.
- Empty-points freedraw returns zero-size bounds at the element origin.
- Line with points `[[0,0],[10,5]]` at element `(x=2, y=3)` returns bounds `(2, 3, 10, 5)`.
- Frame element treated as a rectangle for bbox purposes.

```
Phase 3.3: element bounding box
```

---

## Task 4: Element hit-test

`hitTestElement(element, point, options?): boolean` — true if `point` (scene coords) hits the element. Per type:

- rectangle / text / image / frame → `pointInRectangle(point, getElementBounds(element), element.angle)` against unrotated AABB + element angle.
- ellipse → `pointInEllipse`.
- diamond → `pointInDiamond`.
- line / arrow → any consecutive segment within `threshold` of `point` (threshold defaults to `max(strokeWidth * 2, 5)`). Account for `element.angle`.
- freedraw → same segment-based test against the polyline.

**Files:**

- Create: `packages/scene/src/hit-test.ts`
- Modify: `packages/scene/src/index.ts`
- Create: `packages/scene/test/hit-test.test.ts`

**Tests:**

- Hit-test inside / on edge / outside for each element type.
- Rotated rectangle: pointer inside AABB but outside rotated shape ⇒ false.
- Line: pointer within strokeWidth of segment ⇒ hit; perpendicular distance > threshold ⇒ miss.
- Freedraw with three points: hits midpoint of any segment.
- Optional `threshold` override widens the hit area for line/arrow/freedraw.

```
Phase 3.4: element hit-test
```

---

## Task 5: Scene class — state, listeners, getters

Skeleton implementation. No mutation API yet; just enough to subscribe and read elements.

**Files:**

- Create: `packages/scene/src/scene.ts`
- Modify: `packages/scene/src/index.ts`
- Create: `packages/scene/test/scene-getters.test.ts`

```ts
import type { ExcalidrawElement } from "./types"

export class Scene {
  private elements: readonly ExcalidrawElement[]
  private listeners = new Set<() => void>()

  constructor(initial: readonly ExcalidrawElement[] = []) {
    this.elements = initial
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  getElements(): readonly ExcalidrawElement[] {
    return this.elements.filter((e) => !e.isDeleted)
  }

  getElementsIncludingDeleted(): readonly ExcalidrawElement[] {
    return this.elements
  }

  protected notify(): void {
    for (const fn of this.listeners) fn()
  }

  protected setElements(next: readonly ExcalidrawElement[]): void {
    this.elements = next
    this.notify()
  }
}
```

**Tests:**

- Empty scene has no visible elements.
- `getElements` filters out `isDeleted: true`.
- `getElementsIncludingDeleted` includes deleted ones.
- `subscribe` returns an unsubscribe; the listener fires when `setElements` runs (test via subclass exposing it, or defer until Task 6).

```
Phase 3.5: Scene skeleton (state + listeners + getters)
```

---

## Task 6: Scene.mutate + structural sharing

Add the mutation API. `mutate(fn)` receives a shallow copy of the elements array; the user replaces elements (or pushes/splices) and on return we snapshot the array as the new state.

**Contract** (will be documented in code via JSDoc):

> The draft is a shallow copy of the elements array. To change an element, replace it with a new object (e.g. `draft[i] = { ...draft[i], x: 10 }`). To leave it unchanged, leave the existing reference. Do **not** mutate elements in place; doing so breaks the structural-sharing invariant relied on by listeners that compare by reference.

**Files:**

- Modify: `packages/scene/src/scene.ts`
- Create: `packages/scene/test/scene-mutate.test.ts`

```ts
mutate(fn: (draft: ExcalidrawElement[]) => void, opts?: { skipHistory?: boolean }): void {
  const draft = [...this.elements]
  fn(draft)
  this.setElements(draft)
  if (!opts?.skipHistory) this.pushHistory(draft)
}
```

(Where `pushHistory` is added in Task 7. For Task 6 we leave a stub that does nothing.)

**Tests:**

- `mutate(d => d.push(rect))` adds the element; `getElements()` returns it.
- After mutate, the elements array is a new reference (`scene.getElementsIncludingDeleted() !== before`).
- Unchanged elements retain their reference (structural sharing).
- Subscribers fire exactly once per mutate.
- `mutate(d => { d[0] = { ...d[0], x: 99 } })` updates the first element.

```
Phase 3.6: Scene.mutate with structural-shared snapshots
```

---

## Task 7: Undo / redo + history

Replace the `pushHistory` stub with real history. Push the current snapshot; cap at `MAX_HISTORY = 100` entries; truncate the redo branch on new mutation.

**Files:**

- Modify: `packages/scene/src/scene.ts`
- Create: `packages/scene/test/scene-history.test.ts`

```ts
private history: readonly (readonly ExcalidrawElement[])[] = [[]]
private historyIndex = 0
private static readonly MAX_HISTORY = 100

private pushHistory(snapshot: readonly ExcalidrawElement[]): void {
  // Drop redo branch
  const truncated = this.history.slice(0, this.historyIndex + 1)
  const next = [...truncated, snapshot]
  // Cap
  const capped = next.length > Scene.MAX_HISTORY
    ? next.slice(next.length - Scene.MAX_HISTORY)
    : next
  this.history = capped
  this.historyIndex = capped.length - 1
}

undo(): void {
  if (!this.canUndo()) return
  this.historyIndex -= 1
  this.setElements(this.history[this.historyIndex]!)
}

redo(): void {
  if (!this.canRedo()) return
  this.historyIndex += 1
  this.setElements(this.history[this.historyIndex]!)
}

canUndo(): boolean { return this.historyIndex > 0 }
canRedo(): boolean { return this.historyIndex < this.history.length - 1 }
```

**Tests:**

- Fresh scene: `canUndo() === false`, `canRedo() === false`.
- After one mutate: `canUndo() === true`, `canRedo() === false`.
- `undo` restores prior state; `getElements()` reflects it.
- `redo` re-applies; `redo` after a fresh mutate is impossible (branch was dropped).
- `mutate(..., { skipHistory: true })` does not push.
- History caps at `MAX_HISTORY`: 110 mutations leave only the last 100 reachable.

```
Phase 3.7: Scene undo/redo + history
```

---

## Task 8: JSON round-trip

`toJSON(appState?, files?): ExcalidrawData` and `loadFromJSON(data): { appState?, files? }`.

`appState` and `files` pass through opaquely — scene doesn't introspect them. The structural shell matches upstream v2.

**Files:**

- Create: `packages/scene/src/json.ts`
- Modify: `packages/scene/src/scene.ts`
- Modify: `packages/scene/src/index.ts`
- Create: `packages/scene/test/scene-json.test.ts`

```ts
// json.ts
import type { ExcalidrawData, ExcalidrawAppStateSnapshot, ExcalidrawFiles } from "./types"

export const SCENE_FORMAT_VERSION = 2 as const
export const SCENE_FORMAT_SOURCE = "https://excalidraw-clone.local"

export const buildExcalidrawData = (
  elements: readonly import("./types").ExcalidrawElement[],
  appState?: ExcalidrawAppStateSnapshot,
  files?: ExcalidrawFiles,
): ExcalidrawData => ({
  type: "excalidraw",
  version: SCENE_FORMAT_VERSION,
  source: SCENE_FORMAT_SOURCE,
  elements,
  ...(appState ? { appState } : {}),
  ...(files ? { files } : {}),
})
```

```ts
// scene.ts (added methods)
toJSON(appState?: ExcalidrawAppStateSnapshot, files?: ExcalidrawFiles): ExcalidrawData {
  return buildExcalidrawData(this.elements, appState, files)
}

loadFromJSON(data: ExcalidrawData): { appState?: ExcalidrawAppStateSnapshot; files?: ExcalidrawFiles } {
  this.setElements(data.elements)
  // Reset history with the loaded state as the only entry.
  this.history = [data.elements]
  this.historyIndex = 0
  return {
    ...(data.appState ? { appState: data.appState } : {}),
    ...(data.files ? { files: data.files } : {}),
  }
}
```

**Tests:**

- `toJSON()` of an empty scene matches `{ type: "excalidraw", version: 2, source, elements: [] }`.
- `toJSON(appState, files)` includes both fields.
- Round-trip: `loadFromJSON(toJSON(...))` ⇒ `getElements()` deep-equals original.
- `loadFromJSON` returns the embedded `appState` / `files` opaquely.
- Loading a scene resets history (`canUndo() === false` immediately after load).
- A v2 file with custom `appState` round-trips (opaque pass-through).

```
Phase 3.8: Scene JSON serialization (toJSON / loadFromJSON)
```

---

## Task 9: Final integration

- [ ] **Step 1:** Run the full pipeline.

```bash
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Expected: every command exits 0. Test count is up — `scene` adds ~80–100 new tests.

- [ ] **Step 2:** Verify the boundary rule still passes.

```bash
pnpm --filter @excalidraw-clone/scene lint
```

The `scene` package may import `@excalidraw-clone/geometry` and `nanoid`, nothing else.

- [ ] **Step 3:** Push.

```bash
git push origin develop
```

---

## Done criteria

Phase 3 is complete when:

1. `@excalidraw-clone/scene` exports the API listed above.
2. All element types mirror upstream `.excalidraw` shape; arrow binding fields exist (logic deferred to v1.1).
3. The `Scene` class has `subscribe`, `getElements`, `getElementsIncludingDeleted`, `mutate`, `undo`, `redo`, `canUndo`, `canRedo`, `toJSON`, `loadFromJSON`.
4. History uses structural-shared immutable snapshots; redo branch truncates on new mutation; capped at 100 entries.
5. `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` all green.
6. `scene` only imports `@excalidraw-clone/geometry` and `nanoid`.
7. All Phase 3 commits land on `origin/develop`.

## Not in Phase 3

- Element rendering (Phase 4).
- Tool reducers / pointer event → mutation translation (Phase 5).
- Image binary I/O / IndexedDB persistence (Phase 6).
- Arrow-to-shape binding logic (v1.1).
- Z-order via fractional indexing (v1.1 if needed for cross-merge).
- File-format migrations (v1→v2). Deferred until first incoming user files surface a need; the version field is in place.
