# Right-Click Context Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a right-click context menu on the canvas — element/selection actions when right-clicking a shape, canvas actions when right-clicking empty space — replacing the browser's native menu.

**Architecture:** Extract the pointerdown hit-test closure in `useDrawingDriver.ts` into a standalone, reusable `pickElementAtPoint`; add a `contextmenu` canvas listener that reuses it (with a `includeLocked` option pointerdown never needs) to resolve a target and populate a new Zustand `contextMenu` slice; a presentational `ContextMenu` component (packages/ui, styled like the existing `CommandPalette`) renders whatever a new `ContextMenuHost` (apps/web, styled like the existing `PaletteHost`) builds from that state, wiring to existing scene mutation primitives (`z-order.ts`, `groups.ts`, `locking.ts`, `clipboard.ts`) plus two small new ones (`duplicateElements`, `unlockElements`) and two new geometry/scene helpers for zoom-to-fit (`getElementsBounds`, `fitToContent`).

**Tech Stack:** TypeScript, React, Zustand, Vitest, Testing Library, Playwright — matches the rest of the repo, no new dependencies.

## Global Constraints

- TDD: every new pure function gets a failing test before its implementation, per this repo's established convention.
- i18n: every new user-visible string needs both `apps/web/src/locales/en/common.json` and `apps/web/src/locales/ko/common.json` entries, added together in the same step. Reuse existing `properties.*` keys (`duplicate`, `delete`, `sendToBack`, `sendBackward`, `bringForward`, `bringToFront`, `group`, `ungroup`, `lock`) instead of duplicating them — only genuinely new labels (`copy`, `cut`, `paste`, `selectAll`, `zoomToFit`, `unlock`) get new `contextMenu.*` keys.
- Commit message prefixes follow this repo's convention: package name(s) touched, e.g. `scene: add duplicateElements`, `web: wire context menu into canvas driver`.
- Full gate (`npm run typecheck`, `npm test`, `npm run e2e` from `apps/web`, `npm run format:check`, `npm run lint`) must be green before the final task's commit.
- Menu-click clipboard actions (Copy/Cut/Paste triggered from the menu, not `Ctrl+C/X/V`) must use `navigator.clipboard.writeText`/`readText` (Async Clipboard API) — a menu click never fires a native `copy`/`cut`/`paste` `ClipboardEvent`, so the existing `document.addEventListener("copy"/"cut"/"paste", ...)` handlers in `apps/web/src/keyboard/clipboard.ts` do not fire for menu-triggered actions and are left untouched.

---

### Task 1: `unlockElements` — per-id unlock in `packages/scene`

**Files:**

- Modify: `packages/scene/src/locking.ts`
- Modify: `packages/scene/src/index.ts:53` (the `export { lockElements, unlockAll } from "./locking"` line)
- Test: `packages/scene/test/locking.test.ts`

**Interfaces:**

- Consumes: nothing new — `ExcalidrawElement` (existing), the file's own `newNonce()` helper.
- Produces: `unlockElements(elements: readonly ExcalidrawElement[], ids: readonly string[]): ExcalidrawElement[]` — mirrors `lockElements`, returns unlocked patches for matched, non-deleted, currently-locked ids. Exported from `@excalidraw-clone/scene`. Task 9 (ContextMenuHost) calls this for the "Unlock" menu item.

- [ ] **Step 1: Write the failing tests**

Append to `packages/scene/test/locking.test.ts`:

```ts
describe("unlockElements", () => {
  it("returns unlocked patches for the requested ids only", () => {
    const a = asLocked(rect(0))
    const b = asLocked(rect(20))
    const patches = unlockElements([a, b], [a.id])
    expect(patches).toHaveLength(1)
    expect(patches[0]!.id).toBe(a.id)
    expect(patches[0]!.locked).toBe(false)
  })

  it("bumps versionNonce and updated on each patch", () => {
    const a = asLocked(rect(0))
    const before = a.updated
    const patches = unlockElements([a], [a.id])
    expect(patches[0]!.versionNonce).not.toBe(a.versionNonce)
    expect(patches[0]!.updated).toBeGreaterThanOrEqual(before)
  })

  it("skips ids that are already unlocked or deleted", () => {
    const a = rect(0)
    const dead = { ...asLocked(rect(20)), isDeleted: true }
    expect(unlockElements([a, dead], [a.id, dead.id])).toEqual([])
  })

  it("ignores unknown ids and does not mutate inputs", () => {
    const a = asLocked(rect(0))
    expect(unlockElements([a], ["ghost"])).toEqual([])
    unlockElements([a], [a.id])
    expect(a.locked).toBe(true)
  })
})
```

Add `unlockElements` to the existing `import { lockElements, unlockAll } from "../src/locking"` line at the top of the test file.

- [ ] **Step 2: Run tests to verify they fail**

Run (from `packages/scene`): `npx vitest run test/locking.test.ts`
Expected: FAIL — `unlockElements` is not exported.

- [ ] **Step 3: Implement `unlockElements`**

Append to `packages/scene/src/locking.ts`:

```ts
/** Returns unlocked patches (fresh versionNonce, bumped updated) for the matched
 *  ids. Skips ids not currently locked, deleted, or unknown. */
export function unlockElements(
  elements: readonly ExcalidrawElement[],
  ids: readonly string[],
): ExcalidrawElement[] {
  const idSet = new Set(ids)
  return elements
    .filter((el) => idSet.has(el.id) && !el.isDeleted && el.locked)
    .map((el) => ({ ...el, locked: false, versionNonce: newNonce(), updated: Date.now() }))
}
```

Update `packages/scene/src/index.ts`, changing:

```ts
export { lockElements, unlockAll } from "./locking"
```

to:

```ts
export { lockElements, unlockAll, unlockElements } from "./locking"
```

- [ ] **Step 4: Run tests to verify they pass**

Run (from `packages/scene`): `npx vitest run test/locking.test.ts`
Expected: PASS, all tests including the 4 new ones.

- [ ] **Step 5: Commit**

```bash
git add packages/scene/src/locking.ts packages/scene/src/index.ts packages/scene/test/locking.test.ts
git commit -m "scene: add unlockElements for per-id unlock"
```

---

### Task 2: `duplicateElements` — extracted, reusable element duplication

**Files:**

- Create: `packages/scene/src/duplicate.ts`
- Modify: `packages/scene/src/index.ts` (add export line)
- Modify: `apps/web/src/components/App.tsx:434-451` (replace inline `onDuplicate` body)
- Test: `packages/scene/test/duplicate.test.ts`

**Context:** `App.tsx`'s `PropertiesPanel` `onDuplicate` callback (lines 434-451) already implements this inline: `expandIdsToCopyClosure` + `cloneElementsWithNewIds`, offset by `+12, +12`, pushed to the scene, new ids selected (excluding bound text). This task extracts that exact logic into `packages/scene` so both `PropertiesPanel`'s existing Duplicate button and the new context menu's Duplicate item share one implementation — the same extract-and-reuse pattern already used for `z-order.ts` (see `docs/superpowers/specs/2026-07-22-layers-panel-design.md`).

**Interfaces:**

