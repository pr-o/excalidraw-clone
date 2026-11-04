import { type Bounds } from "@excalidraw-clone/geometry"
import { canBindTo } from "./bindings"
import { getElementBounds } from "./bounds"
import type { PositionPatch } from "./arrange"
import { layerGraph } from "./layering"
import type { ExcalidrawElement } from "./types"
import { isBoundLabel } from "./bound-label"

/**
 * - `tree-down` / `tree-right`: layered (Sugiyama-style) layout, layers flowing
 *   top-to-bottom or left-to-right along the arrow direction.
 * - `radial`: the root in the middle, each BFS depth on its own ring.
 */
export type GraphLayoutMode = "tree-down" | "tree-right" | "radial"

export interface GraphEdge {
  from: string
  to: string
  arrowId: string
}

/** Space between layers (main axis) and between siblings (cross axis). */
const LAYER_GAP = 80
const NODE_GAP = 40
/** Space between disconnected components laid out side by side. */
const COMPONENT_GAP = 80

const isNode = (el: ExcalidrawElement): boolean => canBindTo(el) && !el.locked && !isBoundLabel(el)

/**
 * The layout graph of a selection: nodes are the selected bindable shapes
 * (bound labels excluded), edges are the scene's arrows bound at both ends to
 * two different selected nodes. The arrows need not be selected themselves.
 */
export function graphEdges(
  selected: readonly ExcalidrawElement[],
  all: readonly ExcalidrawElement[],
): GraphEdge[] {
  const ids = new Set(selected.filter(isNode).map((el) => el.id))
  const edges: GraphEdge[] = []
  for (const el of all) {
    if (el.type !== "arrow" || el.isDeleted || !el.startBinding || !el.endBinding) continue
    const from = el.startBinding.elementId
    const to = el.endBinding.elementId
    if (from !== to && ids.has(from) && ids.has(to)) edges.push({ from, to, arrowId: el.id })
  }
  return edges
}

interface GNode {
  id: string
  el: ExcalidrawElement
  b: Bounds
}

interface Placed {
  /** Top-left of each node, relative to the component's own origin. */
  pos: Map<string, { x: number; y: number }>
  width: number
  height: number
}

/** Splits the graph into weakly connected components, in first-node order. */
function components(nodes: readonly GNode[], edges: readonly GraphEdge[]): GNode[][] {
  const adj = new Map<string, string[]>(nodes.map((n) => [n.id, []]))
  for (const e of edges) {
    adj.get(e.from)!.push(e.to)
    adj.get(e.to)!.push(e.from)
  }
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const seen = new Set<string>()
  const out: GNode[][] = []
  for (const n of nodes) {
    if (seen.has(n.id)) continue
    const comp: GNode[] = []
    const stack = [n.id]
    seen.add(n.id)
    while (stack.length) {
      const id = stack.pop()!
      comp.push(byId.get(id)!)
      for (const next of adj.get(id)!) {
        if (!seen.has(next)) {
          seen.add(next)
          stack.push(next)
        }
      }
    }
    out.push(comp)
  }
  return out
}

/** Layers one component; roots (fewest incoming arrows) are tried first. */
function assignLayers(
  comp: readonly GNode[],
  edges: readonly GraphEdge[],
  crossKey: (n: GNode) => number,
): { layerOf: Map<string, number>; dag: GraphEdge[] } {
  const ids = new Set(comp.map((n) => n.id))
  const inComp = edges.filter((e) => ids.has(e.from) && ids.has(e.to))
  const indegree = new Map<string, number>(comp.map((n) => [n.id, 0]))
  for (const e of inComp) indegree.set(e.to, indegree.get(e.to)! + 1)
  // For pure cycles the leftmost/topmost node starts, so it decides the dropped edge.
  const starts = [...comp].sort(
    (p, q) => indegree.get(p.id)! - indegree.get(q.id)! || crossKey(p) - crossKey(q),
  )
  return layerGraph(
    starts.map((n) => n.id),
    inComp,
  )
}

