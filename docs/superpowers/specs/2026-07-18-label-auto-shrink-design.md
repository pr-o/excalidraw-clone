# Label Auto-Shrink (Fit Shape Labels to Their Container) — Design

**Date:** 2026-07-18
**Status:** Approved
**Scope:** Shape labels that are too long shrink at render time so the text always fits inside its container's inner box, in both canvas rendering and SVG export. Scene data is never modified.

## Problem

Shape labels (shipped `7b7b551`) are reconciled to a fixed shape-aware inner box, but `drawText` does no wrapping or fitting — a long label overflows the shape outline symmetrically. Arrow labels (shipped `40361c2`) sidestep this with an occlusion backing, but a rectangle labeled "Reticulating splines since 2026" simply spills out of the rectangle.

## Decisions

- **Mechanism: render-time scale.** The renderer computes an effective font size when drawing; the stored `fontSize` is untouched. No data migration, invisible to undo, and container resizes re-fit automatically on the next frame. (Rejected: persisting a recomputed `fontSize` on commit/resize — the scene package has no canvas to measure with, and it mutates user data.)
- **No minimum size.** Text always fits, however small it gets. The invariant "labels never cross the outline" stays absolute; an unreadably tiny label is an honest signal to enlarge the shape.
- **Editing overlay unchanged.** The textarea edits at natural size; the shrink applies when the canvas draws the committed text. The overlay is already an approximation (no centering, no alignment parity).
- **Shape labels only.** Applies to text bound to a `LABELABLE_TYPES` container. Arrow/line labels (zero-width box, midpoint-pinned, occlusion-backed) and standalone text are excluded.

## Design

### Core rule

For a fitting label with lines measured at the natural font size:

```
scale = min(1, boxWidth / widestLineWidth, boxHeight / totalTextHeight)
effectiveFontSize = fontSize × scale
```

Text metrics scale linearly with font size, so one measurement at the natural size suffices. Because `reconcileBoundText` keeps shape labels sized to exactly the inner box, the fit box is the label's own `width`/`height` — no container geometry needed at draw time. When the text already fits, `scale` is 1 and rendering is byte-identical to today. Empty text draws nothing (unchanged early return).

### Canvas path (`packages/renderer/src/shapes/text.ts`, `draw-element.ts`, `renderer.ts`)

- `drawText`'s trailing `occlude?: TextOcclusion` parameter is consolidated into `opts?: { occlude?: TextOcclusion; fit?: boolean }` (call sites: `draw-element.ts` and the occlusion unit tests). When `fit` is set and scale < 1: set the font to the effective size, and scale the per-line height (`effectiveFontSize × lineHeight`) so multi-line labels stay centered in the box via the existing `verticalOffset`/`horizontalOffset` math.
- `drawElement`'s trailing `labelOcclusionBg?: string` parameter (one call site) is consolidated into `labelOpts?: { occlusionBg?: string; fit?: boolean }` and passed through to `drawText` — a targeted cleanup instead of stacking a second positional optional.
- `CanvasRenderer.render()` already resolves each text element's container (built for arrow labels): a `LINEAR_LABELABLE_TYPES` container yields `{ occlusionBg }` as today; a `LABELABLE_TYPES` container yields `{ fit: true }`; otherwise no options.

### SVG path (`packages/renderer/src/svg.ts`)

- The element loop already resolves containers and holds a `measure` function (the `SVGRenderOptions.measure` hook, defaulting to a hidden canvas). For a shape-container label with a measurer available, compute the same scale from the measured natural size and render `textNode` at the effective font size — the `font-size` attribute and the per-line `tspan` y positions both use it, so centering holds.
- No measurer available → render at natural size (same graceful degradation as the arrow-label backing rect).
- Linear-label backing behavior is unchanged.

### Explicitly untouched

Scene data and types, undo history, persistence format, `TextEditingOverlay`, arrow/line labels, standalone text, PNG export (it rasterizes through the same canvas renderer and inherits the fix).

## Behavior summary

- A label that fits renders exactly as today.
- A too-long label shrinks uniformly (width- or height-bound, whichever is tighter) until it fits the inner box; it never crosses the shape outline.
- Resizing the shape re-fits the label live; enlarging it back restores the natural size (capped at `fontSize` — labels never grow beyond their set size).
- SVG export matches the canvas; PNG export matches by construction.

## Testing

- **Canvas unit tests** (`shapes-text.test.ts`): long single-line text in a small box sets a proportionally scaled font spec; short text keeps the natural font spec (scale capped at 1); multi-line text scales by the height bound; `fit` with empty text draws nothing.
- **Renderer integration** (`renderer-elements.test.ts`): a shape-bound label draws with a scaled font; an arrow-bound label and standalone text do not.
- **SVG unit tests** (`svg.test.ts`): shape label too long for its box emits a scaled `font-size`; fits-fine label emits the natural size; no measurer → natural size, no crash.
- **No new e2e**: the shrink is invisible to scene data by design, so localStorage-based e2e cannot observe it, and pixel-sampling would be fragile. The existing 34-spec suite gates regressions.
- **Full gate** (lint, typecheck, unit, e2e) before merge.

## Out of scope (follow-up candidates)

- Word wrapping inside shapes
- Growing the container to fit its text
- Shrinking in the editing overlay (WYSIWYG parity)
- A user-visible toggle for auto-shrink
