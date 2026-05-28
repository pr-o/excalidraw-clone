# Library / Templates Feature — Design

**Status:** Approved design, ready for implementation plan
**Date:** 2026-05-27
**Predecessor:** v1.1 shipped at `ff0a19b`

## Overview

Add a personal library of reusable shape groups, modeled on upstream Excalidraw's library UX. Users can save the current selection as a library item, click an item to arm it for placement on the canvas, and import/export libraries as `.excalidrawlib` JSON files for hand-sharing. The store is local-only (IndexedDB) — no remote catalog, no community library.

This is the first feature that gives the tool memory across sessions beyond the single scene file.

## Scope

**In scope**

- Right-side collapsible `LibraryPanel` in the canvas UI
- IndexedDB-backed local store of library items
- Add-from-selection action
- Click-then-place insertion with ghost preview
- `.excalidrawlib` v2 import and export
- Rename and delete operations on items
- i18n strings for all new UI

**Out of scope** (deferred to later iterations)

- Drag-from-panel insertion
- Multi-item selection inside the panel
- Item categorization, tags, or search
- Remote library catalog browsing
- Virtualization of the panel grid

## Data Model

### `LibraryItem` (new type in `packages/scene`)

```ts
interface LibraryItem {
  id: string // UUID
  name: string // user-editable
  created: number // ms epoch
  elements: ExcalidrawElement[] // 1..N, normalized to (0,0) origin
  files?: Record<string, ExcalidrawBinaryFile> // binaries used by image elements in this item
}
```

Elements are normalized at save-time: translate so the group's bounding-box min is `(0, 0)`. This makes insertion math trivial — at placement, just translate the cloned elements by the pointer position.

### `.excalidrawlib` v2 (import/export format)

Matches upstream Excalidraw's format:

```json
{
  "type": "excalidrawlib",
  "version": 2,
  "source": "excalidraw-clone",
  "libraryItems": [
    { "id": "...", "name": "...", "created": 0, "elements": [...] }
  ],
  "files": {
    "<fileId>": { "id": "...", "mimeType": "...", "dataURL": "...", "created": 0 }
  }
}
```

`files` is keyed by `fileId` and merged across all items on import — a single binary is stored once even if used by multiple library items.

## Storage Layer

### `packages/persistence/src/library-store.ts`

Mirrors `image-store.ts`. The IndexedDB database `excalidraw-clone` bumps from `DB_VERSION = 1` to `DB_VERSION = 2` and adds a `library_items` object store keyed by `id`.

Public API:

```ts
putLibraryItem(item: LibraryItem): Promise<void>
getLibraryItem(id: string): Promise<LibraryItem | undefined>
getAllLibraryItems(): Promise<LibraryItem[]>          // newest-first by created
deleteLibraryItem(id: string): Promise<void>
renameLibraryItem(id: string, name: string): Promise<void>
clearLibrary(): Promise<void>
importLibraryFile(blob: Blob): Promise<{ added: number; skipped: number }>
exportLibraryFile(): Promise<Blob>                    // .excalidrawlib v2
_resetDBForTesting(): Promise<void>
```

### Shared DB module

Factor a single `packages/persistence/src/db.ts` module that owns `DB_VERSION = 2` and the `upgrade` function that creates both the `files` store (existing) and the new `library_items` store. `image-store.ts` and `library-store.ts` both import the shared `getDB()`. This avoids the version-conflict problem of two modules independently calling `openDB` with different versions.

### Image binaries — `item.files` lifecycle

Library items must be self-sufficient — clearing the scene or its image store should not break library items. So `item.files` is persisted **on the item row** in `library_items`, even though the same binaries also live in the canonical `files` store. This duplicates storage but keeps the library independent.

- **On `putLibraryItem` (add-from-selection)**: collect every `fileId` referenced by the item's elements, look each up in the canonical `files` store via `getFile()`, and attach the result to `item.files` before writing. If a `fileId` is missing from the canonical store (shouldn't happen during normal use), it's omitted from `item.files`.
- **On `importLibraryFile`**: write every binary in the imported top-level `files` map to the canonical store via `putFile()` (idempotent because content-hash keyed). Then for each imported item, attach the subset of `files` whose ids are referenced by that item's elements as `item.files` before writing to `library_items`.
- **On insertion**: read `item.files` from the stored row, merge into the canonical store via `putFile()`, then append elements to the scene. This re-hydrates the binary into `files` if it had been cleared since the item was saved.
- **On `exportLibraryFile`**: walk all items, union every `item.files` into a single top-level `files` map, emit `{ libraryItems, files }`.

