import { expect, test, type Page } from "@playwright/test"
import { parseStoredScene } from "./_helpers"

interface SceneEl {
  id: string
  type: string
  x: number
  y: number
  width: number
  height: number
  isDeleted?: boolean
}

const readScene = async (page: Page): Promise<SceneEl[]> => {
  const json = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  return parseStoredScene<SceneEl>(json).elements.filter((e) => !e.isDeleted)
}

const freshCanvas = async (page: Page): Promise<void> => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-rectangle"]').waitFor({ state: "visible" })
}

const draw = async (
  page: Page,
  toolTestId: string,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> => {
  await page.locator(`[data-testid="${toolTestId}"]`).click()
  const canvas = page.locator("canvas").first()
  const box = await canvas.boundingBox()
  if (!box) throw new Error("canvas not found")
  await page.mouse.move(box.x + from.x, box.y + from.y)
  await page.mouse.down()
  await page.mouse.move(box.x + to.x, box.y + to.y, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(900) // autosave debounce
}

test("Escape while drawing a shape removes the uncommitted shape", async ({ page }) => {
  await freshCanvas(page)
  await page.locator('[data-testid="toolbar-rectangle"]').click()
  const canvas = page.locator("canvas").first()
  const box = await canvas.boundingBox()
  if (!box) throw new Error("canvas not found")
  await page.mouse.move(box.x + 100, box.y + 100)
  await page.mouse.down()
  await page.mouse.move(box.x + 300, box.y + 300, { steps: 8 })
  await page.keyboard.press("Escape")
  await page.mouse.up()
  await page.waitForTimeout(900)

  const rects = (await readScene(page)).filter((e) => e.type === "rectangle")
  expect(rects).toHaveLength(0)
})

test("Escape mid-drag reverts the element to its original position", async ({ page }) => {
  await freshCanvas(page)
  await draw(page, "toolbar-rectangle", { x: 100, y: 100 }, { x: 200, y: 200 })
  await page.locator('[data-testid="toolbar-selection"]').click()

  const canvas = page.locator("canvas").first()
  const box = await canvas.boundingBox()
  if (!box) throw new Error("canvas not found")
  await page.mouse.move(box.x + 150, box.y + 150) // inside the rect, clear of resize handles
  await page.mouse.down()
  await page.mouse.move(box.x + 350, box.y + 150, { steps: 8 })
  await page.keyboard.press("Escape")
  await page.mouse.up()
  await page.waitForTimeout(900)

  const rects = (await readScene(page)).filter((e) => e.type === "rectangle")
  expect(rects).toHaveLength(1)
  expect(rects[0]!.x).toBeCloseTo(100, 5)
  expect(rects[0]!.y).toBeCloseTo(100, 5)
})
