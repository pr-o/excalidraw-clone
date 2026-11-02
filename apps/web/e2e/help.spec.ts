import { expect, test } from "@playwright/test"
import { drawRect, freshCanvas } from "./_helpers"

test("'?' opens the help dialog", async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-rectangle"]').waitFor()
  await page.keyboard.press("Shift+/")
  await expect(page.getByText("Tools")).toBeVisible()
})

test("the visible help button opens the shortcut sheet", async ({ page }) => {
  await freshCanvas(page)
  await page.getByTestId("help-button").click()
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible()
  await expect(page.getByTestId("empty-canvas-hint")).toHaveCount(0)
})

test("the empty-canvas hint shows until the first element is drawn", async ({ page }) => {
  await freshCanvas(page)
  await expect(page.getByTestId("empty-canvas-hint")).toBeVisible()
  // Drawing straight through the hint works: it never takes pointer events.
  await drawRect(page, { x: 500, y: 250 }, { x: 700, y: 400 })
  await expect(page.getByTestId("empty-canvas-hint")).toHaveCount(0)
  await page.reload()
  await page.getByTestId("toolbar-rectangle").waitFor()
  await expect(page.getByTestId("empty-canvas-hint")).toHaveCount(0)
})
