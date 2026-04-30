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
})
