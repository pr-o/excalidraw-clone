"use client"
import { fontFamilyName } from "@excalidraw-clone/renderer"
import {
  cellRect,
  TABLE_LINE_HEIGHT,
  TABLE_PAD_X,
  TABLE_PAD_Y,
  type ExcalidrawTableElement,
  type Scene,
} from "@excalidraw-clone/scene"
import React, { useEffect, useRef, useState } from "react"
import { commitTableCell } from "../driver/tableOps"
import { useAppStore } from "../store"

interface Props {
  scene: Scene
  table: ExcalidrawTableElement
  cell: { row: number; col: number }
}

/** The text editor for one table cell: a textarea laid over the cell (so IME
 *  composition and selection are native). Tab / Shift+Tab / Enter move between
 *  cells, Shift+Enter inserts a newline, Escape or click-away commits and exits.
 *  Mounted with `key` per cell, so moving the editor remounts it. */
export function TableCellEditor({ scene, table, cell }: Props): React.ReactElement {
  const scrollX = useAppStore((s) => s.scrollX)
  const scrollY = useAppStore((s) => s.scrollY)
  const zoom = useAppStore((s) => s.zoom)
  const setId = useAppStore((s) => s.setTextEditElementId)
  const setCell = useAppStore((s) => s.setTextEditCell)
  const stored = table.cells[cell.row]![cell.col]!
  const [value, setValue] = useState(stored)
  const ref = useRef<HTMLTextAreaElement | null>(null)
  // Set once the edit is committed, so the blur caused by unmounting can't commit twice.
  const done = useRef(false)

  useEffect(() => {
    queueMicrotask(() => {
      const node = ref.current
      if (!node) return
      node.focus()
      node.setSelectionRange(node.value.length, node.value.length)
    })
  }, [])

  const finish = (next: { row: number; col: number } | null, appendRow = false): void => {
    if (done.current) return
    done.current = true
    const unchanged = value === stored && !appendRow
    scene.mutate(
      (draft) => commitTableCell(draft, table.id, cell.row, cell.col, value, appendRow),
      unchanged ? { skipHistory: true } : undefined,
    )
    if (next) setCell(next)
    else setId(null)
  }

  const rect = cellRect(table, cell.row, cell.col)
  const bold = table.headerRow && cell.row === 0
  const lineHeight = table.fontSize * TABLE_LINE_HEIGHT
  // Centre a single logical line like the canvas does; taller text starts at the top.
  const padTop = Math.max(TABLE_PAD_Y, (rect.height - value.split("\n").length * lineHeight) / 2)

  return (
    <div
      style={{
        position: "absolute",
        left: `${(table.x + scrollX) * zoom}px`,
        top: `${(table.y + scrollY) * zoom}px`,
        width: `${table.width * zoom}px`,
        height: `${table.height * zoom}px`,
        transform: table.angle === 0 ? undefined : `rotate(${table.angle}rad)`,
        pointerEvents: "none",
      }}
      className="z-40"
    >
      <textarea
        data-testid="table-cell-input"
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => finish(null)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault()
            // Same path as click-away: blur -> commit.
            e.currentTarget.blur()
            return
          }
          if (e.nativeEvent.isComposing || e.keyCode === 229) return
          if (e.key === "Tab") {
            e.preventDefault()
            const index = cell.row * table.cols + cell.col
            if (e.shiftKey) {
              if (index === 0) return
              finish({ row: Math.floor((index - 1) / table.cols), col: (index - 1) % table.cols })
            } else if (index === table.rows * table.cols - 1) {
              finish({ row: table.rows, col: 0 }, true)
            } else {
              finish({ row: Math.floor((index + 1) / table.cols), col: (index + 1) % table.cols })
            }
            return
          }
          if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault()
            finish(cell.row + 1 < table.rows ? { row: cell.row + 1, col: cell.col } : null)
          }
        }}
        style={{
          position: "absolute",
          left: `${rect.x * zoom}px`,
          top: `${rect.y * zoom}px`,
          width: `${rect.width * zoom}px`,
          height: `${rect.height * zoom}px`,
          boxSizing: "border-box",
          padding: `${padTop * zoom}px ${TABLE_PAD_X * zoom}px ${TABLE_PAD_Y * zoom}px`,
          fontSize: `${table.fontSize * zoom}px`,
          fontFamily: fontFamilyName(table.fontFamily),
          fontWeight: bold ? "bold" : "normal",
          lineHeight: TABLE_LINE_HEIGHT,
          textAlign: table.textAlign,
          color: table.strokeColor,
          background: "transparent",
          border: "2px solid #6965db",
          outline: "none",
          resize: "none",
          overflow: "auto",
          margin: 0,
          pointerEvents: "auto",
        }}
      />
    </div>
  )
}
