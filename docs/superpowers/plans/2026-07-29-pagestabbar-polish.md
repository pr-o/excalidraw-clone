# PagesTabBar Polish: Thumbnails & Drag-to-Reorder — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the existing `PagesTabBar` (shipped `07d59e0`) a live-updating page thumbnail per tab and pointer-based drag-to-reorder, per the approved design spec `docs/superpowers/specs/2026-07-29-pagestabbar-polish-design.md`. These were the two items explicitly deferred as follow-ups when multi-page shipped.

**Architecture:** A new pure-rendering driver module, `apps/web/src/driver/pageThumbnails.ts`, offscreen-renders a page's `Scene` into a small letterboxed PNG data URL, reusing the `CanvasRenderer` pattern already established by `apps/web/src/driver/exportPNG.ts`. A new pure function `movePage` in `apps/web/src/driver/pages.ts` handles arbitrary-index reordering (the ◀/▶ buttons keep using the existing adjacent-swap `reorderPage`). `PagesTabBar` (`packages/ui/src/PagesTabBar.tsx`) grows a `thumbnails` prop (rendered as a small `<img>` or blank box per tab) and pointer-event-based drag tracking (`onPointerDown`/`onPointerMove`/`onPointerUp` — no native HTML5 drag-and-drop, consistent with this repo's existing pointer-event-only drag interactions), reporting the result via a new `onMove(id, toIndex)` prop. `App.tsx` owns a `thumbnails: Record<pageId, string | undefined>` cache: hydrated once for every page on mount, regenerated immediately (not debounced) on switch/add/duplicate, dropped on delete, and regenerated ~500ms after the active scene's last mutation via a dedicated `createAutoSaver`-style debounce instance kept separate from persistence's own autosave.

**Deviation note (read before Task 1):** The design spec's illustrative snippet for `renderPageThumbnail` shows a synchronous return type (`string | undefined`), but its own prose requires mirroring `exportToPNG`'s `renderer.start() → one requestAnimationFrame tick → renderer.stop()` sequence to let the offscreen canvas actually paint before reading it back — and `CanvasRenderer.start()` only ever schedules its first paint via `requestAnimationFrame` (verified by reading `packages/renderer/src/renderer.ts`), so there is no synchronous way to force that paint. This plan therefore implements `renderPageThumbnail` as `async`, returning `Promise<string | undefined>`, exactly like `exportToPNG` returns `Promise<Blob>`. Every call site below `await`s or `.then()`s it accordingly. This is a type-signature correction for buildability only — every behavioral decision in the design spec (empty-scene fast path, letterbox/contain fit, when thumbnails refresh, etc.) is implemented exactly as specified.

**Tech Stack:** TypeScript, React 18, Zustand, Vitest, Playwright, pnpm/turbo monorepo. No new dependencies.

## Global Constraints

- Full gate (`pnpm typecheck`, `pnpm test`, `pnpm --filter @excalidraw-clone/web exec playwright test`, `pnpm format:check`) must be green after every task's commit — each task lands the app in a fully working state. Tasks 1–3 below are individually scoped to a single package (`apps/web` or `packages/ui`) and have not yet been wired cross-package, so their own gates use the filtered/scoped subset of these same commands (matching this repo's own established convention — see the prior multi-page plan's Task 2, which scoped its gate to `@excalidraw-clone/ui` before that task's component was wired into `App.tsx` in a later task). Tasks 4 and 5 run the full repo-wide gate, since by then everything is wired together.
- Match existing code style exactly: no semicolons, double quotes, 2-space indent, trailing commas everywhere multiline, `arrowParens: always` (Prettier-enforced per `.prettierrc.json` — run `pnpm format` if in doubt, then `pnpm format:check` to confirm).
- Follow TDD: write the failing test first, confirm it fails for the expected reason, then implement.
- No new runtime dependencies.
- `apps/web`'s Vitest environment is `jsdom` with no `setupFiles` (see `apps/web/vitest.config.ts`) and no `canvas` npm package installed, so `HTMLCanvasElement.prototype.getContext("2d")` returns `null` by default (jsdom logs "Not implemented" and does not throw) and `HTMLCanvasElement.prototype.toDataURL()` returns a non-string placeholder rather than a real data URL. Task 1's unit test therefore mocks both directly on the prototype via `vi.spyOn` with an inline stub 2D context (a `Proxy` that no-ops any method call and stores/returns any property assignment) — this has been empirically verified against the real `CanvasRenderer` + `roughjs` rendering pipeline while writing this plan and does not throw.
- `fireEvent.pointerDown/pointerMove/pointerUp(el, { clientX })` from `@testing-library/react` does **not** reliably propagate `clientX` through to React's synthetic event in this repo's installed versions (`@testing-library/react@^16.1.0`, verified empirically while writing this plan). Task 3's drag tests instead dispatch a real `MouseEvent` with the desired `type`/`clientX`/`bubbles: true` via the plain `fireEvent(el, new MouseEvent(...))` form, which was verified to both bubble correctly and carry `clientX` through.

---

## Task 1: Page-thumbnail renderer (`apps/web/src/driver/pageThumbnails.ts`)

**Files:**

- Create: `apps/web/src/driver/pageThumbnails.ts`
- Test: `apps/web/test/pageThumbnails.test.ts` (new)

**Interfaces:**

- Consumes: `Scene` (from `@excalidraw-clone/scene`, already used throughout `apps/web`), `CanvasRenderer` (from `@excalidraw-clone/renderer`, same constructor shape already used by `apps/web/src/driver/exportPNG.ts`).
- Produces (used by Task 4): `THUMBNAIL_WIDTH = 46`, `THUMBNAIL_HEIGHT = 33`, `THUMBNAIL_CAPTURE_SCALE = 2` (all `apps/web/src/driver/pageThumbnails.ts`), `renderPageThumbnail(scene: Scene, canvasBg: string, theme: "light" | "dark"): Promise<string | undefined>` (`apps/web/src/driver/pageThumbnails.ts`).

### Step 1: Write the failing test

Create `apps/web/test/pageThumbnails.test.ts`:

