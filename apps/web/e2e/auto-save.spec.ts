import { expect, test } from "@playwright/test"
import { dragOnCanvas, parseStoredScene } from "./_helpers"

test("scene survives a reload", async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-ellipse"]').click()
  await dragOnCanvas(page, { x: 200, y: 200 }, { x: 350, y: 320 })
  await page.waitForTimeout(700)
  await page.reload()
  await page.waitForTimeout(500)

  const data = parseStoredScene<{ type: string }>(
    await page.evaluate(() => localStorage.getItem("excalidraw-scene")),
  )
  expect(data.elements[0]?.type).toBe("ellipse")
})
