import { expect, test } from "@playwright/test"
import { dragOnCanvas } from "./_helpers"

test("undo removes the last drawn element", async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-rectangle"]').click()
  await dragOnCanvas(page, { x: 100, y: 100 }, { x: 300, y: 250 })
  await page.waitForTimeout(700)

  const before = JSON.parse(
    (await page.evaluate(() => localStorage.getItem("excalidraw-scene")))!,
  ) as { elements: unknown[] }
  expect(before.elements.length).toBe(1)

  const isMac = process.platform === "darwin"
  await page.keyboard.press(isMac ? "Meta+Z" : "Control+Z")
  await page.waitForTimeout(700)

  const after = JSON.parse(
    (await page.evaluate(() => localStorage.getItem("excalidraw-scene")))!,
  ) as { elements: unknown[] }
  expect(after.elements.length).toBe(0)
})
