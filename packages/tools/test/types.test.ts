import { describe, expect, it } from "vitest"
import { NO_EFFECTS } from "../src"
import type { ToolEffect, ToolEvent } from "../src"

describe("NO_EFFECTS", () => {
  it("is an empty array", () => {
    expect(NO_EFFECTS).toEqual([])
    expect(NO_EFFECTS.length).toBe(0)
  })
})

describe("ToolEvent narrowing", () => {
  it("pointerDown carries an at point", () => {
    const e: ToolEvent = { type: "pointerDown", at: { x: 1, y: 2 } }
    if (e.type === "pointerDown") {
      expect(e.at).toEqual({ x: 1, y: 2 })
    } else {
      throw new Error("unexpected narrowing")
    }
  })

  it("escape carries no payload", () => {
    const e: ToolEvent = { type: "escape" }
    expect(e.type).toBe("escape")
  })

  it("delete carries no payload", () => {
    const e: ToolEvent = { type: "delete" }
    expect(e.type).toBe("delete")
  })
})

describe("ToolEffect narrowing", () => {
  it("mutation carries apply", () => {
    const e: ToolEffect = { kind: "mutation", apply: () => undefined }
    if (e.kind === "mutation") {
      expect(typeof e.apply).toBe("function")
    } else {
      throw new Error("unexpected narrowing")
    }
  })

  it("select carries ids", () => {
    const e: ToolEffect = { kind: "select", ids: ["a", "b"] }
    if (e.kind === "select") {
      expect(e.ids.length).toBe(2)
    } else {
      throw new Error("unexpected narrowing")
    }
  })

  it("startTextEdit carries elementId", () => {
    const e: ToolEffect = { kind: "startTextEdit", elementId: "x" }
    if (e.kind === "startTextEdit") {
      expect(e.elementId).toBe("x")
    } else {
      throw new Error("unexpected narrowing")
    }
  })

  it("switchTool carries tool name", () => {
    const e: ToolEffect = { kind: "switchTool", tool: "selection" }
    if (e.kind === "switchTool") {
      expect(e.tool).toBe("selection")
    } else {
      throw new Error("unexpected narrowing")
    }
  })
})
