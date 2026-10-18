/** Rich text: bold/italic spans over a text element's plain `text`.
 *  `text` stays the source of truth; spans are offsets into it. */
export interface TextSpan {
  start: number
  end: number
  bold?: true
  italic?: true
}

export type SpanStyle = "bold" | "italic"
export interface SpanFlags {
  bold: boolean
  italic: boolean
}

export const BULLET = "• "

const BOLD = 1
const ITALIC = 2
const FLAG: Record<SpanStyle, number> = { bold: BOLD, italic: ITALIC }
const NONE: SpanFlags = { bold: false, italic: false }

const flagsOfSpan = (s: { bold?: unknown; italic?: unknown }): number =>
  (s.bold === true ? BOLD : 0) | (s.italic === true ? ITALIC : 0)

/** Per-character style bits; overlapping spans union their styles. */
const toBits = (spans: readonly TextSpan[] | undefined, len: number): Uint8Array => {
  const bits = new Uint8Array(len)
  for (const s of spans ?? []) {
    const f = flagsOfSpan(s)
    const lo = Math.max(0, s.start)
    const hi = Math.min(len, s.end)
    for (let i = lo; i < hi; i += 1) bits[i] = bits[i]! | f
  }
  return bits
}

const fromBits = (bits: ArrayLike<number>): TextSpan[] => {
  const out: TextSpan[] = []
  let i = 0
  while (i < bits.length) {
    const f = bits[i]!
    let j = i + 1
    while (j < bits.length && bits[j] === f) j += 1
    if (f !== 0) {
      out.push({
        start: i,
        end: j,
        ...(f & BOLD ? { bold: true as const } : {}),
        ...(f & ITALIC ? { italic: true as const } : {}),
      })
    }
    i = j
  }
  return out
}

/** Sorted, non-overlapping, merged, clamped to [0,len], empty/styleless dropped. */
export const normalizeSpans = (spans: readonly TextSpan[] | undefined, len: number): TextSpan[] =>
  fromBits(toBits(spans, len))

/** Trust-boundary validation of untrusted `spans`: anything not an array is
 *  dropped; invalid entries are skipped; the rest are normalized.
 *  Returns undefined when nothing valid remains. */
export const sanitizeSpans = (raw: unknown, len: number): TextSpan[] | undefined => {
  if (!Array.isArray(raw)) return undefined
  const valid = raw.filter((s): s is TextSpan => {
    if (typeof s !== "object" || s === null) return false
    const { start, end } = s as TextSpan
    return Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end > start
  })
  const out = normalizeSpans(valid, len)
  return out.length > 0 ? out : undefined
}

export const hasSpans = (el: { spans?: readonly TextSpan[] | undefined }): boolean =>
  (el.spans?.length ?? 0) > 0

/** Style of the character before `pos` (or after it at position 0): what a
 *  character typed at `pos` inherits. */
export const flagsAt = (
  spans: readonly TextSpan[] | undefined,
  len: number,
  pos: number,
): SpanFlags => {
  if (len === 0) return NONE
  const f = toBits(spans, len)[pos > 0 ? Math.min(pos, len) - 1 : 0]!
  return { bold: (f & BOLD) !== 0, italic: (f & ITALIC) !== 0 }
}

/** True when every character of [start,end) has the style (empty range: false). */
export const rangeHasStyle = (
  spans: readonly TextSpan[] | undefined,
  len: number,
  start: number,
  end: number,
  style: SpanStyle,
): boolean => {
  const bits = toBits(spans, len)
  const hi = Math.min(end, len)
  if (start >= hi) return false
  for (let i = Math.max(0, start); i < hi; i += 1) if ((bits[i]! & FLAG[style]) === 0) return false
  return true
}

/** Toggle: clear the style if the whole range has it, else apply it. */
export const toggleSpanStyle = (
  spans: readonly TextSpan[] | undefined,
  len: number,
  start: number,
  end: number,
  style: SpanStyle,
): TextSpan[] => {
  const on = rangeHasStyle(spans, len, start, end, style)
  const bits = toBits(spans, len)
  for (let i = Math.max(0, start); i < Math.min(end, len); i += 1) {
    bits[i] = on ? bits[i]! & ~FLAG[style] : bits[i]! | FLAG[style]
  }
  return fromBits(bits)
}

/** A text replacement: [start,end) of the old text became `insertLength` chars. */
export interface TextEdit {
  start: number
  end: number
  insertLength: number
}

