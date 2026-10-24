import { BINDING_GAP, computeBoundEndpoint } from "./bindings"
import { DEFAULT_FONT_SIZE } from "./defaults"
import {
  newArrow,
  newDiamond,
  newEllipse,
  newLabelFor,
  newLabelForLinear,
  newRectangle,
} from "./factories"
import type {
  BoundElement,
  ExcalidrawArrowElement,
  ExcalidrawElement,
  ExcalidrawTextElement,
} from "./types"

export type MermaidDirection = "TD" | "TB" | "LR" | "BT" | "RL"
export type MermaidShape = "rectangle" | "ellipse" | "diamond"
export type MermaidEdgeStyle = "arrow" | "open" | "dotted" | "thick"

export interface MermaidNode {
  id: string
  label: string
  shape: MermaidShape
}

export interface MermaidEdge {
  from: string
  to: string
  label?: string
  style: MermaidEdgeStyle
}

export interface MermaidFlowchart {
  direction: MermaidDirection
  nodes: MermaidNode[]
  edges: MermaidEdge[]
  /** Statements that were not understood (unsupported syntax or malformed). */
  skipped: string[]
}

const HEADER = /^(graph|flowchart)(?:\s+(TD|TB|LR|BT|RL))?$/i
const UNSUPPORTED =
  /^(subgraph|end|style|classDef|class|click|linkStyle|direction|accTitle|accDescr)\b/
const NODE_ID = /^[A-Za-z0-9_]+/
// Longest openers first so `([` / `((` win over `(`.
const SHAPES: ReadonlyArray<readonly [string, string, MermaidShape]> = [
  ["([", "])", "ellipse"],
  ["((", "))", "ellipse"],
  ["[", "]", "rectangle"],
  ["(", ")", "rectangle"],
  ["{", "}", "diamond"],
]
// Group 1/2: `-->` / `---` / `-.->` / `==>` with optional `|label|`.
// Group 3/4: `-- label -->` / `-- label ---`.
const EDGE = /^(?:(-\.+->|-{2,}>|-{3,}|={2,}>)(?:\s*\|([^|]*)\|)?|--\s+([^|>]+?)\s+(-{2,}>|-{3,}))/

