import { expect, test, type Page } from "@playwright/test"
import { dragOnCanvas } from "./_helpers"

type SceneEl = {
  id: string
  type: string
  x: number
  points?: { x: number; y: number }[]
  isDeleted?: boolean
}

const readScene = async (page: Page): Promise<SceneEl[]> => {
  const json = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  const data = JSON.parse(json!) as { elements: SceneEl[] }
  return data.elements.filter((e) => !e.isDeleted)
}

const arrowEndX = (els: SceneEl[]): number => {
  const a = els.find((e) => e.type === "arrow")!
  const last = a.points![a.points!.length - 1]!
  return a.x + last.x
}

test("dragging an arrow endpoint onto a shape binds it; moving the shape drags the arrow", async ({
  page,
}) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-rectangle"]').waitFor({ state: "visible" })

  // Rectangle on the right.
  await page.locator('[data-testid="toolbar-rectangle"]').click()
  await dragOnCanvas(page, { x: 500, y: 200 }, { x: 600, y: 300 })

  // Arrow on the left, ending in empty space (unbound end at ≈ 300,250).
  await page.locator('[data-testid="toolbar-arrow"]').click()
  await dragOnCanvas(page, { x: 150, y: 250 }, { x: 300, y: 250 })
  await page.waitForTimeout(700)

  // Select tool; click the arrow body to select it.
  await page.locator('[data-testid="toolbar-selection"]').click()
  await dragOnCanvas(page, { x: 225, y: 250 }, { x: 225, y: 250 })

  // Drag the arrow's end endpoint (≈ 300,250) into the rectangle (≈ 550,250).
  await dragOnCanvas(page, { x: 300, y: 250 }, { x: 550, y: 250 })
  await page.waitForTimeout(700)

  const before = await readScene(page)
  const beforeEndX = arrowEndX(before)

  // Move the rectangle right; the now-bound arrow end must follow.
  await dragOnCanvas(page, { x: 580, y: 290 }, { x: 780, y: 290 })
  await page.waitForTimeout(700)

  const after = await readScene(page)
  expect(arrowEndX(after)).toBeGreaterThan(beforeEndX)
})
