# Design: Element locking — inert elements with click-through and global unlock

**Date:** 2026-07-13
**Status:** Approved
**Approach:** Enforce at interaction boundaries (Approach A); click-through + Unlock All UX

## Background

`locked: boolean` already exists on `ExcalidrawElementBase`
(`packages/scene/src/types.ts:74`) and every factory defaults it to `false`
(`packages/scene/src/factories.ts:67`), so the field round-trips through
persistence and `.excalidraw` files today. Nothing enforces it — the same
"scaffolded but unwired" state `groupIds` was in before the grouping feature.

Decisions made during brainstorming:

- **Click-through + Unlock All.** Locked elements are fully inert: pointer
  interactions pass through to elements beneath. Unlocking is global, not
  per-element. Rejected: upstream-style padlock badge on click (needs a new
  overlay interaction state) and Alt+click unlock (undiscoverable).
- **Lock via shortcut + panel + palette.** `Ctrl+Shift+L` locks the current
  selection; a Lock button in the properties panel; "Lock selection" /
  "Unlock all elements" commands in the palette; plus a floating "Unlock all"
  button whenever locked elements exist.
- **Enforce at interaction boundaries** (Approach A), not inside the
  selection state machine (Approach B — touches every phase of the largest
  state machine in the codebase and is easy to miss a path).

## 1. Semantics

- Locked elements render normally (canvas, SVG, PNG — no visual difference)
  and keep their z-order. There is no lock indicator on the canvas.
- Locked elements cannot be: clicked/selected, marquee-selected, dragged,
  resized, rotated, erased, bound to by new arrows, or picked by select-all.
- Locking operates per element. Locking a selection containing group members
  locks each member individually; group-click can't re-select them until
  unlocked (group expansion starts from a hit, and hits skip locked).
- Non-pointer operations are unaffected: undo/redo, hydration, file open,
  export, and existing arrow bindings to a now-locked element keep working
  (reconciliation still moves bound arrow endpoints if a locked element's
  bound partner moves; the locked element itself never moves).
- Locking clears the locked ids from the current selection — they are no
  longer selectable, so leaving them selected would strand ghost handles.

## 2. Scene helpers

New file `packages/scene/src/locking.ts`, following the
`groupElements`/`ungroupElements` patch-array pattern:

```ts
lockElements(elements: readonly ExcalidrawElement[], ids: readonly string[]): readonly ExcalidrawElement[]
unlockAll(elements: readonly ExcalidrawElement[]): readonly ExcalidrawElement[]
```

Both return **patch arrays** (only changed elements, with `locked` flipped,
new `versionNonce`, bumped `updated`) that callers apply via the existing
`patchScene` idiom in `apps/web/src/keyboard/shortcuts.ts`. `lockElements`
skips ids already locked or deleted; `unlockAll` returns patches for every
non-deleted locked element. Export both from `packages/scene/src/index.ts`.

## 3. Enforcement points

All four are one-line `locked` skips at existing filters:

1. **Driver hit-test** — `apps/web/src/driver/useDrawingDriver.ts` (~line
   140): the top-down loop already skips bound text
   (`el.type === "text" && el.containerId !== null`); add
   `if (el.locked) continue`. This single change covers selection clicks,
   selection drags, **and the eraser** (both its pointerDown and pointerMove
   paths call `ctx.hitTest`).
2. **Marquee** — `packages/tools/src/tools/selection/marquee.ts`
   `elementsInsideMarquee`: alongside `if (e.isDeleted) continue`, add
   `if (e.locked) continue`.
3. **Arrow binding** — `packages/scene/src/bindings.ts` `canBindTo`
   (line 24): `!el.isDeleted && !el.locked && BINDABLE_TYPES.has(el.type)`.
   Existing bindings created before locking are untouched.
4. **Select-all** — `apps/web/src/components/PaletteHost.tsx` `select-all`
   command currently maps every element id; filter to
   `!e.isDeleted && !e.locked`.

Handle hit-testing (resize/rotate/endpoint) needs no change: handles only
appear for selected elements, and locked elements can never become selected.
The keyboard Delete handler operates on `selectedIds`, so it is safe for the
same reason.

## 4. UI surfaces

- **Shortcut** — in `apps/web/src/keyboard/shortcuts.ts`, `Ctrl+Shift+L`:
  `patchScene(scene, lockElements(scene.getElements(), selectedIds))` then
  `setSelection([])`. No-op when nothing is selected. (Ctrl+L stays free;
  browsers own it.)
- **Properties panel** — new `onLock: () => void` prop on `PropertiesPanel`
  (`packages/ui`), rendered as a full-width button (testid `panel-lock`) in
  the Arrange section area; App.tsx wires it to the same lock+deselect flow.
  The panel only shows when a selection exists, which is exactly when Lock
  is meaningful.
- **Command palette** — `PaletteHost.tsx` gains `lock-selection` (hint
  `Ctrl+Shift+L`, no-op when selection empty) and `unlock-all` commands.
- **Floating Unlock-all** — small button fixed bottom-left in App.tsx
  (corner is currently unoccupied), testid `unlock-all`, rendered only when
  `scene` contains a non-deleted locked element (recomputed via the existing
  `useSceneRevision` hook) and not in zen mode. Clicking applies
  `unlockAll` patches. This keeps unlocking discoverable without a context
  menu.
- **i18n** — new keys in `en`/`ko` `common.json`: `properties.lock`,
  `palette.lockSelection`, `palette.unlockAll`, `canvas.unlockAll` (floating
  button label/aria).

## 5. Testing

- **Scene unit** — `packages/scene/test/locking.test.ts`: patch semantics
  (only requested ids, versionNonce bumped, deleted skipped, unlockAll finds
  all locked), immutability of inputs.
- **Tools unit** — marquee skips locked; eraser via a `ctx.hitTest` stub that
  honors locked (mirrors driver behavior); `canBindTo` rejects locked.
- **Web unit** — shortcut test: Ctrl+Shift+L patches scene and clears
  selection (existing shortcuts test file pattern).
- **UI unit** — PropertiesPanel renders Lock button and fires `onLock`.
- **e2e** — `apps/web/e2e/locking.spec.ts`: draw two overlapping rects, lock
  the top one via panel button → click at the overlap selects the bottom
  one; marquee over both selects only the unlocked one; floating Unlock-all
  appears, click it → element selectable again; lock persists across reload
  (draw, lock, reload, click hits nothing where the locked element is).

## Out of scope

Per-element unlock UX (padlock badge), lock indicators on canvas, locking
entire frames as containers, and any context-menu work.
