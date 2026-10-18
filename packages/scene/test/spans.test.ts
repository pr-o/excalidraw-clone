import { describe, expect, it } from "vitest"
import {
  applyBulletEdit,
  autoBullet,
  diffEdit,
  enterOnBullet,
  normalizeSpans,
  remapSpans,
  remapSpansForText,
  sanitizeSpans,
  sliceRuns,
  toggleSpanStyle,
  type TextSpan,
} from "../src"

const b = (start: number, end: number): TextSpan => ({ start, end, bold: true })
const i = (start: number, end: number): TextSpan => ({ start, end, italic: true })

describe("normalizeSpans", () => {
  it("sorts, merges adjacent, drops empty and clamps", () => {
    expect(normalizeSpans([b(5, 8), b(0, 3), b(3, 5), b(4, 4), b(9, 99)], 12)).toEqual([
      b(0, 8),
      b(9, 12),
    ])
  })
  it("unions overlapping different styles into split runs", () => {
    expect(normalizeSpans([b(0, 4), i(2, 6)], 6)).toEqual([
      b(0, 2),
      { start: 2, end: 4, bold: true, italic: true },
      i(4, 6),
    ])
  })
})

describe("sanitizeSpans", () => {
  it("drops non-arrays and malformed entries", () => {
    expect(sanitizeSpans("x", 5)).toBeUndefined()
    expect(
      sanitizeSpans(
        [null, 3, { start: "a", end: 2, bold: true }, { start: 3, end: 1, bold: true }],
        5,
      ),
    ).toBeUndefined()
    expect(
      sanitizeSpans(
        [{ start: 0, end: 2, bold: "yes" }, b(1, 3), { start: 1.5, end: 3, bold: true }],
        5,
      ),
    ).toEqual([b(1, 3)])
  })
})

describe("remapSpans", () => {
  const ed = (start: number, end: number, insertLength: number) => ({ start, end, insertLength })
  it("insert inside a span extends it", () => {
    expect(remapSpans([b(2, 6)], 8, ed(4, 4, 3))).toEqual([b(2, 9)])
  })
  it("insert before a span shifts it (unstyled left)", () => {
    expect(remapSpans([b(2, 6)], 8, ed(1, 1, 2))).toEqual([b(4, 8)])
  })
  it("insert at the end boundary inherits the left style; at the start it does not", () => {
    expect(remapSpans([b(2, 6)], 8, ed(6, 6, 1))).toEqual([b(2, 7)])
    expect(remapSpans([b(2, 6)], 8, ed(2, 2, 1))).toEqual([b(3, 7)])
  })
  it("insertStyle overrides inheritance", () => {
    expect(remapSpans([b(2, 6)], 8, ed(6, 6, 1), { bold: false, italic: false })).toEqual([b(2, 6)])
  })
  it("delete inside shrinks; delete across spans trims both; delete all drops", () => {
    expect(remapSpans([b(2, 6)], 8, ed(3, 5, 0))).toEqual([b(2, 4)])
    expect(remapSpans([b(0, 3), i(5, 8)], 8, ed(2, 6, 0))).toEqual([b(0, 2), i(2, 4)])
    expect(remapSpans([b(2, 4)], 8, ed(1, 5, 0))).toEqual([])
  })
  it("replace across a span boundary", () => {
    expect(remapSpans([b(0, 4)], 8, ed(2, 6, 1))).toEqual([b(0, 3)])
  })
})

describe("diffEdit / remapSpansForText", () => {
  it("diffs a single replacement", () => {
    expect(diffEdit("hello world", "hello brave world")).toEqual({
      start: 6,
      end: 6,
      insertLength: 6,
    })
    expect(diffEdit("abc", "abc")).toEqual({ start: 3, end: 3, insertLength: 0 })
  })
  it("keeps spans consistent for an outside-the-editor text change", () => {
    expect(remapSpansForText([b(6, 11)], "hello world", "hello brave world")).toEqual([b(12, 17)])
    expect(remapSpansForText([b(6, 11)], "hello world", "hello")).toBeUndefined()
    expect(remapSpansForText(undefined, "a", "b")).toBeUndefined()
  })
  it("never corrupts spans through IME-style intermediate edits", () => {
    let text = "ab"
    let spans: TextSpan[] = [b(0, 2)]
    for (const next of ["abㅎ", "ab하", "ab한", "ab한글"]) {
      spans = remapSpans(spans, text.length, diffEdit(text, next))
      text = next
    }
    expect(spans).toEqual([b(0, 4)])
  })
})

describe("toggleSpanStyle", () => {
  it("applies bold on an unstyled range, then clears it", () => {
    const on = toggleSpanStyle(undefined, 11, 6, 11, "bold")
    expect(on).toEqual([b(6, 11)])
    expect(toggleSpanStyle(on, 11, 6, 11, "bold")).toEqual([])
  })
  it("applies when only part of the range is styled; splits on partial clear", () => {
    expect(toggleSpanStyle([b(0, 3)], 8, 2, 6, "bold")).toEqual([b(0, 6)])
    expect(toggleSpanStyle([b(0, 8)], 8, 2, 5, "bold")).toEqual([b(0, 2), b(5, 8)])
  })
  it("styles are independent", () => {
    expect(toggleSpanStyle([b(0, 4)], 4, 0, 4, "italic")).toEqual([
      { start: 0, end: 4, bold: true, italic: true },
    ])
  })
})

describe("sliceRuns", () => {
  it("partitions the slice into style runs", () => {
    expect(sliceRuns("hello world", [b(6, 11)], 3, 11)).toEqual([
      { text: "lo ", bold: false, italic: false },
      { text: "world", bold: true, italic: false },
    ])
  })
})

describe("bullets", () => {
  it("auto-converts '- ' and '* ' at line start only", () => {
    expect(autoBullet("- ", 2)).toEqual({ start: 0, end: 2, insert: "• ", caret: 2 })
    expect(autoBullet("a\n* ", 4)).toMatchObject({ start: 2, end: 4 })
    expect(autoBullet("a - ", 4)).toBeNull()
    expect(autoBullet("-", 1)).toBeNull()
  })
  it("Enter on a bullet line continues the list", () => {
    const edit = enterOnBullet("• item", 6, 6)!
    expect(applyBulletEdit("• item", undefined, edit).text).toBe("• item\n• ")
    expect(edit.caret).toBe(9)
  })
  it("Enter on an empty bullet line removes the bullet", () => {
    const r = applyBulletEdit("• a\n• ", undefined, enterOnBullet("• a\n• ", 6, 6)!)
    expect(r.text).toBe("• a\n")
    expect(r.caret).toBe(4)
  })
  it("Enter on a non-bullet line is left to the browser", () => {
    expect(enterOnBullet("plain", 5, 5)).toBeNull()
    expect(enterOnBullet("• item", 1, 1)).toBeNull()
  })
})