```ts
import { newRectangle, Scene } from "@excalidraw-clone/scene"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  renderPageThumbnail,
  THUMBNAIL_CAPTURE_SCALE,
  THUMBNAIL_HEIGHT,
  THUMBNAIL_WIDTH,
} from "../src/driver/pageThumbnails"

function createStubContext(): CanvasRenderingContext2D {
  const store: Record<string, unknown> = {}
  return new Proxy(store, {
    get(target, prop) {
      if (prop in target) return target[prop as string]
      if (prop === "measureText") return (text: string) => ({ width: String(text).length * 6 })
      if (
        prop === "createLinearGradient" ||
        prop === "createRadialGradient" ||
        prop === "createPattern"
      ) {
        return () => ({ addColorStop: () => undefined })
      }
      return () => undefined
    },
    set(target, prop, value) {
      target[prop as string] = value
      return true
    },
  }) as unknown as CanvasRenderingContext2D
}

describe("renderPageThumbnail", () => {
  let capturedCanvases: HTMLCanvasElement[]
  let getContextSpy: ReturnType<typeof vi.spyOn>
  let toDataURLSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    capturedCanvases = []
    getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockImplementation(function (this: HTMLCanvasElement) {
        capturedCanvases.push(this)
        return createStubContext()
      } as unknown as typeof HTMLCanvasElement.prototype.getContext)
    toDataURLSpy = vi
      .spyOn(HTMLCanvasElement.prototype, "toDataURL")
      .mockReturnValue("data:image/png;base64,MOCKED")
  })

  afterEach(() => {
    getContextSpy.mockRestore()
    toDataURLSpy.mockRestore()
  })

  it("returns undefined for an empty scene without invoking the renderer", async () => {
    const scene = new Scene()
    const result = await renderPageThumbnail(scene, "#ffffff", "light")
    expect(result).toBeUndefined()
    expect(getContextSpy).not.toHaveBeenCalled()
  })

  it("returns a PNG data URL for a non-empty scene", async () => {
    const scene = new Scene([newRectangle({ x: 0, y: 0, width: 40, height: 40 })])
    const result = await renderPageThumbnail(scene, "#ffffff", "light")
    expect(result).toBe("data:image/png;base64,MOCKED")
    expect(getContextSpy).toHaveBeenCalled()
    expect(toDataURLSpy).toHaveBeenCalledWith("image/png")
  })

  it("fits the canvas to the fixed thumbnail size regardless of element aspect ratio (letterboxed)", async () => {
    const scene = new Scene([newRectangle({ x: 0, y: 0, width: 2000, height: 20 })])
    await renderPageThumbnail(scene, "#ffffff", "light")
    expect(capturedCanvases.length).toBeGreaterThan(0)
    for (const canvas of capturedCanvases) {
      expect(canvas.width).toBe(THUMBNAIL_WIDTH * THUMBNAIL_CAPTURE_SCALE)
      expect(canvas.height).toBe(THUMBNAIL_HEIGHT * THUMBNAIL_CAPTURE_SCALE)
    }
  })
})
```

- [ ] Create this file exactly as above.

### Step 2: Run the test to confirm it fails

Run: `pnpm --filter @excalidraw-clone/web test -- pageThumbnails`
Expected: FAIL — `../src/driver/pageThumbnails` does not exist yet.

- [ ] Run and confirm.

### Step 3: Create `apps/web/src/driver/pageThumbnails.ts`

```ts
"use client"
import { CanvasRenderer } from "@excalidraw-clone/renderer"
import type { ExcalidrawElement, Scene } from "@excalidraw-clone/scene"

export const THUMBNAIL_WIDTH = 46
export const THUMBNAIL_HEIGHT = 33
export const THUMBNAIL_CAPTURE_SCALE = 2

const PADDING = 4

export async function renderPageThumbnail(
  scene: Scene,
  canvasBg: string,
  theme: "light" | "dark",
): Promise<string | undefined> {
  const elements = scene.getElements()
  if (elements.length === 0) return undefined

  const bbox = computeBBox(elements)
  const canvas = document.createElement("canvas")
  canvas.width = THUMBNAIL_WIDTH * THUMBNAIL_CAPTURE_SCALE
  canvas.height = THUMBNAIL_HEIGHT * THUMBNAIL_CAPTURE_SCALE

  const availW = canvas.width - PADDING * 2
  const availH = canvas.height - PADDING * 2
  const bboxW = Math.max(bbox.width, 1)
  const bboxH = Math.max(bbox.height, 1)
  const scale = Math.min(availW / bboxW, availH / bboxH, 1)
  const contentW = bboxW * scale
  const contentH = bboxH * scale
  const offsetX = PADDING + (availW - contentW) / 2
  const offsetY = PADDING + (availH - contentH) / 2
  const scrollX = offsetX / scale - bbox.x
  const scrollY = offsetY / scale - bbox.y

  const renderer = new CanvasRenderer(canvas, scene, {
    theme,
    canvasBg,
    viewTransform: { scrollX, scrollY, zoom: scale },
  })

  renderer.start()
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  renderer.stop()

  return canvas.toDataURL("image/png")
}

function computeBBox(elements: readonly ExcalidrawElement[]): {
  x: number
  y: number
  width: number
  height: number
} {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const el of elements) {
    minX = Math.min(minX, el.x)
    minY = Math.min(minY, el.y)
    maxX = Math.max(maxX, el.x + el.width)
    maxY = Math.max(maxY, el.y + el.height)
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}
```

- [ ] Create this file exactly as above.

### Step 4: Run the test to confirm it passes

Run: `pnpm --filter @excalidraw-clone/web test -- pageThumbnails`
Expected: PASS (3 tests).

- [ ] Run and confirm.

### Step 5: Run the scoped gate

Run: `pnpm --filter @excalidraw-clone/web typecheck`
Expected: PASS.

Run: `pnpm --filter @excalidraw-clone/web test`
Expected: PASS (all `apps/web` unit tests, not just the new file).

Run: `pnpm format`
Expected: exits 0 (auto-fixes any formatting drift).

Run: `pnpm format:check`
Expected: PASS.

- [ ] Run all four and confirm green. Fix any fallout before proceeding.

### Step 6: Commit

```bash
git add apps/web/src/driver/pageThumbnails.ts apps/web/test/pageThumbnails.test.ts
git commit -m "web: add renderPageThumbnail offscreen-canvas thumbnail renderer"
```

- [ ] Commit.

---

## Task 2: `movePage` arbitrary-index reorder

**Files:**

- Modify: `apps/web/src/driver/pages.ts`
- Test: `apps/web/test/pages-driver.test.ts` (extend)

