import { describe, expect, it } from "vitest"
import { layerGraph } from "../src/layering"
import { layoutFlowchart, parseMermaidFlowchart } from "../src/mermaid"

const e = (from: string, to: string) => ({ from, to })

describe("layerGraph", () => {
  it("layers by longest path", () => {
    const { layerOf } = layerGraph(["a", "b", "c"], [e("a", "b"), e("b", "c"), e("a", "c")])
    expect([layerOf.get("a"), layerOf.get("b"), layerOf.get("c")]).toEqual([0, 1, 2])
  })

  it("drops the back edge of a cycle so layering terminates", () => {
    const { layerOf, dag } = layerGraph(["a", "b"], [e("a", "b"), e("b", "a")])
    expect([layerOf.get("a"), layerOf.get("b")]).toEqual([0, 1])
    expect(dag).toEqual([e("a", "b")])
  })

  it("ignores edges that mention unknown nodes", () => {
    const { layerOf } = layerGraph(["a"], [e("a", "ghost"), e("ghost", "a")])
    expect([...layerOf.keys()]).toEqual(["a"])
  })

  it("handles a very long chain without overflowing the stack", () => {
    const ids = Array.from({ length: 30000 }, (_, i) => `n${i}`)
    const { layerOf } = layerGraph(
      ids,
      ids.slice(1).map((id, i) => e(ids[i]!, id)),
    )
    expect(layerOf.get("n29999")).toBe(29999)
  })
})

describe("mermaid layout shares the layering", () => {
  it("lays out a long flowchart chain", () => {
    const text = `graph TD\n${Array.from({ length: 4000 }, (_, i) => `N${i} --> N${i + 1}`).join("\n")}`
    const parsed = parseMermaidFlowchart(text)
    if ("error" in parsed) throw new Error(parsed.error)
    expect(layoutFlowchart(parsed).length).toBeGreaterThan(4000)
  })
})
