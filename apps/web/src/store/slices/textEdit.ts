import type { StateCreator } from "zustand"

export interface TableCellRef {
  row: number
  col: number
}

export interface TextEditSlice {
  textEditElementId: string | null
  /** Table cell under edit when `textEditElementId` is a table. */
  textEditCell: TableCellRef | null
  /** Last cell edited, for the Table section's row/column actions. */
  tableActiveCell: (TableCellRef & { elementId: string }) | null
  setTextEditElementId: (id: string | null, cell?: TableCellRef | null) => void
  /** Move the editor to another cell of the table already being edited. */
  setTextEditCell: (cell: TableCellRef) => void
}

export const createTextEditSlice: StateCreator<TextEditSlice, [], [], TextEditSlice> = (set) => ({
  textEditElementId: null,
  textEditCell: null,
  tableActiveCell: null,
  setTextEditElementId: (id, cell = null) =>
    set((s) => ({
      textEditElementId: id,
      textEditCell: id === null ? null : cell,
      tableActiveCell: id !== null && cell ? { elementId: id, ...cell } : s.tableActiveCell,
    })),
  setTextEditCell: (cell) =>
    set((s) =>
      s.textEditElementId === null
        ? s
        : {
            textEditCell: cell,
            tableActiveCell: { elementId: s.textEditElementId, ...cell },
          },
    ),
})