**Interfaces:**

- Consumes: `PageRecord`, `createPageRecord` (already in `apps/web/src/driver/pages.ts`).
- Produces (used by Task 4): `movePage(pages: readonly PageRecord[], id: string, toIndex: number): PageRecord[]` (`apps/web/src/driver/pages.ts`).

### Step 1: Write the failing tests

In `apps/web/test/pages-driver.test.ts`, change the import from `../src/driver/pages` at the top of the file from:

```ts
import {
  addPage,
  createPageRecord,
  cyclePageId,
  DEFAULT_VIEWPORT,
  deletePage,
  duplicatePage,
  pagesFromDocument,
  renamePage,
  reorderPage,
  withViewport,
} from "../src/driver/pages"
```

to:

```ts
import {
  addPage,
  createPageRecord,
  cyclePageId,
  DEFAULT_VIEWPORT,
  deletePage,
  duplicatePage,
  movePage,
  pagesFromDocument,
  renamePage,
  reorderPage,
  withViewport,
} from "../src/driver/pages"
```

Then append this new `describe` block at the end of the file (after the existing `describe("cyclePageId", ...)` block):

```ts
describe("movePage", () => {
  it("moves a page from its current index to an arbitrary target index", () => {
    const a = createPageRecord("Page 1")
    const b = createPageRecord("Page 2")
    const c = createPageRecord("Page 3")
    const result = movePage([a, b, c], c.id, 0)
    expect(result.map((p) => p.id)).toEqual([c.id, a.id, b.id])
  })

  it("clamps a too-large target index to the last position", () => {
    const a = createPageRecord("Page 1")
    const b = createPageRecord("Page 2")
    const result = movePage([a, b], a.id, 99)
    expect(result.map((p) => p.id)).toEqual([b.id, a.id])
  })

  it("clamps a negative target index to the first position", () => {
    const a = createPageRecord("Page 1")
    const b = createPageRecord("Page 2")
    const result = movePage([a, b], b.id, -5)
    expect(result.map((p) => p.id)).toEqual([b.id, a.id])
  })

  it("is a no-op when the id is not found", () => {
    const a = createPageRecord("Page 1")
    const b = createPageRecord("Page 2")
    const result = movePage([a, b], "missing", 0)
    expect(result).toEqual([a, b])
  })

  it("is effectively a no-op when toIndex equals the current index", () => {
    const a = createPageRecord("Page 1")
    const b = createPageRecord("Page 2")
    const result = movePage([a, b], a.id, 0)
    expect(result.map((p) => p.id)).toEqual([a.id, b.id])
  })
})
```

- [ ] Make both edits.

### Step 2: Run to confirm failure

Run: `pnpm --filter @excalidraw-clone/web test -- pages-driver`
Expected: FAIL — `movePage` is not exported from `../src/driver/pages` yet.

- [ ] Run and confirm.

### Step 3: Implement `movePage` in `apps/web/src/driver/pages.ts`

Append this function to the end of the file (after `cyclePageId`):

```ts
export function movePage(pages: readonly PageRecord[], id: string, toIndex: number): PageRecord[] {
  const fromIndex = pages.findIndex((p) => p.id === id)
  if (fromIndex === -1) return [...pages]
  const clamped = Math.max(0, Math.min(toIndex, pages.length - 1))
  const next = [...pages]
  const [moved] = next.splice(fromIndex, 1)
  next.splice(clamped, 0, moved!)
  return next
}
```

- [ ] Make this edit.

### Step 4: Run to confirm green

Run: `pnpm --filter @excalidraw-clone/web test -- pages-driver`
Expected: PASS (all cases, including the pre-existing ones).

- [ ] Run and confirm.

### Step 5: Run the scoped gate

Run: `pnpm --filter @excalidraw-clone/web typecheck`
Expected: PASS.

Run: `pnpm --filter @excalidraw-clone/web test`
Expected: PASS.

Run: `pnpm format`
Expected: exits 0.

Run: `pnpm format:check`
Expected: PASS.

- [ ] Run all four and confirm green.

### Step 6: Commit

```bash
git add apps/web/src/driver/pages.ts apps/web/test/pages-driver.test.ts
git commit -m "web: add movePage for arbitrary-index page reordering"
```

- [ ] Commit.

---

## Task 3: `PagesTabBar` thumbnails + pointer-drag reordering

**Files:**

- Modify: `packages/ui/src/PagesTabBar.tsx`
- Test: `packages/ui/test/PagesTabBar.test.tsx` (extend)

**Interfaces:**

- Consumes: nothing beyond plain data, same as before (`{ id: string; name: string }[]`) — the component stays decoupled from `PageRecord`/`Scene`.
- Produces (used by Task 4): `PagesTabBarProps` grows two members: `thumbnails?: Readonly<Record<string, string | undefined>>` and `onMove: (id: string, toIndex: number) => void`. New `data-testid`s: `page-thumb-{id}` (an `<img>` when a thumbnail exists, a blank bordered `<div>` otherwise) and `page-drop-line` (rendered only while a drag with a resolved target position is in progress).

### Step 1: Write the failing tests

