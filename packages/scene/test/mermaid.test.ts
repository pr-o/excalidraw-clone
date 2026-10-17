import { describe, expect, it } from "vitest"
import { layoutFlowchart, parseMermaidFlowchart, type MermaidFlowchart } from "../src/mermaid"
import type { ExcalidrawElement } from "../src/types"

const ok = (text: string): MermaidFlowchart => {
  const r = parseMermaidFlowchart(text)
  if ("error" in r) throw new Error(r.error)
  return r
}

describe("parseMermaidFlowchart", () => {
  it("parses the header and defaults direction to TD", () => {
    expect(ok("graph").direction).toBe("TD")
    expect(ok("flowchart LR").direction).toBe("LR")
    expect(ok("graph BT").direction).toBe("BT")
  })

  it("errors without a graph/flowchart header", () => {
    expect(parseMermaidFlowchart("A --> B")).toHaveProperty("error")
    expect(parseMermaidFlowchart("   ")).toHaveProperty("error")
    expect(parseMermaidFlowchart("sequenceDiagram")).toHaveProperty("error")
  })

  it("parses every node shape form", () => {
    const f = ok(
      'graph TD\nA\nB[Box]\nC(Round)\nD([Stadium])\nE((Circle))\nF{Choice}\nG["Quoted [x]"]',
    )
    expect(f.nodes).toEqual([
      { id: "A", label: "A", shape: "rectangle" },
      { id: "B", label: "Box", shape: "rectangle" },
      { id: "C", label: "Round", shape: "rectangle" },
      { id: "D", label: "Stadium", shape: "ellipse" },
      { id: "E", label: "Circle", shape: "ellipse" },
      { id: "F", label: "Choice", shape: "diamond" },
      { id: "G", label: "Quoted [x]", shape: "rectangle" },
    ])
  })

  it("parses edge kinds and labels", () => {
    const f = ok(
      "graph LR\nA --> B\nB --- C\nC -.-> D\nD ==> E\nE -->|yes| F\nF -- no --> G\nG ---|plain| H",
    )
    expect(f.edges).toEqual([
      { from: "A", to: "B", style: "arrow" },
      { from: "B", to: "C", style: "open" },
      { from: "C", to: "D", style: "dotted" },
      { from: "D", to: "E", style: "thick" },
      { from: "E", to: "F", label: "yes", style: "arrow" },
      { from: "F", to: "G", label: "no", style: "arrow" },
      { from: "G", to: "H", label: "plain", style: "open" },
    ])
  })

  it("parses chains and semicolon separators, defining nodes inline", () => {
    const f = ok("graph LR; A[Start] --> B{Ok?}; B -->|yes| C[Done] --> D")
    expect(f.nodes.map((n) => n.id)).toEqual(["A", "B", "C", "D"])
    expect(f.nodes[1]).toEqual({ id: "B", label: "Ok?", shape: "diamond" })
    expect(f.edges.map((e) => `${e.from}>${e.to}`)).toEqual(["A>B", "B>C", "C>D"])
  })

  it("ignores %% comments and keeps a later explicit label", () => {
    const f = ok("%% top\ngraph TD\nA --> B %% trailing\n%% A --> Z\nA[Alpha]")
    expect(f.nodes).toEqual([
      { id: "A", label: "Alpha", shape: "rectangle" },
      { id: "B", label: "B", shape: "rectangle" },
    ])
    expect(f.skipped).toEqual([])
  })

  it("skips and reports unsupported lines", () => {
    const f = ok(
      "graph TD\nsubgraph one\nA --> B\nend\nstyle A fill:#f9f\nclassDef x fill:#fff\nclick A call\nA --> C",
    )
    expect(f.edges).toHaveLength(2)
    expect(f.skipped).toEqual([
      "subgraph one",
      "end",
      "style A fill:#f9f",
      "classDef x fill:#fff",
      "click A call",
    ])
  })

  it("reports malformed statements as skipped", () => {
    const f = ok("graph TD\nA[unclosed --> B\nC --> D")
    expect(f.skipped).toEqual(["A[unclosed --> B"])
    expect(f.edges).toEqual([{ from: "C", to: "D", style: "arrow" }])
  })
})

const shapes = (els: ExcalidrawElement[]): ExcalidrawElement[] =>
  els.filter((e) => e.type === "rectangle" || e.type === "ellipse" || e.type === "diamond")