### ID collisions on import

If an imported `LibraryItem.id` already exists locally, **skip** it (do not overwrite). The return value reports `{ added, skipped }` so the UI can show e.g. "12 added, 3 skipped".

## UI Surface

### `LibraryPanel` (new component in `packages/ui`)

A right-edge collapsible panel, ~280px wide when expanded. A vertical toggle button is pinned to the canvas's right edge (`aria-label` from `t("library.toggle")`).

Open/closed state lives in the existing UI prefs slice and is persisted via the existing `saveUI`/`loadUI` round-trip.

Layout when open:

```
┌──────────────────────────┐
│ Library  [⤓ Import] [⤒]  │   header: import, export-menu, collapse
├──────────────────────────┤
│ [+ Add from selection]   │   disabled when selection is empty
├──────────────────────────┤
│  ┌──┐  ┌──┐  ┌──┐        │   grid of items
│  │SVG│ │SVG│ │SVG│       │   click → arms placement tool
│  └──┘  └──┘  └──┘        │   dblclick name → inline rename
│  Item1  Item2  Item3     │
│   ⋯     ⋯     ⋯           │   ⋯ menu: Rename / Delete
└──────────────────────────┘
```

When empty, the grid is replaced by an `library.empty` placeholder string.

### Thumbnails

Inline `<svg>` rendered on demand via the existing `renderSceneToSVG()` from `packages/renderer/src/svg.ts` (added in v1.1). Each thumbnail is rendered at a fixed 80×80 viewport with `padding: 4`. No persisted thumbnail data.

### Insertion tool state — `LibrarySlice` in the Zustand store

```ts
interface LibrarySlice {
  pendingItem: LibraryItem | null
  armLibraryItem(item: LibraryItem): void
  clearPendingItem(): void
}
```

When `pendingItem` is non-null:

1. The toolbar tool indicator becomes inert; cursor shows a crosshair.
2. A canvas overlay renders a ghost preview of the item's elements at 60% opacity, translated to the current pointer position.
3. First canvas click commits placement:
   - Deep-clone elements, regenerate each element's `id` with `nanoid` so re-inserting the same item produces independent groups.
   - Translate by the pointer position.
   - Merge any `item.files` into the image store via `putFile()`.
   - Append elements to the scene; select the inserted elements; clear `pendingItem`.
4. `Escape` cancels: clears `pendingItem` with no scene change.
5. Switching toolbar tools, opening any dialog, or losing canvas focus all clear `pendingItem` so the user never gets stuck in a ghost-cursor state.

Wire-up lives in `apps/web/src/components/CanvasShell.tsx`: the overlay and click handler subscribe to `pendingItem`. No window-global event hack — purely state-driven, consistent with the v1.1 `DispatchSlice` refactor.

## Add / Import / Export Flows

### Add from selection

The panel's `Add from selection` button is enabled iff the scene has 1+ selected elements. On click:

1. Read selected element IDs from the scene slice.
2. Deep-clone the corresponding elements.
3. Compute the bounding box; translate each clone so the box's min corner is `(0, 0)`.
4. Collect any `fileId`s referenced by image elements; pull binaries from the existing `files` store via `getFile()` and attach them as `item.files` on the new `LibraryItem`. (Binaries themselves stay in `files`; the attached map is for export round-tripping.)
5. Create `LibraryItem` with `crypto.randomUUID()`, `created: Date.now()`, `name: "Item N"` where `N = currentCount + 1`.
6. Call `putLibraryItem`. Panel re-reads `getAllLibraryItems` and re-renders.

### Import

The panel header's `Import` button opens a native file picker (`accept=".excalidrawlib,application/json"`). On select:

1. Read blob, call `importLibraryFile(blob)`.
2. On success, show a toast using `t("library.imported", { added, skipped })`.
3. On parse or schema failure, show `t("library.importError")` and apply nothing.

### Export

A menu item in the panel header (`⋯` overflow menu, label `library.export`) calls `exportLibraryFile()` and triggers a download via the existing `download()` helper. Filename: `library-{YYYY-MM-DD}.excalidrawlib`.

## i18n Keys

Add to the locale files in `apps/web/src/locales/` (English + Korean):

