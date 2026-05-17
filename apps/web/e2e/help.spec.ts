import { expect, test } from "@playwright/test"

test("'?' opens the help dialog", async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.keyboard.press("Shift+/")
  await expect(page.getByText("shortcuts.tools")).toBeVisible()
})
