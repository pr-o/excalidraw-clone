import { BINDING_GAP } from "./bindings"
import { addArrowBackRefs } from "./binding-refs"
import { newArrow, newDiamond, newNote, newRectangle, withLabel } from "./factories"
import type { LibraryItem } from "./library-item"
import type {
  ExcalidrawArrowElement,
  ExcalidrawDiamondElement,
  ExcalidrawElement,
  ExcalidrawRectangleElement,
} from "./types"

const HEADER_BG = "#e9ecef"
const ROUNDED = { type: 1 } as const

type Node = ExcalidrawRectangleElement | ExcalidrawDiamondElement

/** A straight arrow from the bottom middle of `from` to the top middle of `to`, bound to both. */
const arrowDown = (from: Node, to: Node): ExcalidrawArrowElement => {
  const sx = from.x + from.width / 2
  const sy = from.y + from.height
  const dx = to.x + to.width / 2 - sx
  const dy = to.y - sy
  return {
    ...newArrow({ x: sx, y: sy, width: Math.abs(dx), height: Math.abs(dy) }),
    points: [
      { x: 0, y: 0 },
      { x: dx, y: dy },
    ],
    startBinding: { elementId: from.id, focus: 0, gap: BINDING_GAP },
    endBinding: { elementId: to.id, focus: 0, gap: BINDING_GAP },
  }
}

function buildFlowchart(): ExcalidrawElement[] {
  const steps = [
    withLabel(
      { ...newRectangle({ x: 0, y: 0, width: 160, height: 60 }), roundness: ROUNDED },
      "Start",
    ),
    withLabel(newRectangle({ x: 0, y: 120, width: 160, height: 60 }), "Process"),
    withLabel(newDiamond({ x: 0, y: 240, width: 160, height: 80 }), "Decision?"),
    withLabel(
      { ...newRectangle({ x: 0, y: 400, width: 160, height: 60 }), roundness: ROUNDED },
      "End",
    ),
  ]
  const arrows = steps.slice(1).map((step, i) => arrowDown(steps[i]!.container, step.container))
  const out: ExcalidrawElement[] = [
    ...steps.map((s) => s.container),
    ...steps.map((s) => s.text),
    ...arrows,
  ]
  for (const arrow of arrows) addArrowBackRefs(out, arrow)
  return out
}

function buildKanban(): ExcalidrawElement[] {
  return ["To do", "Doing", "Done"].flatMap((title, i) => {
    const x = i * 180
    const header = withLabel(
      newRectangle({ x, y: 0, width: 140, height: 40, backgroundColor: HEADER_BG }),
      title,
    )
    const note = newNote({ x, y: 60, width: 140, height: 80 })
    return [header.container, header.text, note.container, note.text]
  })
}

export const BUILTIN_TEMPLATES: LibraryItem[] = [
  { id: "builtin-flowchart", name: "Flowchart", created: 0, elements: buildFlowchart() },
  { id: "builtin-kanban", name: "Kanban board", created: 0, elements: buildKanban() },
]
