import { expect, test } from "@playwright/test"
import { dragOnCanvas, freshCanvas, readScene } from "./_helpers"

test("the toolbar lock keeps the rectangle tool active across draws", async ({ page }) => {
  await freshCanvas(page)
  await page.getByTestId("toolbar-lock").click()
  await page.getByTestId("toolbar-rectangle").click()
  await dragOnCanvas(page, { x: 100, y: 100 }, { x: 200, y: 200 })
  await expect(page.getByTestId("toolbar-rectangle")).toHaveAttribute("aria-pressed", "true")
  await dragOnCanvas(page, { x: 300, y: 300 }, { x: 400, y: 400 })
  await expect.poll(async () => (await readScene(page)).length).toBe(2)

  // Unlocked, drawing hands back to the selection tool as before.
  await page.getByTestId("toolbar-lock").click()
  await dragOnCanvas(page, { x: 500, y: 100 }, { x: 600, y: 200 })
  await expect(page.getByTestId("toolbar-selection")).toHaveAttribute("aria-pressed", "true")
})
