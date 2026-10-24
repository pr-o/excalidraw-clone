import { describe, expect, it } from "vitest"
import {
  exportMermaidFlowchart,
  layoutFlowchart,
  parseMermaidFlowchart,
  type MermaidFlowchart,
} from "../src/mermaid"
import { newRectangle, newText } from "../src/factories"
import type { ExcalidrawElement } from "../src/types"

const ok = (text: string): MermaidFlowchart => {
  const r = parseMermaidFlowchart(text)
  if ("error" in r) throw new Error(r.error)
  return r
}

const build = (text: string): ExcalidrawElement[] => layoutFlowchart(ok(text))

describe("exportMermaidFlowchart", () => {
  it("round-trips nodes, edges, labels and shapes through the parser", () => {
    const src = "graph TD\nA[Start] --> B{Ok?}\nB -->|yes| C((Done))\nB -.->|no| D[Retry]\nD --> A"
    const back = ok(exportMermaidFlowchart(build(src)))
    const orig = ok(src)
    expect(back.direction).toBe("TD")
    expect(back.nodes.map((n) => [n.label, n.shape])).toEqual(
      orig.nodes.map((n) => [n.label, n.shape]),
    )
    const label = (f: MermaidFlowchart, id: string): string =>
      f.nodes.find((n) => n.id === id)!.label
    const edges = (f: MermaidFlowchart): string[] =>
      f.edges.map((e) => `${label(f, e.from)}>${label(f, e.to)}|${e.label ?? ""}|${e.style}`)
    expect(edges(back)).toEqual(edges(orig))
    expect(back.skipped).toEqual([])
  })

  it("emits deterministic ids and syntax", () => {
    expect(exportMermaidFlowchart(build("graph LR\nX[One] --> Y{Two}\nY --- Z((Three))"))).toBe(
      ["flowchart LR", '  A["One"]', '  B{"Two"}', '  C(("Three"))', "  A --> B", "  B --- C"].join(
        "\n",
      ),
    )
  })

  it("picks LR when arrows mostly run horizontally, TD otherwise", () => {
    expect(exportMermaidFlowchart(build("graph LR\nA --> B --> C"))).toMatch(/^flowchart LR/)
    expect(exportMermaidFlowchart(build("graph RL\nA --> B"))).toMatch(/^flowchart LR/)
    expect(exportMermaidFlowchart(build("graph BT\nA --> B"))).toMatch(/^flowchart TD/)
    expect(exportMermaidFlowchart([])).toBe("flowchart TD")
  })

  it("escapes characters the parser would misread, and round-trips them", () => {
    const tricky = 'say "hi" [x] {y} | a;b %% c #1'
    const shape = newRectangle({ x: 0, y: 0, width: 100, height: 50 })
    const text = {
      ...newText({ x: 0, y: 0, text: `${tricky}\nline2` }),
      containerId: shape.id,
    }
    const els = [{ ...shape, boundElements: [{ id: text.id, type: "text" as const }] }, text]
    const out = exportMermaidFlowchart(els)
    const back = ok(out)
    expect(back.skipped).toEqual([])
    expect(back.nodes).toEqual([{ id: "A", label: `${tricky}\nline2`, shape: "rectangle" }])
  })

  it("exports unlabeled shapes as bare ids, rounded rects as (..), others as [..]", () => {
    const label = (shape: ExcalidrawElement, s: string): ExcalidrawElement[] => {
      const text = { ...newText({ x: 0, y: 0, text: s }), containerId: shape.id }
      return [{ ...shape, boundElements: [{ id: text.id, type: "text" as const }] }, text]
    }
    const plain = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const rounded = {
      ...newRectangle({ x: 0, y: 50, width: 10, height: 10 }),
      roundness: { type: 2 as const },
    }
    const hex = {
      ...newRectangle({ x: 0, y: 100, width: 10, height: 10 }),
      type: "hexagon" as const,
    }
    expect(exportMermaidFlowchart([plain, ...label(rounded, "r"), ...label(hex, "h")])).toBe(
      ["flowchart TD", "  A", '  B("r")', '  C["h"]'].join("\n"),
    )
  })

  it("ignores unbound arrows, free text and non-shape elements; honours ids", () => {
    const els = build("graph TD\nA[One] --> B[Two]\nB --> C[Three]")
    const free = newText({ x: 500, y: 500, text: "loose" })
    const out = exportMermaidFlowchart([...els, free])
    expect(out).not.toContain("loose")
    const [one, two] = els.filter((e) => e.type === "rectangle")
    // Only the first two shapes selected: the B->C edge drops out with C.
    const sel = exportMermaidFlowchart(els, [one!.id, two!.id])
    expect(ok(sel).nodes.map((n) => n.label)).toEqual(["One", "Two"])
    expect(ok(sel).edges).toHaveLength(1)
  })
})