| Key                        | Purpose                                                                            |
| -------------------------- | ---------------------------------------------------------------------------------- |
| `library.title`            | Panel header label                                                                 |
| `library.toggle`           | Aria-label for the open/close toggle button                                        |
| `library.addFromSelection` | "Add from selection" button                                                        |
| `library.empty`            | Empty-state placeholder                                                            |
| `library.import`           | "Import library..." button                                                         |
| `library.export`           | "Export library..." menu item                                                      |
| `library.rename`           | "Rename" context-menu item                                                         |
| `library.delete`           | "Delete" context-menu item                                                         |
| `library.imported`         | Toast: "{added} added, {skipped} skipped"                                          |
| `library.importError`      | Toast: failed to read library file                                                 |
| `library.placing`          | Status hint while a `pendingItem` is armed (e.g. "Click to place • Esc to cancel") |

## Edge Cases

- **Empty selection on Add**: button is disabled. If invoked via command palette anyway, no-op + `console.warn`.
- **Imported item references a missing image binary**: still import the item; at insertion time, the image element renders the existing broken-image placeholder. Don't block import on missing binaries.
- **Imported binary already exists locally**: `putFile()` is keyed by content hash, so it no-ops — correct behavior.
- **DB migration v1 → v2**: handled by the shared `db.ts`. Existing `files` store and its contents are preserved.
- **Pending placement while user switches tools or opens a dialog**: clear `pendingItem`.
- **Malformed `.excalidrawlib`**: try/catch around `JSON.parse` and schema check (`type === "excalidrawlib"`, `version === 2`, `Array.isArray(libraryItems)`). On failure, toast and apply nothing.
- **Rename to empty string or whitespace-only**: revert to previous name on blur.
- **Element ID uniqueness on insertion**: regenerate all element `id`s via `nanoid`.
- **Large libraries**: out of scope. A `// TODO: virtualize` comment in the panel grid is acceptable.

## Testing Strategy

### `packages/persistence` (vitest + fake-indexeddb)

- Round-trip: `putLibraryItem` → `getAllLibraryItems` → `deleteLibraryItem` → `clearLibrary`.
- `renameLibraryItem` mutates only `name`, leaves other fields intact.
- Import: well-formed file adds items; malformed JSON rejects without partial writes; duplicate `id` is counted as `skipped`.
- Export: a populated library round-trips back through `importLibraryFile` to the same end state.
- DB migration: opening a v1 DB then a v2 client preserves all `files` rows and adds the `library_items` store.

### `packages/scene` (if a normalization helper is added there)

- `normalizeToOrigin(elements)` translates so the bounding-box min is `(0, 0)` and preserves relative positions.

### `packages/ui`

No DOM tests today. `LibraryPanel` is prop-driven and small; skip.

### `apps/web` (Playwright e2e — one new spec `library.spec.ts`)

- Draw a rectangle, select it, click `Add from selection` → item appears in panel.
- Click the item, click on canvas → a second rectangle exists in the scene at the click point.
- Arm an item, press `Escape` → no element added.
- Reload page → library item still present (verifies DB persistence).

## File Manifest

**New files**

- `packages/persistence/src/db.ts` — shared `getDB()` with `DB_VERSION = 2`
- `packages/persistence/src/library-store.ts`
- `packages/persistence/test/library-store.test.ts`
- `packages/persistence/test/import-export.test.ts`
- `packages/scene/src/library-item.ts` — `LibraryItem` type
- `packages/scene/src/normalize.ts` — `normalizeToOrigin` helper (+ test)
- `packages/ui/src/LibraryPanel.tsx`
- `apps/web/test/library.spec.ts` (Playwright)

**Modified files**

- `packages/persistence/src/image-store.ts` — switch to shared `getDB()`
- `packages/persistence/src/index.ts` — export new library API
- `packages/scene/src/index.ts` — export `LibraryItem` + `normalizeToOrigin`
- `packages/ui/src/index.ts` — export `LibraryPanel`
- `apps/web/src/app/store/` — add `LibrarySlice`, register in root store
- `apps/web/src/components/CanvasShell.tsx` — ghost-preview overlay, placement click handler
- `apps/web/src/components/App.tsx` — mount `LibraryPanel` on the right edge
- `apps/web/src/locales/en.json`, `apps/web/src/locales/ko.json` — new i18n keys

## Acceptance Criteria

A user opens the app, draws a rectangle and a circle, selects both, clicks **Add from selection** in the library panel — an item appears with an SVG thumbnail. They click the item, then click somewhere on the canvas — a copy of the group is placed there and selected. They reload the page — the library item is still there. They click **Export library**, then in a fresh browser profile, **Import library** the downloaded file — the item is restored. All existing v1.1 e2e specs still pass. Full monorepo gate (typecheck, lint, unit tests, Playwright e2e) is green.