Replace the entire contents of `packages/ui/test/PagesTabBar.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { PagesTabBar } from "../src/PagesTabBar"

const t = (key: string): string => key

const pages = [
  { id: "p1", name: "Page 1" },
  { id: "p2", name: "Page 2" },
]

const handlers = {
  onSwitch: vi.fn(),
  onAdd: vi.fn(),
  onDelete: vi.fn(),
  onRename: vi.fn(),
  onDuplicate: vi.fn(),
  onReorder: vi.fn(),
  onMove: vi.fn(),
}

const firePointer = (
  el: Element,
  type: "pointerdown" | "pointermove" | "pointerup",
  clientX = 0,
): boolean => fireEvent(el, new MouseEvent(type, { clientX, bubbles: true }))

const stubRect = (el: HTMLElement, rect: { left: number; width: number }): void => {
  el.getBoundingClientRect = () =>
    ({
      left: rect.left,
      right: rect.left + rect.width,
      width: rect.width,
      top: 0,
      bottom: 33,
      height: 33,
      x: rect.left,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect
}

describe("PagesTabBar", () => {
  it("renders one tab per page", () => {
    render(<PagesTabBar t={t} pages={pages} activePageId="p1" {...handlers} />)
    expect(screen.getByTestId("page-tab-p1")).toBeInTheDocument()
    expect(screen.getByTestId("page-tab-p2")).toBeInTheDocument()
  })

  it("clicking a tab calls onSwitch with its id", async () => {
    const onSwitch = vi.fn()
    render(<PagesTabBar t={t} pages={pages} activePageId="p1" {...handlers} onSwitch={onSwitch} />)
    await userEvent.click(screen.getByTestId("page-switch-p2"))
    expect(onSwitch).toHaveBeenCalledWith("p2")
  })

  it("clicking + calls onAdd", async () => {
    const onAdd = vi.fn()
    render(<PagesTabBar t={t} pages={pages} activePageId="p1" {...handlers} onAdd={onAdd} />)
    await userEvent.click(screen.getByTestId("page-add"))
    expect(onAdd).toHaveBeenCalled()
  })

  it("delete is disabled when only one page remains", () => {
    render(<PagesTabBar t={t} pages={[pages[0]!]} activePageId="p1" {...handlers} />)
    expect(screen.getByTestId("page-delete-p1")).toBeDisabled()
  })

  it("delete is enabled with multiple pages and calls onDelete with the id", async () => {
    const onDelete = vi.fn()
    render(<PagesTabBar t={t} pages={pages} activePageId="p1" {...handlers} onDelete={onDelete} />)
    await userEvent.click(screen.getByTestId("page-delete-p2"))
    expect(onDelete).toHaveBeenCalledWith("p2")
  })

  it("clicking duplicate calls onDuplicate with the id", async () => {
    const onDuplicate = vi.fn()
    render(
      <PagesTabBar t={t} pages={pages} activePageId="p1" {...handlers} onDuplicate={onDuplicate} />,
    )
    await userEvent.click(screen.getByTestId("page-duplicate-p1"))
    expect(onDuplicate).toHaveBeenCalledWith("p1")
  })

  it("reorder-left is disabled for the first tab, reorder-right disabled for the last", () => {
    render(<PagesTabBar t={t} pages={pages} activePageId="p1" {...handlers} />)
    expect(screen.getByTestId("page-reorder-left-p1")).toBeDisabled()
    expect(screen.getByTestId("page-reorder-right-p2")).toBeDisabled()
    expect(screen.getByTestId("page-reorder-right-p1")).not.toBeDisabled()
  })

  it("clicking reorder-right calls onReorder with the id and direction", async () => {
    const onReorder = vi.fn()
    render(
      <PagesTabBar t={t} pages={pages} activePageId="p1" {...handlers} onReorder={onReorder} />,
    )
    await userEvent.click(screen.getByTestId("page-reorder-right-p1"))
    expect(onReorder).toHaveBeenCalledWith("p1", "right")
  })

  it("double-clicking a tab name enters rename mode, Enter commits via onRename", async () => {
    const onRename = vi.fn()
    render(<PagesTabBar t={t} pages={pages} activePageId="p1" {...handlers} onRename={onRename} />)
    await userEvent.dblClick(screen.getByTestId("page-switch-p1"))
    const input = screen.getByTestId("page-rename-input-p1")
    await userEvent.clear(input)
    await userEvent.type(input, "Renamed{Enter}")
    expect(onRename).toHaveBeenCalledWith("p1", "Renamed")
  })

  it("renders a thumbnail image when a thumbnail entry exists for a page", () => {
    render(
      <PagesTabBar
        t={t}
        pages={pages}
        activePageId="p1"
        thumbnails={{ p1: "data:image/png;base64,AAAA" }}
        {...handlers}
      />,
    )
    const thumb = screen.getByTestId("page-thumb-p1")
    expect(thumb.tagName).toBe("IMG")
    expect(thumb).toHaveAttribute("src", "data:image/png;base64,AAAA")
  })

  it("renders a blank box when no thumbnail entry exists for a page", () => {
    render(<PagesTabBar t={t} pages={pages} activePageId="p1" {...handlers} />)
    const thumb = screen.getByTestId("page-thumb-p1")
    expect(thumb.tagName).toBe("DIV")
  })

  it("dragging a tab past a sibling's midpoint calls onMove with the resulting target index", () => {
    const onMove = vi.fn()
    render(<PagesTabBar t={t} pages={pages} activePageId="p1" {...handlers} onMove={onMove} />)
    const tab1 = screen.getByTestId("page-tab-p1")
    const tab2 = screen.getByTestId("page-tab-p2")
    stubRect(tab1, { left: 0, width: 100 })
    stubRect(tab2, { left: 100, width: 100 })
    const bar = screen.getByTestId("pages-tab-bar")

    firePointer(tab1, "pointerdown")
    firePointer(bar, "pointermove", 160)
    firePointer(bar, "pointerup")

    expect(onMove).toHaveBeenCalledWith("p1", 1)
  })

  it("dragging a tab left past a sibling's midpoint calls onMove with the resulting target index", () => {
    const onMove = vi.fn()
    render(<PagesTabBar t={t} pages={pages} activePageId="p1" {...handlers} onMove={onMove} />)
    const tab1 = screen.getByTestId("page-tab-p1")
    const tab2 = screen.getByTestId("page-tab-p2")
    stubRect(tab1, { left: 0, width: 100 })
    stubRect(tab2, { left: 100, width: 100 })
    const bar = screen.getByTestId("pages-tab-bar")

    firePointer(tab2, "pointerdown")
    firePointer(bar, "pointermove", 20)
    firePointer(bar, "pointerup")

    expect(onMove).toHaveBeenCalledWith("p2", 0)
  })

  it("a drag that never crosses a sibling midpoint is a no-op", () => {
    const onMove = vi.fn()
    render(<PagesTabBar t={t} pages={pages} activePageId="p1" {...handlers} onMove={onMove} />)
    const tab1 = screen.getByTestId("page-tab-p1")
    const bar = screen.getByTestId("pages-tab-bar")

    firePointer(tab1, "pointerdown")
    firePointer(bar, "pointerup")

    expect(onMove).not.toHaveBeenCalled()
  })

  it("renders the drop-line indicator only while a drag with a computed target is in progress", () => {
    render(<PagesTabBar t={t} pages={pages} activePageId="p1" {...handlers} />)
    expect(screen.queryByTestId("page-drop-line")).not.toBeInTheDocument()

    const tab1 = screen.getByTestId("page-tab-p1")
    const tab2 = screen.getByTestId("page-tab-p2")
    stubRect(tab1, { left: 0, width: 100 })
    stubRect(tab2, { left: 100, width: 100 })
    const bar = screen.getByTestId("pages-tab-bar")

    firePointer(tab1, "pointerdown")
    firePointer(bar, "pointermove", 160)
    expect(screen.getByTestId("page-drop-line")).toBeInTheDocument()

    firePointer(bar, "pointerup")
    expect(screen.queryByTestId("page-drop-line")).not.toBeInTheDocument()
  })

  it("pointerdown on a reorder/duplicate/delete button does not start a drag", () => {
    const onMove = vi.fn()
    render(<PagesTabBar t={t} pages={pages} activePageId="p1" {...handlers} onMove={onMove} />)
    const bar = screen.getByTestId("pages-tab-bar")

    firePointer(screen.getByTestId("page-reorder-right-p1"), "pointerdown")
    firePointer(bar, "pointermove", 160)
    firePointer(bar, "pointerup")

    expect(onMove).not.toHaveBeenCalled()
    expect(screen.queryByTestId("page-drop-line")).not.toBeInTheDocument()
  })
})
```

