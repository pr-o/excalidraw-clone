import { describe, expect, it } from "vitest"
import { BUILTIN_TEMPLATES } from "../src/templates"
import type { ExcalidrawElement } from "../src/types"

describe("BUILTIN_TEMPLATES", () => {
  it("exposes exactly the flowchart and kanban templates", () => {
    expect(BUILTIN_TEMPLATES.map((t) => t.id)).toEqual(["builtin-flowchart", "builtin-kanban"])
    for (const t of BUILTIN_TEMPLATES) {
      expect(t.name.length).toBeGreaterThan(0)
      expect(t.created).toBe(0)
      expect(t.elements.length).toBeGreaterThan(0)
    }
  })

  it("resolves every arrow binding to an element in the same template", () => {
    for (const t of BUILTIN_TEMPLATES) {
      const ids = new Set(t.elements.map((e) => e.id))
      for (const el of t.elements) {
        if (el.type !== "arrow") continue
        if (el.startBinding) expect(ids.has(el.startBinding.elementId)).toBe(true)
        if (el.endBinding) expect(ids.has(el.endBinding.elementId)).toBe(true)
      }
    }
  })

  it("keeps every bound text consistent with its container", () => {
    for (const t of BUILTIN_TEMPLATES) {
      const byId = new Map<string, ExcalidrawElement>(t.elements.map((e) => [e.id, e]))
      for (const el of t.elements) {
        if (el.type !== "text" || el.containerId == null) continue
        const container = byId.get(el.containerId)
        expect(container).toBeDefined()
        expect(container!.boundElements?.some((b) => b.id === el.id)).toBe(true)
      }
    }
  })

  it("has at least one fully bound arrow in the flowchart", () => {
    const flow = BUILTIN_TEMPLATES.find((t) => t.id === "builtin-flowchart")!
    const bound = flow.elements.filter((e) => e.type === "arrow" && e.startBinding && e.endBinding)
    expect(bound.length).toBeGreaterThanOrEqual(3)
  })
})
