import { create } from "zustand"
import { createCanvasBgSlice, type CanvasBgSlice } from "./slices/canvasBg"
import { createDialogSlice, type DialogSlice } from "./slices/dialog"
import { createDispatchSlice, type DispatchSlice } from "./slices/dispatch"
import { createGridSlice, type GridSlice } from "./slices/grid"
import { createI18nSlice, type I18nSlice } from "./slices/i18n"
import { createLibrarySlice, type LibrarySlice } from "./slices/library"
import { createPaletteSlice, type PaletteSlice } from "./slices/palette"
import { createPointerSlice, type PointerSlice } from "./slices/pointer"
import { createSelectionSlice, type SelectionSlice } from "./slices/selection"
import { createTextEditSlice, type TextEditSlice } from "./slices/textEdit"
import { createThemeSlice, type ThemeSlice } from "./slices/theme"
import { createToolSlice, type ToolSlice } from "./slices/tool"
import { createToolStateSlice, type ToolStateSlice } from "./slices/toolState"
import { createViewSlice, type ViewSlice } from "./slices/view"

export type AppState = ToolSlice &
  ThemeSlice &
  ViewSlice &
  GridSlice &
  DialogSlice &
  PaletteSlice &
  I18nSlice &
  SelectionSlice &
  ToolStateSlice &
  CanvasBgSlice &
  TextEditSlice &
  DispatchSlice &
  LibrarySlice &
  PointerSlice

export const useAppStore = create<AppState>()((...a) => ({
  ...createToolSlice(...a),
  ...createThemeSlice(...a),
  ...createViewSlice(...a),
  ...createGridSlice(...a),
  ...createDialogSlice(...a),
  ...createPaletteSlice(...a),
  ...createI18nSlice(...a),
  ...createSelectionSlice(...a),
  ...createToolStateSlice(...a),
  ...createCanvasBgSlice(...a),
  ...createTextEditSlice(...a),
  ...createDispatchSlice(...a),
  ...createLibrarySlice(...a),
  ...createPointerSlice(...a),
}))
