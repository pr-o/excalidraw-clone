# Templates — Design

**Date:** 2026-06-25
**Status:** Approved (design), pending implementation plan
**Builds on:** v1.2 library feature (d77ef2c), v1.5 smart arrows / binding (41b0dab), sticky notes (v1.4).

## Goal

Ship built-in, read-only "starter" templates (Flowchart, Kanban) that drop onto the canvas through the existing library place-flow, with bound connectors that stay attached when nodes move.

## Decisions (locked during brainstorming)

1. **Templates are built-in `LibraryItem`s** bundled in code, not seeded into IndexedDB.
2. **Bound connectors:** flowchart arrows are bound to their nodes — requires fixing placement to remap binding references to the new element ids.
3. **UI:** a read-only **TEMPLATES** section at the top of the existing Library panel, above **MY ITEMS**.
4. **First set:** Flowchart and Kanban board (two templates). Structure makes adding more trivial.

## Current-state findings (ground truth)

- `LibraryItem = { id; name; created; elements: ExcalidrawElement[]; files? }` (`packages/scene/src/library-item.ts`).
- The place-flow: `armLibraryItem(item)` sets `pendingItem` (`apps/web/src/store/slices/library.ts`) → driver draws a ghost following the cursor → click calls `placeLibraryItem(item, x, y, scene)` (`apps/web/src/driver/useDrawingDriver.ts:39`) which re-IDs and offsets elements, pushes via `scene.mutate`, and selects them.
- **Gap:** `placeLibraryItem` sets `id: crypto.randomUUID()` per element but does **not** rewrite `startBinding.elementId`, `endBinding.elementId`, `boundElements[].id`, or `containerId`. So a placed flowchart loses its bindings and a placed note loses its container↔text link. This is also a latent bug for user library items containing bound arrows or notes.
- `scene.mutate` runs `reconcileBindings` and `reconcileBoundText`, so once bindings reference live ids, connectors snap into place automatically.
- `LibraryPanel` (`packages/ui/src/LibraryPanel.tsx`) takes `items: LibraryItem[]`, `onItemClick`, `onRename`, `onDelete`, and `renderThumbnail(item) => string` (SVG markup wired by `App.tsx`). It renders one `<ul>` of item tiles; each tile = thumbnail button (`onItemClick`) + name (double-click rename) + `⋯` menu (rename/delete).
- Factories: `newRectangle`, `newDiamond`, `newArrow`, `newText`, `newNote` (`packages/scene/src/factories.ts`). `newNote` returns `{ container, text }` with reciprocal `boundElements`/`containerId`.

## Architecture

### Layer 1 — Scene: ID-remap primitive + template data