/** Common prefix/suffix diff of two strings as a single replacement. */
export const diffEdit = (oldText: string, newText: string): TextEdit => {
  const max = Math.min(oldText.length, newText.length)
  let p = 0
  while (p < max && oldText[p] === newText[p]) p += 1
  let s = 0
  while (s < max - p && oldText[oldText.length - 1 - s] === newText[newText.length - 1 - s]) s += 1
  return { start: p, end: oldText.length - s, insertLength: newText.length - p - s }
}

/** Remap spans through a replacement. Inserted characters take `insertStyle`,
 *  or by default the style of the character before the insertion point. */
export const remapSpans = (
  spans: readonly TextSpan[] | undefined,
  oldLen: number,
  edit: TextEdit,
  insertStyle?: SpanFlags,
): TextSpan[] => {
  const bits = toBits(spans, oldLen)
  const inherit = flagsAt(spans, oldLen, edit.start)
  const f = insertStyle ?? inherit
  const ins = (f.bold ? BOLD : 0) | (f.italic ? ITALIC : 0)
  const next = new Uint8Array(oldLen - (edit.end - edit.start) + edit.insertLength)
  next.set(bits.subarray(0, edit.start), 0)
  next.fill(ins, edit.start, edit.start + edit.insertLength)
  next.set(bits.subarray(edit.end), edit.start + edit.insertLength)
  return fromBits(next)
}

/** Keep spans consistent when `text` changes outside the editor (the one
 *  rule: diff old/new text and remap). Returns undefined when none remain. */
export const remapSpansForText = (
  spans: readonly TextSpan[] | undefined,
  oldText: string,
  newText: string,
  insertStyle?: SpanFlags,
): TextSpan[] | undefined => {
  if (!spans || spans.length === 0) return undefined
  const out = remapSpans(spans, oldText.length, diffEdit(oldText, newText), insertStyle)
  return out.length > 0 ? out : undefined
}

export interface TextRun {
  text: string
  bold: boolean
  italic: boolean
}

/** The [lo,hi) slice of `text` partitioned into style runs. */
export const sliceRuns = (
  text: string,
  spans: readonly TextSpan[] | undefined,
  lo = 0,
  hi = text.length,
): TextRun[] => {
  if (hi <= lo) return []
  const bits = toBits(spans, text.length)
  const runs: TextRun[] = []
  let i = lo
  while (i < hi) {
    const f = bits[i]!
    let j = i + 1
    while (j < hi && bits[j] === f) j += 1
    runs.push({ text: text.slice(i, j), bold: (f & BOLD) !== 0, italic: (f & ITALIC) !== 0 })
    i = j
  }
  return runs
}

/** Result of one editor action on (text, spans). */
export interface EditResult {
  text: string
  spans: TextSpan[]
  /** Caret position after the edit. */
  caret: number
}

export interface BulletEdit {
  start: number
  end: number
  insert: string
  caret: number
}

export const applyBulletEdit = (
  text: string,
  spans: readonly TextSpan[] | undefined,
  edit: BulletEdit,
  insertStyle?: SpanFlags,
): EditResult => ({
  text: text.slice(0, edit.start) + edit.insert + text.slice(edit.end),
  spans: remapSpans(
    spans,
    text.length,
    { start: edit.start, end: edit.end, insertLength: edit.insert.length },
    insertStyle,
  ),
  caret: edit.caret,
})

/** Typing "- " or "* " at the start of a line (caret right after it) → "• ". */
export const autoBullet = (text: string, caret: number): BulletEdit | null => {
  if (caret < 2) return null
  const marker = text.slice(caret - 2, caret)
  if (marker !== "- " && marker !== "* ") return null
  if (caret - 2 > 0 && text[caret - 3] !== "\n") return null
  return { start: caret - 2, end: caret, insert: BULLET, caret }
}

/** Enter inside a bullet line continues the list; Enter on an empty bullet
 *  line removes the bullet. Null = not a bullet line (default newline). */
export const enterOnBullet = (
  text: string,
  selStart: number,
  selEnd: number,
): BulletEdit | null => {
  const ls = text.lastIndexOf("\n", selStart - 1) + 1
  const le = text.indexOf("\n", ls)
  const line = text.slice(ls, le < 0 ? text.length : le)
  if (!line.startsWith(BULLET) || selStart < ls + BULLET.length) return null
  if (line === BULLET && selStart === selEnd && selStart === ls + BULLET.length) {
    return { start: ls, end: ls + BULLET.length, insert: "", caret: ls }
  }
  const insert = `\n${BULLET}`
  return { start: selStart, end: selEnd, insert, caret: selStart + insert.length }
}
