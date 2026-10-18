"use client"
import { fontFamilyName } from "@excalidraw-clone/renderer"
import {
  applyBulletEdit,
  autoBullet,
  diffEdit,
  enterOnBullet,
  flagsAt,
  remapSpans,
  normalizeSpans,
  sliceRuns,
  toggleSpanStyle,
  type BulletEdit,
  type Scene,
  type SpanFlags,
  type SpanStyle,
  type TextSpan,
} from "@excalidraw-clone/scene"
import React, { useEffect, useLayoutEffect, useRef, useState } from "react"
import { commitTextEdit } from "../driver/commitTextEdit"
import { measureStandaloneText } from "../driver/measureStandaloneText"
import { renameFrame } from "../driver/renameFrame"
import { useAppStore } from "../store"

export function TextEditingOverlay({ scene }: { scene: Scene }): React.ReactElement | null {
  const id = useAppStore((s) => s.textEditElementId)
  const setId = useAppStore((s) => s.setTextEditElementId)
  const scrollX = useAppStore((s) => s.scrollX)
  const scrollY = useAppStore((s) => s.scrollY)
  const zoom = useAppStore((s) => s.zoom)
  const ref = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null)
  const [value, setValue] = useState("")
  const [spans, setSpans] = useState<TextSpan[]>([])
  // Typing style chosen with Ctrl+B/I at a bare caret; valid only at that caret.
  const pending = useRef<{ flags: SpanFlags; at: number } | null>(null)
  // Selection to re-apply after a programmatic value change.
  const restoreSel = useRef<{ start: number; end: number } | null>(null)
  const mirror = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!id) return
    const el = scene.getElementsIncludingDeleted().find((e) => e.id === id)
    setValue(el?.type === "frame" ? (el.name ?? "") : el?.type === "text" ? el.text : "")
    setSpans(el?.type === "text" ? normalizeSpans(el.spans, el.text.length) : [])
    pending.current = null
    queueMicrotask(() => ref.current?.focus())
  }, [id, scene])

  useLayoutEffect(() => {
    const sel = restoreSel.current
    const node = ref.current
    if (sel && node) {
      restoreSel.current = null
      node.setSelectionRange(sel.start, sel.end)
    }
  }, [value, spans])

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
          }
          if (e.key === "Escape") {
            e.preventDefault()
            setId(null)
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

  if (target.type !== "text") return null
  const el = target

  const left = (el.x + scrollX) * zoom
  const top = (el.y + scrollY) * zoom
  const fontSize = el.fontSize * zoom
  // Fixed-width text wraps inside its box while editing, as it renders.
  const fixedWidth =
    el.containerId === null && el.autoResize === false
      ? {
          width: `${el.width * zoom}px`,
          height: `${el.height * zoom}px`,
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

  const applyEdit = (nextText: string, nextSpans: TextSpan[], caret?: number): void => {
    setValue(nextText)
    setSpans(nextSpans)
    if (caret !== undefined) restoreSel.current = { start: caret, end: caret }
  }

  const applyBullet = (edit: BulletEdit): void => {
    const r = applyBulletEdit(value, spans, edit)
    applyEdit(r.text, r.spans, r.caret)
  }

  const toggleStyle = (style: SpanStyle, node: HTMLTextAreaElement): void => {
    const { selectionStart: a, selectionEnd: b } = node
    if (a !== b) {
      setSpans(toggleSpanStyle(spans, value.length, a, b, style))
      restoreSel.current = { start: a, end: b }
      return
    }
    const base = pending.current?.at === a ? pending.current.flags : flagsAt(spans, value.length, a)
    pending.current = { flags: { ...base, [style]: !base[style] }, at: a }
  }

  const onInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>): void => {
    const next = e.target.value
    const edit = diffEdit(value, next)
    const style = pending.current?.at === edit.start ? pending.current.flags : undefined
    pending.current = null
    const nextSpans = remapSpans(spans, value.length, edit, style)
    const composing = (e.nativeEvent as { isComposing?: boolean }).isComposing === true
    const bullet = composing ? null : autoBullet(next, e.target.selectionStart)
    if (bullet) {
      const r = applyBulletEdit(next, nextSpans, bullet)
      applyEdit(r.text, r.spans, r.caret)
      return
    }
    setValue(next)
    setSpans(nextSpans)
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
    <div style={{ position: "absolute", left: `${left}px`, top: `${top}px` }} className="z-40">
      {styled && (
        // Styled mirror under a transparent textarea: the textarea keeps owning
        // caret, selection, IME and paste. Bold is drawn with a stroke instead
        // of a heavier face so glyph advances match the textarea's caret math.
        <div
          ref={mirror}
          aria-hidden
          data-testid="text-mirror"
          style={{
            ...textStyle,
            position: "absolute",
            inset: 0,
            boxSizing: "border-box",
            border: "1px solid transparent",
            overflow: "hidden",
            pointerEvents: "none",
            whiteSpace: "pre-wrap",
            overflowWrap: "break-word",
            color: el.strokeColor,
          }}
        >
          {sliceRuns(value, spans).map((r, k) => (
            <span
              key={k}
              data-bold={r.bold || undefined}
              data-italic={r.italic || undefined}
              style={{
                fontStyle: r.italic ? "italic" : undefined,
                WebkitTextStroke: r.bold && weight !== "bold" ? `${fontSize * 0.035}px` : undefined,
              }}
            >
              {r.text}
            </span>
          ))}
        </div>
      )}
      <textarea
        ref={(node) => {
          ref.current = node
        }}
        value={value}
        onChange={onInputChange}
        onBlur={commit}
        onScroll={(e) => {
          if (mirror.current) mirror.current.scrollTop = e.currentTarget.scrollTop
        }}
        onSelect={(e) => {
          if (pending.current && pending.current.at !== e.currentTarget.selectionStart) {
            pending.current = null
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault()
            // Blur rather than commit() directly: onBlur → commit() is the exact
            // click-away path, so typed text is kept and it can't double-commit.
            e.currentTarget.blur()
            return
          }
          const composing = e.nativeEvent.isComposing || e.keyCode === 229
          if (composing) return
          if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
            const k = e.key.toLowerCase()
            if (k === "b" || k === "i") {
              e.preventDefault()
              toggleStyle(k === "b" ? "bold" : "italic", e.currentTarget)
            }
            return
          }
          if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
            const edit = enterOnBullet(
              value,
              e.currentTarget.selectionStart,
              e.currentTarget.selectionEnd,
            )
            if (edit) {
              e.preventDefault()
              applyBullet(edit)
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