- [ ] Replace the file exactly as above.

### Step 2: Run to confirm failure

Run: `pnpm --filter @excalidraw-clone/ui test -- PagesTabBar`
Expected: FAIL — TS errors (`thumbnails`/`onMove` not in `PagesTabBarProps`) and/or missing `page-thumb-p1`/`page-drop-line` test ids.

- [ ] Run and confirm.

### Step 3: Replace `packages/ui/src/PagesTabBar.tsx`

```tsx
import { useRef, useState } from "react"

export interface PagesTabBarProps {
  t: (key: string) => string
  pages: readonly { id: string; name: string }[]
  activePageId: string
  thumbnails?: Readonly<Record<string, string | undefined>>
  onSwitch: (id: string) => void
  onAdd: () => void
  onDelete: (id: string) => void
  onRename: (id: string, name: string) => void
  onDuplicate: (id: string) => void
  onReorder: (id: string, direction: "left" | "right") => void
  onMove: (id: string, toIndex: number) => void
  className?: string
}

interface DragState {
  draggedId: string
  overIndex: number | null
  dropLineLeft: number
}

export function PagesTabBar({
  t,
  pages,
  activePageId,
  thumbnails,
  onSwitch,
  onAdd,
  onDelete,
  onRename,
  onDuplicate,
  onReorder,
  onMove,
  className,
}: PagesTabBarProps): React.ReactElement {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState("")
  const [drag, setDrag] = useState<DragState | null>(null)
  const barRef = useRef<HTMLElement>(null)

  const startRename = (id: string, currentName: string): void => {
    setEditingId(id)
    setDraftName(currentName)
  }

  const commitRename = (id: string): void => {
    if (draftName.trim().length > 0) onRename(id, draftName.trim())
    setEditingId(null)
  }

  const handleTabPointerDown =
    (id: string) =>
    (e: React.PointerEvent<HTMLDivElement>): void => {
      const target = e.target as HTMLElement
      if (target.closest("button, input")) return
      setDrag({ draggedId: id, overIndex: null, dropLineLeft: 0 })
    }

  const handleBarPointerMove = (e: React.PointerEvent<HTMLElement>): void => {
    if (!drag) return
    const bar = barRef.current
    if (!bar) return
    const tabEls = Array.from(bar.querySelectorAll<HTMLElement>("[data-page-tab-index]"))
    if (tabEls.length === 0) return
    let boundary = pages.length
    let dropLineLeft = tabEls[tabEls.length - 1]!.getBoundingClientRect().right
    for (const el of tabEls) {
      const rect = el.getBoundingClientRect()
      const mid = rect.left + rect.width / 2
      if (e.clientX < mid) {
        boundary = Number(el.dataset.pageTabIndex)
        dropLineLeft = rect.left
        break
      }
    }
    setDrag({ ...drag, overIndex: boundary, dropLineLeft })
  }

  const handleBarPointerUp = (): void => {
    if (!drag) return
    const { draggedId, overIndex } = drag
    if (overIndex !== null) {
      const fromIndex = pages.findIndex((p) => p.id === draggedId)
      const target = overIndex > fromIndex ? overIndex - 1 : overIndex
      if (fromIndex !== -1 && target !== fromIndex) onMove(draggedId, target)
    }
    setDrag(null)
  }

  return (
    <nav
      ref={barRef}
      aria-label={t("pages.title")}
      data-testid="pages-tab-bar"
      onPointerMove={handleBarPointerMove}
      onPointerUp={handleBarPointerUp}
      className={`fixed bottom-0 left-0 right-0 z-30 flex items-center gap-1 overflow-x-auto bg-white px-2 py-1 shadow-lg ${className ?? ""}`}
    >
      {drag && drag.overIndex !== null && (
        <div
          data-testid="page-drop-line"
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 top-0 z-10 w-0.5 bg-violet-500"
          style={{ left: drag.dropLineLeft }}
        />
      )}

      {pages.map((page, index) => {
        const active = page.id === activePageId
        const editing = editingId === page.id
        const thumb = thumbnails?.[page.id]
        return (
          <div
            key={page.id}
            data-testid={`page-tab-${page.id}`}
            data-page-tab-index={index}
            onPointerDown={handleTabPointerDown(page.id)}
            className={`flex shrink-0 items-center gap-1 rounded px-2 py-1 text-xs ${
              active ? "bg-violet-100" : "hover:bg-gray-50"
            }`}
          >
            <button
              type="button"
              data-testid={`page-reorder-left-${page.id}`}
              aria-label={t("pages.moveLeft")}
              disabled={index === 0}
              onClick={() => onReorder(page.id, "left")}
              className="rounded px-0.5 disabled:opacity-30"
            >
              ◀
            </button>

            {thumb ? (
              <img
                src={thumb}
                alt=""
                data-testid={`page-thumb-${page.id}`}
                className="h-[33px] w-[46px] shrink-0 rounded-sm border border-gray-200 object-contain"
              />
            ) : (
              <div
                data-testid={`page-thumb-${page.id}`}
                aria-hidden="true"
                className="h-[33px] w-[46px] shrink-0 rounded-sm border border-gray-200 bg-gray-50"
              />
            )}

            {editing ? (
              <input
                autoFocus
                data-testid={`page-rename-input-${page.id}`}
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onBlur={() => commitRename(page.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename(page.id)
                  if (e.key === "Escape") setEditingId(null)
                }}
                className="w-24 rounded border border-gray-300 px-1"
              />
            ) : (
              <button
                type="button"
                data-testid={`page-switch-${page.id}`}
                onClick={() => onSwitch(page.id)}
                onDoubleClick={() => startRename(page.id, page.name)}
                className="max-w-[8rem] truncate"
              >
                {page.name}
              </button>
            )}

            <button
              type="button"
              data-testid={`page-reorder-right-${page.id}`}
              aria-label={t("pages.moveRight")}
              disabled={index === pages.length - 1}
              onClick={() => onReorder(page.id, "right")}
              className="rounded px-0.5 disabled:opacity-30"
            >
              ▶
            </button>

            <button
              type="button"
              data-testid={`page-duplicate-${page.id}`}
              aria-label={t("pages.duplicate")}
              title={t("pages.duplicate")}
              onClick={() => onDuplicate(page.id)}
              className="rounded px-0.5 hover:bg-gray-100"
            >
              ⧉
            </button>

            <button
              type="button"
              data-testid={`page-delete-${page.id}`}
              aria-label={t("pages.delete")}
              title={t("pages.delete")}
              disabled={pages.length === 1}
              onClick={() => onDelete(page.id)}
              className="rounded px-0.5 hover:bg-gray-100 disabled:opacity-30"
            >
              ✕
            </button>
          </div>
        )
      })}

      <button
        type="button"
        data-testid="page-add"
        aria-label={t("pages.add")}
        title={t("pages.add")}
        onClick={onAdd}
        className="shrink-0 rounded px-2 py-1 text-xs hover:bg-gray-100"
      >
        +
      </button>
    </nav>
  )
}
```

