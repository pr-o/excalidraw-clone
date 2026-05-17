import { expect, test } from "@playwright/test"

test("theme toggle changes data-theme attr", async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByRole("button", { name: /menu/i }).click()
  await page.locator('[data-testid="theme-dark"]').click()
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark")
})
