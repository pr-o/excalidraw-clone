import { boundsCenter } from "@excalidraw-clone/geometry"
import {
  addBackRef,
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
  pointsPatch,
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
    ...pointsPatch([boundsCenter(source), boundsCenter(shape)]),
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