- [ ] Replace the file exactly as above.

### Step 4: Run to confirm green

Run: `pnpm --filter @excalidraw-clone/ui test -- PagesTabBar`
Expected: PASS (17 tests: 9 pre-existing + 8 new).

- [ ] Run and confirm.

### Step 5: Run the scoped gate

Run: `pnpm --filter @excalidraw-clone/ui typecheck`
Expected: PASS.

Run: `pnpm --filter @excalidraw-clone/ui test`
Expected: PASS.

Run: `pnpm format`
Expected: exits 0.

Run: `pnpm format:check`
Expected: PASS.

- [ ] Run all four and confirm green.

Note: do **not** run a repo-wide `pnpm typecheck` at this point — `apps/web/src/components/App.tsx` does not yet pass the new required `onMove` prop to `<PagesTabBar>` (that wiring is Task 4), so a repo-wide typecheck would fail until Task 4 lands. This mirrors how the prior multi-page plan's Task 2 (adding `PagesTabBar` itself) also scoped its gate to `@excalidraw-clone/ui` only, ahead of its `App.tsx` wiring task.

### Step 6: Commit

```bash
git add packages/ui/src/PagesTabBar.tsx packages/ui/test/PagesTabBar.test.tsx
git commit -m "ui: PagesTabBar thumbnails + pointer-based drag-to-reorder"
```

- [ ] Commit.

---

## Task 4: Wire thumbnails + `onMove` into `App.tsx`

**Files:**

- Modify: `apps/web/src/components/App.tsx`

**Interfaces:**

- Consumes: `renderPageThumbnail` (Task 1), `movePage` (Task 2), `PagesTabBar`'s `thumbnails`/`onMove` props (Task 3), `createAutoSaver` (already exported from `@excalidraw-clone/persistence`, used the same way by `apps/web/src/driver/autoSave.ts`), `useAppStore`'s `canvasBg: string` and `resolvedTheme: "light" | "dark"` fields (already defined in `apps/web/src/store/slices/theme.ts` and read elsewhere in this codebase).
- Produces (used by Task 5): the app now renders live thumbnails in `PagesTabBar` and supports pointer-drag reordering end-to-end.

### Step 1: Add `createAutoSaver` to the persistence import

In `apps/web/src/components/App.tsx`, change:

```ts
import {
  deleteLibraryItem,
  download,
  exportLibraryFile,
  getAllLibraryItems,
  getFile,
  importLibraryFile,
  putLibraryItem,
  renameLibraryItem,
} from "@excalidraw-clone/persistence"
```

to:

```ts
import {
  createAutoSaver,
  deleteLibraryItem,
  download,
  exportLibraryFile,
  getAllLibraryItems,
  getFile,
  importLibraryFile,
  putLibraryItem,
  renameLibraryItem,
} from "@excalidraw-clone/persistence"
```

- [ ] Make this edit.

### Step 2: Add `movePage` and `renderPageThumbnail` imports

Change:

```ts
import { startAutoSave } from "../driver/autoSave"
import { hydratePages, hydrateUI } from "../driver/hydration"
import { pickAndUploadImage } from "../driver/imageUpload"
import {
  addPage,
  cyclePageId,
  deletePage,
  DEFAULT_VIEWPORT,
  duplicatePage,
  pagesFromDocument,
  renamePage,
  reorderPage,
  withViewport,
  type PageRecord,
} from "../driver/pages"
import { useSceneRevision } from "../hooks/useSceneRevision"
import { openExcalidrawFromPicker } from "../driver/openFile"
import { patchScene } from "../driver/patchScene"
import { saveAsExcalidraw } from "../driver/saveFile"
```

to:

```ts
import { startAutoSave } from "../driver/autoSave"
import { hydratePages, hydrateUI } from "../driver/hydration"
import { pickAndUploadImage } from "../driver/imageUpload"
import {
  addPage,
  cyclePageId,
  deletePage,
  DEFAULT_VIEWPORT,
  duplicatePage,
  movePage,
  pagesFromDocument,
  renamePage,
  reorderPage,
  withViewport,
  type PageRecord,
} from "../driver/pages"
import { renderPageThumbnail } from "../driver/pageThumbnails"
import { useSceneRevision } from "../hooks/useSceneRevision"
import { openExcalidrawFromPicker } from "../driver/openFile"
import { patchScene } from "../driver/patchScene"
import { saveAsExcalidraw } from "../driver/saveFile"
```

- [ ] Make this edit.

