"use client"
import { fontFamilyName } from "@excalidraw-clone/renderer"
import { enterOnBullet, normalizeSpans, type Scene } from "@excalidraw-clone/scene"
import React, { useEffect, useRef } from "react"
import { commitTextEdit } from "../driver/commitTextEdit"
import { measureStandaloneText } from "../driver/measureStandaloneText"
import { renameFrame } from "../driver/renameFrame"
import { useAppStore } from "../store"
import { RichMirror, useRichText } from "./richText"
import { TableCellEditor } from "./TableCellEditor"
import { focusCanvas } from "./CanvasShell"

export function TextEditingOverlay({ scene }: { scene: Scene }): React.ReactElement | null {
  const id = useAppStore((s) => s.textEditElementId)
  const setId = useAppStore((s) => s.setTextEditElementId)
  const scrollX = useAppStore((s) => s.scrollX)
  const scrollY = useAppStore((s) => s.scrollY)
  const zoom = useAppStore((s) => s.zoom)
  const tableCell = useAppStore((s) => s.textEditCell)
  const rich = useRichText()
  const { ref, value, setValue, spans } = rich
  const mirror = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!id) return
    const el = scene.getElementsIncludingDeleted().find((e) => e.id === id)
    rich.reset(
      el?.type === "frame" ? (el.name ?? "") : el?.type === "text" ? el.text : "",
      el?.type === "text" ? normalizeSpans(el.spans, el.text.length) : [],
    )
    queueMicrotask(() => ref.current?.focus())
  }, [id, scene])

  if (!id) return null
  const target = scene.getElementsIncludingDeleted().find((e) => e.id === id)
  if (!target) return null

  if (target.type === "frame") {
    const commitName = (): void => {
      const trimmed = value.trim()
      const changed = target.name !== (trimmed === "" ? null : trimmed)
      scene.mutate(
        (draft) => renameFrame(draft, id, value),
        changed ? undefined : { skipHistory: true },
      )
      setId(null)
    }
    return (
      <input
        data-testid="frame-name-input"
        ref={(node) => {
          ref.current = node
        }}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commitName}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            commitName()
            focusCanvas()
          }
          if (e.key === "Escape") {
            e.preventDefault()
            setId(null)
            focusCanvas()
          }
        }}
        style={{
          position: "absolute",
          left: `${(target.x + scrollX) * zoom}px`,
          top: `${(target.y + scrollY) * zoom - 28}px`,
          fontSize: "12px",
          background: "transparent",
          border: "1px solid #999",
          outline: "none",
        }}
        className="z-40"
      />
    )
  }

  if (target.type === "table") {
    if (!tableCell || tableCell.row >= target.rows || tableCell.col >= target.cols) return null
    return (
      <TableCellEditor
        key={`${target.id}:${tableCell.row}:${tableCell.col}`}
        scene={scene}
        table={target}
        cell={tableCell}
      />
    )
  }

  if (target.type !== "text") return null
  const el = target

  const fontSize = el.fontSize * zoom
  // A bound label edits inside its container's text box, at its aligned line
  // position, so the text doesn't spill off-centre and jump on commit.
  // Arrow/line labels size to their text instead, so they keep the natural editor.
  const container =
    el.containerId === null ? undefined : scene.getElements().find((c) => c.id === el.containerId)
  const inBox = container !== undefined && container.type !== "arrow" && container.type !== "line"
  const labelTextHeight = value.split("\n").length * fontSize * el.lineHeight
  const labelOffset =
    !inBox || el.verticalAlign === "top"
      ? 0
      : Math.max(0, el.height * zoom - labelTextHeight) * (el.verticalAlign === "middle" ? 0.5 : 1)
  const left = (el.x + scrollX) * zoom
  const top = (el.y + scrollY) * zoom + labelOffset
  // Fixed-width text wraps inside its box while editing, as it renders.
  const fixedWidth =
    el.containerId === null && el.autoResize === false
      ? {
          width: `${el.width * zoom}px`,
          height: `${el.height * zoom}px`,
          boxSizing: "content-box" as const,
          whiteSpace: "pre-wrap" as const,
        }
      : inBox
        ? {
            width: `${el.width * zoom}px`,
            height: `${labelTextHeight}px`,
            boxSizing: "content-box" as const,
            whiteSpace: "pre-wrap" as const,
          }
        : {}

  const commit = (): void => {
    const noVisibleChange = value === "" && (el?.text ?? "") === ""
    // Free-standing text has no container to size it; measure the typed
    // content so the persisted box (and so its hit-test area) fits it.
    // Bound labels are skipped entirely (no canvas is created for them).
    const measuredSize =
      el.containerId === null ? measureStandaloneText({ ...el, text: value, spans }) : undefined
    scene.mutate(
      (draft) => commitTextEdit(draft, id, value, measuredSize, spans),
      noVisibleChange ? { skipHistory: true } : undefined,
    )
    setId(null)
  }

  const styled = spans.length > 0
  const weight = el.fontWeight ?? "normal"
  const textStyle = {
    fontSize: `${fontSize}px`,
    fontFamily: fontFamilyName(el.fontFamily),
    fontWeight: weight,
    fontStyle: el.fontStyle ?? "normal",
    textAlign: el.textAlign,
    lineHeight: el.lineHeight,
  } as const

  return (
    <div
      style={{
        position: "absolute",
        left: `${left}px`,
        top: `${top}px`,
        // Rotated text (incl. labels of rotated shapes) edits at its drawn angle,
        // turning about the element's centre.
        ...(el.angle !== 0
          ? {
              transform: `rotate(${el.angle}rad)`,
              transformOrigin: `${(el.width * zoom) / 2}px ${(el.height * zoom) / 2 - labelOffset}px`,
            }
          : {}),
      }}
      className="z-40"
    >
      {styled && (
        <RichMirror
          mirrorRef={mirror}
          value={value}
          spans={spans}
          weight={weight}
          fontSize={fontSize}
          color={el.strokeColor}
          style={{
            ...textStyle,
            position: "absolute",
            inset: 0,
            boxSizing: "border-box",
            border: "1px solid transparent",
          }}
        />
      )}
      <textarea
        data-canvas-text
        ref={(node) => {
          ref.current = node
        }}
        value={value}
        onChange={rich.onChange}
        onBlur={commit}
        onScroll={(e) => {
          if (mirror.current) mirror.current.scrollTop = e.currentTarget.scrollTop
        }}
        onSelect={rich.onSelect}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault()
            // Blur rather than commit() directly: onBlur → commit() is the exact
            // click-away path, so typed text is kept and it can't double-commit.
            e.currentTarget.blur()
            focusCanvas()
            return
          }
          const composing = e.nativeEvent.isComposing || e.keyCode === 229
          if (composing) return
          if (rich.onModifierKey(e)) return
          if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
            const edit = enterOnBullet(
              value,
              e.currentTarget.selectionStart,
              e.currentTarget.selectionEnd,
            )
            if (edit) {
              e.preventDefault()
              rich.applyBullet(edit)
            }
          }
        }}
        style={{
          display: "block",
          position: "relative",
          ...textStyle,
          ...(styled ? { color: "transparent", caretColor: el.strokeColor } : {}),
          background: "transparent",
          border: "1px solid #999",
          outline: "none",
          resize: "none",
          padding: 0,
          margin: 0,
          ...fixedWidth,
        }}
      />
    </div>
  )
}