function layoutLayered(
  comp: readonly GNode[],
  edges: readonly GraphEdge[],
  horizontal: boolean,
): Placed {
  const main = (n: GNode): number => (horizontal ? n.b.width : n.b.height)
  const cross = (n: GNode): number => (horizontal ? n.b.height : n.b.width)
  const crossKey = (n: GNode): number =>
    horizontal ? n.b.y + n.b.height / 2 : n.b.x + n.b.width / 2

  const { layerOf, dag } = assignLayers(comp, edges, crossKey)
  const layers: GNode[][] = []
  for (const n of comp) (layers[layerOf.get(n.id)!] ??= []).push(n)
  for (const layer of layers) layer.sort((p, q) => crossKey(p) - crossKey(q))

  // Barycenter sweeps to cut crossings; ties keep their current order (stable sort).
  const preds = new Map<string, string[]>(comp.map((n) => [n.id, []]))
  const succs = new Map<string, string[]>(comp.map((n) => [n.id, []]))
  for (const e of dag) {
    preds.get(e.to)!.push(e.from)
    succs.get(e.from)!.push(e.to)
  }
  const index = new Map<string, number>()
  const reindex = (): void => {
    for (const layer of layers) layer.forEach((n, i) => index.set(n.id, i))
  }
  reindex()
  const sweep = (layer: GNode[], neighbours: Map<string, string[]>): void => {
    const score = new Map<string, number>()
    for (const n of layer) {
      const ns = neighbours.get(n.id)!
      score.set(
        n.id,
        ns.length ? ns.reduce((s, id) => s + index.get(id)!, 0) / ns.length : index.get(n.id)!,
      )
    }
    layer.sort((p, q) => score.get(p.id)! - score.get(q.id)!)
    layer.forEach((n, i) => index.set(n.id, i))
  }
  for (let pass = 0; pass < 4; pass += 1) {
    for (let l = 1; l < layers.length; l += 1) sweep(layers[l]!, preds)
    for (let l = layers.length - 2; l >= 0; l -= 1) sweep(layers[l]!, succs)
  }

  const spans = layers.map(
    (layer) => layer.reduce((s, n) => s + cross(n), 0) + NODE_GAP * (layer.length - 1),
  )
  const widest = Math.max(...spans)
  const pos = new Map<string, { x: number; y: number }>()
  let mainPos = 0
  layers.forEach((layer, l) => {
    const band = Math.max(...layer.map(main))
    let crossPos = (widest - spans[l]!) / 2
    for (const n of layer) {
      const m = mainPos + (band - main(n)) / 2
      pos.set(n.id, horizontal ? { x: m, y: crossPos } : { x: crossPos, y: m })
      crossPos += cross(n) + NODE_GAP
    }
    mainPos += band + LAYER_GAP
  })
  const total = mainPos - LAYER_GAP
  return horizontal ? { pos, width: total, height: widest } : { pos, width: widest, height: total }
}

function layoutRadial(comp: readonly GNode[], edges: readonly GraphEdge[]): Placed {
  const ids = new Set(comp.map((n) => n.id))
  const byId = new Map(comp.map((n) => [n.id, n]))
  const nbrs = new Map<string, string[]>(comp.map((n) => [n.id, []]))
  const indegree = new Map<string, number>(comp.map((n) => [n.id, 0]))
  const outdegree = new Map<string, number>(comp.map((n) => [n.id, 0]))
  for (const e of edges) {
    if (!ids.has(e.from) || !ids.has(e.to)) continue
    nbrs.get(e.from)!.push(e.to)
    nbrs.get(e.to)!.push(e.from)
    outdegree.set(e.from, outdegree.get(e.from)! + 1)
    indegree.set(e.to, indegree.get(e.to)! + 1)
  }

  // Root: a source with the most outgoing arrows; otherwise the best connected node.
  const root = [...comp].sort(
    (p, q) =>
      Number(indegree.get(q.id) === 0) - Number(indegree.get(p.id) === 0) ||
      outdegree.get(q.id)! - outdegree.get(p.id)! ||
      nbrs.get(q.id)!.length - nbrs.get(p.id)!.length ||
      p.b.y - q.b.y ||
      p.b.x - q.b.x,
  )[0]!

  const depth = new Map<string, number>([[root.id, 0]])
  const parent = new Map<string, string>()
  const rings: GNode[][] = [[root]]
  for (let queue = [root]; queue.length;) {
    const next: GNode[] = []
    for (const n of queue) {
      for (const id of nbrs.get(n.id)!) {
        if (depth.has(id)) continue
        depth.set(id, depth.get(n.id)! + 1)
        parent.set(id, n.id)
        const child = byId.get(id)!
        next.push(child)
      }
    }
    if (next.length) rings.push(next)
    queue = next
  }

  const dim = (n: GNode): number => Math.max(n.b.width, n.b.height)
  const center = new Map<string, { x: number; y: number }>([[root.id, { x: 0, y: 0 }]])
  const angleOf = new Map<string, number>([[root.id, -Math.PI / 2]])
  let radius = 0
  let prevThickness = dim(root)
  for (let r = 1; r < rings.length; r += 1) {
    const ring = [...rings[r]!].sort(
      (p, q) =>
        angleOf.get(parent.get(p.id)!)! - angleOf.get(parent.get(q.id)!)! ||
        p.b.y - q.b.y ||
        p.b.x - q.b.x,
    )
    const thickness = Math.max(...ring.map(dim))
    const arc = ring.reduce((s, n) => s + dim(n) + NODE_GAP, 0)
    radius = Math.max(radius + prevThickness / 2 + thickness / 2 + LAYER_GAP, arc / (2 * Math.PI))
    ring.forEach((n, i) => {
      const a = -Math.PI / 2 + (2 * Math.PI * i) / ring.length
      angleOf.set(n.id, a)
      center.set(n.id, { x: radius * Math.cos(a), y: radius * Math.sin(a) })
    })
    prevThickness = thickness
  }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const n of comp) {
    const c = center.get(n.id)!
    minX = Math.min(minX, c.x - n.b.width / 2)
    minY = Math.min(minY, c.y - n.b.height / 2)
    maxX = Math.max(maxX, c.x + n.b.width / 2)
    maxY = Math.max(maxY, c.y + n.b.height / 2)
  }
  const pos = new Map<string, { x: number; y: number }>()
  for (const n of comp) {
    const c = center.get(n.id)!
    pos.set(n.id, { x: c.x - n.b.width / 2 - minX, y: c.y - n.b.height / 2 - minY })
  }
  return { pos, width: maxX - minX, height: maxY - minY }
}

