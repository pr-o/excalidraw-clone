# Label Word Wrap (Wrap Shape-Label Text at the Inner Box) — Design

**Date:** 2026-07-18
**Status:** Approved
**Scope:** Shape labels wrap at their inner-box width at render time, in canvas rendering and SVG export; auto-shrink then applies to the wrapped block. Scene data is never modified.

## Problem

Auto-shrink (shipped `9908dcd`) guarantees labels fit their shape, but a long sentence shrinks into a tiny single line while the box above and below sits empty. Wrapping is the natural first fitting tool; shrinking should be the fallback, not the whole mechanism.

## Decisions

- **Mechanism: render-time.** Display lines are computed when drawing, like auto-shrink. The stored `text` keeps the user's literal input including their manual newlines; re-wrap happens automatically on container resize; undo is untouched. (Rejected: persisting wrapped text with an `originalText` sidecar, upstream Excalidraw's model — needs measurement at commit/resize sites that have no canvas.)
- **Spaces only; auto-shrink handles unbreakable words.** Greedy word wrap splits at spaces. A single word wider than the box stays whole on its own line, and the existing width-bound shrink scales the label down. No mid-word breaking, no hyphenation.
- **Wrap once at natural size.** The shrink applied afterward does not trigger a re-wrap. (Re-wrapping at the smaller size could pack more words per line, but iterating wrap↔shrink buys little for the complexity; a single pass is stable and predictable.)
- **Same targeting as auto-shrink.** Wrapping applies exactly where `fit` applies: text bound to a `LABELABLE_TYPES` container. Arrow/line labels (zero-width box — wrapping would explode them into one word per line) and standalone text never wrap. The renderer's existing container routing already enforces this; no routing changes.
- **Editing overlay unchanged.** The textarea shows the raw unwrapped text, consistent with the auto-shrink decision.

## Design

### 1. Shared layout: `layoutLabel` (`packages/renderer/src/text-metrics.ts`)

```ts
layoutLabel(
  text: string,
  box: { width: number; height: number },
  fontSize: number,
  lineHeight: number,
  measureWidth: (s: string) => number,   // width of s at the natural font size
): { lines: string[]; scale: number }
```

1. Split `text` on `"\n"` into logical lines (the user's manual breaks are always respected).
2. Greedy-wrap each logical line at `box.width`: accumulate words while the candidate string (words joined by single spaces) measures ≤ `box.width`; a word that doesn't fit even alone becomes its own line. An empty logical line stays as an empty display line.
3. `scale = min(1, box.width / widestDisplayLineWidth, box.height / (lines.length × fontSize × lineHeight))`, guarding zero-width/zero-height inputs to 1 as today.

Pure function; consecutive spaces collapse to single spaces in wrapped output (accepted — labels are short UI text, not whitespace-sensitive content).

### 2. Canvas path (`packages/renderer/src/shapes/text.ts`)

In `drawText`, the `opts.fit` branch calls `layoutLabel` with a `ctx.measureText`-based `measureWidth` at the natural font, then draws the returned `lines` at `fontSize × scale`. The existing `horizontalOffset`/`verticalOffset` centering already handles multi-line blocks. The non-fit path (standalone text, arrow labels with `occlude`) is byte-identical to today: split on `"\n"`, no wrap, no scale.

### 3. SVG path (`packages/renderer/src/svg.ts`)

`shapeLabelScale` is replaced by `layoutLabel` (its `measureWidth` measures single-line candidates through the existing `measure` hook). The loop passes the resulting `{ lines, scale }` into `textNode`, which renders those display lines as tspans at `fontSize × scale`. No measurer available → no wrap, no shrink, natural single-pass rendering (same graceful degradation as the backing rect and auto-shrink). The linear-label backing path is untouched.

### Explicitly untouched

Scene data and types, undo, persistence, `TextEditingOverlay`, arrow/line labels, occlusion backing, standalone text, PNG export (inherits the canvas path).

## Behavior summary

- "reticulating splines" in a narrow rectangle wraps to two lines at full size instead of shrinking to fit one line.
- Manual newlines in the label are always kept; wrapping only adds breaks, never removes the user's.
- A wrapped block taller than the box shrinks by the height bound; an unbreakable long word shrinks by the width bound.
- Resizing the shape re-wraps live. SVG export matches the canvas; PNG matches by construction.
- Labels that fit on one line render byte-identically to today.

## Testing

- **`layoutLabel` unit tests** (new `text-metrics.test.ts` describe or file): wraps two words at a narrow width; respects manual newlines; keeps an over-wide word whole with scale < 1; empty logical lines preserved; short text returns one line at scale 1; height-bound scale after wrapping.
- **Canvas** (`shapes-text.test.ts`): two-word label in a narrow box draws two `fillText` calls at the natural font (no shrink); tall wrapped block scales the font down; non-fit text never wraps.
- **SVG** (`svg.test.ts`): wrapped label emits two `<tspan>`s at natural font-size; no measurer → single tspan at natural size.
- **No new e2e** — invisible to scene data (same rationale as auto-shrink); the existing 34-spec suite gates regressions.
- **Full gate** (lint, typecheck, unit, e2e) before merge. Watch `exactOptionalPropertyTypes` on any new optional props.

## Out of scope (follow-up candidates)

- Mid-word breaking / hyphenation
- Wrap-shrink iteration (re-wrap at reduced size)
- Editor WYSIWYG parity
- Growing the container to fit its text
