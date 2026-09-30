import {
  BINDING_GAP,
  type ExcalidrawArrowElement,
  type ExcalidrawElement,
  newArrow,
  newRectangle,
  newText,
  Scene,
} from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { type ChainDirection, createChainedShape } from "../src/keyboard/flowchartChain"
import { extractStyle } from "../src/keyboard/styleClipboard"

const setup = (): { scene: Scene; source: ExcalidrawElement } => {
  const scene = new Scene()
  const source: ExcalidrawElement = {
    ...newRectangle({
      x: 100,
      y: 200,
      width: 120,
      height: 60,
      strokeColor: "#e03131",
      backgroundColor: "#ffc9c9",
    }),
    strokeStyle: "dashed",
    strokeWidth: 4,
    opacity: 70,
  }
  scene.mutate((draft) => {
    draft.push(source)
  })
  return { scene, source }
}

const byId = (scene: Scene, id: string): ExcalidrawElement =>
  scene.getElements().find((e) => e.id === id)!

const arrowOf = (scene: Scene): ExcalidrawArrowElement =>
  scene.getElements().find((e) => e.type === "arrow") as ExcalidrawArrowElement

describe("createChainedShape", () => {
  it.each<[ChainDirection, number, number]>([
    ["right", 100 + 120 + 80, 200],
    ["left", 100 - 80 - 120, 200],
    ["down", 100, 200 + 60 + 80],
    ["up", 100, 200 - 80 - 60],
  ])("places a same-type, same-size shape 80px %s of the source", (dir, x, y) => {
    const { scene, source } = setup()
    const id = createChainedShape(scene, source, dir)
    expect(id).not.toBeNull()
    const shape = byId(scene, id!)
    expect(shape.type).toBe("rectangle")
    expect(shape.x).toBe(x)
    expect(shape.y).toBe(y)
    expect(shape.width).toBe(120)
    expect(shape.height).toBe(60)
  })

  it("copies the source's visual style onto the new shape", () => {
    const { scene, source } = setup()
    const id = createChainedShape(scene, source, "right")!
    expect(extractStyle(byId(scene, id))).toEqual(extractStyle(source))
  })

  it("connects source and new shape with a bound arrow", () => {
    const { scene, source } = setup()
    const id = createChainedShape(scene, source, "right")!
    const arrows = scene.getElements().filter((e) => e.type === "arrow")
    expect(arrows).toHaveLength(1)
    const arrow = arrows[0] as ExcalidrawArrowElement
    expect(arrow.startBinding).toEqual({ elementId: source.id, focus: 0, gap: BINDING_GAP })
    expect(arrow.endBinding).toEqual({ elementId: id, focus: 0, gap: BINDING_GAP })
  })

  it("adds arrow back-references to both shapes", () => {
    const { scene, source } = setup()
    const id = createChainedShape(scene, source, "right")!
    const arrow = arrowOf(scene)
    expect(byId(scene, source.id).boundElements).toContainEqual({ id: arrow.id, type: "arrow" })
    expect(byId(scene, id).boundElements).toContainEqual({ id: arrow.id, type: "arrow" })
  })

  it("snaps the arrow endpoints onto the facing edges (plus gap)", () => {
    const { scene, source } = setup()
    createChainedShape(scene, source, "right")
    const arrow = arrowOf(scene)
    const start = { x: arrow.x + arrow.points[0]!.x, y: arrow.y + arrow.points[0]!.y }
    const end = { x: arrow.x + arrow.points[1]!.x, y: arrow.y + arrow.points[1]!.y }
    // source right edge = 220, new shape left edge = 300, centers at y = 230
    expect(start.x).toBeCloseTo(220 + BINDING_GAP, 1)
    expect(end.x).toBeCloseTo(300 - BINDING_GAP, 1)
    expect(start.y).toBeCloseTo(230, 1)
    expect(end.y).toBeCloseTo(230, 1)
  })

  it("chains with a single history entry", () => {
    const { scene, source } = setup()
    createChainedShape(scene, source, "down")
    expect(scene.getElements()).toHaveLength(3)
    scene.undo()
    expect(scene.getElements()).toHaveLength(1)
  })

  it.each([
    ["text", newText({ x: 0, y: 0, text: "hi" })],
    ["arrow", newArrow({ x: 0, y: 0 })],
  ])("returns null and leaves the scene untouched for a %s source", (_name, el) => {
    const scene = new Scene()
    scene.mutate((draft) => {
      draft.push(el)
    })
    const before = scene.getElements()
    expect(createChainedShape(scene, el, "right")).toBeNull()
    expect(scene.getElements()).toEqual(before)
    expect(scene.getElements()).toHaveLength(1)
  })
})