/** Undoes `escapeLabel`: Mermaid `#quot;` / `#NN;` entity codes and `<br>`. */
const decodeLabel = (s: string): string =>
  s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/#quot;/g, '"')
    .replace(/#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))

/** Splits on newlines and `;`, but not inside double quotes. */
function splitStatements(text: string): string[] {
  const out: string[] = []
  let cur = ""
  let quoted = false
  for (const ch of text) {
    if (ch === '"') quoted = !quoted
    if (!quoted && (ch === "\n" || ch === ";")) {
      out.push(cur)
      cur = ""
    } else cur += ch
  }
  out.push(cur)
  return out
}

const edgeStyle = (token: string): MermaidEdgeStyle =>
  token.startsWith("-.")
    ? "dotted"
    : token.startsWith("=")
      ? "thick"
      : token.endsWith(">")
        ? "arrow"
        : "open"

/** Parses one statement (`A[x] --> B -->|y| C`); throws on malformed input. */
function parseStatement(
  s: string,
  define: (id: string, label?: string, shape?: MermaidShape) => void,
): MermaidEdge[] {
  let i = 0
  const ws = (): void => {
    while (i < s.length && /\s/.test(s[i]!)) i += 1
  }
  const node = (): string => {
    ws()
    const m = NODE_ID.exec(s.slice(i))
    if (!m) throw new Error("expected node id")
    const id = m[0]
    i += id.length
    const shape = SHAPES.find(([open]) => s.startsWith(open, i))
    if (!shape) {
      define(id)
      return id
    }
    const [open, close, kind] = shape
    i += open.length
    ws()
    let label: string
    if (s[i] === '"') {
      const end = s.indexOf('"', i + 1)
      if (end < 0) throw new Error("unclosed quote")
      label = s.slice(i + 1, end)
      i = end + 1
      ws()
      if (!s.startsWith(close, i)) throw new Error("unclosed shape")
    } else {
      const end = s.indexOf(close, i)
      if (end < 0) throw new Error("unclosed shape")
      label = s.slice(i, end).trim()
      i = end
    }
    i += close.length
    define(id, decodeLabel(label), kind)
    return id
  }

  const edges: MermaidEdge[] = []
  let from = node()
  ws()
  while (i < s.length) {
    const m = EDGE.exec(s.slice(i))
    if (!m) throw new Error("expected edge")
    i += m[0].length
    const token = m[1] ?? m[4]!
    const raw = (m[2] ?? m[3])?.trim()
    const label = raw === undefined ? undefined : decodeLabel(raw)
    const to = node()
    edges.push({ from, to, ...(label ? { label } : {}), style: edgeStyle(token) })
    from = to
    ws()
  }
  return edges
}

/**
 * Parses a subset of Mermaid flowchart syntax: `graph|flowchart [dir]` header,
 * `A`, `A[x]`, `A(x)`, `A([x])`, `A((x))`, `A{x}`, quoted labels, edges
 * `-->` `---` `-.->` `==>` with `|label|` or `-- label -->`, chains, `;`
 * separators and `%%` comments. Anything else is collected in `skipped`.
 */
export function parseMermaidFlowchart(text: string): MermaidFlowchart | { error: string } {
  const statements = splitStatements(text)
    .map((s) => s.replace(/%%.*$/, "").trim())
    .filter((s) => s !== "")
  const header = statements.length > 0 ? HEADER.exec(statements[0]!) : null
  if (!header) return { error: 'Expected a "graph" or "flowchart" header' }
  const dir = (header[2]?.toUpperCase() ?? "TD") as MermaidDirection

  const nodes = new Map<string, MermaidNode>()
  const define = (id: string, label?: string, shape?: MermaidShape): void => {
    if (label !== undefined && shape !== undefined) nodes.set(id, { id, label, shape })
    else if (!nodes.has(id)) nodes.set(id, { id, label: id, shape: "rectangle" })
  }
  const edges: MermaidEdge[] = []
  const skipped: string[] = []
  for (const s of statements.slice(1)) {
    if (UNSUPPORTED.test(s)) {
      skipped.push(s)
      continue
    }
    // Stage definitions so a malformed statement leaves no half-defined nodes.
    const staged: Array<() => void> = []
    try {
      const parsed = parseStatement(s, (id, label, shape) =>
        staged.push(() => define(id, label, shape)),
      )
      for (const commit of staged) commit()
      edges.push(...parsed)
    } catch {
      skipped.push(s)
    }
  }
  return { direction: dir, nodes: [...nodes.values()], edges, skipped }
}

const NODE_GAP = 60
const LAYER_GAP = 100
// shortcut: label width is estimated from character count (the scene package
// has no canvas to measure with); render-time label shrink/wrap covers misses.
const CHAR_W = DEFAULT_FONT_SIZE * 0.6

const nodeSize = (n: MermaidNode): { width: number; height: number } => {
  const text = n.label.length * CHAR_W + 40
  // Diamond/ellipse label boxes are inset, so they need more room per char.
  const scale = n.shape === "diamond" ? 1.6 : n.shape === "ellipse" ? 1.4 : 1
  return {
    width: Math.max(120, Math.ceil(text * scale)),
    height: n.shape === "diamond" ? 80 : 60,
  }
}

/** Longest-path layer per node; back edges (found by DFS) are ignored. */
function assignLayers(f: MermaidFlowchart): Map<string, number> {
  const out = new Map<string, string[]>()
  for (const n of f.nodes) out.set(n.id, [])
  for (const e of f.edges) out.get(e.from)!.push(e.to)

  const state = new Map<string, 1 | 2>() // 1 = on stack, 2 = done
  const forward = new Map<string, string[]>()
  const order: string[] = [] // reverse postorder = topological over forward edges
  const visit = (id: string): void => {
    state.set(id, 1)
    const fwd: string[] = []
    for (const to of out.get(id)!) {
      if (state.get(to) === 1) continue // back edge
      fwd.push(to)
      if (!state.has(to)) visit(to)
    }
    forward.set(id, fwd)
    state.set(id, 2)
    order.push(id)
  }
  for (const n of f.nodes) if (!state.has(n.id)) visit(n.id)

  const layer = new Map<string, number>(f.nodes.map((n) => [n.id, 0]))
  for (const id of order.reverse()) {
    for (const to of forward.get(id)!) {
      layer.set(to, Math.max(layer.get(to)!, layer.get(id)! + 1))
    }
  }
  return layer
}

/**
 * Lays out a parsed flowchart as scene elements: layered (longest path),
 * labeled shapes, and arrows bound to both endpoints. Coordinates are around
 * the origin; callers re-center. Self-loops are dropped.
 */
export function layoutFlowchart(f: MermaidFlowchart): ExcalidrawElement[] {
  const layerOf = assignLayers(f)
  const layers: MermaidNode[][] = []
  for (const n of f.nodes) (layers[layerOf.get(n.id)!] ??= []).push(n)

  const horizontal = f.direction === "LR" || f.direction === "RL"
  const reversed = f.direction === "BT" || f.direction === "RL"
  const sizes = new Map(f.nodes.map((n) => [n.id, nodeSize(n)]))
  const mainOf = (s: { width: number; height: number }): number => (horizontal ? s.width : s.height)
  const crossOf = (s: { width: number; height: number }): number =>
    horizontal ? s.height : s.width

  const shapes = new Map<string, ExcalidrawElement>()
  let mainPos = 0
  for (const layer of reversed ? [...layers].reverse() : layers) {
    const band = Math.max(...layer.map((n) => mainOf(sizes.get(n.id)!)))
    const total =
      layer.reduce((sum, n) => sum + crossOf(sizes.get(n.id)!), 0) + NODE_GAP * (layer.length - 1)
    let crossPos = -total / 2
    for (const n of layer) {
      const size = sizes.get(n.id)!
      const main = mainPos + (band - mainOf(size)) / 2
      const input = horizontal
        ? { x: main, y: crossPos, ...size }
        : { x: crossPos, y: main, ...size }
      const factory =
        n.shape === "diamond" ? newDiamond : n.shape === "ellipse" ? newEllipse : newRectangle
      shapes.set(n.id, factory(input))
      crossPos += crossOf(size) + NODE_GAP
    }
    mainPos += band + LAYER_GAP
  }

  const refs = new Map<string, BoundElement[]>()
  const addRef = (id: string, ref: BoundElement): void => {
    refs.set(id, [...(refs.get(id) ?? []), ref])
  }
  const labels: ExcalidrawTextElement[] = []
  for (const n of f.nodes) {
    const shape = shapes.get(n.id)!
    const text = { ...newLabelFor(shape), text: n.label, originalText: n.label }
    labels.push(text)
    addRef(shape.id, { id: text.id, type: "text" })
  }

  const centerOf = (e: ExcalidrawElement): { x: number; y: number } => ({
    x: e.x + e.width / 2,
    y: e.y + e.height / 2,
  })
  const arrows: ExcalidrawElement[] = []
  for (const e of f.edges) {
    if (e.from === e.to) continue
    const from = shapes.get(e.from)!
    const to = shapes.get(e.to)!
    const s = computeBoundEndpoint(from, centerOf(to), BINDING_GAP)
    const t = computeBoundEndpoint(to, centerOf(from), BINDING_GAP)
    const base = newArrow({ x: s.x, y: s.y })
    const arrow: ExcalidrawArrowElement = {
      ...base,
      width: Math.abs(t.x - s.x),
      height: Math.abs(t.y - s.y),
      points: [
        { x: 0, y: 0 },
        { x: t.x - s.x, y: t.y - s.y },
      ],
      startBinding: { elementId: from.id, focus: 0, gap: BINDING_GAP },
      endBinding: { elementId: to.id, focus: 0, gap: BINDING_GAP },
      endArrowhead: e.style === "open" ? null : base.endArrowhead,
      strokeStyle: e.style === "dotted" ? "dashed" : base.strokeStyle,
      strokeWidth: e.style === "thick" ? 4 : base.strokeWidth,
    }
    addRef(from.id, { id: arrow.id, type: "arrow" })
    addRef(to.id, { id: arrow.id, type: "arrow" })
    if (e.label) {
      const width = e.label.length * CHAR_W
      const text = newLabelForLinear(arrow)
      arrows.push(arrow, {
        ...text,
        x: text.x - width / 2,
        width,
        text: e.label,
        originalText: e.label,
      })
      arrow.boundElements = [{ id: text.id, type: "text" }]
    } else arrows.push(arrow)
  }

  const boundShapes = f.nodes.map((n) => {
    const shape = shapes.get(n.id)!
    return { ...shape, boundElements: refs.get(shape.id) ?? null }
  })
  return [...boundShapes, ...labels, ...arrows]
}

const NODE_TYPES = new Set<ExcalidrawElement["type"]>([
  "rectangle",
  "diamond",
  "ellipse",
  "triangle",
  "parallelogram",
  "hexagon",
  "pentagon",
  "octagon",
])

// `#` first so the codes it introduces are not re-escaped; `%` would start a
// `%%` comment, `;` splits statements and `|` ends an edge label.
const escapeLabel = (s: string): string =>
  s
    .replace(/[#"|;%]/g, (c) => (c === '"' ? "#quot;" : `#${c.charCodeAt(0)};`))
    .replace(/\r?\n/g, "<br/>")

/** A, B, …, Z, AA, AB, … */
const nodeId = (i: number): string =>
  (i >= 26 ? nodeId(Math.floor(i / 26) - 1) : "") + String.fromCharCode(65 + (i % 26))

/**
 * Serialises shapes and the arrows bound to them at both ends as a Mermaid
 * flowchart (the inverse of `parseMermaidFlowchart`). With `ids`, only those
 * shapes count as nodes. Free text, unbound arrows and other elements are
 * ignored. Direction is LR when edges run mostly horizontally, else TD.
 */
export function exportMermaidFlowchart(
  elements: readonly ExcalidrawElement[],
  ids?: readonly string[],
): string {
  const live = elements.filter((e) => !e.isDeleted)
  const picked = ids && ids.length > 0 ? new Set(ids) : null
  const nodes = live.filter((e) => NODE_TYPES.has(e.type) && (!picked || picked.has(e.id)))
  const idOf = new Map(nodes.map((e, i) => [e.id, nodeId(i)]))
  const labelOf = new Map<string, string>()
  for (const e of live) {
    if (e.type === "text" && e.containerId !== null && e.text.trim() !== "")
      labelOf.set(e.containerId, e.text)
  }

  const lines = nodes.map((e) => {
    const id = idOf.get(e.id)!
    const label = labelOf.get(e.id)
    if (label === undefined) return `  ${id}`
    const [open, close] =
      e.type === "diamond"
        ? ["{", "}"]
        : e.type === "ellipse"
          ? ["((", "))"]
          : e.type === "rectangle" && e.roundness !== null
            ? ["(", ")"]
            : ["[", "]"]
    return `  ${id}${open}"${escapeLabel(label)}"${close}`
  })

  const byId = new Map(nodes.map((e) => [e.id, e]))
  const center = (e: ExcalidrawElement): { x: number; y: number } => ({
    x: e.x + e.width / 2,
    y: e.y + e.height / 2,
  })
  let dx = 0
  let dy = 0
  for (const e of live) {
    if (e.type !== "arrow" || !e.startBinding || !e.endBinding) continue
    const from = byId.get(e.startBinding.elementId)
    const to = byId.get(e.endBinding.elementId)
    if (!from || !to) continue
    dx += Math.abs(center(to).x - center(from).x)
    dy += Math.abs(center(to).y - center(from).y)
    const link = e.strokeStyle !== "solid" ? "-.->" : e.endArrowhead === null ? "---" : "-->"
    const label = labelOf.get(e.id)
    const pipe = label === undefined ? "" : `|${escapeLabel(label)}|`
    lines.push(`  ${idOf.get(from.id)!} ${link}${pipe} ${idOf.get(to.id)!}`)
  }
  return [`flowchart ${dx > dy ? "LR" : "TD"}`, ...lines].join("\n")
}
