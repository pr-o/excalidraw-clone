import { BINDING_GAP } from "./bindings"
import { newArrow, newDiamond, newNote, newRectangle, newText } from "./factories"
import type { LibraryItem } from "./library-item"
import type {
  BoundElement,
  ExcalidrawArrowElement,
  ExcalidrawDiamondElement,
  ExcalidrawElement,
  ExcalidrawRectangleElement,
  ExcalidrawTextElement,
} from "./types"

const HEADER_BG = "#e9ecef"

type NodeEl = ExcalidrawRectangleElement | ExcalidrawDiamondElement

/** Builds a labeled node (container + bound text) and registers the back-ref. */
function makeNode(
  kind: "rectangle" | "diamond",
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  rounded: boolean,
  addRef: (nodeId: string, ref: BoundElement) => void,
  labels: ExcalidrawTextElement[],
): NodeEl {
  const node: NodeEl =
    kind === "diamond"
      ? newDiamond({ x, y, width: w, height: h })
      : { ...newRectangle({ x, y, width: w, height: h }), roundness: rounded ? { type: 1 } : null }
  const text = newText({
    x,
    y: y + h / 2 - 10,
    width: w,
    height: 20,
    text: label,
    textAlign: "center",
    verticalAlign: "middle",
    containerId: node.id,
  })
  labels.push(text)
  addRef(node.id, { id: text.id, type: "text" })
  return node
}

function buildFlowchart(): ExcalidrawElement[] {
  const refs = new Map<string, BoundElement[]>()
  const addRef = (nodeId: string, ref: BoundElement): void => {
    const arr = refs.get(nodeId) ?? []
    arr.push(ref)
    refs.set(nodeId, arr)
  }
  const labels: ExcalidrawTextElement[] = []
  const arrows: ExcalidrawArrowElement[] = []

  const start = makeNode("rectangle", 0, 0, 160, 60, "Start", true, addRef, labels)
  const process = makeNode("rectangle", 0, 120, 160, 60, "Process", false, addRef, labels)
  const decision = makeNode("diamond", 0, 240, 160, 80, "Decision?", false, addRef, labels)
  const end = makeNode("rectangle", 0, 400, 160, 60, "End", true, addRef, labels)
  const nodes: NodeEl[] = [start, process, decision, end]

  const connect = (from: NodeEl, to: NodeEl): void => {
    const sx = from.x + from.width / 2
    const sy = from.y + from.height
    const ex = to.x + to.width / 2
    const ey = to.y
    const arrow: ExcalidrawArrowElement = {
      ...newArrow({ x: sx, y: sy }),
      x: sx,
      y: sy,
      width: Math.abs(ex - sx),
      height: Math.abs(ey - sy),
      points: [
        { x: 0, y: 0 },
        { x: ex - sx, y: ey - sy },
      ],
      startBinding: { elementId: from.id, focus: 0, gap: BINDING_GAP },
      endBinding: { elementId: to.id, focus: 0, gap: BINDING_GAP },
    }
    arrows.push(arrow)
    addRef(from.id, { id: arrow.id, type: "arrow" })
    addRef(to.id, { id: arrow.id, type: "arrow" })
  }
  connect(start, process)
  connect(process, decision)
  connect(decision, end)

  const boundNodes = nodes.map((n) => ({ ...n, boundElements: refs.get(n.id) ?? null }))
  return [...boundNodes, ...labels, ...arrows]
}

function buildKanban(): ExcalidrawElement[] {
  const els: ExcalidrawElement[] = []
  const columns = ["To do", "Doing", "Done"]
  columns.forEach((title, i) => {
    const x = i * 180
    const header = newRectangle({ x, y: 0, width: 140, height: 40, backgroundColor: HEADER_BG })
    const label = newText({
      x,
      y: 10,
      width: 140,
      height: 20,
      text: title,
      textAlign: "center",
      verticalAlign: "middle",
      containerId: header.id,
    })
    els.push({ ...header, boundElements: [{ id: label.id, type: "text" }] }, label)
    const note = newNote({ x, y: 60, width: 140, height: 80 })
    els.push(note.container, note.text)
  })
  return els
}

export const BUILTIN_TEMPLATES: LibraryItem[] = [
  { id: "builtin-flowchart", name: "Flowchart", created: 0, elements: buildFlowchart() },
  { id: "builtin-kanban", name: "Kanban board", created: 0, elements: buildKanban() },
]
