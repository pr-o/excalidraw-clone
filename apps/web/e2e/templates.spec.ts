import { expect, test, type Page } from "@playwright/test"
import { dragOnCanvas } from "./_helpers"

type SceneEl = {
  id: string
  type: string
  x: number
  y: number
  width: number
  height: number
  points?: { x: number; y: number }[]
  startBinding?: { elementId: string } | null
  endBinding?: { elementId: string } | null
  isDeleted?: boolean
}

const readScene = async (page: Page): Promise<SceneEl[]> => {
  const json = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  const data = JSON.parse(json!) as { elements: SceneEl[] }
  return data.elements.filter((e) => !e.isDeleted)
}

const boundArrows = (els: SceneEl[]): SceneEl[] =>
  els.filter((e) => e.type === "arrow" && e.startBinding != null && e.endBinding != null)

const firstPointAbs = (a: SceneEl): { x: number; y: number } => ({
  x: a.x + a.points![0]!.x,
  y: a.y + a.points![0]!.y,
})

test("place a flowchart template, keep bindings, reflow on node drag", async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="library-toggle"]').waitFor({ state: "visible" })

  // Open the library and place the flowchart template on the canvas.
  await page.locator('[data-testid="library-toggle"]').click()
  const tile = page.locator('[data-testid="template-item-builtin-flowchart"]')
  await expect(tile).toBeVisible()
  await tile.locator("button").first().click()

  const canvas = page.locator("canvas").first()
  const box = await canvas.boundingBox()
  if (!box) throw new Error("canvas not found")
  await page.mouse.move(box.x + 300, box.y + 150)
  await page.mouse.click(box.x + 300, box.y + 150)
  await page.waitForTimeout(800)

  // Bindings survived placement: the flowchart has fully-bound arrows.
  const placed = await readScene(page)
  const arrows = boundArrows(placed)
  expect(arrows.length).toBeGreaterThanOrEqual(3)

  // Pick the first bound arrow and the node its start is bound to.
  const arrow = arrows[0]!
  const startNode = placed.find((e) => e.id === arrow.startBinding!.elementId)!
  const p0Before = firstPointAbs(arrow)

  // Drag that node to the right; its bound arrow endpoint must follow.
  await page.locator('[data-testid="toolbar-selection"]').click()
  const nodeCenter = { x: startNode.x + startNode.width / 2, y: startNode.y + startNode.height / 2 }
  await dragOnCanvas(page, nodeCenter, { x: nodeCenter.x + 160, y: nodeCenter.y })
  await page.waitForTimeout(700)

  const after = await readScene(page)
  const arrowAfter = after.find((e) => e.id === arrow.id)!
  const p0After = firstPointAbs(arrowAfter)
  expect(Math.abs(p0After.x - p0Before.x)).toBeGreaterThan(20)
})