### Step 3: Add `thumbnails` state, `canvasBg`/`resolvedTheme` reads, immediate regen in `switchToPage`, and the two new effects

Change:

```ts
function Inner(): React.ReactElement {
  const { t, i18n } = useTranslation()
  const initialDoc = useMemo(() => hydratePages(), [])
  const [pages, setPages] = useState<PageRecord[]>(initialDoc.pages)
  const [activePageId, setActivePageId] = useState<string>(initialDoc.activePageId)
  const scene = useMemo(
    () => pages.find((p) => p.id === activePageId)!.scene,
    [pages, activePageId],
  )
  const switchToPage = useCallback(
    (targetId: string): void => {
      if (targetId === activePageId) return
      const s = useAppStore.getState()
      setPages(
        withViewport(pages, activePageId, { scrollX: s.scrollX, scrollY: s.scrollY, zoom: s.zoom }),
      )
      const target = pages.find((p) => p.id === targetId)
      s.setView(target?.viewport ?? DEFAULT_VIEWPORT)
      setActivePageId(targetId)
      s.setSelection([])
    },
    [activePageId, pages],
  )
  useEffect(() => {
    hydrateUI()
  }, [])
  useEffect(() => {
    return startAutoSave(pages, activePageId)
  }, [pages, activePageId])
  useEffect(() => {
    return attachShortcuts({
      scene,
      onNextPage: () => switchToPage(cyclePageId(pages, activePageId, "next")),
      onPrevPage: () => switchToPage(cyclePageId(pages, activePageId, "prev")),
    })
  }, [scene, pages, activePageId, switchToPage])
  useEffect(() => {
    return attachClipboard({ scene })
  }, [scene])
```

to:

```ts
function Inner(): React.ReactElement {
  const { t, i18n } = useTranslation()
  const initialDoc = useMemo(() => hydratePages(), [])
  const [pages, setPages] = useState<PageRecord[]>(initialDoc.pages)
  const [activePageId, setActivePageId] = useState<string>(initialDoc.activePageId)
  const [thumbnails, setThumbnails] = useState<Record<string, string | undefined>>({})
  const scene = useMemo(
    () => pages.find((p) => p.id === activePageId)!.scene,
    [pages, activePageId],
  )
  const canvasBg = useAppStore((s) => s.canvasBg)
  const resolvedTheme = useAppStore((s) => s.resolvedTheme)
  const switchToPage = useCallback(
    (targetId: string): void => {
      if (targetId === activePageId) return
      const s = useAppStore.getState()
      setPages(
        withViewport(pages, activePageId, { scrollX: s.scrollX, scrollY: s.scrollY, zoom: s.zoom }),
      )
      const target = pages.find((p) => p.id === targetId)
      s.setView(target?.viewport ?? DEFAULT_VIEWPORT)
      setActivePageId(targetId)
      s.setSelection([])
      if (target) {
        void renderPageThumbnail(target.scene, canvasBg, resolvedTheme).then((thumb) => {
          setThumbnails((prev) => ({ ...prev, [targetId]: thumb }))
        })
      }
    },
    [activePageId, pages, canvasBg, resolvedTheme],
  )
  useEffect(() => {
    hydrateUI()
  }, [])
  useEffect(() => {
    return startAutoSave(pages, activePageId)
  }, [pages, activePageId])
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const entries = await Promise.all(
        initialDoc.pages.map(
          async (p) => [p.id, await renderPageThumbnail(p.scene, canvasBg, resolvedTheme)] as const,
        ),
      )
      if (cancelled) return
      setThumbnails((prev) => ({ ...prev, ...Object.fromEntries(entries) }))
    })()
    return () => {
      cancelled = true
    }
  }, [initialDoc, canvasBg, resolvedTheme])
  useEffect(() => {
    const saver = createAutoSaver({
      delayMs: 500,
      flush: () => {
        void renderPageThumbnail(scene, canvasBg, resolvedTheme).then((thumb) => {
          setThumbnails((prev) => ({ ...prev, [activePageId]: thumb }))
        })
      },
    })
    const unsub = scene.subscribe(() => saver.schedule())
    return () => {
      unsub()
      saver.dispose()
    }
  }, [scene, activePageId, canvasBg, resolvedTheme])
  useEffect(() => {
    return attachShortcuts({
      scene,
      onNextPage: () => switchToPage(cyclePageId(pages, activePageId, "next")),
      onPrevPage: () => switchToPage(cyclePageId(pages, activePageId, "prev")),
    })
  }, [scene, pages, activePageId, switchToPage])
  useEffect(() => {
    return attachClipboard({ scene })
  }, [scene])
```

- [ ] Make this edit.

### Step 4: Wire `thumbnails`/`onMove` into the `<PagesTabBar>` element, and update thumbnails on add/duplicate/delete

Change:

```tsx
<PagesTabBar
  t={t}
  pages={pages}
  activePageId={activePageId}
  onSwitch={switchToPage}
  onAdd={() => {
    const updated = addPage(pages)
    setPages(updated)
    setActivePageId(updated[updated.length - 1]!.id)
  }}
  onDelete={(id) => {
    if (id === activePageId) {
      const fallback = pages.find((p) => p.id !== id)
      if (fallback) switchToPage(fallback.id)
    }
    setPages(deletePage(pages, id))
  }}
  onRename={(id, name) => setPages(renamePage(pages, id, name))}
  onDuplicate={(id) => {
    const updated = duplicatePage(pages, id)
    setPages(updated)
    const index = pages.findIndex((p) => p.id === id)
    setActivePageId(updated[index + 1]!.id)
  }}
  onReorder={(id, direction) => setPages(reorderPage(pages, id, direction))}
/>
```

to:

