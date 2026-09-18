# Stats/Dimensions Panel — Design

**Date:** 2026-09-18
**Status:** Approved
**Scope:** A toggleable bottom-left panel (Alt+/, matching real Excalidraw) showing live x/y/width/height/angle for a single selected element (editable via typed commit), a read-only combined bounding box for a multi-element selection, and scene-level element count when nothing is selected. No group-scale/group-move transform, no new toolbar button.

## Problem

The app has no way to inspect or precisely set an element's numeric geometry — position, size, rotation are mouse-drag-only via the resize/rotate handles in `packages/tools/src/tools/selection/{resize,rotate}.ts`. Real Excalidraw's stats panel (Alt+/) fills this gap. A codebase audit found the app otherwise already covers most of real Excalidraw's surface (shapes, freedraw, eraser, images, frames, library, layers panel, presentation mode, hyperlinks, PNG/SVG/`.excalidraw` export/import) — stats display, smart alignment guides, and comments were the three gaps identified; the user picked stats for this pass.

Two structural facts shaped scope:

- **No multi-element group-scale transform exists.** `resize.ts`'s `computeResize`/`buildResizeMoveEffect` operate on a single `elementId`; there is no "scale N elements together from one bounding box" logic anywhere (align/distribute reposition elements individually, they don't scale). Making a multi-select stats box editable would mean building that transform from scratch — out of scope for this spec (see Out of scope).
- **A rotation-aware multi-element bounding box already exists.** `packages/scene/src/bounds.ts`'s `getElementsBounds(elements)` returns the AABB of a set of elements, already used elsewhere in the codebase. The multi-select read-only box reuses this directly — no new geometry work.

## Decisions

- **New pure component `StatsPanel.tsx` in `packages/ui`**, shaped like `LayersPanel`/`PropertiesPanel` (props in, callbacks out, no store access inside). Rendered in `App.tsx` at a fixed bottom-left position, mirroring real Excalidraw's convention (`PropertiesPanel` is top-right, `Toolbar` top-center, `LayersPanel` left).
- **Visibility: local `useState` (`statsOpen`), toggled only by Alt+/.** No toolbar button — matches real Excalidraw, where the stats panel is keyboard-only. Discoverable via a new entry in `HelpDialog.tsx` and the `en`/`ko` `shortcuts.json` locale files.
- **New pure function `computeStats(selectedElements, allElements)` in `packages/scene/src/stats.ts`** (alongside `bounds.ts`, since it composes `getElementsBounds`), returning a discriminated union:
  ```ts
  type Stats =
    | { kind: "scene"; elementCount: number }
    | {
        kind: "single"
        id: string
        x: number
        y: number
        width: number
        height: number
        angleDeg: number
      }
    | { kind: "multi"; count: number; x: number; y: number; width: number; height: number }
  ```
  `"scene"` is `allElements.filter(e => !e.isDeleted).length` (nothing selected — selected-count of 0 falls out naturally). `"single"` converts the stored radians to `angleDeg` for display (`angle * 180 / Math.PI`); the underlying element value stays radians. `"multi"` is `getElementsBounds(selectedElements)` with no angle field (a rotated group's box isn't meaningfully "one angle").
- **Editing is single-selection only.** `StatsPanel` takes `stats: Stats` and `onChange(patch: Partial<Pick<ExcalidrawElement, "x"|"y"|"width"|"height"|"angle">>)`, fired only in the `"single"` case; inputs are disabled/read-only for `"multi"` and `"scene"`. `onChange` converts a typed `angleDeg` back to radians before calling the callback.
- **Commit semantics: onBlur/Enter, not per-keystroke** — mirrors `PagesTabBar`'s rename-input pattern (the only existing `onBlur`-commit precedent in the codebase). Local edit state holds the in-progress typed value; Escape reverts to the live value without committing. One commit = one `scene.mutate` call = one undo-history entry, consistent with how other discrete edits (rename, style changes) behave.
- **Validation: width/height clamp to a minimum of 1** (typed `0`/negative can't collapse or invert the element); x/y/angle are unconstrained. No aspect-ratio lock on typed edits — that's a resize-drag-only, Shift-modifier behavior (`resize.ts`) and doesn't apply to direct numeric entry.
- **Keyboard wiring**: add `onToggleStats?: () => void` to the `Bindings` interface in `apps/web/src/keyboard/shortcuts.ts`, mirroring the existing `onNextPage`/`onPrevPage` shape. In the handler: `if (e.altKey && key === "/") { e.preventDefault(); onToggleStats?.(); return }` (placed alongside the other top-level shortcut checks). `App.tsx` adds `const [statsOpen, setStatsOpen] = useState(false)` and passes `onToggleStats: () => setStatsOpen((v) => !v)` into the existing `attachShortcuts({...})` call.
- **`stats.toggle` / `stats.title` locale strings** added to `en`/`ko` `shortcuts.json` and `common.json` as needed, alongside existing shortcut-help entries.

## Testing

Unit TDD: `stats.test.ts` (new, `packages/scene/test`) covering `computeStats`'s three cases — scene count with nothing selected, single-element field values and radians→degrees conversion, multi-select bounding box (including a rotated-element case, verifying it matches `getElementsBounds` directly). `StatsPanel.test.tsx` (new, `packages/ui`) for the commit-on-blur/Enter/Escape-revert behavior and the width/height minimum-1 clamp, mirroring `PagesTabBar.test.tsx`'s existing rename-input test shape.

E2E (`apps/web/e2e/stats-panel.spec.ts`, new): Alt+/ toggles the panel open/closed; selecting one rectangle shows its x/y/width/height/angle, typing a new width and blurring updates the element on canvas and persists; selecting two elements shows a read-only combined box (inputs disabled, no commit possible); deselecting shows the scene element count.

Full gate (`typecheck`, `test`, `format:check`, `lint`) before merge, per this repo's established convention.

## Out of scope (follow-up candidates)

- Multi-select group-scale/group-move (editable multi-select bounding box) — needs a new transform subsystem, not designed here; flagged to and declined by the user for this pass.
- Smart/alignment guides while dragging and comments/annotations — the other two gaps identified in the audit, not picked for this pass.
- A toolbar button/menu entry for toggling the panel (keyboard-only, matching real Excalidraw).
- Unit conversion beyond degrees for angle (e.g. displaying width/height in units other than the canvas's native pixels).
