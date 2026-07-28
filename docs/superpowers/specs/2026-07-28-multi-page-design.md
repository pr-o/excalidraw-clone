# Multi-Page / Multi-Scene Support — Design

**Date:** 2026-07-28
**Status:** Approved
**Scope:** Let a single document contain multiple pages, each an independent canvas with its own elements, undo/redo history, and pan/zoom viewport. Navigate pages via a new bottom `PagesTabBar`. Shared across pages: the image/file store and the shape library. Out of scope: real-time collaboration/multiplayer, cross-page element references or bindings, per-page themes.

## Problem

The v2 backlog (library, more shapes, snap-to-grid, polish) is fully cleared as of the more-shapes feature (`d2ccbb2`). The app's document model is a single flat `elements` array backed by one `Scene` instance and one localStorage key — there is no way to work on more than one canvas within a document. Real Excalidraw's multi-page concept is the clearest remaining gap versus a mature drawing tool, and unlike multiplayer collaboration (which requires a server, networking, and conflict resolution — a much larger architectural commitment), it's an extension of the existing local-only persistence and `Scene` architecture.

## Decisions

### Data model & persistence

- `ExcalidrawData` (`packages/scene/src/types.ts`) changes from a flat `elements` array to:

  ```ts
  export interface ExcalidrawPage {
    id: string
    name: string
    elements: readonly ExcalidrawElement[]
  }

  export interface ExcalidrawData {
    type: "excalidraw"
    version: 3 // bumped from 2
    source: string
    pages: readonly ExcalidrawPage[]
    activePageId: string
    appState?: ExcalidrawAppStateSnapshot
    files?: ExcalidrawFiles // unchanged — shared across pages
  }
  ```

- `SCENE_FORMAT_VERSION` (`packages/scene/src/json.ts`) bumps to `3`.
- The library store (`library-store.ts`) and image/file store (`image-store.ts`) are untouched — already independent of the elements array, which is why sharing them across pages is free.

### Migration & file I/O

- `packages/persistence/src/migrations.ts`: add a `v2ToV3` step wrapping the old flat `elements` into `{ pages: [{ id, name: "Page 1", elements }], activePageId: <that id> }`.
- **Fix an existing gap as part of this work:** `local-store.ts`'s `loadScene()` currently does a strict exact-version match (`obj.version === SCENE_FORMAT_VERSION`) and never calls `migrate()` — that path is only wired into "Open .excalidraw file" and the PNG round-trip today. Bumping the version without fixing this would silently wipe every existing user's localStorage save (a `version: 2` document would fail the strict check and be treated as "no saved scene"). Relax the check to "structurally valid, any recognized version" and call `migrate()` inside `loadScene()` before returning.
- `apps/web/src/driver/hydration.ts`: `hydrateScene()` → `hydratePages()`, returning `{ pages: PageRecord[], activePageId }` — one `Scene` per page built from migrated data, or a single blank default page if nothing was saved.
- `packages/persistence/src/file-io.ts`: add `serializeDocument(pages, activePageId, appState?, files?): ExcalidrawData` alongside the existing `serializeScene` (kept as a lower-level single-scene primitive).
- `apps/web/src/driver/saveFile.ts`, `exportPNG.ts`, `autoSave.ts`: switch from `serializeScene(scene, ...)` to `serializeDocument(pages, activePageId, ...)`.
- `apps/web/src/driver/openFile.ts`: opening a file now replaces the entire `pages`/`activePageId` state in `App.tsx` (rebuilding fresh `Scene` instances), rather than mutating the currently active scene.

### App-level state & page switching

- `App.tsx` replaces `const scene = useMemo(() => hydrateScene(), [])` with:

  ```ts
  interface PageRecord {
    id: string
    name: string
    scene: Scene
    viewport: ViewTransform // { scrollX, scrollY, zoom }, snapshotted on last visit
  }

  const [pages, setPages] = useState<PageRecord[]>(() => hydratePages().pages)
  const [activePageId, setActivePageId] = useState<string>(() => hydratePages().activePageId)
  const scene = useMemo(
    () => pages.find((p) => p.id === activePageId)!.scene,
    [pages, activePageId],
  )
  ```

- `switchToPage(targetId)` (invoked by tab clicks and the page-cycle shortcuts):
  1. Snapshot current `scrollX/scrollY/zoom` (from the zustand view slice) into the outgoing page's `viewport` field.
  2. Set `activePageId` to `targetId`.
  3. Call `setView(targetPage.viewport)` to restore the incoming page's saved position (fresh pages default to `{scrollX:0, scrollY:0, zoom:1}`).
  4. Clear selection (`selectedIds`), since selected element ids don't exist on the new page.