```tsx
<PagesTabBar
  t={t}
  pages={pages}
  activePageId={activePageId}
  thumbnails={thumbnails}
  onSwitch={switchToPage}
  onAdd={() => {
    const updated = addPage(pages)
    const created = updated[updated.length - 1]!
    setPages(updated)
    setActivePageId(created.id)
    void renderPageThumbnail(created.scene, canvasBg, resolvedTheme).then((thumb) => {
      setThumbnails((prev) => ({ ...prev, [created.id]: thumb }))
    })
  }}
  onDelete={(id) => {
    if (id === activePageId) {
      const fallback = pages.find((p) => p.id !== id)
      if (fallback) switchToPage(fallback.id)
    }
    setPages(deletePage(pages, id))
    setThumbnails((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }}
  onRename={(id, name) => setPages(renamePage(pages, id, name))}
  onDuplicate={(id) => {
    const updated = duplicatePage(pages, id)
    const index = pages.findIndex((p) => p.id === id)
    const created = updated[index + 1]!
    setPages(updated)
    setActivePageId(created.id)
    void renderPageThumbnail(created.scene, canvasBg, resolvedTheme).then((thumb) => {
      setThumbnails((prev) => ({ ...prev, [created.id]: thumb }))
    })
  }}
  onReorder={(id, direction) => setPages(reorderPage(pages, id, direction))}
  onMove={(id, toIndex) => setPages(movePage(pages, id, toIndex))}
/>
```

- [ ] Make this edit.

### Step 5: Run the full repo-wide gate

Run: `pnpm typecheck`
Expected: PASS (all packages, including `apps/web` and `packages/ui` now consistent with each other).

Run: `pnpm test`
Expected: PASS (all unit tests across all packages).

Run: `pnpm --filter @excalidraw-clone/web exec playwright test`
Expected: PASS — all existing e2e specs still pass unchanged (thumbnails/drag are additive; no existing spec asserts on the tab bar's absence of a thumbnail or on exact tab-bar layout that a 46×33 thumbnail would disturb).

Run: `pnpm format`
Expected: exits 0.

Run: `pnpm format:check`
Expected: PASS.

- [ ] Run all five and confirm green. Fix any fallout before proceeding.

### Step 6: Commit

```bash
git add apps/web/src/components/App.tsx
git commit -m "web: wire live page thumbnails and pointer-drag reordering into App"
```

- [ ] Commit.

---

## Task 5: E2E coverage

**Files:**

- Modify: `apps/web/e2e/pages.spec.ts`

**Interfaces:**

- Consumes: `page-thumb-{id}` (Task 3/4), the `dragOnCanvas`-adjacent `page.mouse` drag pattern, `readDoc`/`SceneDoc` already defined at the top of `apps/web/e2e/pages.spec.ts`.

### Step 1: Add the new e2e tests

Append these two `test(...)` blocks to the end of `apps/web/e2e/pages.spec.ts` (after the existing `test("pages: add, switch, rename, delete-guard, and localStorage round-trip", ...)` block — do not modify that existing test):

```ts
test("pages: active tab shows a live-updating thumbnail after drawing", async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-rectangle"]').waitFor({ state: "visible" })

  const firstTab = page.locator('[data-testid^="page-tab-"]')
  const firstId = (await firstTab.getAttribute("data-testid"))!.replace("page-tab-", "")
  const thumb = page.locator(`[data-testid="page-thumb-${firstId}"]`)

  // Blank box before any drawing: it's a <div>, not an <img>, so it has no src.
  expect(await thumb.getAttribute("src")).toBeNull()

  await page.locator('[data-testid="toolbar-rectangle"]').click()
  await dragOnCanvas(page, { x: 100, y: 100 }, { x: 200, y: 200 })
  await page.locator('[data-testid="toolbar-selection"]').click()

  // The thumbnail effect mirrors the 500ms autosave debounce; poll rather than
  // assume a fixed wait has been long enough (the e2e suite's established
  // pattern for anything gated behind that debounce).
  await expect
    .poll(async () => thumb.getAttribute("src"), { timeout: 3000 })
    .toMatch(/^data:image\/png;base64,/)
})

test("pages: dragging a tab past a sibling reorders the pages array in localStorage", async ({
  page,
}) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-rectangle"]').waitFor({ state: "visible" })

  await page.locator('[data-testid="page-add"]').click()
  await expect(page.locator('[data-testid^="page-tab-"]')).toHaveCount(2)
  await expect.poll(async () => (await readDoc(page))?.pages.length).toBe(2)

  const idsBefore = await page
    .locator('[data-testid^="page-tab-"]')
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-testid")!.replace("page-tab-", "")))
  const firstId = idsBefore[0]!
  const secondId = idsBefore[1]!

  const firstTab = page.locator(`[data-testid="page-tab-${firstId}"]`)
  const secondTab = page.locator(`[data-testid="page-tab-${secondId}"]`)
  const firstBox = await firstTab.boundingBox()
  const secondBox = await secondTab.boundingBox()
  if (!firstBox || !secondBox) throw new Error("tab not found")

  await page.mouse.move(firstBox.x + firstBox.width / 2, firstBox.y + firstBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(secondBox.x + secondBox.width + 5, secondBox.y + secondBox.height / 2, {
    steps: 8,
  })
  await page.mouse.up()

  await expect
    .poll(async () => (await readDoc(page))?.pages.map((p) => p.id))
    .toEqual([secondId, firstId])
})
```

- [ ] Make this edit.

### Step 2: Run the new e2e specs to confirm they pass against the real implementation

Run: `pnpm --filter @excalidraw-clone/web exec playwright test pages.spec.ts`
Expected: PASS (all three tests in the file — the pre-existing one plus these two new ones). If either new test fails, debug against the real running app (`pnpm --filter @excalidraw-clone/web dev`) rather than loosening the assertions.

- [ ] Run and confirm PASS.

### Step 3: Run the full repo-wide gate one final time

Run: `pnpm typecheck`
Expected: PASS.

Run: `pnpm test`
Expected: PASS.

Run: `pnpm --filter @excalidraw-clone/web exec playwright test`
Expected: PASS — full e2e suite including the new tests.

Run: `pnpm format`
Expected: exits 0.

Run: `pnpm format:check`
Expected: PASS.

- [ ] Run all five and confirm green.

### Step 4: Commit

```bash
git add apps/web/e2e/pages.spec.ts
git commit -m "web: e2e coverage for page thumbnails and pointer-drag reordering"
```

- [ ] Commit.

---

## Final verification (after Task 5)

Run the complete gate one more time from a clean state:

```bash
pnpm typecheck
pnpm test
pnpm --filter @excalidraw-clone/web exec playwright test
pnpm lint
pnpm format:check
```

All must exit 0. Then write the SDD-style completion report and update project memory noting: full gate status, the three out-of-scope follow-ups explicitly deferred by the design spec (click-and-hold thumbnail preview without switching, configurable thumbnail size/density mode, keyboard-driven arbitrary-position reorder), and the final commit hash.
