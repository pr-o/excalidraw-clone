# Move to Page — Design

**Date:** 2026-08-16
**Status:** Approved
**Scope:** A "Move to page" action in the element context menu that relocates a single, unbound, ungrouped, non-frame-member element to another page in the document, via a small floating page-picker. No cross-page bindings, no multi-element/grouped/framed moves, no new cross-page undo machinery — v1 covers the simplest case cleanly rather than the general case partially.

## Problem

Multi-page (`docs/superpowers/specs/2026-07-28-multi-page-design.md`) shipped page CRUD (`apps/web/src/driver/pages.ts`: add/delete/rename/duplicate/reorder) and page switching, but there is no way to move an individual element from one page to another — confirmed by grep, nothing resembling cross-page element movement exists anywhere in the codebase today. The context-menu design (`docs/superpowers/specs/2026-08-02-context-menu-design.md`) explicitly flagged "Multi-page-aware actions (e.g. 'move to page') in the menu" as an out-of-scope follow-up.

Two structural gaps make this non-trivial, not just a new menu item:

- **Binding corruption risk.** Elements can be bound to each other (arrow `startBinding`/`endBinding`, bound text via `containerId`/`boundElements`) and grouped (`groupIds`) or nested in frames (`frameId`). Moving an element to another page's `Scene` while something it's connected to stays behind leaves a dangling reference — `packages/scene/src/bindings.ts` looks these up via a plain `byId.get(...)` map, so a broken reference degrades silently (stuck/unbound arrow) rather than crashing, which makes it easy to ship unnoticed.
- **No picker surface exists.** `ContextMenu.tsx`'s items are flat, single-click, `{ id, label, hint?, perform: () => void }` — there's no way to express "pick one of N pages" as a single item.

## Decisions

- **Scope v1 to the simplest safe case**: the item only appears when exactly one element is selected, `groupIds.length === 0`, `frameId === null`, and it participates in **no** binding relationship in either direction: no `containerId` (isn't bound text inside a container), empty `boundElements` (isn't a container with a bound label riding along), and — if it's an arrow/line — no `startBinding`/`endBinding` (isn't itself attached to another element), and no other element's `startBinding`/`endBinding` references it (isn't the target another arrow points at). This sidesteps the binding-corruption problem by construction — no closure-expansion policy needs inventing — and matches the original multi-page spec's own boundary ("no cross-page element references or bindings"). Also requires `pages.length > 1`; with a single page, the item never appears.
- **Mental model: cut, then instant-paste into another page.** Reuses the exact soft-delete pattern `ContextMenuHost`'s existing Cut handler already uses (`draft[i] = { ...draft[i], isDeleted: true }` on the source scene) rather than splicing the array. The element **keeps its id** across the move — unlike Duplicate, which must mint fresh ids to avoid colliding within the _same_ scene, a cross-scene move has no collision risk, and reusing the id is what makes it a move rather than a copy. No new `packages/scene` function: this stays exactly as thin as the existing inline Cut/Delete handlers in `ContextMenuHost.tsx`.
- **Picker is a new, separate floating component, not a change to `ContextMenu.tsx`.** Clicking "Move to page" behaves like any other item — it closes the context menu normally via the existing `perform(); onClose()` flow — but `perform()` also sets new local state in `ContextMenuHost` (`{ elementId, x, y }`, reusing the context menu's own last position). `ContextMenuHost` then renders the new `PagePickerFlyout` (`packages/ui/src/PagePickerFlyout.tsx`) at that position. Zero changes to `ContextMenu.tsx` — no submenu machinery, no new item-type field. The flyout mirrors `MoreShapesMenu`'s existing floating-panel conventions (viewport-edge-flipping the way `ContextMenu` already does, Escape + outside-click to close) and gets the same roving-focus Arrow/Home/End keyboard nav just shipped for `ContextMenu` (`96d4585`), for a11y consistency across the app's floating lists.
- **Post-move: switch to the destination page, select the moved element there.** Confirms the move visually and matches "sending it there." Implemented as a new `moveElementToPage(elementId, targetPageId)` callback in `App.tsx` (the only place with access to both the active `scene` and the full `pages: PageRecord[]` array): marks the element deleted on the source scene, pushes a copy onto the destination page's `Scene`, calls the existing `switchToPage(targetPageId)`, then selects the moved element's id.
- **`ContextMenuHost` gains two new props**: `pages: { id: string; name: string }[]` (to list move targets and exclude the current page) and `onMoveElementToPage: (elementId: string, targetPageId: string) => void` (implemented by `App.tsx`, passed down at the existing `<ContextMenuHost scene={scene} />` call site).
- **No cross-page atomic undo — accepted, documented limitation.** Each page's `Scene` already owns fully independent undo/redo history (per the multi-page spec). A move is two separate mutations on two separate histories: undoing on the destination page only undoes the "add," undoing on the source page only undoes the soft-delete. This matches how independent per-page history already works everywhere else in the app; building cross-page atomic undo is out of scope for v1.
- **`contextMenu.moveToPage` locale string** added to `apps/web/src/locales/en/common.json` and `ko/common.json`, alongside the existing `contextMenu.*` keys.

## Testing

Unit TDD: `PagePickerFlyout.test.tsx` (new) — renders one row per page excluding the current page, first row auto-focused on open, Arrow/Home/End navigation (mirroring `ContextMenu.test.tsx`'s existing keyboard-nav suite), click/Enter on a row calls `onSelect(pageId)`, Escape and outside-click call `onClose`. `ContextMenuHost`/`App`-level coverage for the visibility rule: item hidden for multi-select, grouped, framed, or bound elements, and hidden with only one page; shown otherwise; clicking it opens the flyout instead of immediately closing the whole menu.

E2E (`apps/web/e2e/move-to-page.spec.ts`, new): right-click an eligible element → "Move to page" appears → click it → flyout lists the other pages → click a target page → element disappears from the source page, view switches to the destination page, element appears there and is selected, source page's tab-bar thumbnail updates. Negative check: item absent for a grouped/bound/multi-selected element or when only one page exists.

Full gate (`typecheck`, `test`, `format:check`, `lint`) before merge, per this repo's established convention.

## Out of scope (follow-up candidates)

- Multi-element, grouped, framed, or bound-element moves (would need a closure-expansion policy and a binding-boundary decision — deferred, not designed here)
- Cross-page atomic undo
- Copy-to-page (distinct semantics from move, not addressed)
- Any other context-menu follow-up from `2026-08-02-context-menu-design.md` (submenus, editing-time context menu, custom/configurable items) — unrelated to this pass