- Consumes: `expandIdsToCopyClosure`, `cloneElementsWithNewIds` (both already exported from `@excalidraw-clone/scene`).
- Produces: `duplicateElements(elements: readonly ExcalidrawElement[], ids: readonly string[]): ExcalidrawElement[]` — closure-expanded clones with fresh ids, offset `+12, +12` from their originals. Does not mutate the scene; callers push the result and select the non-bound-text ids themselves (Task 9's ContextMenuHost does this the same way `App.tsx` already does).

- [ ] **Step 1: Write the failing test**

Create `packages/scene/test/duplicate.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { duplicateElements } from "../src/duplicate"
import { newFrame, newLabelFor, newRectangle } from "../src/factories"
import type { ExcalidrawElement } from "../src/types"

describe("duplicateElements", () => {
  it("clones the requested elements with fresh ids, offset by +12/+12", () => {
    const a = newRectangle({ x: 10, y: 20, width: 30, height: 40 })
    const copies = duplicateElements([a], [a.id])
    expect(copies).toHaveLength(1)
    expect(copies[0]!.id).not.toBe(a.id)
    expect(copies[0]!.x).toBe(22)
    expect(copies[0]!.y).toBe(32)
  })

  it("carries a selected frame's members and their bound labels along (copy closure), each with a fresh id", () => {
    const frame = newFrame({ x: 0, y: 0, width: 200, height: 200 })
    const rect = { ...newRectangle({ x: 10, y: 10, width: 50, height: 40 }), frameId: frame.id }
    const label = { ...newLabelFor(rect), text: "hi" }
    const rectWithLabel = { ...rect, boundElements: [{ id: label.id, type: "text" as const }] }
    const elements: ExcalidrawElement[] = [rectWithLabel, label, frame]
    const copies = duplicateElements(elements, [frame.id])
    expect(copies).toHaveLength(3)
    const originalIds = new Set(elements.map((e) => e.id))
    for (const c of copies) expect(originalIds.has(c.id)).toBe(false)
    const copiedFrame = copies.find((c) => c.type === "frame")!
    const copiedRect = copies.find((c) => c.type === "rectangle")!
    const copiedLabel = copies.find((c) => c.type === "text")!
    expect(copiedFrame.x).toBe(12)
    expect(copiedRect.frameId).toBe(copiedFrame.id)
    expect(copiedRect.boundElements).toEqual([{ id: copiedLabel.id, type: "text" }])
  })

  it("returns an empty array for an empty selection", () => {
    const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    expect(duplicateElements([a], [])).toEqual([])
  })

  it("does not mutate the input elements", () => {
    const a = newRectangle({ x: 10, y: 20, width: 30, height: 40 })
    duplicateElements([a], [a.id])
    expect(a.x).toBe(10)
    expect(a.y).toBe(20)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `packages/scene`): `npx vitest run test/duplicate.test.ts`
Expected: FAIL — cannot find module `../src/duplicate`.

- [ ] **Step 3: Implement `duplicateElements`**

Create `packages/scene/src/duplicate.ts`:

```ts
import { cloneElementsWithNewIds, expandIdsToCopyClosure } from "./clone"
import type { ExcalidrawElement } from "./types"

const DUPLICATE_OFFSET = 12

/** Clones the copy-closure of `ids` (frame members + bound labels included)
 *  with fresh ids, offset by a fixed +12/+12 from the originals. Positions
 *  only — callers push the result into the scene and select it. */
export function duplicateElements(
  elements: readonly ExcalidrawElement[],
  ids: readonly string[],
): ExcalidrawElement[] {
  const picked = expandIdsToCopyClosure(ids, elements)
  return cloneElementsWithNewIds(picked).map((el) => ({
    ...el,
    x: el.x + DUPLICATE_OFFSET,
    y: el.y + DUPLICATE_OFFSET,
  }))
}
```

Add to `packages/scene/src/index.ts`, next to the `clone.ts` export line:

```ts
export { cloneElementsWithNewIds, expandIdsToCopyClosure } from "./clone"
export { duplicateElements } from "./duplicate"
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `packages/scene`): `npx vitest run test/duplicate.test.ts`
Expected: PASS.

- [ ] **Step 5: Extract `App.tsx`'s inline duplicate to use it**

In `apps/web/src/components/App.tsx`, add `duplicateElements` to the existing `@excalidraw-clone/scene` import block (alphabetical, next to `distributeElements`), and replace the `onDuplicate` body:

```tsx
onDuplicate={() => {
  const copies = duplicateElements(scene.getElements(), selectedIds)
  scene.mutate((draft) => {
    draft.push(...copies)
  })
  useAppStore
    .getState()
    .setSelection(
      copies
        .filter((c) => !(c.type === "text" && c.containerId !== null))
        .map((c) => c.id),
    )
}}
```

This replaces the 12-line inline block (former lines 434-450) with 10 lines that produce identical behavior — `cloneElementsWithNewIds`/`expandIdsToCopyClosure` are no longer directly needed by `App.tsx` for this callback, but stay imported since other callbacks in the file don't use them for duplication (check no other use is broken — `expandIdsToCopyClosure` and `cloneElementsWithNewIds` may become unused imports in `App.tsx`; if so, remove them from the import block).

- [ ] **Step 6: Run the web unit suite and manually verify PropertiesPanel's Duplicate button**

