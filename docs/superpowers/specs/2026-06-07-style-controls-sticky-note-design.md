# v1.4 — Style Controls + Sticky Note

**Status:** Design approved, awaiting spec review
**Date:** 2026-06-07
**Backlog item:** v2 direction #2 ("more shape variants"), bundling a slice of latent-field
surfacing (#1-style) with one genuinely new element type.

## Goal

Deliver visible shape variety in one cohesive release:

1. **Style controls** — surface three latent element fields (`strokeStyle`, `fillStyle`,
   `roundness`) into the `PropertiesPanel` and teach the renderer to honor the two it
   currently ignores.
2. **Sticky note** — a new `note` element built on a minimal **bound-text-in-container**
   subsystem: a box you type into, whose text stays centered and follows the box on
   move / resize / delete.

Explicitly steered away from binding connectors / re-routing (their own future release).

## Background — current state (verified 2026-06-07)

- `packages/scene/src/types.ts` already defines `StrokeStyle = solid|dashed|dotted`,
  `FillStyle = hachure|cross-hatch|solid`, `Roundness = {type:1|2}|null`, and 10
  `Arrowhead` variants. Every element carries `strokeStyle`, `fillStyle`, `roundness`.
- `PropertiesPanel.tsx` exposes only: stroke color, background, stroke width, opacity,
  layers, actions. The style fields above are **unreachable** from the UI.
- Renderer reality:
  - `fillStyle` — **already drawn** (rect/ellipse/diamond `*Options` pass it to rough.js).
  - `strokeStyle` — **never passed** to rough.js → dashed/dotted does not render.
  - `roundness` — **ignored**; rectangle uses sharp `gen.rectangle`.
- `containerId` (on text) and `boundElements` (on containers) exist in the model + factory
  but **nothing implements bound-text behavior** — no centering, no move/resize/delete
  cascade. This is the subsystem this release builds.
- The text renderer (`shapes/text.ts`) already honors `textAlign:"center"` +
  `verticalAlign:"middle"` off `e.width`/`e.height`, so centered rendering is free once a
  bound text element is sized to its container.
- `Scene.mutate(fn)` (`scene.ts:49`) is the single mutation chokepoint:
  `const draft=[...elements]; fn(draft); setElements(draft)`. `normalize.ts`
  (`normalizeToOrigin`) is an existing precedent for a post-mutation normalization pass.
- Tool shortcut map `TOOL_KEYS` (`apps/web/src/keyboard/shortcuts.ts:10`) uses
  v/r/o/d/l/a/p/t/9/e/f — **`n` is free**.

## Decisions

- **Auto-wrap: OUT.** MVP sticky note is a fixed box with centered, manually-line-broken
  text (matches pre-wrap Excalidraw). Auto-wrap + container auto-grow is a follow-up
  release (needs canvas text measurement in the layout path).
- **Shortcut: `n`** → `note` tool.
- **Style controls edit the current selection only** — matching the panel's existing
  behavior (`PropertiesPanel` returns `null` with no selection; every row just calls
  `onChange({...})` on the selected elements). New shapes keep using their factory
  defaults; a "next-shape default" mechanism does not exist today and is out of scope.

---

## Section 1 — Style controls

Three new segmented-toggle rows in `PropertiesPanel.tsx`, modeled on the existing stroke
width row (which already uses `commonValue` for mixed-selection blanking).

| Control        | Field         | Values (UI → model)                 | Renderer work                         |
| -------------- | ------------- | ----------------------------------- | ------------------------------------- |
| Stroke style   | `strokeStyle` | solid / dashed / dotted             | add `strokeLineDash` to rough options |
| Fill style     | `fillStyle`   | hachure / cross-hatch / solid       | none (already drawn)                  |
| Edge roundness | `roundness`   | sharp (`null`) / round (`{type:1}`) | rounded-rect path                     |

### Renderer changes

- `strokeLineDash` mapping (shared constant): solid → `[]`, dashed → `[8,8]`,
  dotted → `[2,6]`. Add to the `Options` returned by `rectangleOptions`, `ellipseOptions`,
  `diamondOptions`, and the linear (`line`/`arrow`) option builders. rough.js honors
  `strokeLineDash` natively.
- Rounded rectangle: when `e.roundness !== null`, replace `gen.rectangle(...)` with a
  rounded path (`gen.path(...)` describing a rect with corner radius). Radius derived from
  box size (clamped, e.g. `min(width,height,32)*0.25`). `roundness:null` keeps the current
  sharp path. (Ellipse/diamond ignore roundness — unchanged.)

### UI changes

- New rows wired through `commonValue<StrokeStyle>` / `commonValue<FillStyle>` /
  `commonValue<Roundness>` so a mixed selection shows no active segment.
- New i18n keys under `properties.*` in `en` + `ko` (`strokeStyle`, `fillStyle`,
  `roundness`, and per-value labels).
- Each row calls `onChange({...})` on the selected elements, exactly like the stroke-width
  row. The panel only renders when a selection exists, so there is no no-selection state to
  handle.

---

## Section 2 — Bound-text invariant (`reconcileBoundText`)

One pure function in `packages/scene` (sibling to `normalize.ts`), called inside
`Scene.mutate` immediately after `fn(draft)` and before `setElements`:

```
reconcileBoundText(draft: ExcalidrawElement[]): void   // in-place on the draft array
```

For each non-deleted **container** (element with `boundElements` referencing a text) and
its bound text child:

1. **Geometry sync** — set the text element's box to the container box minus a fixed
   `NOTE_PADDING` (e.g. 8px each side): `x = c.x + p`, `y = c.y + p`,
   `width = max(0, c.width - 2p)`, `height = max(0, c.height - 2p)`. Force
   `textAlign:"center"`, `verticalAlign:"middle"`.
2. **Delete cascade** — if the container is `isDeleted`, mark the bound text `isDeleted`.

Guarantees:

- **Move / resize need zero new code** — both end as `mutate` calls that change the
  container box; the text re-derives. `drag.ts`, `resize.ts`, selection internals untouched.
- **Content is never touched** — reconcile only writes geometry / `isDeleted`, so text
  editing is unaffected.
- Idempotent and O(n); safe to run on every mutation.

Edge cases: orphaned references (bound id missing) are skipped; a text whose container is
gone is left as-is (becomes a free text element — acceptable for MVP).

---

## Section 3 — Sticky note: tool, rendering, editing

### Tool (`packages/tools/src/tools/note.ts`)

- New `note` entry in `ToolName`, `registry.ts`, and `index.ts` exports.
- Drag-to-size via the existing `shapeReduce`, but the factory produces **two** elements:
  - a rectangle: default yellow `backgroundColor`, `roundness:{type:1}`, `boundElements:
[{id: textId, type:"text"}]`;
  - a bound `text`: `containerId = rectId`, `text:""`, centered/middle align. Its box is
    set by `reconcileBoundText` on the first commit.
- On `pointerUp` (non-zero box): emit the rect+text mutation, `select` the container,
  `switchTool: selection`, and `startTextEdit` on the text child. Zero-size drag → discard
  both (mirror `shapeReduce`'s empty-box path).
- `shapeReduce` currently assumes a single element id in its state; the note tool either
  (a) extends a small variant that tracks the container id and lets reconcile attach the
  text, or (b) wraps `shapeReduce` driving the container and creates the text in the same
  factory push. Implementation plan picks the cleaner of the two during TDD.

### Rendering

No new shape renderer. Container draws as a rounded rect (Section 1); bound text draws as a
normal centered text element. `reconcileBoundText` keeps them aligned.

### Editing

- `TextEditingOverlay` already positions off the text element's box, which reconcile glues
  to the container — overlay works unchanged.
- Double-click: extend the existing selection `doubleClick` text path so a hit on a
  container resolves to its bound text id before emitting `startTextEdit`.

### Toolbar + shortcut + help

- Toolbar button in the UI package (follow the existing tool-button pattern).
- `n: "note"` in `TOOL_KEYS`.
- `en` + `ko` labels for the toolbar/tooltip and a HelpDialog row.

---

## Section 4 — Testing

- **scene:** `reconcileBoundText` unit tests — geometry sync, delete cascade, no-op when no
  bound text, content untouched, idempotency, orphan handling.
- **tools:** `note` reducer — creates two linked elements, emits `startTextEdit`,
  discards zero-size; selection drag/resize/delete tests asserting the text follows
  (exercise the invariant through `mutate`).
- **renderer:** dashed/dotted `strokeLineDash` in shape options; rounded-rect path vs sharp.
- **ui:** `PropertiesPanel` — three new toggle rows incl. mixed-selection blank state.
- **e2e (Playwright):** draw a sticky note → type → move it → text follows; toggle a shape
  to dashed and confirm it persists.

## Files touched (anticipated)

- `packages/scene/src/`: `reconcile-bound-text.ts` (new), `scene.ts` (call in `mutate`),
  `index.ts` (export).
- `packages/renderer/src/shapes/`: `rectangle.ts` (rounded path + dash), `ellipse.ts`,
  `diamond.ts`, `arrow.ts`, line options (dash); shared `stroke-dash.ts` constant.
- `packages/tools/src/`: `tools/note.ts` (new), `registry.ts`, `types.ts` (ToolName),
  `index.ts`.
- `packages/scene/src/factories.ts`: `newNote` helper (rect + text pair) if cleaner than
  inline.
- `packages/ui/src/PropertiesPanel.tsx`: three rows; toolbar note button.
- `apps/web/src/keyboard/shortcuts.ts`: `n`.
- `apps/web/src/components/`: selection double-click → container's bound text.
- i18n `en`/`ko` JSON; HelpDialog row.
- Tests across scene/tools/renderer/ui + Playwright e2e.

## Out of scope (future)

- Auto-wrap of bound text + container auto-grow.
- Arrowhead picker (the other latent field; deferred with binding connectors).
- Binding connectors / re-routing.
