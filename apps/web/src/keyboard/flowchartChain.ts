import {
  BINDING_GAP,
  type ExcalidrawArrowElement,
  type ExcalidrawElement,
  type NewElementInput,
  newArrow,
  newDiamond,
  newEllipse,
  newHexagon,
  newOctagon,
  newParallelogram,
  newPentagon,
  newRectangle,
  newTriangle,
  type Scene,
} from "@excalidraw-clone/scene"
import { applyStyle, extractStyle } from "./styleClipboard"

export type ChainDirection = "up" | "down" | "left" | "right"

/** Distance between the source's edge and the chained shape's facing edge. */
const CHAIN_GAP = 80

const FACTORIES: Record<string, (input: NewElementInput) => ExcalidrawElement> = {
  rectangle: newRectangle,
  diamond: newDiamond,
  ellipse: newEllipse,
  triangle: newTriangle,
  parallelogram: newParallelogram,
  hexagon: newHexagon,
  pentagon: newPentagon,
  octagon: newOctagon,
}

interface Point {
  x: number
  y: number
}

/** Same bbox + relative-points math as the tools package's `pointsPatch`. */
const pointsPatch = (
  abs: readonly Point[],
): Pick<ExcalidrawArrowElement, "x" | "y" | "width" | "height" | "points"> => {
  const xs = abs.map((p) => p.x)
  const ys = abs.map((p) => p.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  return {
    x: minX,
    y: minY,
    width: Math.max(...xs) - minX,
    height: Math.max(...ys) - minY,
    points: abs.map((p) => ({ x: p.x - minX, y: p.y - minY })),
  }
}

/** Mirrors `addBackRef` in packages/tools/src/binding-refs.ts (not exported
 *  from @excalidraw-clone/tools' public index). Idempotent. */
const addBackRef = (draft: ExcalidrawElement[], targetId: string, arrowId: string): void => {
  const j = draft.findIndex((e) => e.id === targetId)
  if (j < 0) return
  const t = draft[j]!
  const existing = t.boundElements ?? []
  if (existing.some((b) => b.id === arrowId)) return
  draft[j] = { ...t, boundElements: [...existing, { id: arrowId, type: "arrow" }] }
}

const center = (el: ExcalidrawElement): Point => ({
  x: el.x + el.width / 2,
  y: el.y + el.height / 2,
})

/**
 * Creates a same-type, same-size, same-style shape CHAIN_GAP away from
 * `source` in `direction`, connected by an arrow bound to both. Returns the new
 * shape's id, or null (scene untouched) when `source` isn't a chainable shape.
 */
export function createChainedShape(
  scene: Scene,
  source: ExcalidrawElement,
  direction: ChainDirection,
): string | null {
  const factory = FACTORIES[source.type]
  if (!factory) return null

  const { width, height } = source
  let x = source.x
  let y = source.y
  if (direction === "right") x = source.x + width + CHAIN_GAP
  else if (direction === "left") x = source.x - CHAIN_GAP - width
  else if (direction === "down") y = source.y + height + CHAIN_GAP
  else y = source.y - CHAIN_GAP - height

  const shape = applyStyle(factory({ x, y, width, height }), extractStyle(source))
  const arrow: ExcalidrawArrowElement = {
    ...newArrow({ x: 0, y: 0 }),
    ...pointsPatch([center(source), center(shape)]),
    startBinding: { elementId: source.id, focus: 0, gap: BINDING_GAP },
    endBinding: { elementId: shape.id, focus: 0, gap: BINDING_GAP },
  }

  scene.mutate((draft) => {
    draft.push(shape, arrow)
    addBackRef(draft, source.id, arrow.id)
    addBackRef(draft, shape.id, arrow.id)
  })
  return shape.id
}