Run (from `apps/web`): `npx vitest run`
Expected: PASS (no test directly exercises `onDuplicate`'s body, so this just guards against a typecheck/import break — typecheck is verified in the next step).

Run (from repo root): `npm run typecheck`
Expected: PASS — confirms no unused-import errors and correct types.

- [ ] **Step 7: Commit**

```bash
git add packages/scene/src/duplicate.ts packages/scene/src/index.ts packages/scene/test/duplicate.test.ts apps/web/src/components/App.tsx
git commit -m "scene: extract duplicateElements, reuse in App.tsx"
```

---

### Task 3: `getElementsBounds` — union bounding box for zoom-to-fit

**Files:**

- Modify: `packages/scene/src/bounds.ts`
- Modify: `packages/scene/src/index.ts:52` (the `export { getElementBounds } from "./bounds"` line)
- Test: `packages/scene/test/bounds.test.ts`

**Interfaces:**

- Consumes: `getElementBounds` (same file, existing), `boundsFromPoints` from `@excalidraw-clone/geometry` (already a dependency of `packages/scene`).
- Produces: `getElementsBounds(elements: readonly ExcalidrawElement[]): Bounds | null` — union AABB of all non-deleted elements, or `null` for an empty/all-deleted scene. Task 9's ContextMenuHost uses `null` to hide the "Zoom to fit" menu item.

- [ ] **Step 1: Write the failing tests**

Append to `packages/scene/test/bounds.test.ts` (add `getElementsBounds` to the existing `import { getElementBounds, newFrame, newFreedraw, newLine, newRectangle } from "../src"` line):

```ts
describe("getElementsBounds", () => {
  it("returns null for an empty element list", () => {
    expect(getElementsBounds([])).toBeNull()
  })

  it("returns null when every element is deleted", () => {
    const a = { ...newRectangle({ x: 0, y: 0, width: 10, height: 10 }), isDeleted: true }
    expect(getElementsBounds([a])).toBeNull()
  })

  it("returns a single element's own bounds when there's only one", () => {
    const a = newRectangle({ x: 10, y: 20, width: 30, height: 40 })
    expect(getElementsBounds([a])).toEqual({ x: 10, y: 20, width: 30, height: 40 })
  })

  it("returns the union bounding box across multiple elements", () => {
    const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const b = newRectangle({ x: 50, y: 40, width: 10, height: 10 })
    const bounds = getElementsBounds([a, b])
    expect(bounds).toEqual({ x: 0, y: 0, width: 60, height: 50 })
  })

  it("ignores deleted elements when computing the union", () => {
    const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const dead = { ...newRectangle({ x: 500, y: 500, width: 10, height: 10 }), isDeleted: true }
    expect(getElementsBounds([a, dead])).toEqual({ x: 0, y: 0, width: 10, height: 10 })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `packages/scene`): `npx vitest run test/bounds.test.ts`
Expected: FAIL — `getElementsBounds` is not exported.

- [ ] **Step 3: Implement `getElementsBounds`**

In `packages/scene/src/bounds.ts`, add `boundsFromPoints` to the existing `@excalidraw-clone/geometry` import, then append:

```ts
export function getElementsBounds(elements: readonly ExcalidrawElement[]): Bounds | null {
  const visible = elements.filter((el) => !el.isDeleted)
  if (visible.length === 0) return null
  const corners: Point[] = []
  for (const el of visible) {
    const b = getElementBounds(el)
    corners.push({ x: b.x, y: b.y }, { x: b.x + b.width, y: b.y + b.height })
  }
  return boundsFromPoints(corners)
}
```

Update `packages/scene/src/index.ts`, changing:

```ts
export { getElementBounds } from "./bounds"
```

to:

```ts
export { getElementBounds, getElementsBounds } from "./bounds"
```

- [ ] **Step 4: Run tests to verify they pass**

Run (from `packages/scene`): `npx vitest run test/bounds.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/scene/src/bounds.ts packages/scene/src/index.ts packages/scene/test/bounds.test.ts
git commit -m "scene: add getElementsBounds for zoom-to-fit"
```

---

### Task 4: `fitToContent` — viewport transform for zoom-to-fit

**Files:**

- Modify: `packages/geometry/src/transform.ts`
- Modify: `packages/geometry/src/index.ts:17` (the `sceneToViewport, viewportToScene, zoomToPoint, ZOOM_MIN, ZOOM_MAX` export line)
- Test: `packages/geometry/test/transform.test.ts`

**Interfaces:**

- Consumes: `Bounds`, `ViewTransform` (existing types from `./types`), `clamp` (from `./scalar`, already exported package-wide), `ZOOM_MIN`/`ZOOM_MAX` (same file).
- Produces: `fitToContent(bounds: Bounds, viewportWidth: number, viewportHeight: number): ViewTransform` — the zoom/scroll that centers `bounds` in a `viewportWidth × viewportHeight` viewport with ~10% padding, clamped to `[ZOOM_MIN, ZOOM_MAX]`. Task 9's ContextMenuHost calls this with `window.innerWidth`/`window.innerHeight`, matching the existing `Cmd+0`/`Cmd+/Cmd-` zoom handlers' viewport-size convention in `apps/web/src/keyboard/shortcuts.ts`.

- [ ] **Step 1: Write the failing tests**

Append to `packages/geometry/test/transform.test.ts` (add `fitToContent` to the existing `import { sceneToViewport, viewportToScene, zoomToPoint, ZOOM_MIN, ZOOM_MAX } from "../src"` line, and `Bounds` to the `import type { Point, ViewTransform } from "../src"` line):

```ts
describe("fitToContent", () => {
  it("centers the content bounds in the viewport", () => {
    const bounds: Bounds = { x: 0, y: 0, width: 100, height: 100 }
    const view = fitToContent(bounds, 1000, 1000)
    const centerScene = { x: 50, y: 50 }
    const centerViewport = sceneToViewport(centerScene, view)
    expect(centerViewport.x).toBeCloseTo(500, 0)
    expect(centerViewport.y).toBeCloseTo(500, 0)
  })

  it("picks a zoom that fits the wider dimension when the viewport is narrower than it is tall", () => {
    const bounds: Bounds = { x: 0, y: 0, width: 200, height: 100 }
    const view = fitToContent(bounds, 1000, 1000)
    // width is the constraining dimension: zoom * width * 1.1(padding) <= viewportWidth
    expect(view.zoom).toBeLessThanOrEqual(1000 / (200 * 1.1) + 1e-9)
  })

  it("clamps zoom to ZOOM_MAX for very small content", () => {
    const bounds: Bounds = { x: 0, y: 0, width: 1, height: 1 }
    const view = fitToContent(bounds, 1000, 1000)
    expect(view.zoom).toBe(ZOOM_MAX)
  })

  it("clamps zoom to ZOOM_MIN for very large content", () => {
    const bounds: Bounds = { x: 0, y: 0, width: 1_000_000, height: 1_000_000 }
    const view = fitToContent(bounds, 1000, 1000)
    expect(view.zoom).toBe(ZOOM_MIN)
  })

  it("handles a zero-size bounds (single point) without producing NaN/Infinity", () => {
    const bounds: Bounds = { x: 5, y: 5, width: 0, height: 0 }
    const view = fitToContent(bounds, 1000, 1000)
    expect(Number.isFinite(view.zoom)).toBe(true)
    expect(Number.isFinite(view.scrollX)).toBe(true)
    expect(Number.isFinite(view.scrollY)).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `packages/geometry`): `npx vitest run test/transform.test.ts`
Expected: FAIL — `fitToContent` is not exported.

- [ ] **Step 3: Implement `fitToContent`**

In `packages/geometry/src/transform.ts`, change the top import from:

```ts
import type { Point, ViewTransform } from "./types"
```

to:

```ts
import { clamp } from "./scalar"
import type { Bounds, Point, ViewTransform } from "./types"
```

then append:

```ts
const FIT_PADDING = 1.1

export const fitToContent = (
  bounds: Bounds,
  viewportWidth: number,
  viewportHeight: number,
): ViewTransform => {
  const width = Math.max(bounds.width, 1)
  const height = Math.max(bounds.height, 1)
  const zoom = clamp(
    Math.min(viewportWidth / (width * FIT_PADDING), viewportHeight / (height * FIT_PADDING)),
    ZOOM_MIN,
    ZOOM_MAX,
  )
  const centerX = bounds.x + bounds.width / 2
  const centerY = bounds.y + bounds.height / 2
  return {
    zoom,
    scrollX: viewportWidth / 2 / zoom - centerX,
    scrollY: viewportHeight / 2 / zoom - centerY,
  }
}
```

Update `packages/geometry/src/index.ts`, changing:

```ts
export { sceneToViewport, viewportToScene, zoomToPoint, ZOOM_MIN, ZOOM_MAX } from "./transform"
```

to:

```ts
export {
  fitToContent,
  sceneToViewport,
  viewportToScene,
  zoomToPoint,
  ZOOM_MIN,
  ZOOM_MAX,
} from "./transform"
```

- [ ] **Step 4: Run tests to verify they pass**

Run (from `packages/geometry`): `npx vitest run test/transform.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/geometry/src/transform.ts packages/geometry/src/index.ts packages/geometry/test/transform.test.ts
git commit -m "geometry: add fitToContent for zoom-to-fit"
```

---

### Task 5: `pickElementAtPoint` — extracted, lock-aware hit-testing

**Files:**

- Create: `apps/web/src/driver/hitTest.ts`
- Modify: `apps/web/src/driver/useDrawingDriver.ts:156-173` (replace the inline `hitTest` closure body)
- Test: `apps/web/test/hitTest.test.ts`

**Context:** The `hitTest` closure inside `useDrawingDriver.ts`'s `dispatch` (lines 156-173) currently does: iterate `scene.getElements()` back-to-front, skip bound text and locked elements, call `hitTestElement`, defer frames to lowest priority. This task extracts it verbatim into a standalone function, adding one new capability (`includeLocked`) that pointerdown never uses (default `false` preserves exact current behavior) but the new `contextmenu` handler (Task 7) needs, to make locked elements right-clickable for their Unlock action.

**Interfaces:**

- Consumes: `hitTestElement` from `@excalidraw-clone/scene` (existing), `Point` from `@excalidraw-clone/geometry` (existing), `ExcalidrawElement` type (existing).
- Produces: `pickElementAtPoint(elements: readonly ExcalidrawElement[], point: Point, options?: { includeLocked?: boolean }): ExcalidrawElement | null`. Task 7 (contextmenu handler) calls this with `{ includeLocked: true }`; the existing `ctx.hitTest` in `dispatch` calls it with no options (`includeLocked` defaults to `false`).

- [ ] **Step 1: Write the failing test**

Create `apps/web/test/hitTest.test.ts`:

```ts
import { newFrame, newLabelFor, newRectangle } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { pickElementAtPoint } from "../src/driver/hitTest"

describe("pickElementAtPoint", () => {
  it("returns the topmost element under the point", () => {
    const a = newRectangle({ x: 0, y: 0, width: 100, height: 100 })
    const b = newRectangle({ x: 0, y: 0, width: 100, height: 100 })
    expect(pickElementAtPoint([a, b], { x: 50, y: 50 })?.id).toBe(b.id)
  })

  it("returns null when nothing is under the point", () => {
    const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    expect(pickElementAtPoint([a], { x: 500, y: 500 })).toBeNull()
  })

  it("skips locked elements by default", () => {
    const a = { ...newRectangle({ x: 0, y: 0, width: 100, height: 100 }), locked: true }
    expect(pickElementAtPoint([a], { x: 50, y: 50 })).toBeNull()
  })

  it("includes locked elements when includeLocked is true", () => {
    const a = { ...newRectangle({ x: 0, y: 0, width: 100, height: 100 }), locked: true }
    expect(pickElementAtPoint([a], { x: 50, y: 50 }, { includeLocked: true })?.id).toBe(a.id)
  })

  it("skips bound text elements (containerId set)", () => {
    const rect = newRectangle({ x: 0, y: 0, width: 100, height: 100 })
    const label = newLabelFor(rect)
    expect(pickElementAtPoint([rect, label], { x: 50, y: 50 })?.id).toBe(rect.id)
  })

  it("treats frames as lowest priority — a member element wins over its frame", () => {
    const frame = newFrame({ x: 0, y: 0, width: 200, height: 200 })
    const member = { ...newRectangle({ x: 50, y: 50, width: 20, height: 20 }), frameId: frame.id }
    expect(pickElementAtPoint([frame, member], { x: 60, y: 60 })?.id).toBe(member.id)
  })

  it("returns the frame when the point is over its empty interior", () => {
    const frame = newFrame({ x: 0, y: 0, width: 200, height: 200 })
    const member = { ...newRectangle({ x: 50, y: 50, width: 20, height: 20 }), frameId: frame.id }
    expect(pickElementAtPoint([frame, member], { x: 150, y: 150 })?.id).toBe(frame.id)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `apps/web`): `npx vitest run test/hitTest.test.ts`
Expected: FAIL — cannot find module `../src/driver/hitTest`.

- [ ] **Step 3: Implement `pickElementAtPoint`**

Create `apps/web/src/driver/hitTest.ts`:

```ts
import type { Point } from "@excalidraw-clone/geometry"
import { hitTestElement, type ExcalidrawElement } from "@excalidraw-clone/scene"

/** Finds the topmost element under `point`, back-to-front. Skips bound text
 *  and (unless `includeLocked`) locked elements. Frames are lowest-priority:
 *  members inside a frame win, the frame itself only catches clicks on its
 *  empty interior. */
export function pickElementAtPoint(
  elements: readonly ExcalidrawElement[],
  point: Point,
  options?: { includeLocked?: boolean },
): ExcalidrawElement | null {
  const includeLocked = options?.includeLocked ?? false
  let frameHit: ExcalidrawElement | null = null
  for (let i = elements.length - 1; i >= 0; i -= 1) {
    const el = elements[i] as ExcalidrawElement
    if (el.type === "text" && el.containerId !== null) continue
    if (el.locked && !includeLocked) continue
    if (!hitTestElement(el, point)) continue
    if (el.type === "frame") {
      frameHit = frameHit ?? el
      continue
    }
    return el
  }
  return frameHit
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `apps/web`): `npx vitest run test/hitTest.test.ts`
Expected: PASS.

- [ ] **Step 5: Replace the inline closure in `useDrawingDriver.ts`**

In `apps/web/src/driver/useDrawingDriver.ts`, remove `hitTestElement` from the `@excalidraw-clone/scene` import (no longer used directly in this file) and add an import:

```ts
import { pickElementAtPoint } from "./hitTest"
```

Replace the `hitTest` closure body (current lines 156-173):

```ts
hitTest: (at) => {
  // Frames are lowest-priority: members inside a frame win, the frame
  // itself only catches clicks on its empty interior.
  const elements = scene.getElements()
  let frameHit: ExcalidrawElement | null = null
  for (let i = elements.length - 1; i >= 0; i -= 1) {
    const el = elements[i] as ExcalidrawElement
    if (el.type === "text" && el.containerId !== null) continue
    if (el.locked) continue
    if (!hitTestElement(el, at)) continue
    if (el.type === "frame") {
      frameHit = frameHit ?? el
      continue
    }
    return el
  }
  return frameHit
},
```

with:

```ts
hitTest: (at) => pickElementAtPoint(scene.getElements(), at),
```

- [ ] **Step 6: Run the full web unit suite to confirm no regression**

Run (from `apps/web`): `npx vitest run`
Expected: PASS — selection/drawing behavior is unchanged since default `includeLocked: false` reproduces the exact prior closure.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/driver/hitTest.ts apps/web/src/driver/useDrawingDriver.ts apps/web/test/hitTest.test.ts
git commit -m "web: extract pickElementAtPoint, add includeLocked option"
```

---

### Task 6: `contextMenu` Zustand slice

**Files:**

- Create: `apps/web/src/store/slices/contextMenu.ts`
- Modify: `apps/web/src/store/index.ts`

**Interfaces:**

- Consumes: `Point` from `@excalidraw-clone/geometry` (existing), `StateCreator` from `zustand` (existing pattern, see `dialog.ts`/`palette.ts`).
- Produces: `ContextMenuState` type and `ContextMenuSlice` interface `{ contextMenu: ContextMenuState; setContextMenu: (s: ContextMenuState) => void }`, composed into `AppState`/`useAppStore`. Task 7 (driver) calls `setContextMenu(...)` to open it; Task 9 (`ContextMenuHost`) reads `contextMenu` to render and calls `setContextMenu(null)` to close it.

This slice has no branching logic (a single setter, like `dialog.ts`/`palette.ts`), so per this repo's existing convention (`dialog.ts`/`palette.ts` have no dedicated unit test files — only slices with real logic like `selection.ts`/`tool.ts` do) it is not unit-tested directly; it's exercised through Task 9's e2e coverage.

- [ ] **Step 1: Create the slice**

Create `apps/web/src/store/slices/contextMenu.ts`:

```ts
import type { Point } from "@excalidraw-clone/geometry"
import type { StateCreator } from "zustand"

interface ContextMenuBase {
  x: number
  y: number
  scenePoint: Point
}

export type ContextMenuState =
  | (ContextMenuBase & { target: "canvas" })
  | (ContextMenuBase & { target: "element"; elementIds: string[]; locked: boolean })
  | null

export interface ContextMenuSlice {
  contextMenu: ContextMenuState
  setContextMenu: (s: ContextMenuState) => void
}

export const createContextMenuSlice: StateCreator<ContextMenuSlice, [], [], ContextMenuSlice> = (
  set,
) => ({
  contextMenu: null,
  setContextMenu: (s) => set({ contextMenu: s }),
})
```

- [ ] **Step 2: Compose it into the store**

In `apps/web/src/store/index.ts`, add the import (alphabetically, after `createCanvasBgSlice`):

```ts
import { createContextMenuSlice, type ContextMenuSlice } from "./slices/contextMenu"
```

Add `ContextMenuSlice` to the `AppState` intersection type, and `...createContextMenuSlice(...a)` to the `create<AppState>()((...a) => ({ ... }))` object, both alongside the existing `CanvasBgSlice`/`createCanvasBgSlice` entries.

- [ ] **Step 3: Typecheck**

Run (from repo root): `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/store/slices/contextMenu.ts apps/web/src/store/index.ts
git commit -m "web: add contextMenu store slice"
```

---

### Task 7: Wire the `contextmenu` canvas listener

**Files:**

- Modify: `apps/web/src/driver/useDrawingDriver.ts`
- Test: `apps/web/test/hitTest.test.ts` is not extended here (this task's logic is DOM-event glue, covered by Task 10's e2e); this task's own correctness is verified by the typecheck + full web unit suite (regression guard) plus manual smoke-check before commit.

**Context:** Two changes to `useDrawingDriver.ts`'s `useEffect`:

1. Guard `onPointerDown` to ignore non-primary-button presses. Today it has no `e.button` check, so a right-click's `pointerdown` already flows into the active tool's dispatch (e.g. the selection tool's hit-test/selection logic) _before_ the browser's `contextmenu` event fires — this predates this feature but would now conflict with the context menu's own selection handling (double selection-mutation on right-click). The fix is one line: primary-button-only tool dispatch, matching standard drawing-app convention (mirrors upstream Excalidraw).
2. Add a `contextmenu` listener that resolves the target via `pickElementAtPoint(..., { includeLocked: true })` and opens the `contextMenu` store slice.

**Interfaces:**

- Consumes: `pickElementAtPoint` (Task 5), `useAppStore().setContextMenu`/`.selectedIds`/`.setSelection` (Task 6 + existing `SelectionSlice`), `expandIdsToGroups` from `@excalidraw-clone/scene` (existing, already used by `LayersPanel`'s `onSelect` in `App.tsx`), `clientToScene` (existing, same file's `./events` import).
- Produces: right-clicking the canvas now opens `useAppStore.getState().contextMenu` instead of the native menu. Task 9's `ContextMenuHost` consumes this state.

- [ ] **Step 1: Guard `onPointerDown` to primary button only, and to close an open context menu instead of double-processing the click**

In `apps/web/src/driver/useDrawingDriver.ts`, as the very first lines inside `const onPointerDown = (e: PointerEvent): void => {`, add (before the existing `if (orphanedPointerRef.current === e.pointerId) ...` line):

```ts
if (e.button !== 0) return
if (useAppStore.getState().contextMenu) {
  useAppStore.getState().setContextMenu(null)
  return
}
```

The first line makes right-click a no-op for the drawing/selection tools, leaving it exclusively to the new `contextmenu` handler. The second line ensures that when the context menu is open, a left-click on the canvas closes the menu instead of _also_ being processed as a tool action (e.g. starting a new selection/rubber-band under the menu) — one click, one effect. `ContextMenu`'s own outside-pointerdown listener (Task 8) still independently closes the menu when the outside click lands on non-canvas UI chrome (Toolbar, PropertiesPanel, etc.), which this canvas-level guard can't see. `useAppStore` is already imported in this file.

- [ ] **Step 2: Add the `expandIdsToGroups` import**

Add `expandIdsToGroups` to the existing `@excalidraw-clone/scene` import block in this file (alongside `cloneElementsWithNewIds`, `hitTestElement` — note `hitTestElement` was already removed from this import in Task 5).

- [ ] **Step 3: Add the `contextmenu` handler**

Inside the same `useEffect`, after the `onDoubleClick` handler definition (before the `canvas.addEventListener(...)` calls), add:

```ts
const onContextMenu = (e: MouseEvent): void => {
  e.preventDefault()
  const store = useAppStore.getState()
  const scenePoint = clientToScene(
    canvas,
    { scrollX: store.scrollX, scrollY: store.scrollY, zoom: store.zoom },
    e,
  )
  const hit = pickElementAtPoint(scene.getElements(), scenePoint, { includeLocked: true })
  if (!hit) {
    store.setContextMenu({ x: e.clientX, y: e.clientY, scenePoint, target: "canvas" })
    return
  }
  if (hit.locked) {
    store.setContextMenu({
      x: e.clientX,
      y: e.clientY,
      scenePoint,
      target: "element",
      elementIds: [hit.id],
      locked: true,
    })
    return
  }
  const alreadySelected = store.selectedIds.includes(hit.id)
  const elementIds = alreadySelected
    ? store.selectedIds
    : expandIdsToGroups([hit.id], scene.getElements())
  if (!alreadySelected) store.setSelection(elementIds)
  store.setContextMenu({
    x: e.clientX,
    y: e.clientY,
    scenePoint,
    target: "element",
    elementIds,
    locked: false,
  })
}
```

- [ ] **Step 4: Register and clean up the listener**

Add next to the other `canvas.addEventListener` calls:

```ts
canvas.addEventListener("contextmenu", onContextMenu)
```

and in the returned cleanup function, next to the other `canvas.removeEventListener` calls:

```ts
canvas.removeEventListener("contextmenu", onContextMenu)
```

- [ ] **Step 5: Run the full web unit suite and typecheck**

Run (from `apps/web`): `npx vitest run`
Run (from repo root): `npm run typecheck`
Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/driver/useDrawingDriver.ts
git commit -m "web: wire contextmenu canvas listener, guard pointerdown to primary button"
```

---

### Task 8: `ContextMenu` presentational component

**Files:**

- Create: `packages/ui/src/ContextMenu.tsx`
- Modify: `packages/ui/src/index.ts`
- Test: `packages/ui/test/ContextMenu.test.tsx`

**Interfaces:**

- Consumes: nothing from this repo beyond React — pure, prop-driven, same convention as `CommandPalette`.
- Produces: `ContextMenuItem` (`{ id: string; label: string; hint?: string; perform: () => void }`) and `ContextMenuProps` (`{ x: number; y: number; items: readonly ContextMenuItem[]; onClose: () => void }`) types, and the `ContextMenu` component. Exported from `@excalidraw-clone/ui`. Task 9's `ContextMenuHost` renders it.

- [ ] **Step 1: Write the failing tests**

Create `packages/ui/test/ContextMenu.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { ContextMenu, type ContextMenuItem } from "../src/ContextMenu"

const items = (): ContextMenuItem[] => [
  { id: "copy", label: "Copy", hint: "Ctrl+C", perform: vi.fn() },
  { id: "delete", label: "Delete", perform: vi.fn() },
]

describe("ContextMenu", () => {
  it("renders every item's label and hint", () => {
    render(<ContextMenu x={10} y={10} items={items()} onClose={() => {}} />)
    expect(screen.getByText("Copy")).toBeInTheDocument()
    expect(screen.getByText("Ctrl+C")).toBeInTheDocument()
    expect(screen.getByText("Delete")).toBeInTheDocument()
  })

  it("clicking an item calls perform then onClose", async () => {
    const onClose = vi.fn()
    const list = items()
    render(<ContextMenu x={10} y={10} items={list} onClose={onClose} />)
    await userEvent.click(screen.getByText("Delete"))
    expect(list[1]!.perform).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it("Escape closes without invoking any item", async () => {
    const onClose = vi.fn()
    const list = items()
    render(<ContextMenu x={10} y={10} items={list} onClose={onClose} />)
    await userEvent.keyboard("{Escape}")
    expect(onClose).toHaveBeenCalled()
    for (const item of list) expect(item.perform).not.toHaveBeenCalled()
  })

  it("a pointerdown outside the menu closes it", async () => {
    const onClose = vi.fn()
    render(
      <div>
        <button type="button">outside</button>
        <ContextMenu x={10} y={10} items={items()} onClose={onClose} />
      </div>,
    )
    await userEvent.click(screen.getByText("outside"))
    expect(onClose).toHaveBeenCalled()
  })

  it("assigns each item a stable data-testid for e2e targeting", () => {
    render(<ContextMenu x={10} y={10} items={items()} onClose={() => {}} />)
    expect(document.querySelector('[data-testid="context-menu-item-copy"]')).not.toBeNull()
    expect(document.querySelector('[data-testid="context-menu-item-delete"]')).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `packages/ui`): `npx vitest run test/ContextMenu.test.tsx`
Expected: FAIL — cannot find module `../src/ContextMenu`.

- [ ] **Step 3: Implement `ContextMenu`**

Create `packages/ui/src/ContextMenu.tsx`:

```tsx
"use client"
import { useEffect, useLayoutEffect, useRef, useState } from "react"

export interface ContextMenuItem {
  id: string
  label: string
  hint?: string
  perform: () => void
}

export interface ContextMenuProps {
  x: number
  y: number
  items: readonly ContextMenuItem[]
  onClose: () => void
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps): React.ReactElement {
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [pos, setPos] = useState({ left: x, top: y })

  useLayoutEffect(() => {
    const el = menuRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const left = x + rect.width > window.innerWidth ? Math.max(0, x - rect.width) : x
    const top = y + rect.height > window.innerHeight ? Math.max(0, y - rect.height) : y
    setPos({ left, top })
  }, [x, y])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose()
    }
    const onPointerDown = (e: PointerEvent): void => {
      if (!menuRef.current?.contains(e.target as Node)) onClose()
    }
    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("pointerdown", onPointerDown)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("pointerdown", onPointerDown)
    }
  }, [onClose])

  return (
    <div
      ref={menuRef}
      role="menu"
      data-testid="context-menu"
      style={{ position: "fixed", left: pos.left, top: pos.top }}
      className="z-50 min-w-[180px] rounded-lg bg-white py-1 shadow-xl"
    >
      {items.map((item) => (
        <button
          key={item.id}
          role="menuitem"
          type="button"
          data-testid={`context-menu-item-${item.id}`}
          onClick={() => {
            item.perform()
            onClose()
          }}
          className="flex w-full items-center justify-between gap-4 px-3 py-1.5 text-left text-sm hover:bg-violet-100"
        >
          <span>{item.label}</span>
          {item.hint && <kbd className="font-mono text-xs text-gray-500">{item.hint}</kbd>}
        </button>
      ))}
    </div>
  )
}
```

Add to `packages/ui/src/index.ts`, next to the `CommandPalette` export block:

```ts
export { ContextMenu } from "./ContextMenu"
export type { ContextMenuItem, ContextMenuProps } from "./ContextMenu"
```

- [ ] **Step 4: Run tests to verify they pass**

Run (from `packages/ui`): `npx vitest run test/ContextMenu.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/ContextMenu.tsx packages/ui/src/index.ts packages/ui/test/ContextMenu.test.tsx
git commit -m "ui: add ContextMenu component"
```

---

### Task 9: `ContextMenuHost`, `App.tsx` wiring, and locale keys

**Files:**

- Create: `apps/web/src/components/ContextMenuHost.tsx`
- Modify: `apps/web/src/components/App.tsx`
- Modify: `apps/web/src/locales/en/common.json`
- Modify: `apps/web/src/locales/ko/common.json`

**Context:** This is the wiring task — no new pure logic, just assembling Tasks 1-8 into a working feature, following `PaletteHost.tsx`'s exact convention (a component that reads store state, builds an items/commands array from existing driver primitives via `patchScene`, and renders the presentational component). Not unit-tested directly (same as `PaletteHost`); Task 10's e2e spec is the test.

**Interfaces:**

- Consumes: `ContextMenu`/`ContextMenuItem` (Task 8), `useAppStore().contextMenu`/`.setContextMenu` (Task 6), `pickElementAtPoint`... no — consumes `duplicateElements` (Task 2), `unlockElements` (Task 1), `getElementsBounds` (Task 3), `fitToContent` (Task 4), plus existing `copyPayload`/`buildPaste` (`apps/web/src/driver/clipboard.ts`), `bringForward`/`bringToFront`/`sendBackward`/`sendToBack`/`groupElements`/`ungroupElements`/`lockElements` (all existing, already imported elsewhere in `App.tsx`), `patchScene` (existing).
- Produces: a rendered `<ContextMenuHost scene={scene} />` in `App.tsx`, alongside the existing `<PaletteHost scene={scene} />`.

- [ ] **Step 1: Add the new locale keys**

In `apps/web/src/locales/en/common.json`, add a new top-level `contextMenu` object (e.g. after `"layers"`, before `"pages"`):

```json
"contextMenu": {
  "copy": "Copy",
  "cut": "Cut",
  "paste": "Paste",
  "selectAll": "Select all",
  "zoomToFit": "Zoom to fit",
  "unlock": "Unlock"
},
```

In `apps/web/src/locales/ko/common.json`, add at the same position:

```json
"contextMenu": {
  "copy": "복사",
  "cut": "잘라내기",
  "paste": "붙여넣기",
  "selectAll": "전체 선택",
  "zoomToFit": "화면에 맞추기",
  "unlock": "잠금 해제"
},
```

- [ ] **Step 2: Create `ContextMenuHost`**

Create `apps/web/src/components/ContextMenuHost.tsx`:

```tsx
"use client"
import { fitToContent } from "@excalidraw-clone/geometry"
import {
  bringForward,
  bringToFront,
  duplicateElements,
  getElementsBounds,
  groupElements,
  lockElements,
  sendBackward,
  sendToBack,
  ungroupElements,
  unlockElements,
  type ExcalidrawElement,
  type Scene,
} from "@excalidraw-clone/scene"
import { ContextMenu, type ContextMenuItem } from "@excalidraw-clone/ui"
import { useTranslation } from "react-i18next"
import { buildPaste, copyPayload } from "../driver/clipboard"
import { patchScene } from "../driver/patchScene"
import { useAppStore } from "../store"

// Same predicate as apps/web/src/keyboard/clipboard.ts's private selectableIds —
// pasted/duplicated bound text rides along with its container but isn't itself selectable.
const selectableIds = (els: readonly ExcalidrawElement[]): string[] =>
  els.filter((el) => !(el.type === "text" && el.containerId !== null)).map((el) => el.id)

export function ContextMenuHost({ scene }: { scene: Scene }): React.ReactElement | null {
  const { t } = useTranslation()
  const contextMenu = useAppStore((s) => s.contextMenu)

  if (!contextMenu) return null
  const close = (): void => useAppStore.getState().setContextMenu(null)

  const items: ContextMenuItem[] = []

  if (contextMenu.target === "canvas") {
    const { scenePoint } = contextMenu
    items.push({
      id: "paste",
      label: t("contextMenu.paste"),
      perform: () => {
        void navigator.clipboard
          .readText()
          .then((text) => {
            const pasted = buildPaste(text, scenePoint)
            if (pasted.length === 0) return
            scene.mutate((draft) => {
              draft.push(...pasted)
            })
            useAppStore.getState().setSelection(selectableIds(pasted))
          })
          .catch(() => {})
      },
    })
    items.push({
      id: "select-all",
      label: t("contextMenu.selectAll"),
      perform: () => {
        useAppStore.getState().setSelection(
          scene
            .getElements()
            .filter((el) => !el.locked)
            .map((el) => el.id),
        )
      },
    })
    const bounds = getElementsBounds(scene.getElements())
    if (bounds) {
      items.push({
        id: "zoom-to-fit",
        label: t("contextMenu.zoomToFit"),
        perform: () => {
          useAppStore
            .getState()
            .setView(fitToContent(bounds, window.innerWidth, window.innerHeight))
        },
      })
    }
  } else {
    const { elementIds, locked, scenePoint } = contextMenu
    const selectedElements = scene.getElements().filter((el) => elementIds.includes(el.id))

    items.push({
      id: "copy",
      label: t("contextMenu.copy"),
      perform: () => {
        const payload = copyPayload(scene.getElements(), elementIds)
        if (payload) void navigator.clipboard.writeText(payload.text).catch(() => {})
      },
    })

    if (locked) {
      items.push({
        id: "unlock",
        label: t("contextMenu.unlock"),
        perform: () => {
          patchScene(scene, unlockElements(scene.getElements(), elementIds))
          useAppStore.getState().setSelection(elementIds)
        },
      })
    } else {
      items.push({
        id: "cut",
        label: t("contextMenu.cut"),
        perform: () => {
          const payload = copyPayload(scene.getElements(), elementIds)
          if (!payload) return
          void navigator.clipboard.writeText(payload.text).catch(() => {})
          const doomed = new Set(payload.ids)
          scene.mutate((draft) => {
            for (let i = 0; i < draft.length; i += 1) {
              if (doomed.has(draft[i]!.id)) draft[i] = { ...draft[i]!, isDeleted: true }
            }
          })
          useAppStore.getState().setSelection([])
        },
      })
      items.push({
        id: "paste",
        label: t("contextMenu.paste"),
        perform: () => {
          void navigator.clipboard
            .readText()
            .then((text) => {
              const pasted = buildPaste(text, scenePoint)
              if (pasted.length === 0) return
              scene.mutate((draft) => {
                draft.push(...pasted)
              })
              useAppStore.getState().setSelection(selectableIds(pasted))
            })
            .catch(() => {})
        },
      })
      items.push({
        id: "duplicate",
        label: t("properties.duplicate"),
        perform: () => {
          const copies = duplicateElements(scene.getElements(), elementIds)
          scene.mutate((draft) => {
            draft.push(...copies)
          })
          useAppStore.getState().setSelection(selectableIds(copies))
        },
      })
      items.push({
        id: "delete",
        label: t("properties.delete"),
        perform: () => {
          scene.mutate((draft) => {
            for (let i = 0; i < draft.length; i += 1) {
              if (elementIds.includes(draft[i]!.id)) draft[i] = { ...draft[i]!, isDeleted: true }
            }
          })
          useAppStore.getState().setSelection([])
        },
      })
      items.push({
        id: "bring-to-front",
        label: t("properties.bringToFront"),
        perform: () => {
          scene.mutate((draft) => {
            const next = bringToFront(draft, elementIds)
            draft.length = 0
            draft.push(...next)
          })
        },
      })
      items.push({
        id: "bring-forward",
        label: t("properties.bringForward"),
        perform: () => {
          scene.mutate((draft) => {
            const next = bringForward(draft, elementIds)
            draft.length = 0
            draft.push(...next)
          })
        },
      })
      items.push({
        id: "send-backward",
        label: t("properties.sendBackward"),
        perform: () => {
          scene.mutate((draft) => {
            const next = sendBackward(draft, elementIds)
            draft.length = 0
            draft.push(...next)
          })
        },
      })
      items.push({
        id: "send-to-back",
        label: t("properties.sendToBack"),
        perform: () => {
          scene.mutate((draft) => {
            const next = sendToBack(draft, elementIds)
            draft.length = 0
            draft.push(...next)
          })
        },
      })
      if (elementIds.length >= 2) {
        items.push({
          id: "group",
          label: t("properties.group"),
          perform: () => {
            const byId = new Map(
              groupElements(selectedElements, elementIds, crypto.randomUUID()).map((el) => [
                el.id,
                el,
              ]),
            )
            if (byId.size === 0) return
            scene.mutate((draft) => {
              for (let i = 0; i < draft.length; i += 1) {
                const p = byId.get(draft[i]!.id)
                if (p) draft[i] = p
              }
            })
          },
        })
      }
      if (selectedElements.some((el) => el.groupIds.length > 0)) {
        items.push({
          id: "ungroup",
          label: t("properties.ungroup"),
          perform: () => {
            const byId = new Map(
              ungroupElements(selectedElements, elementIds).map((el) => [el.id, el]),
            )
            if (byId.size === 0) return
            scene.mutate((draft) => {
              for (let i = 0; i < draft.length; i += 1) {
                const p = byId.get(draft[i]!.id)
                if (p) draft[i] = p
              }
            })
          },
        })
      }
      items.push({
        id: "lock",
        label: t("properties.lock"),
        perform: () => {
          patchScene(scene, lockElements(scene.getElements(), elementIds))
          useAppStore.getState().setSelection([])
        },
      })
    }
  }

  return <ContextMenu x={contextMenu.x} y={contextMenu.y} items={items} onClose={close} />
}
```

- [ ] **Step 3: Wire it into `App.tsx`**

Add the import next to `PaletteHost`:

```ts
import { ContextMenuHost } from "./ContextMenuHost"
```

Render it next to `<PaletteHost scene={scene} />` (same location, e.g. immediately after):

```tsx
<PaletteHost scene={scene} />
<ContextMenuHost scene={scene} />
```

- [ ] **Step 4: Typecheck, lint, and run the full unit suite**

Run (from repo root): `npm run typecheck && npm run lint`
Run (from `apps/web`): `npx vitest run`
Expected: all PASS. Fix any import-ordering lint issues by matching the alphabetical/grouped style of neighboring imports in the touched files.

- [ ] **Step 5: Manual smoke-check**

Run (from `apps/web`): `npm run dev`, open the app, draw a rectangle, right-click it (expect Copy/Cut/Paste/Duplicate/Delete/z-order/Group/Lock items, no native menu), right-click empty canvas (expect Paste/Select all/Zoom to fit), lock an element via the Properties panel then right-click it (expect only Copy/Unlock). Stop the dev server after confirming.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/ContextMenuHost.tsx apps/web/src/components/App.tsx apps/web/src/locales/en/common.json apps/web/src/locales/ko/common.json
git commit -m "web: wire ContextMenuHost into App, add contextMenu locale keys"
```

---

### Task 10: E2E coverage

**Files:**

- Create: `apps/web/e2e/context-menu.spec.ts`

**Interfaces:**

- Consumes: `dragOnCanvas`, `parseStoredScene` from `./_helpers` (existing, used by every other e2e spec in this suite).
- Produces: end-to-end confidence that the whole feature (Tasks 1-9) works through a real browser, matching the depth of coverage `layers-panel.spec.ts`/`locking.spec.ts` already provide for their features.

- [ ] **Step 1: Write the e2e spec**

Create `apps/web/e2e/context-menu.spec.ts`:

```ts
import { expect, test } from "@playwright/test"
import { dragOnCanvas } from "./_helpers"

test.beforeEach(async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-rectangle"]').waitFor({ state: "visible" })
})

const drawRect = async (page: import("@playwright/test").Page) => {
  await page.locator('[data-testid="toolbar-rectangle"]').click()
  await dragOnCanvas(page, { x: 150, y: 150 }, { x: 250, y: 220 })
  await page.waitForTimeout(120)
  await page.locator('[data-testid="toolbar-selection"]').click()
}

test("right-click an element opens the menu and Delete removes it", async ({ page }) => {
  await drawRect(page)
  const canvas = page.locator("canvas").first()
  const box = await canvas.boundingBox()
  if (!box) throw new Error("canvas not found")
  await page.mouse.click(box.x + 200, box.y + 185, { button: "right" })

  await expect(page.locator('[data-testid="context-menu"]')).toBeVisible()
  await expect(page.locator('[data-testid="context-menu-item-delete"]')).toBeVisible()

  await page.locator('[data-testid="context-menu-item-delete"]').click()
  await expect(page.locator('[data-testid="context-menu"]')).toHaveCount(0)

  // Nothing left to right-click — a right-click now hits empty canvas.
  await page.mouse.click(box.x + 200, box.y + 185, { button: "right" })
  await expect(page.locator('[data-testid="context-menu-item-select-all"]')).toBeVisible()
})

test("right-click empty canvas shows the canvas menu", async ({ page }) => {
  const canvas = page.locator("canvas").first()
  const box = await canvas.boundingBox()
  if (!box) throw new Error("canvas not found")
  await page.mouse.click(box.x + 400, box.y + 400, { button: "right" })

  await expect(page.locator('[data-testid="context-menu-item-paste"]')).toBeVisible()
  await expect(page.locator('[data-testid="context-menu-item-select-all"]')).toBeVisible()
  // No content yet, so zoom-to-fit is hidden.
  await expect(page.locator('[data-testid="context-menu-item-zoom-to-fit"]')).toHaveCount(0)
})

test("right-click a locked element shows only Copy and Unlock; Unlock unlocks it", async ({
  page,
}) => {
  await drawRect(page)
  const canvas = page.locator("canvas").first()
  const box = await canvas.boundingBox()
  if (!box) throw new Error("canvas not found")

  // Select the rectangle, then lock it via the keyboard shortcut.
  await page.mouse.click(box.x + 200, box.y + 185)
  await page.keyboard.press("Control+Shift+l")

  await page.mouse.click(box.x + 200, box.y + 185, { button: "right" })
  await expect(page.locator('[data-testid="context-menu-item-copy"]')).toBeVisible()
  await expect(page.locator('[data-testid="context-menu-item-unlock"]')).toBeVisible()
  await expect(page.locator('[data-testid="context-menu-item-delete"]')).toHaveCount(0)

  await page.locator('[data-testid="context-menu-item-unlock"]').click()

  // Now unlocked: right-clicking it again shows the full unlocked menu.
  await page.mouse.click(box.x + 200, box.y + 185, { button: "right" })
  await expect(page.locator('[data-testid="context-menu-item-delete"]')).toBeVisible()
})

test("Escape and outside-click both close the menu without side effects", async ({ page }) => {
  await drawRect(page)
  const canvas = page.locator("canvas").first()
  const box = await canvas.boundingBox()
  if (!box) throw new Error("canvas not found")

  await page.mouse.click(box.x + 200, box.y + 185, { button: "right" })
  await expect(page.locator('[data-testid="context-menu"]')).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(page.locator('[data-testid="context-menu"]')).toHaveCount(0)

  await page.mouse.click(box.x + 200, box.y + 185, { button: "right" })
  await expect(page.locator('[data-testid="context-menu"]')).toBeVisible()
  await page.mouse.click(box.x + 50, box.y + 500)
  await expect(page.locator('[data-testid="context-menu"]')).toHaveCount(0)
})
```

- [ ] **Step 2: Run the new spec**

Run (from `apps/web`): `npm run e2e -- context-menu.spec.ts`
Expected: PASS, all 4 tests. If clipboard-permission prompts block Copy/Cut/Paste assertions under Playwright's default Chromium context, this spec deliberately avoids asserting on clipboard _content_ (only on menu visibility and Delete/Unlock, which don't touch the clipboard) — no special Playwright clipboard permission setup is needed for these 4 tests as written.

- [ ] **Step 3: Run the full gate**

Run (from repo root): `npm run typecheck && npm test && npm run format:check && npm run lint`
Run (from `apps/web`): `npm run e2e`
Expected: everything green.

- [ ] **Step 4: Commit**

```bash
git add apps/web/e2e/context-menu.spec.ts
git commit -m "web: e2e coverage for right-click context menu"
```
