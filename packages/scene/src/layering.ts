/** A directed edge between two node ids; callers may attach more fields. */
export interface LayerEdge {
  from: string
  to: string
}

/**
 * Longest-path layering of a directed graph, tolerating cycles.
 *
 * Cycles are broken by an iterative DFS (explicit stack, so a very long chain
 * cannot overflow the call stack): an edge to a node still on the DFS stack is
 * a back edge and is ignored. `startOrder` is both the node set and the order
 * DFS roots are tried in, so it decides which edge of a cycle is dropped.
 * Edges mentioning a node outside `startOrder` are ignored.
 *
 * Returns each node's layer (0 = sources) and the acyclic edge set that
 * produced them.
 */
export function layerGraph<E extends LayerEdge>(
  startOrder: readonly string[],
  edges: readonly E[],
): { layerOf: Map<string, number>; dag: E[] } {
  const out = new Map<string, E[]>(startOrder.map((id) => [id, []]))
  for (const e of edges) out.get(e.from)?.push(e)

  const state = new Map<string, 1 | 2>() // 1 = on stack, 2 = done
  const dag: E[] = []
  const post: string[] = []
  for (const start of startOrder) {
    if (state.has(start)) continue
    state.set(start, 1)
    const stack: { id: string; next: number }[] = [{ id: start, next: 0 }]
    while (stack.length) {
      const frame = stack[stack.length - 1]!
      const edge = out.get(frame.id)![frame.next]
      if (!edge) {
        state.set(frame.id, 2)
        post.push(frame.id)
        stack.pop()
        continue
      }
      frame.next += 1
      if (!out.has(edge.to)) continue
      const s = state.get(edge.to)
      if (s === 1) continue // back edge: drop
      dag.push(edge)
      if (s === undefined) {
        state.set(edge.to, 1)
        stack.push({ id: edge.to, next: 0 })
      }
    }
  }

  // Reverse postorder is a topological order of the acyclic edge set.
  const layerOf = new Map<string, number>(startOrder.map((id) => [id, 0]))
  const dagOut = new Map<string, E[]>(startOrder.map((id) => [id, []]))
  for (const e of dag) dagOut.get(e.from)!.push(e)
  for (let i = post.length - 1; i >= 0; i -= 1) {
    const id = post[i]!
    for (const e of dagOut.get(id)!) {
      layerOf.set(e.to, Math.max(layerOf.get(e.to)!, layerOf.get(id)! + 1))
    }
  }
  return { layerOf, dag }
}
