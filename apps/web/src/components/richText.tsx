"use client"
import {
  applyBulletEdit,
  autoBullet,
  diffEdit,
  flagsAt,
  remapSpans,
  sliceRuns,
  toggleSpanStyle,
  type BulletEdit,
  type SpanFlags,
  type SpanStyle,
  type TextSpan,
} from "@excalidraw-clone/scene"
import React, { useLayoutEffect, useRef, useState } from "react"

type Field = HTMLTextAreaElement | HTMLInputElement

/** Editing state for a textarea over rich text (bold/italic spans + bullets),
 *  shared by the text overlay and the table cell editor: the textarea owns
 *  caret, selection, IME and paste; spans are remapped through every change. */
export function useRichText(initialText = "", initialSpans: TextSpan[] = []) {
  const ref = useRef<Field | null>(null)
  const [value, setValue] = useState(initialText)
  const [spans, setSpans] = useState<TextSpan[]>(initialSpans)
  // Typing style chosen with Ctrl+B/I at a bare caret; valid only at that caret.
  const pending = useRef<{ flags: SpanFlags; at: number } | null>(null)
  // Selection to re-apply after a programmatic value change.
  const restoreSel = useRef<{ start: number; end: number } | null>(null)

  useLayoutEffect(() => {
    const sel = restoreSel.current
    const node = ref.current
    if (sel && node) {
      restoreSel.current = null
      node.setSelectionRange(sel.start, sel.end)
    }
  }, [value, spans])

  const reset = (text: string, nextSpans: TextSpan[]): void => {
    setValue(text)
    setSpans(nextSpans)
    pending.current = null
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

  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>): void => {
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

  const onSelect = (e: React.SyntheticEvent<HTMLTextAreaElement>): void => {
    if (pending.current && pending.current.at !== e.currentTarget.selectionStart) {
      pending.current = null
    }
  }

  /** Ctrl/Cmd (no Alt/Shift) chords: B / I toggle bold / italic. Returns true
   *  for every such chord, so callers leave the rest to the browser. */
  const onModifierKey = (e: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return false
    const k = e.key.toLowerCase()
    if (k === "b" || k === "i") {
      e.preventDefault()
      toggleStyle(k === "b" ? "bold" : "italic", e.currentTarget)
    }
    return true
  }

  return { ref, value, setValue, spans, reset, applyBullet, onChange, onSelect, onModifierKey }
}

/** Styled copy of the text under a transparent textarea. Bold is drawn with a
 *  stroke instead of a heavier face so glyph advances match the textarea's
 *  caret math. `style` must give it the textarea's box, font and padding. */
export function RichMirror({
  value,
  spans,
  weight,
  fontSize,
  color,
  style,
  mirrorRef,
}: {
  value: string
  spans: readonly TextSpan[]
  weight: string
  fontSize: number
  color: string
  style: React.CSSProperties
  mirrorRef?: React.Ref<HTMLDivElement>
}): React.ReactElement {
  return (
    <div
      ref={mirrorRef}
      aria-hidden
      data-testid="text-mirror"
      style={{
        ...style,
        overflow: "hidden",
        pointerEvents: "none",
        whiteSpace: "pre-wrap",
        overflowWrap: "break-word",
        color,
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
  )
}
