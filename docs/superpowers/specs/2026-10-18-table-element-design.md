# Table element - design

New element type `table`: an editable grid of plain-text cells that behaves as one rectangle for selection, movement, binding and export.

## Data model (`packages/scene/src/types.ts`, `table.ts`)

`ExcalidrawTableElement` adds `rows`, `cols` (1..50), `colWidths[]`, `rowHeights[]`, `cells[row][col]` (plain strings, no spans), `headerRow` (default true), and `fontSize` / `fontFamily` / `textAlign` (text style for all cells). Defaults: 3x3, 120x40 cells; minimums 40 (col) and 28 (row).

**Invariant:** `width === sum(colWidths)` and `height === sum(rowHeights)`. `reconcileTables` runs inside `Scene.mutate` (after bound text, before bindings/frames). Any code that writes `width`/`height` directly (resize handle, multi-element resize, stats panel) therefore scales every column/row proportionally, clamped to the minimums, with no per-feature code. Structure ops (`insertRow/Col`, `deleteRow/Col`, `setTrackSize`) set sizes and box together, so they are no-ops for the reconciler. A malformed table reaching `mutate` (e.g. pasted JSON) is repaired by `sanitizeTable`.

Pure helpers (all in `table.ts`, unit tested): `newTable`, `fitTable`, `insert/deleteRow/Col`, `setCellText`, `setTrackSize`, `cellRect`, `cellAtLocal`, `borderAtLocal`, `toTableLocal` (undoes rotation), `autoGrowRows`, `tableText`, `sanitizeTable`.

**Auto-grow:** `autoGrowRows(table, countLines)` grows (never shrinks) rows to fit wrapped text. The measurer is injected; the web app supplies a canvas `measureText` + `wrapLines` one (`driver/tableOps.ts`). It runs on cell commit and after a font size/family patch, not on resize or border drag.

## Touch points

| Area         | Change                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| scene        | type union, `newTable`, hit-test (rectangle: any point inside selects), bounds (default rect), `BINDABLE_TYPES` (binds as a rectangle), stats (`table: {rows, cols}`)                                                                                                                                                                                                                  |
| persistence  | `migrate()` runs `sanitizeTable` on every table: rows/cols clamped, arrays padded/truncated, cells coerced to strings, garbage becomes a default 3x3. Optional type, so old documents load unchanged                                                                                                                                                                                   |
| renderer     | `shapes/table.ts`: fill, header tint (stroke colour at 12% alpha, theme-aware), outer border, one rough.js line per inner border (so roughness/dash/width apply); `layoutTableCells` shared by canvas and SVG for wrapped, vertically centred, aligned text; header row bold. Shadow/opacity ride the shared draw path. `setHiddenElement(id, cell)` hides only the edited cell's text |
| tools        | `table` tool (shape tool wrapper: drag splits the box 3x3 with min size; click = default 360x120; shift ignored). Selection tool: `tableBorder` handle (4 screen px, interior borders only, after corner/edge handles), `tableResizing` phase (axis-local so rotation works; Escape reverts; one undo step), double-click -> `startTextEdit` with `cell`                               |
| editor       | `TableCellEditor`: textarea over the cell (native IME). Tab/Shift+Tab move, Tab on the last cell appends a row, Enter commits and moves down (last row: exits), Shift+Enter newline, Escape/blur commit. IME composition keys are ignored. Store: `textEditCell`, `tableActiveCell` (last edited, used by the panel)                                                                   |
| UI           | More-shapes flyout button + shortcut `7` (free key), icon, Help entry, PropertiesPanel "Table" section (`table-add-row/col`, `table-del-row/col`, `table-header-toggle`; font family/size/align rows apply to tables, bold/italic hidden), layers label via `toolbar.table`, stats panel rows x cols                                                                                   |
| context menu | on a table: insert row above/below, column left/right, delete row/column, targeting the clicked cell                                                                                                                                                                                                                                                                                   |
| other        | find-on-canvas searches cell text; clipboard/duplicate/alt-drag/group/frame/lock/link/z-order/history are generic; minimap draws a rect; exports (PNG/SVG/PDF/selection/frame) use the SVG path; i18n en + ko                                                                                                                                                                          |

## Decisions and known limits

- Flip is allowed but only mirrors geometry/position in multi-selections; a lone table renders symmetric, so a single flip is visually a no-op and cell order is not reversed.
- Rotation works; the editor overlay is rotated with the table.
- Shrinking a table below the minimum track sizes clamps the size (the box grows back to the minimum), so a top/left handle drag at the limit shifts the origin.
- Gradient fill is not offered for tables (not a labelable type); fill is always solid.
- Row heights do not shrink when text is deleted, and only auto-grow on commit/font change (not on column narrowing).
- The edit overlay centres a single line vertically; multi-line text starts at the cell top until commit.
- Cell text has no bold/italic spans in v1 (header row is bold).
