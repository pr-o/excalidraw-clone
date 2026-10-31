import type { ExcalidrawTableElement } from "@excalidraw-clone/scene"
import { ACTION, Choice, type OnChange, Section, type T } from "./controls"

export type TableAction = "addRow" | "addCol" | "delRow" | "delCol"

const TABLE_ACTIONS = [
  ["addRow", "table-add-row", "properties.tableAddRow"],
  ["addCol", "table-add-col", "properties.tableAddCol"],
  ["delRow", "table-del-row", "properties.tableDelRow"],
  ["delCol", "table-del-col", "properties.tableDelCol"],
] as const

/** Row/column structure edits and the header toggle for a single selected table. */
export function TableSection({
  t,
  table,
  onChange,
  onTableAction,
}: {
  t: T
  table: ExcalidrawTableElement
  onChange: OnChange
  onTableAction: (action: TableAction) => void
}): React.ReactElement {
  return (
    <Section label={t("properties.table")}>
      <div className="grid grid-cols-2 gap-1">
        {TABLE_ACTIONS.map(([action, testId, key]) => (
          <button
            key={action}
            type="button"
            data-testid={testId}
            disabled={
              (action === "delRow" && table.rows <= 1) ||
              (action === "delCol" && table.cols <= 1) ||
              (action === "addRow" && table.rows >= 50) ||
              (action === "addCol" && table.cols >= 50)
            }
            onClick={() => onTableAction(action)}
            className={`${ACTION} disabled:opacity-40`}
          >
            {t(key)}
          </button>
        ))}
      </div>
      <Choice
        data-testid="table-header-toggle"
        pressed={table.headerRow}
        onClick={() => onChange({ headerRow: !table.headerRow })}
        className="mt-1 h-7 w-full text-xs"
      >
        {t("properties.tableHeader")}
      </Choice>
    </Section>
  )
}
