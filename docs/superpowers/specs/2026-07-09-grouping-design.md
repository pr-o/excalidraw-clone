# Grouping (Flat) — Design

**Date:** 2026-07-09
**Status:** Approved
**Feature:** Group/ungroup elements so they select and move as one unit.

## Goals

- Group two or more selected elements so that clicking or marquee-touching any
  member selects (and drags) the whole group.
- Ungroup restores independent selection.
- Double-click drills into a group to select a single member for individual
  styling, dragging, or resizing.
- Standard shortcuts: `Ctrl/Cmd+G` group, `Ctrl/Cmd+Shift+G` ungroup. Grid
  toggle moves from `Ctrl+Shift+G` to `Ctrl/Cmd+'` (upstream Excalidraw's
  binding).
- Fix the latent clone bug: duplicated/placed grouped elements must not share
  group ids with their source.

## Non-goals (v1)

- Nested groups (group containing groups).
- Group-level resize/rotate (handles remain single-element only).
- A combined dashed selection outline in the renderer.
- Any export/render change — groups are invisible; there is nothing to draw.

## Data model

No schema change. `groupIds: readonly string[]` already exists on every
`ExcalidrawElement` (currently always empty). **Flat rule:** the array holds at
most one id; elements sharing that id form one group. The array form stays
wire-compatible with upstream Excalidraw and permits nesting later.

## Architecture

Follows the align/distribute precedent exactly: pure geometry/membership
helpers in `packages/scene`, selection semantics in the `packages/tools`
selection reducer, wiring in `App.tsx` via `scene.mutate`, buttons in
`packages/ui` PropertiesPanel, shortcuts in `apps/web/src/keyboard/shortcuts.ts`.

### 1. Scene operations — new `packages/scene/src/groups.ts`

Three pure functions (exported from the scene index):

- `expandIdsToGroups(ids, elements): string[]` — returns the input ids plus
  every non-deleted element that shares a group id with any of them. Single
  source of truth for "selection includes whole groups". Preserves scene order,
  no duplicates.
- `groupElements(elements, ids, groupId): ExcalidrawElement[]` — each element
  whose id is in `ids` gets `groupIds: [groupId]`, overwriting any prior
  membership (regrouping absorbs). Returns elements unchanged (same references)
  when fewer than 2 ids match. The caller supplies the fresh
  `crypto.randomUUID()` so the function stays deterministic and testable.
- `ungroupElements(elements, ids): ExcalidrawElement[]` — sets `groupIds: []`
  on each element whose id is in `ids`.

Applied through `scene.mutate`, so undo/redo works via scene history and
bound-text/binding reconciliation runs automatically.

### 2. Selection semantics — `packages/tools` selection reducer (`reduceIdle`)

The reducer already receives elements via `ctx.readElements()` and emits
`{ kind: "select" | "addToSelection", ids }` effects. Changes, all in
`reduceIdle` (tools may import `expandIdsToGroups` from
`@excalidraw-clone/scene`, as it already imports `bindingTargetAt`):

- **pointerDown on an unselected element:** select
  `expandIdsToGroups([hit.id])` instead of `[hit.id]`; `movedIds` uses the
  expanded set so the ensuing drag moves the whole group. Shift-click adds the
  expanded set. pointerDown on an already-selected element is unchanged (drags
  the current selection — this is what makes drill-in "sticky" during a drag).
- **Marquee pointerUp:** expand `enclosed` through `expandIdsToGroups` —
  touching one member selects the whole group.
- **doubleClick (drill-in):** if the hit element has a group AND is not already
  the sole selection → emit `select [hit.id]` (drill in) and stop. Otherwise
  fall through to today's text-edit behavior. On a grouped sticky note: first
  double-click drills in, second opens the text editor. Flat groups make
  drill-in stateless — no new state-machine phase.

Resize/rotate/endpoint/bend handles already gate on single-selected elements
and are untouched; a drilled-in member gets them naturally.

### 3. Clone fix — `packages/scene/src/clone.ts`

`cloneElementsWithNewIds` gains a group-id remap: build a lazy map of each
distinct old group id → one fresh uuid, and rewrite every cloned element's
`groupIds` through it. Fixes the latent bug where placing a grouped library
item or template twice would merge both copies into a single group.

### 4. UI — PropertiesPanel Group section (`packages/ui`)

New **Group** section rendered above Arrange, using the existing Section/button
pattern:

- **Group** button — enabled when ≥2 elements are selected.
- **Ungroup** button — enabled when any selected element has a non-empty
  `groupIds`.
- New props: `onGroup: () => void`, `onUngroup: () => void`. Enablement derives
  from the selected elements the panel already receives.

### 5. Wiring — `apps/web/src/components/App.tsx`

Handlers mirror align/distribute:

- `onGroup`: compute
  `groupElements(selectedElements, selectedIds, crypto.randomUUID())`, index
  the results by id, then merge into the draft inside `scene.mutate` — the
  exact patch-by-id pattern the `onAlign`/`onDistribute` handlers use
  (App.tsx:334–341). Selection unchanged.
- `onUngroup`: same shape with `ungroupElements(selectedElements, selectedIds)`;
  selection unchanged.

### 6. Shortcuts — `apps/web/src/keyboard/shortcuts.ts`

- `Ctrl/Cmd+Shift+G` → ungroup selection (replaces grid toggle; this branch
  already precedes the plain-G check).
- `Ctrl/Cmd+G` → group selection (≥2 selected, else no-op).
- `Ctrl/Cmd+'` → `toggleGrid()`.
- Help dialog / shortcut listing text updated to match.

### 7. i18n — `apps/web/src/locales` (en, ko)

`properties.group`, `properties.ungroup`, and the updated grid-shortcut label
wherever the help dialog lists it.

## Edge cases

- **Deleting/erasing a member:** group persists among the remainder. A
  1-member group is harmless (click/drag behave as ungrouped); Ungroup clears
  it. No auto-dissolve in v1.
- **Grouping already-grouped elements:** old membership is overwritten — the
  new group absorbs the members (flat-model consequence).
- **Bound text on grouped containers:** not added to groups. Hit-test already
  skips bound text; `scene.mutate` reconciliation keeps it glued to its
  container during group drags. Group-then-delete flows inherit existing
  container/bound-text behavior.
- **Escape:** clears selection as today; no drill-out step exists in a flat
  model.
- **Library/template placement and future duplication:** covered by the clone
  group-id remap.

## Error handling

All operations are no-ops rather than errors: group with <2 selected does
nothing; ungroup with no grouped selection does nothing; expansion of unknown
ids passes them through. UI buttons are disabled in exactly those states, so
the no-ops are only reachable via shortcuts.

## Testing

- **Scene unit tests** (`packages/scene/test/groups.test.ts`):
  group/ungroup/expand happy paths, <2-element no-op, absorb-on-regroup,
  deleted elements excluded from expansion; `clone` test extended for group-id
  remapping (distinct clones get distinct group ids, shared membership
  preserved within one clone set).
- **Tools unit tests** (selection reducer): click on member selects whole
  group; shift-click adds whole group; marquee touching one member selects
  group; double-click drills in to member; double-click on drilled-in note
  member reaches text edit; drag after group-click moves all members.
- **UI unit test** (PropertiesPanel): Group disabled <2 selected; Ungroup
  disabled when nothing grouped; callbacks fire.
- **E2E** (`apps/web/e2e/group.spec.ts`): draw two rects → Ctrl+G → click one
  and drag → both move; Ctrl+Shift+G → drag moves only one; Ctrl+' still
  toggles the grid.
