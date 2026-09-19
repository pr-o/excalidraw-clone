import { expect, test } from "@playwright/test"
import { dragOnCanvas, parseStoredScene } from "./_helpers"

test("Alt+/ toggles the stats panel; scene/single/multi states all show the right stats", async ({
  page,
}) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-rectangle"]').waitFor()

  // Nothing on the canvas yet: opening shows the scene element count (0).
  await page.keyboard.press("Alt+/")
  await expect(page.locator('[data-testid="stats-panel"]')).toBeVisible()
  await expect(page.locator('[data-testid="stats-element-count"]')).toHaveText("Elements: 0")

  // Alt+/ again closes it.
  await page.keyboard.press("Alt+/")
  await expect(page.locator('[data-testid="stats-panel"]')).toHaveCount(0)

  // Draw two rectangles.
  const draw = async (from: { x: number; y: number }, to: { x: number; y: number }) => {
    await page.locator('[data-testid="toolbar-rectangle"]').click()
    await dragOnCanvas(page, from, to)
    await page.waitForTimeout(120)
  }
  await draw({ x: 100, y: 100 }, { x: 200, y: 160 })
  await draw({ x: 300, y: 100 }, { x: 340, y: 130 })

  // Drawing leaves the new shape selected, so deselect to get back to scene stats.
  await page.keyboard.press("Escape")

  await page.keyboard.press("Alt+/")
  await expect(page.locator('[data-testid="stats-panel"]')).toBeVisible()
  await expect(page.locator('[data-testid="stats-element-count"]')).toHaveText("Elements: 2")

  // Select the first rectangle: single stats, editable width.
  await page.locator('[data-testid="toolbar-selection"]').click()
  await page
    .locator("canvas")
    .first()
    .click({ position: { x: 150, y: 130 } })
  await page.waitForTimeout(120)

  const widthInput = page.locator('[data-testid="stats-width"]')
  await expect(widthInput).toHaveValue("100")
  await expect(widthInput).toBeEnabled()

  await widthInput.fill("150")
  await widthInput.blur()
  await page.waitForTimeout(900)

  let sceneJson = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  let data = parseStoredScene<{ type: string; width?: number; isDeleted?: boolean }>(sceneJson)
  let rects = data.elements.filter((e) => e.type === "rectangle" && !e.isDeleted)
  expect(rects.some((r) => r.width === 150)).toBe(true)

  // Select both rectangles: read-only combined box, no commit possible.
  await dragOnCanvas(page, { x: 80, y: 80 }, { x: 360, y: 180 })
  await page.waitForTimeout(150)
  await expect(page.locator('[data-testid="stats-multi-count"]')).toHaveText("Selected: 2")
  await expect(page.locator('[data-testid="stats-width"]')).toBeDisabled()

  // Deselect: back to the scene element count (still 2 rectangles).
  await page.keyboard.press("Escape")
  await expect(page.locator('[data-testid="stats-element-count"]')).toHaveText("Elements: 2")

  sceneJson = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  data = parseStoredScene<{ type: string; width?: number; isDeleted?: boolean }>(sceneJson)
  rects = data.elements.filter((e) => e.type === "rectangle" && !e.isDeleted)
  expect(rects.length).toBe(2)
})
