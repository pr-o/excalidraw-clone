import { expect, test, type Page } from "@playwright/test"
import { dragOnCanvas, parseStoredScene } from "./_helpers"

type SceneEl = { id: string; type: string; mirror?: [number, number]; isDeleted?: boolean }

const readScene = async (page: Page): Promise<SceneEl[]> => {
  const json = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  return parseStoredScene<SceneEl>(json).elements.filter((e) => !e.isDeleted)
}

const freshCanvas = async (page: Page): Promise<void> => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-triangle"]').waitFor({ state: "visible" })
}

const drawTriangle = async (page: Page): Promise<void> => {
  await page.locator('[data-testid="toolbar-triangle"]').click()
  await dragOnCanvas(page, { x: 120, y: 80 }, { x: 220, y: 180 })
  await page.waitForTimeout(120)
  await page.locator('[data-testid="toolbar-selection"]').click()
}

const selectTriangle = async (page: Page): Promise<void> => {
  const box = await page.locator("canvas").first().boundingBox()
  if (!box) throw new Error("canvas not found")
  await page.mouse.click(box.x + 180, box.y + 160) // inside the lower body of the triangle
  await expect(page.locator('[data-testid="flip-x"]')).toBeVisible()
}

test("Shift+V flips a triangle and the mirror persists across reload", async ({ page }) => {
  await freshCanvas(page)
  await drawTriangle(page)
  await selectTriangle(page)
  await page.keyboard.press("Shift+V")
  await page.waitForTimeout(900) // autosave debounce

  await page.reload()
  await page.locator('[data-testid="toolbar-selection"]').click()
  const tri = (await readScene(page)).find((e) => e.type === "triangle")
  expect(tri?.mirror).toEqual([1, -1])
})

test("element context menu offers Flip horizontal and flips on click", async ({ page }) => {
  await freshCanvas(page)
  await drawTriangle(page)
  await selectTriangle(page)

  const box = await page.locator("canvas").first().boundingBox()
  if (!box) throw new Error("canvas not found")
  await page.mouse.click(box.x + 180, box.y + 160, { button: "right" })
  await expect(page.locator('[data-testid="context-menu-item-flip-horizontal"]')).toBeVisible()
  await page.locator('[data-testid="context-menu-item-flip-horizontal"]').click()
  await page.waitForTimeout(900)

  const tri = (await readScene(page)).find((e) => e.type === "triangle")
  expect(tri?.mirror).toEqual([-1, 1])
})
