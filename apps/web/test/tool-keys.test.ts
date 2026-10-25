import { afterEach, describe, expect, it, vi } from "vitest"
import {
  DEFAULT_TOOL_KEYS,
  effectiveToolKeys,
  loadToolKeyOverrides,
  saveToolKeyOverrides,
  setToolKey,
  toolForKey,
  validateToolKey,
} from "../src/keyboard/toolKeys"

describe("tool key map", () => {
  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it("merges overrides over the defaults", () => {
    const map = effectiveToolKeys({ rectangle: "q" })
    expect(map.rectangle).toBe("q")
    expect(map.ellipse).toBe(DEFAULT_TOOL_KEYS.ellipse)
    expect(toolForKey("q", { rectangle: "q" })).toBe("rectangle")
    expect(toolForKey("r", { rectangle: "q" })).toBeUndefined()
    expect(toolForKey("r", {})).toBe("rectangle")
  })

  it("validates a candidate key", () => {
    expect(validateToolKey("rectangle", "q", false, {})).toBeNull()
    expect(validateToolKey("rectangle", "Q", false, {})).toBeNull()
    expect(validateToolKey("rectangle", "r", false, {})).toBeNull()
    expect(validateToolKey("rectangle", "q", true, {})).toBe("modifier")
    expect(validateToolKey("rectangle", "Enter", false, {})).toBe("notPrintable")
    expect(validateToolKey("rectangle", "?", false, {})).toBe("reserved")
    expect(validateToolKey("rectangle", " ", false, {})).toBe("reserved")
    expect(validateToolKey("rectangle", "o", false, {})).toBe("taken")
    // A key freed by a rebind becomes available.
    expect(validateToolKey("rectangle", "o", false, { ellipse: "x" })).toBeNull()
  })

  it("setToolKey lowercases, and drops overrides equal to the default", () => {
    expect(setToolKey({}, "rectangle", "Q")).toEqual({ rectangle: "q" })
    expect(setToolKey({ rectangle: "q" }, "rectangle", "r")).toEqual({})
    expect(setToolKey({ rectangle: "q", ellipse: "x" }, "rectangle", null)).toEqual({
      ellipse: "x",
    })
  })

  it("round-trips through storage and ignores junk", () => {
    saveToolKeyOverrides({ rectangle: "q" })
    expect(loadToolKeyOverrides()).toEqual({ rectangle: "q" })
    localStorage.setItem("excalidraw-tool-keys", '{"rectangle":"qq","bogus":"z","line":"Y"}')
    expect(loadToolKeyOverrides()).toEqual({ line: "y" })
    localStorage.setItem("excalidraw-tool-keys", "not json")
    expect(loadToolKeyOverrides()).toEqual({})
  })

  it("survives unavailable storage", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked")
    })
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked")
    })
    expect(loadToolKeyOverrides()).toEqual({})
    expect(() => saveToolKeyOverrides({ rectangle: "q" })).not.toThrow()
  })
})