/**
 * Arranges the selected shapes by the arrows connecting them. Each connected
 * component is laid out on its own and the components are packed side by side;
 * the result keeps the selection's original top-left corner. Returns `[]` when
 * the selection has no connecting arrows, so callers can treat it as "nothing
 * to do".
 */
export function layoutGraph(
  selected: readonly ExcalidrawElement[],
  all: readonly ExcalidrawElement[],
  mode: GraphLayoutMode,
): PositionPatch[] {
  const nodes: GNode[] = selected
    .filter(isNode)
    .map((el) => ({ id: el.id, el, b: getElementBounds(el) }))
  const edges = graphEdges(selected, all)
  if (nodes.length < 2 || edges.length === 0) return []

  const horizontal = mode === "tree-right"
  const originX = Math.min(...nodes.map((n) => n.b.x))
  const originY = Math.min(...nodes.map((n) => n.b.y))
  const key = (n: GNode): number => (horizontal ? n.b.y : n.b.x)

  const comps = components(nodes, edges).sort(
    (p, q) => Math.min(...p.map(key)) - Math.min(...q.map(key)),
  )
  const patches: PositionPatch[] = []
  let offset = 0
  for (const comp of comps) {
    const placed =
      mode === "radial" ? layoutRadial(comp, edges) : layoutLayered(comp, edges, horizontal)
    const dx = horizontal ? 0 : offset
    const dy = horizontal ? offset : 0
    for (const n of comp) {
      const p = placed.pos.get(n.id)!
      patches.push({
        id: n.id,
        x: n.el.x + (originX + dx + p.x - n.b.x),
        y: n.el.y + (originY + dy + p.y - n.b.y),
      })
    }
    offset += (horizontal ? placed.height : placed.width) + COMPONENT_GAP
  }
  return patches
}

/**
 * Straightens the non-elbowed arrows connecting `nodeIds` to their two end
 * points, dropping stale bends so they re-route cleanly after a layout. The
 * scene's binding reconciliation recomputes the exact end positions.
 */
export function straightenConnectors(
  all: readonly ExcalidrawElement[],
  nodeIds: ReadonlySet<string>,
): ExcalidrawElement[] {
  const out: ExcalidrawElement[] = []
  for (const el of all) {
    if (el.type !== "arrow" || el.isDeleted || el.elbowed) continue
    if (!el.startBinding || !el.endBinding || el.points.length <= 2) continue
    if (!nodeIds.has(el.startBinding.elementId) || !nodeIds.has(el.endBinding.elementId)) continue
    out.push({ ...el, points: [el.points[0]!, el.points[el.points.length - 1]!] })
  }
  return out
}
