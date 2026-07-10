# Design: Arrowhead Variants

**Date:** 2026-07-10
**Status:** Approved
**Backlog:** closes the remaining slice of v2 backlog item #2 (more shape variants)

## Problem

The scene schema has been ahead of the product since v1.5: `Arrowhead` in
`packages/scene/src/types.ts` defines 8 kinds (`arrow`, `bar`, `dot`, `circle`,
`cross`, `triangle`, `diamond`, `triangle_outline`) and every linear element
carries nullable `startArrowhead` / `endArrowhead` fields — but:

- the renderer (`packages/renderer/src/shapes/arrow.ts`) only checks _presence_
  and always draws the same open V-chevron, ignoring the kind;
- `line.ts` ignores the fields entirely, even though lines carry them;
- no UI exists to set either field.

## Scope decisions (user-confirmed)

- Render **all 8 schema kinds** — no dead schema values remain.
- Picker exposes **None** (null) plus the 8 kinds, for **both Start and End**.
- Feature covers **arrows and lines** (a line with an end arrowhead is a
  straight connector, matching upstream Excalidraw).
- **No schema or factory changes.** Defaults stay: arrow = end `"arrow"` /
  start `null`; line = both `null`. Existing serialized scenes are unaffected.
- No changes to next-shape defaults: the picker edits the current selection
  only (consistent with the v1.4 style-controls decision).

## Architecture (Approach A — dedicated renderer module)

### 1. Renderer: `packages/renderer/src/shapes/arrowheads.ts` (new)

```ts
export const arrowheadDrawables = (
  kind: Arrowhead,
  tip: RoughPoint,
  prev: RoughPoint,
  gen: RoughGenerator,
  opts: Options,
): readonly Drawable[]
```

Pure function; a switch over the 8 kinds. Geometry is derived from the tip
point and the angle from `prev` toward `tip` (`Math.atan2`), reusing the
existing constants `ARROWHEAD_LENGTH = 20` and `ARROWHEAD_ANGLE = Math.PI / 6`
(moved into this module).

| Kind               | Geometry                                                                                   | Fill                       |
| ------------------ | ------------------------------------------------------------------------------------------ | -------------------------- |
| `arrow`            | open V-chevron via `linearPath` (current behavior, default)                                | stroke only                |
| `triangle`         | closed triangle via `polygon`, base behind tip                                             | solid fill in stroke color |
| `triangle_outline` | same triangle                                                                              | stroke only                |
| `bar`              | segment perpendicular to shaft, centered at tip, total length ARROWHEAD_LENGTH             | stroke only                |
| `dot`              | circle centered on tip, diameter 0.6 · ARROWHEAD_LENGTH                                    | solid fill in stroke color |
| `circle`           | same circle                                                                                | stroke only                |
| `cross`            | X of two segments centered on tip, each of total length ARROWHEAD_LENGTH, at ±45° to shaft | stroke only                |
| `diamond`          | rhombus via `polygon`, far vertex at tip                                                   | solid fill in stroke color |

Filled kinds pass `{ ...opts, fill: opts.stroke, fillStyle: "solid" }`.
All kinds inherit `strokeLineDash` already present in `opts` (dashed arrows get
dashed heads — same tradeoff as today's chevron; acceptable).

Callers:

- `arrow.ts`: delete the private `arrowhead()` helper; call
  `arrowheadDrawables(e.endArrowhead, tip, prev, gen, opts)` /
  `(e.startArrowhead, tip, next, ...)` under the existing presence checks.
- `line.ts`: add the same two presence-checked blocks. Requires
  `e.points.length >= 2` (already guarded).

### 2. UI: "Arrowheads" section in `packages/ui/src/PropertiesPanel.tsx`

- Rendered **only when every selected element is a `line` or `arrow`**
  (`selectedElements.every(e => e.type === "line" || e.type === "arrow")`),
  so the `onChange` patch can never touch non-linear elements.
- Two rows inside one `<Section label={t("properties.arrowheads")}>`:
  Start and End. Each row: 9 compact buttons — None + 8 kinds.
- Buttons carry inline SVG glyphs (16×16 viewBox, `currentColor`), with
  `title` and `aria-label` from i18n, and `aria-pressed` driven by
  `commonValue<Arrowhead | null>(selected, "startArrowhead" | "endArrowhead")`.
  Mixed values → no button pressed (existing `commonValue` semantics).
- Click → existing `onChange({ startArrowhead: kind })` /
  `onChange({ endArrowhead: kind })` patch path (kind is `null` for None).
  **No new props; no App.tsx changes** — the generic patch flow already
  applies to all selected elements and triggers scene revision.

### 3. i18n

`apps/web/src/locales/{en,ko}/common.json` gain:
`properties.arrowheads`, `properties.arrowheadStart`, `properties.arrowheadEnd`,
`properties.arrowhead_none`, and `properties.arrowhead_<kind>` for the 8 kinds.
The `packages/ui` tests use the raw-key `t` stub convention (t: key => key).
No shortcut changes → HelpDialog and shortcuts.json untouched.

### 4. Testing

- **Renderer** (`packages/renderer/test/arrowheads.test.ts`, new): for each of
  the 8 kinds — non-empty drawables, expected rough shape (`linearPath` /
  `polygon` / `circle` / `line`), filled kinds carry `fill === stroke` +
  `fillStyle: "solid"`, outline kinds carry no fill. Plus: `arrow.ts` renders
  start+end heads; `line.ts` renders heads when fields set and none when null.
- **UI** (`PropertiesPanel.test.tsx`): section hidden when selection includes a
  non-linear element; visible for all-linear selection; clicking a kind fires
  `onChange` with the right patch; `aria-pressed` reflects the common value;
  None button patches `null`.
- **e2e** (`apps/web/e2e/arrowheads.spec.ts`, new): draw an arrow, select it,
  click a start-arrowhead button in the panel, assert the persisted element in
  `localStorage["excalidraw-scene"]` has that `startArrowhead` and the default
  `endArrowhead: "arrow"`.
- Full monorepo gate before merge: typecheck / test / lint / build / e2e.

## Execution

Same SDD pipeline as the grouping feature: spec + implementation plan written
inline (Fable 5), implementation dispatched to Opus subagents task-by-task with
review gates, commits on `develop`, whole-branch review, then merge to `main`.
