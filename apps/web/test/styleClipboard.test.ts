import { newArrow, newEllipse, newLine, newRectangle, newText } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { applyStyle, extractStyle } from "../src/keyboard/styleClipboard"

describe("extractStyle", () => {
  it("captures only base style fields from a rectangle", () => {
    const rect = newRectangle({ x: 0, y: 0, width: 10, height: 10, strokeColor: "#ff0000" })
    const clip = extractStyle(rect)
    expect(clip.base.strokeColor).toBe("#ff0000")
    expect(clip.base).toEqual({
      strokeColor: rect.strokeColor,
      backgroundColor: rect.backgroundColor,
      fillStyle: rect.fillStyle,
      strokeWidth: rect.strokeWidth,
      strokeStyle: rect.strokeStyle,
      roughness: rect.roughness,
      opacity: rect.opacity,
      roundness: rect.roundness,
    })
    expect(clip.text).toBeUndefined()
    expect(clip.linear).toBeUndefined()
  })

  it("captures base + text style fields from a text element", () => {
    const text = newText({
      x: 0,
      y: 0,
      text: "hi",
      fontSize: 36,
      fontFamily: 3,
      textAlign: "center",
      verticalAlign: "middle",
    })
    const clip = extractStyle(text)
    expect(clip.base.strokeColor).toBe(text.strokeColor)
    expect(clip.text).toEqual({
      fontFamily: 3,
      fontSize: 36,
      textAlign: "center",
      verticalAlign: "middle",
    })
    expect(clip.linear).toBeUndefined()
  })

  it("captures base + arrowhead fields from an arrow", () => {
    const arrow = {
      ...newArrow({ x: 0, y: 0, width: 10, height: 0 }),
      startArrowhead: "dot" as const,
    }
    const clip = extractStyle(arrow)
    expect(clip.linear).toEqual({ startArrowhead: "dot", endArrowhead: "arrow" })
    expect(clip.text).toBeUndefined()
  })

  it("captures base + arrowhead fields from a line", () => {
    const line = newLine({ x: 0, y: 0, width: 10, height: 0 })
    const clip = extractStyle(line)
    expect(clip.linear).toEqual({ startArrowhead: null, endArrowhead: null })
    expect(clip.text).toBeUndefined()
  })
})

describe("applyStyle", () => {
  it("copies base fields onto any target type, leaving geometry untouched", () => {
    const source = {
      ...newRectangle({
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        strokeColor: "#ff0000",
        backgroundColor: "#00ff00",
      }),
      strokeWidth: 4 as const,
      strokeStyle: "dashed" as const,
      opacity: 40,
    }
    const target = newEllipse({ x: 77, y: 88, width: 33, height: 44 })
    const next = applyStyle(target, extractStyle(source))
    expect(next.strokeColor).toBe("#ff0000")
    expect(next.backgroundColor).toBe("#00ff00")
    expect(next.strokeWidth).toBe(4)
    expect(next.strokeStyle).toBe("dashed")
    expect(next.opacity).toBe(40)
    expect({ x: next.x, y: next.y, width: next.width, height: next.height }).toEqual({
      x: 77,
      y: 88,
      width: 33,
      height: 44,
    })
    expect(next.id).toBe(target.id)
    expect(next.type).toBe("ellipse")
  })

  it("applies text fields when the target is text", () => {
    const source = newText({ x: 0, y: 0, text: "a", fontSize: 36, textAlign: "center" })
    const target = newText({ x: 5, y: 5, text: "b", fontSize: 16, textAlign: "left" })
    const next = applyStyle(target, extractStyle(source))
    expect(next.type === "text" && next.fontSize).toBe(36)
    expect(next.type === "text" && next.textAlign).toBe("center")
    expect(next.type === "text" && next.text).toBe("b")
  })

  it("skips text fields when the target is not text", () => {
    const source = newText({ x: 0, y: 0, text: "a", fontSize: 36, textAlign: "center" })
    const target = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const next = applyStyle(target, extractStyle(source))
    expect(next).not.toHaveProperty("fontSize")
    expect(next).not.toHaveProperty("textAlign")
    expect(Object.keys(next).sort()).toEqual(Object.keys(target).sort())
  })

  it("applies arrowhead fields when the target is arrow or line", () => {
    const source = {
      ...newArrow({ x: 0, y: 0, width: 10, height: 0 }),
      startArrowhead: "dot" as const,
      endArrowhead: "bar" as const,
    }
    const target = newLine({ x: 0, y: 0, width: 10, height: 0 })
    const next = applyStyle(target, extractStyle(source))
    expect(next.type === "line" && next.startArrowhead).toBe("dot")
    expect(next.type === "line" && next.endArrowhead).toBe("bar")
  })

  it("skips arrowhead fields when the target is not arrow or line", () => {
    const source = newArrow({ x: 0, y: 0, width: 10, height: 0 })
    const target = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const next = applyStyle(target, extractStyle(source))
    expect(next).not.toHaveProperty("startArrowhead")
    expect(next).not.toHaveProperty("endArrowhead")
  })

  it("returns a new object without mutating the input element", () => {
    const source = newRectangle({ x: 0, y: 0, width: 1, height: 1, strokeColor: "#ff0000" })
    const target = newRectangle({ x: 0, y: 0, width: 1, height: 1, strokeColor: "#0000ff" })
    const next = applyStyle(target, extractStyle(source))
    expect(next).not.toBe(target)
    expect(target.strokeColor).toBe("#0000ff")
    expect(next.strokeColor).toBe("#ff0000")
  })
})
