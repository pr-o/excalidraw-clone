import { describe, expect, it } from "vitest"
import { keyboardPanDelta } from "../src/hooks/useKeyboardAvoidance"

describe("keyboardPanDelta", () => {
  it("scrolls just enough to lift a covered field above the keyboard (12px margin)", () => {
    expect(keyboardPanDelta(700, 400)).toBe(312)
  })
  it("leaves a visible field alone", () => {
    expect(keyboardPanDelta(300, 400)).toBe(0)
  })
})
