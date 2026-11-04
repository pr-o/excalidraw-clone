import { expect, test } from "@playwright/test"
import { drawRect, freshCanvas, readScene } from "./_helpers"

test("Reset the canvas clears the whole document, not just the open page", async ({ page }) => {
  await freshCanvas(page)
  await drawRect(page, { x: 100, y: 120 }, { x: 200, y: 200 })

  await page.locator('[data-testid="page-add"]').click()
  await expect(page.locator('[data-testid^="page-tab-"]')).toHaveCount(2)
  await drawRect(page, { x: 300, y: 120 }, { x: 400, y: 200 })

  await page.getByRole("button", { name: /menu/i }).click()
  await page.getByRole("menuitem", { name: "Reset the canvas" }).click()
  await page.getByRole("button", { name: "Reset canvas" }).click()

  await expect(page.locator('[data-testid^="page-tab-"]')).toHaveCount(1)
  expect((await readScene<{ isDeleted?: boolean }>(page)).length).toBe(0)

  // Past the auto-save debounce: what was stored must be the empty document too.
  await page.waitForTimeout(900)
  await page.reload()
  await page.locator('[data-testid="toolbar-rectangle"]').waitFor({ state: "visible" })
  await expect(page.locator('[data-testid^="page-tab-"]')).toHaveCount(1)
  expect((await readScene<{ isDeleted?: boolean }>(page)).length).toBe(0)
})
