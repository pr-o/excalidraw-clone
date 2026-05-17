import { expect, test } from "@playwright/test"
import { dragOnCanvas } from "./_helpers"

test("user can draw a rectangle", async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => {
    localStorage.clear()
  })
  await page.reload()
  await page.locator('[data-testid="toolbar-rectangle"]').click()
  await dragOnCanvas(page, { x: 100, y: 100 }, { x: 300, y: 250 })
  await page.waitForTimeout(700)

  const sceneJson = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  expect(sceneJson).toBeTruthy()
  const data = JSON.parse(sceneJson!) as { elements: { type: string }[] }
  expect(data.elements.length).toBeGreaterThan(0)
  expect(data.elements[0]?.type).toBe("rectangle")
})
