# PagesTabBar Polish: Thumbnails & Drag-to-Reorder — Design

**Date:** 2026-07-29
**Status:** Approved
**Scope:** Add a live-updating page thumbnail and pointer-based drag-to-reorder to the existing `PagesTabBar` (shipped `07d59e0`). Follow-up to the two items explicitly deferred in `docs/superpowers/specs/2026-07-28-multi-page-design.md`'s "Out of scope" list. Out of scope here too: cross-page anything, thumbnail click-to-preview-without-switching, custom thumbnail sizes/themes.

## Problem

`PagesTabBar` currently shows only a text label per page — with several pages open, telling them apart requires reading names or clicking through, and reordering is limited to swapping one adjacent position at a time via the ◀/▶ buttons. Both were called out as follow-up candidates when multi-page shipped.

## Decisions

### Thumbnail rendering

- New module `apps/web/src/driver/pageThumbnails.ts`:

  ```ts
  export const THUMBNAIL_WIDTH = 46
  export const THUMBNAIL_HEIGHT = 33
  export const THUMBNAIL_CAPTURE_SCALE = 2 // render @2x for retina, display at 1x via CSS

  export function renderPageThumbnail(
    scene: Scene,
    canvasBg: string,
    theme: "light" | "dark",
  ): string | undefined
  ```

  - Returns `undefined` immediately if `scene.getElements().length === 0` — no renderer invoked, `PagesTabBar` shows a plain blank box. This is the common case for a freshly added page and keeps the fast path free.
  - Otherwise reuses the exact `exportToPNG` pattern (`apps/web/src/driver/exportPNG.ts`): compute the elements' bounding box, build an offscreen `CanvasRenderer` on a detached `<canvas>`, but instead of fitting the canvas to the bbox (like PNG export), fit the bbox **into** a fixed `THUMBNAIL_WIDTH × THUMBNAIL_HEIGHT` canvas (letterboxed/"contain", centered, small padding) — the scale factor is computed as `min(canvasW / bboxW, canvasH / bboxH)`, clamped so a tiny scene doesn't get blown up past 1x.
  - Renders synchronously (`renderer.start()` → one `requestAnimationFrame` tick → `renderer.stop()`, mirroring `exportToPNG`) and returns `canvas.toDataURL("image/png")`. No image-file preloading needed here — thumbnails are a coarse visual hint, not a faithful export, so image elements can render as their placeholder/broken state without special-casing (matches how the canvas already renders images that haven't loaded yet).

### When thumbnails refresh

Only the **active** page's scene can mutate — background pages are idle `Scene` instances until switched to — so thumbnail regeneration only ever targets the current `activePageId`:

- **On hydrate:** generate once for every page from its loaded elements, so tabs aren't blank on first paint.
- **On switch/add/duplicate:** regenerate the newly-active page's thumbnail immediately (not debounced) — covers the case where a page has content but hasn't been edited since becoming active (e.g. duplicated, or revisited).
- **On edit:** debounced ~500ms after the active scene's last mutation, mirroring the autosave debounce already wired in `apps/web/src/driver/autoSave.ts` — same "the user stopped drawing" signal, but implemented as its own `createAutoSaver`-style debounce instance (from `@excalidraw-clone/persistence`) local to `App.tsx`, kept separate from persistence so a thumbnail-only failure can never affect saving.
- Deleting a page simply drops its cached thumbnail along with its `PageRecord`.

Cached as `Record<pageId, string | undefined>` React state in `App.tsx`, passed to `PagesTabBar` as a new `thumbnails` prop.

### `PagesTabBar` changes

- New prop: `thumbnails?: Readonly<Record<string, string | undefined>>`.
- Each tab renders a `46×33` `<img data-testid="page-thumb-{id}">` (or a blank bordered box when the entry is `undefined`) to the left of the name, per the approved mockup — same row height as today, thumbnail sized ~65% larger than the initial small draft after two rounds of visual sizing feedback.
- Reordering becomes pointer-based, not native HTML5 drag-and-drop — this repo's existing drag interactions (canvas element dragging, the `dragOnCanvas` e2e helper) are all pointer-event sequences, and native HTML5 DnD has no usable `DataTransfer` in jsdom, making it awkward to unit test. Instead:
  - `onPointerDown` on a tab (excluding the reorder/delete/duplicate buttons and the rename input) starts a drag, tracked in component state: `{ draggedId: string, overIndex: number | null }`.
  - `onPointerMove` (attached to the bar while dragging) computes the insertion index by comparing the pointer's x-position against sibling tab midpoints, updating `overIndex`.
  - A thin absolute-positioned drop-line `<div data-testid="page-drop-line">` renders between tabs at `overIndex`.
  - `onPointerUp` calls the new `onMove(id, toIndex)` prop and clears drag state; a drag that ends with `overIndex` equal to the dragged tab's current position is a no-op.
  - The existing ◀/▶ reorder buttons are unchanged and still call `onReorder` (adjacent-swap) — both mechanisms coexist, per your call to keep the buttons for accessibility/simplicity.

### Driver: arbitrary-index move

- New pure function in `apps/web/src/driver/pages.ts`:

  ```ts
  export function movePage(pages: readonly PageRecord[], id: string, toIndex: number): PageRecord[]
  ```

  Removes the page at its current index and re-inserts it at `toIndex` (clamped to `[0, pages.length - 1]`); a no-op if `id` isn't found. `reorderPage` (adjacent swap, used by the buttons) is untouched.

### App.tsx wiring

- `thumbnails` state initialized from `renderPageThumbnail` over every hydrated page.
- A dedicated debounced effect (separate `createAutoSaver`-like instance) subscribed to the active `scene`, calling `setThumbnails` with the freshly rendered data URL for `activePageId` only.
- `switchToPage`, the `onAdd`/`onDuplicate` handlers, and `onDelete` (to drop the removed id's entry) each update `thumbnails` synchronously alongside their existing `pages`/`activePageId` updates.
- `PagesTabBar`'s `onMove` handler calls `setPages(movePage(pages, id, toIndex))`.

### YAGNI

No thumbnail click-to-preview without switching, no custom per-user thumbnail size/position settings, no thumbnails in any other panel, no keyboard-driven reorder-to-arbitrary-position (the ◀/▶ buttons already give keyboard/no-mouse users adjacent-swap access — sufficient given drag is now mouse-only same as most tab bars).

## Testing

Unit TDD:

- `apps/web/test/pages-driver.test.ts`: `movePage` — moves to an arbitrary index, clamps out-of-range targets, no-ops on unknown id.
- New `apps/web/test/pageThumbnails.test.ts`: empty scene → `undefined` with no renderer invocation; non-empty scene → a `data:image/png;base64,...` string; a scene whose elements exceed the thumbnail's aspect ratio is letterboxed without exceeding `THUMBNAIL_WIDTH`/`HEIGHT`.
- `packages/ui/test/PagesTabBar.test.tsx`: extended — renders `page-thumb-{id}` img when a thumbnail entry exists, blank box when absent; pointer-drag sequence (`pointerDown` → `pointerMove` past a sibling's midpoint → `pointerUp`) calls `onMove` with the expected target index; a drag that doesn't cross any midpoint is a no-op; existing ◀/▶/rename/delete/duplicate tests unchanged.

E2e: extend `apps/web/e2e/pages.spec.ts` — draw an element, wait past the debounce, and assert the active tab's `page-thumb-{id}` `src` attribute is non-empty (exact pixel content isn't asserted, just presence/change, matching how other e2e specs treat rendered canvas output as opaque); simulate a pointer-drag reorder (`page.mouse.down/move/up` sequence over two tabs, mirroring `dragOnCanvas`'s pattern) and assert the resulting page order in the `excalidraw-scene` localStorage `pages` array.

Full gate (`tsc` + unit + e2e) before merge, same bar as the parent feature.

## Out of scope (follow-up candidates)

- Click-and-hold thumbnail preview without switching pages
- Configurable thumbnail size or an alternate tab-bar density mode
- Keyboard-driven arbitrary-position reorder (drag remains mouse-only)