const center = (e: ExcalidrawElement): { x: number; y: number } => ({
  x: e.x + e.width / 2,
  y: e.y + e.height / 2,
})

const overlaps = (a: ExcalidrawElement, b: ExcalidrawElement): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

describe("layoutFlowchart", () => {
  const sample =
    "graph TD\nA[Start] --> B{Ok?}\nB -->|yes| C[Done]\nB -->|no| D[A much longer label]"

  it("creates a labeled shape per node and a bound arrow per edge", () => {
    const els = layoutFlowchart(ok(sample))
    const byId = new Map(els.map((e) => [e.id, e]))
    expect(shapes(els)).toHaveLength(4)
    const arrows = els.filter((e) => e.type === "arrow")
    expect(arrows).toHaveLength(3)
    for (const a of arrows) {
      if (a.type !== "arrow") continue
      const from = byId.get(a.startBinding!.elementId)!
      const to = byId.get(a.endBinding!.elementId)!
      expect(from.boundElements).toContainEqual({ id: a.id, type: "arrow" })
      expect(to.boundElements).toContainEqual({ id: a.id, type: "arrow" })
    }
    const texts = els.filter((e) => e.type === "text")
    expect(texts.map((t) => t.type === "text" && t.text).sort()).toEqual(
      ["A much longer label", "Done", "Ok?", "Start", "no", "yes"].sort(),
    )
    for (const t of texts) {
      if (t.type !== "text") continue
      const c = byId.get(t.containerId!)!
      expect(c.boundElements).toContainEqual({ id: t.id, type: "text" })
    }
  })

  it("assigns longest-path layers top-down for TD, without overlaps", () => {
    const els = layoutFlowchart(ok("graph TD\nA --> B --> C\nA --> C"))
    const [a, b, c] = shapes(els)
    expect(center(a!).y).toBeLessThan(center(b!).y)
    expect(center(b!).y).toBeLessThan(center(c!).y)
    expect(b!.y - (a!.y + a!.height)).toBe(100)
    expect(a!.width).toBeGreaterThanOrEqual(120)
    expect(a!.height).toBeGreaterThanOrEqual(60)
  })

  it("places nodes in a layer 60px apart in order of appearance", () => {
    const els = layoutFlowchart(ok(sample))
    const s = shapes(els)
    const c = s[2]!
    const d = s[3]!
    expect(d.x - (c.x + c.width)).toBe(60)
    expect(d.width).toBeGreaterThan(c.width) // grows with text
    for (let i = 0; i < s.length; i += 1)
      for (let j = i + 1; j < s.length; j += 1) expect(overlaps(s[i]!, s[j]!)).toBe(false)
  })

  it("maps directions to rows/columns and reverses BT/RL", () => {
    const pos = (dir: string): { x: number; y: number }[] =>
      shapes(layoutFlowchart(ok(`graph ${dir}\nA --> B`))).map(center)
    const [lrA, lrB] = pos("LR")
    expect(lrB!.x).toBeGreaterThan(lrA!.x)
    expect(lrB!.y).toBe(lrA!.y)
    const [rlA, rlB] = pos("RL")
    expect(rlB!.x).toBeLessThan(rlA!.x)
    const [btA, btB] = pos("BT")
    expect(btB!.y).toBeLessThan(btA!.y)
    expect(pos("TB")).toEqual(pos("TD"))
  })

  it("tolerates cycles by ignoring back edges for layering", () => {
    const els = layoutFlowchart(ok("graph TD\nA --> B --> C --> A"))
    const [a, b, c] = shapes(els).map(center)
    expect(a!.y).toBeLessThan(b!.y)
    expect(b!.y).toBeLessThan(c!.y)
    expect(els.filter((e) => e.type === "arrow")).toHaveLength(3)
  })

  it("styles open, dotted and thick edges", () => {
    const els = layoutFlowchart(ok("graph TD\nA --- B\nB -.-> C\nC ==> D"))
    const arrows = els.filter((e) => e.type === "arrow")
    const [open, dotted, thick] = arrows
    expect(open!.type === "arrow" && open!.endArrowhead).toBeNull()
    expect(dotted!.strokeStyle).toBe("dashed")
    expect(thick!.strokeWidth).toBe(4)
  })
})