- **`packages/scene/src/clone.ts` → `cloneElementsWithNewIds(elements: readonly ExcalidrawElement[]): ExcalidrawElement[]`**
  - Build `idMap: Map<oldId, newId>` (`newId = crypto.randomUUID()`) for every element.
  - Return new elements with the new id and every internal reference rewritten through `idMap`:
    - `startBinding.elementId`, `endBinding.elementId` (when present)
    - `boundElements: { id, type }[]` — map each `id`
    - `containerId`
    - `frameId` (if present on the element)
  - References whose target id is **not** in the map are left unchanged (bundles are self-contained; this also means a stray external ref can't crash placement).
  - Pure: does not touch `x`/`y` (offset stays in `placeLibraryItem`).
  - Exported from `packages/scene/src/index.ts`.
- **`packages/scene/src/templates.ts` → `BUILTIN_TEMPLATES: LibraryItem[]`**
  - Each template is built with factories and given a fixed `id`/`name`/`created: 0`.
  - **Flowchart:** Start (rounded rect) → Process (rect) → Decision (diamond) → End (rounded rect), laid out vertically, joined by three `newArrow`s whose `startBinding`/`endBinding` reference the node ids, with each node's `boundElements` referencing its arrows. Each node label is a bound text element (text `containerId` → node id; node `boundElements` includes the text), the same container↔text mechanism `newNote` uses.
  - **Kanban:** three column header rects ("To do" / "Doing" / "Done"), each with a bound text label, plus a few `newNote` sticky notes laid out under the columns. (Column headers use the same bound-text mechanism as flowchart nodes; sticky notes come from `newNote`.)
  - Internal ids are generated once at module load; placement re-IDs them, so stable session ids are fine.

### Layer 2 — Web: binding-aware placement

- `placeLibraryItem` (`useDrawingDriver.ts`) replaces its inline `.map(el => ({ ...el, id: randomUUID(), x: el.x+x, y: el.y+y }))` with:
  `const cloned = cloneElementsWithNewIds(item.elements); const placed = cloned.map(el => ({ ...el, x: el.x + x, y: el.y + y }))`.
  Everything else (files, `scene.mutate`, selection) unchanged.
- `App.tsx` imports `BUILTIN_TEMPLATES` and passes it to `LibraryPanel` as `templates`.

### Layer 3 — UI: Templates section

- `LibraryPanel` gains `templates: LibraryItem[]`.
- Extract the existing tile markup into an internal `ItemTile` sub-component (thumbnail button + name + optional menu), parameterized by a `readOnly` flag.
  - `readOnly` tiles (templates): thumbnail + name only, **no** `⋯` menu, no rename/delete.
  - Editable tiles (user items): unchanged behavior.
- Render order inside the scroll area: **TEMPLATES** header + grid of `templates` (always shown, read-only) → **MY ITEMS** header + existing user-items grid (or the empty message).
- Two new i18n strings: `library.templates`, `library.myItems`. Template tiles get `data-testid={`template-item-${item.id}`}` for e2e.

## Data flow (place a flowchart)

1. User opens the library panel, clicks the Flowchart tile → `onItemClick(item)` → `armLibraryItem` sets `pendingItem`.
2. Ghost preview follows the cursor; click on canvas → `placeLibraryItem`.
3. `cloneElementsWithNewIds` assigns fresh ids and rewrites all internal binding/container refs; elements are offset to the drop point.
4. `scene.mutate` pushes them; `reconcileBindings`/`reconcileBoundText` snap connectors and labels into place; placed elements are selected.
5. Moving a node reflows its bound arrows (existing binding behavior).

## Testing strategy

- **Unit (scene):**
  - `cloneElementsWithNewIds`: every element gets a new id; no new id equals any old id; an arrow's `startBinding.elementId`/`endBinding.elementId` point to the cloned node ids; a note's `boundElements[].id` and the text's `containerId` are mutually consistent post-clone; an unmapped external ref is left unchanged.
  - `BUILTIN_TEMPLATES` well-formed: for each item, every arrow binding `elementId` resolves to an element in the same item; every text `containerId` resolves to a container whose `boundElements` includes that text.
- **Unit (ui):** `LibraryPanel` renders a TEMPLATES section listing the built-ins; clicking a template tile calls `onItemClick`; template tiles render no rename/delete menu (`role="menu"` absent for templates). Existing library-item tests still pass.
- **E2e (`apps/web/e2e/templates.spec.ts`):** open library → click the Flowchart template tile → click canvas → assert element count increased and at least one arrow has non-null `startBinding` and `endBinding`; drag a node and assert its bound arrow endpoint moved.

## Scope guards (YAGNI)

- Built-in templates only — no user-defined templates, no "save as template."
- Templates are a code constant — not persisted, not editable/deletable in the panel.
- Two templates this version (Flowchart, Kanban).
- No new thumbnail renderer — reuse `renderThumbnail`.
- `cloneElementsWithNewIds` handles the reference fields that exist in this codebase today (`startBinding`, `endBinding`, `boundElements`, `containerId`, `frameId`); no speculative generality.

## Risks / notes

- The ID-remap changes shared placement behavior for **all** library items, not just templates — this is intended (it fixes the latent binding/note bug) and is covered by keeping the existing library e2e/tests green plus the new unit tests.
- Module-load `crypto.randomUUID()` for template ids is fine in browser and Node 22 (test env); placement re-IDs regardless.