- `Scene` mutation notifications flow through `Scene.subscribe`/`useSceneRevision`, not React state, so the `scene` reference stays stable while drawing — only page-list operations (add/delete/rename/reorder/switch) touch React state. No changes needed to `useSceneRevision`, `PropertiesPanel`, or `LayersPanel`.
- `startAutoSave` signature changes from `startAutoSave(scene)` to `startAutoSave(pages, activePageId)`: it subscribes to every page's `Scene.subscribe(...)` (so edits on any page schedule a save) and serializes the full document via `serializeDocument`. The effect dependency becomes `[pages]` (page-list identity), which only changes on add/delete/reorder, not on every keystroke.

### UI — `PagesTabBar`

New component `packages/ui/src/PagesTabBar.tsx`, following the existing panel prop-drilling convention:

```ts
export interface PagesTabBarProps {
  t: (key: string) => string
  pages: readonly { id: string; name: string }[]
  activePageId: string
  onSwitch: (id: string) => void
  onAdd: () => void
  onDelete: (id: string) => void
  onRename: (id: string, name: string) => void
  onDuplicate: (id: string) => void
  onReorder: (id: string, direction: "left" | "right") => void
}
```

- Rendered `fixed bottom-0 left-0 right-0` (avoids the already-occupied left dock (`LayersPanel`) and right dock (`LibraryPanel` + floating `PropertiesPanel`); a flat list of pages, usually few and switched often, fits a tab bar better than a scrolling side panel anyway).
- One tab per page (`data-testid="page-tab-{id}"`), rename-on-double-click via an inline `<input>`, small reorder buttons, and duplicate/delete affordances styled like `LayersPanel`'s z-order controls. Trailing `+` button (`data-testid="page-add"`).
- Delete is disabled (not hidden) when `pages.length === 1` — a document always has at least one page.

App.tsx wiring: `onAdd` appends a new `PageRecord` (fresh `Scene`, generated id, name `Page N`, default viewport); `onDelete` filters it out, switching to the previous page if the deleted one was active; `onDuplicate` deep-clones elements via the existing `cloneElementsWithNewIds` helper (already used by the templates feature) into a new `Scene` inserted right after the source; `onReorder` swaps adjacent array entries.

### Shortcuts & i18n

- `attachShortcuts`'s `Bindings` interface (`apps/web/src/keyboard/shortcuts.ts`) gains `onNextPage`/`onPrevPage` callbacks. Alt+PageDown / Alt+PageUp cycle `activePageId` through `pages`, wrapping at the ends. The effect already re-runs on `[scene]`, which changes on every page switch, so the callbacks stay fresh with no new dependency wiring.
- New `pages` key block in `common.json`/`shortcuts.json` (en + ko), mirroring the shape of the existing `layers` block (`pages.title`, `pages.add`, `pages.rename`, `pages.delete`, `pages.duplicate`, plus shortcut descriptions), and a new row in `HelpDialog`.

### YAGNI

No cross-page element references or bindings, no per-page theme/background, no page thumbnails/previews in the tab bar, no drag-to-reorder (button-based reorder only, matching `LayersPanel`'s pattern), no shared/global undo across pages.

## Testing

Unit TDD:

- `packages/persistence/test/migrations.test.ts`: `v2ToV3` cases (elements → single named page + correct `activePageId`); existing version-too-new/unrecognized-version errors unchanged.
- `packages/persistence/test/local-store.test.ts`: a `version: 2` payload in localStorage now loads successfully via `migrate()` instead of returning `null` (regression test for the data-loss fix).
- `packages/ui/test/PagesTabBar.test.tsx`: new file mirroring `MoreShapesMenu.test.tsx`'s style — tab rendering, active-tab styling, switch/add/rename/duplicate/reorder callbacks, delete disabled at one page.
- `apps/web/test/`: hydration test — `hydratePages()` falls back to one blank page when localStorage is empty, and correctly rebuilds multiple `Scene` instances from saved multi-page data.

E2e: new `apps/web/e2e/pages.spec.ts` (~60 lines, mirroring `layers-panel.spec.ts`) covering — add a page and verify the canvas clears to blank; draw on page 2, switch to page 1, and verify page 1's elements are still present and page 2's aren't visible; delete is blocked at one page; rename persists; Alt+PageDown/Up cycles pages; reload the page (localStorage round-trip) and confirm both pages' content and the active page survive.

Edge cases covered explicitly: switching pages mid-drag or mid-text-edit must cleanly commit/cancel rather than corrupt state (same requirement as any other toolbar action mid-draw already has to satisfy), and the last-page delete guard.

Full gate (`tsc` + unit + e2e) before merge.

## Out of scope (follow-up candidates)

- Real-time multiplayer collaboration (separate, much larger feature — server/networking/CRDT)
- Cross-page element references, bindings, or shared frames
- Page thumbnails/previews in the tab bar
- Drag-to-reorder pages (button-based only for v1)
- Global/shared undo history across pages
