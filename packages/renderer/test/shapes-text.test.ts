import { newText } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { drawText } from "../src/shapes/text"
import { createMockCanvas } from "../src/test-utils/mock-canvas"

describe("drawText", () => {
  it("writes one fillText per non-empty line", () => {
    const { ctx } = createMockCanvas()
    const t = { ...newText({ x: 0, y: 0, text: "hello\nworld" }) }
    drawText(ctx as unknown as CanvasRenderingContext2D, t)
    const fillTextCalls = ctx.__calls.filter((c) => c.method === "fillText")
    expect(fillTextCalls.length).toBe(2)
    expect(fillTextCalls[0]?.args[0]).toBe("hello")
    expect(fillTextCalls[1]?.args[0]).toBe("world")
  })

  it("sets textAlign on the context", () => {
    const { ctx } = createMockCanvas()
    const t = { ...newText({ x: 0, y: 0, text: "hi", textAlign: "center" }) }
    drawText(ctx as unknown as CanvasRenderingContext2D, t)
    expect(ctx.__props.textAlign).toBe("center")
  })

  it("empty text writes no fillText calls", () => {
    const { ctx } = createMockCanvas()
    const t = { ...newText({ x: 0, y: 0 }) }
    drawText(ctx as unknown as CanvasRenderingContext2D, t)
    expect(ctx.__calls.filter((c) => c.method === "fillText").length).toBe(0)
  })

  it("uses the element strokeColor as fillStyle", () => {
    const { ctx } = createMockCanvas()
    const t = { ...newText({ x: 0, y: 0, text: "hi", strokeColor: "#ff00ff" }) }
    drawText(ctx as unknown as CanvasRenderingContext2D, t)
    expect(ctx.__props.fillStyle).toBe("#ff00ff")
  })

  it("includes fontSize in the font spec", () => {
    const { ctx } = createMockCanvas()
    const t = { ...newText({ x: 0, y: 0, text: "hi", fontSize: 32 }) }
    drawText(ctx as unknown as CanvasRenderingContext2D, t)
    expect(typeof ctx.__props.font).toBe("string")
    expect((ctx.__props.font as string).includes("32px")).toBe(true)
  })

  it("with occlude, fills a padded backing rect before the text", () => {
    const { ctx } = createMockCanvas()
    // mock measureText: width = text.length * 10 → "hi" = 20
    // default fontSize 20 × lineHeight 1.25 → line height 25; box is 0×0
    const t = { ...newText({ x: 0, y: 0, text: "hi" }) }
    drawText(ctx as unknown as CanvasRenderingContext2D, t, undefined, {
      occlude: { background: "#ffffff" },
    })
    const rects = ctx.__calls.filter((c) => c.method === "fillRect")
    expect(rects).toHaveLength(1)
    expect(rects[0]!.args).toEqual([-14, -16.5, 28, 33])
    const order = ctx.__calls.map((c) => c.method)
    expect(order.indexOf("fillRect")).toBeLessThan(order.indexOf("fillText"))
  })

  it("without occlude, no backing rect is filled", () => {
    const { ctx } = createMockCanvas()
    const t = { ...newText({ x: 0, y: 0, text: "hi" }) }
    drawText(ctx as unknown as CanvasRenderingContext2D, t)
    expect(ctx.__calls.filter((c) => c.method === "fillRect")).toHaveLength(0)
  })

  it("occlude with empty text draws nothing", () => {
    const { ctx } = createMockCanvas()
    const t = { ...newText({ x: 0, y: 0 }) }
    drawText(ctx as unknown as CanvasRenderingContext2D, t, undefined, {
      occlude: { background: "#ffffff" },
    })
    expect(ctx.__calls).toHaveLength(0)
  })

  it("fit shrinks the font so a wide line fits the box width", () => {
    const { ctx } = createMockCanvas()
    // "hi!!" → mock width 40; box width 20 → scale 0.5 → 20px × 0.5 = 10px
    const t = { ...newText({ x: 0, y: 0, width: 20, height: 64, text: "hi!!" }) }
    drawText(ctx as unknown as CanvasRenderingContext2D, t, undefined, { fit: true })
    expect((ctx.__props.font as string).startsWith("10px")).toBe(true)
  })

  it("fit leaves text that already fits at its natural size", () => {
    const { ctx } = createMockCanvas()
    // "hi" → width 20 ≤ 84; height 25 ≤ 64 → scale 1
    const t = { ...newText({ x: 0, y: 0, width: 84, height: 64, text: "hi" }) }
    drawText(ctx as unknown as CanvasRenderingContext2D, t, undefined, { fit: true })
    expect((ctx.__props.font as string).startsWith("20px")).toBe(true)
  })

  it("fit shrinks by the height bound for tall multi-line text", () => {
    const { ctx } = createMockCanvas()
    // 4 lines × 25 = 100 natural height; box height 50 → scale 0.5 → 10px
    const t = { ...newText({ x: 0, y: 0, width: 84, height: 50, text: "a\nb\nc\nd" }) }
    drawText(ctx as unknown as CanvasRenderingContext2D, t, undefined, { fit: true })
    expect((ctx.__props.font as string).startsWith("10px")).toBe(true)
  })

  it("fit with empty text draws nothing", () => {
    const { ctx } = createMockCanvas()
    const t = { ...newText({ x: 0, y: 0, width: 20, height: 20 }) }
    drawText(ctx as unknown as CanvasRenderingContext2D, t, undefined, { fit: true })
    expect(ctx.__calls).toHaveLength(0)
  })
})
