import { expect, test } from "@playwright/test"

test("Cmd+/ opens command palette; Esc closes", async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  const isMac = process.platform === "darwin"
  await page.keyboard.press(isMac ? "Meta+/" : "Control+/")
  await expect(page.getByRole("dialog", { name: "palette.title" })).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog", { name: "palette.title" })).toHaveCount(0)
})
