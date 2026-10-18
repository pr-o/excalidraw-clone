# Rich text: bold/italic spans and bullet lists

## Data model

- `ExcalidrawTextElement.text` stays the source of truth (find, bounds fallback, Mermaid, old readers).
- New optional `spans?: { start; end; bold?: true; italic?: true }[]` (offsets into `text`). Always
  normalized by `normalizeSpans` (sorted, merged, clamped, empty/styleless dropped; overlaps union).
  No format bump: the field is optional and old documents load unchanged.
- Trust boundary: `migrate()` runs `sanitizeSpans` on every text element (non-array dropped, invalid
  entries skipped, rest normalized to the text length).
- Text changed outside the editor (property patches): ONE rule — diff old/new text
  (`remapSpansForText`, common prefix/suffix) and remap spans; spans that lose all content are removed.
  An explicit `spans` in the same patch wins.
- Bullets are literal "• " (U+2022 + space) in `text`; no extra model.
- Pure logic lives in `packages/scene/src/spans.ts` (remap, toggle, slice-into-runs, bullet edits).

## Layout (shared)

`wrapRich` in `renderer/text-metrics.ts` is the single wrapping routine (canvas, SVG, label-fit,
bounds measuring). It returns `{text, start, indent}` lines; `wrapLines`/`layoutLabel` are thin
views over it. Bullet lines hang: continuation lines are indented by the width of "• " and wrap
inside `maxWidth - indent`. Without spans the original space-collapsing behavior is kept; with spans
lines are exact slices of `text` so runs line up. Widths are run-aware (`makeMeasure`: each run is
measured with its own bold/italic font), so wrapping, shrink-to-fit and bounds account for bold width.

## Rendering

- Canvas: no spans → the original single `fillText` per line (same fast path). Spans → per-run
  `fillText` with `runFont` (`bold`/`italic`/`bold italic` over the element's base weight/style).
- SVG (and so PDF): per line a `<tspan x y>` containing child `<tspan font-weight/font-style>` per
  styled run; `xml:space="preserve"` on rich `<text>`.
- Hanging indent is applied only to left-aligned text (it has no meaning against a centered/right edge).

## Editor: layered textarea + styled mirror (not contenteditable)

Kept the `<textarea>` as the only input surface and put a non-interactive styled mirror under it
(textarea text transparent while spans exist). Reasons: caret, selection, IME composition,
paste-as-plain-text, undo and `fill()` all stay native and every existing unit/e2e test keeps working
(a contenteditable would need a hand-rolled selection/serialization layer and rewriting ~15 specs).
Caret drift risk of layered editors comes from bold's wider glyphs, so the mirror draws bold with a
text stroke (same advances as regular) rather than a heavier face; the canvas shows true bold after
commit. Spans are always derived by remapping through the exact text diff of every change event,
so IME intermediate states can never leave spans out of range.

- Ctrl/Cmd+B / I: toggle over the selection, or set a one-shot typing style at a bare caret.
- "- " / "\* " at line start → "• "; Enter on a bullet line continues; Enter on an empty bullet removes it.
- Commit (`commitTextEdit`) stores normalized spans and measures the box with them.

## Touch points

| Area                | Change                                                                                                                                                          |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| scene               | `spans.ts`, type field, exports                                                                                                                                 |
| persistence         | `sanitizeSpans` in `normalizePages`                                                                                                                             |
| renderer            | text-metrics layout/measure, canvas `drawText`, SVG tspans                                                                                                      |
| web driver          | `commitTextEdit`, `measureStandaloneText`, `applyPropertiesPatch` (+`setWholeTextStyle`)                                                                        |
| web UI              | `TextEditingOverlay`, `App` wiring, PropertiesPanel `text-bold`/`text-italic` (whole text)                                                                      |
| i18n/help           | en+ko common/shortcuts, HelpDialog entries                                                                                                                      |
| unchanged by design | find (searches `text`), clipboard (elements are copied whole, spans ride along), style copy/paste (spans are content), history panel (span change = "modified") |

## Known gaps

- Editor has no hanging indent for wrapped bullets (CSS can't indent per logical line in one textarea).
- Editor bold is a stroke approximation; wrap points may differ slightly from the canvas for bold text.
- The existing element-level Bold/Italic buttons (`font-bold`/`font-italic`) remain; the new
  `text-bold`/`text-italic` buttons operate on spans for the whole text.
