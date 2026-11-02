import { newRectangle, newText } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { describeUnit, navigationUnits, stepSelection } from "../src/keyboard/canvasNavigation"

const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
const g1 = { ...newRectangle({ x: 20, y: 0, width: 10, height: 10 }), groupIds: ["g"] }
const label = { ...newText({ x: 22, y: 2, text: "hi" }), containerId: g1.id }
const g2 = { ...newRectangle({ x: 40, y: 0, width: 10, height: 10 }), groupIds: ["g"] }
const locked = { ...newRectangle({ x: 60, y: 0, width: 10, height: 10 }), locked: true }
const b = newRectangle({ x: 80, y: 0, width: 10, height: 10 })
const all = [a, g1, label, g2, locked, b]

describe("canvas keyboard navigation", () => {
  it("units: one per element or group, skipping bound labels and locked elements", () => {
    expect(navigationUnits(all)).toEqual([[a.id], [g1.id, g2.id], [b.id]])
  })

  it("steps forward/back from the selection and returns null past either end", () => {
    expect(stepSelection(all, [], 1)?.ids).toEqual([a.id])
    expect(stepSelection(all, [], -1)?.ids).toEqual([b.id])
    expect(stepSelection(all, [a.id], 1)?.ids).toEqual([g1.id, g2.id])
    expect(stepSelection(all, [g2.id], 1)).toMatchObject({ ids: [b.id], index: 2, count: 3 })
    expect(stepSelection(all, [g1.id, g2.id], -1)?.ids).toEqual([a.id])
    expect(stepSelection(all, [b.id], 1)).toBeNull()
    expect(stepSelection(all, [a.id], -1)).toBeNull()
  })

  it("describes type, bound label, bounds and position", () => {
    const t = (key: string, o: Record<string, unknown> = {}): string => {
      const v = (k: string): string => String(o[k])
      if (key === "a11y.element")
        return `${v("type")}${v("label")} @${v("x")},${v("y")} ${v("width")}x${v("height")} ${v("index")}/${v("count")}`
      if (key === "a11y.elementLabel") return ` "${v("text")}"`
      if (key === "a11y.groupOf") return `group ${v("count")} `
      return key
    }
    const withLabel = {
      ...g1,
      groupIds: [],
      boundElements: [{ id: label.id, type: "text" as const }],
    }
    expect(describeUnit([withLabel.id], [withLabel, label], 0, 1, t)).toBe(
      'toolbar.rectangle "hi" @20,0 10x10 1/1',
    )
    expect(describeUnit([g1.id, g2.id], all, 1, 3, t)).toBe(
      "group 2 toolbar.rectangle @20,0 30x10 2/3",
    )
  })
})
