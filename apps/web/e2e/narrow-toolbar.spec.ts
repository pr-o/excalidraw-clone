import { expect, test } from "@playwright/test"
import { freshCanvas } from "./_helpers"

const OVERFLOW_960 = ["image", "note", "frame", "eraser", "laser", "comment"]
const OVERFLOW_600 = ["arrow", "line", "freedraw", "text", ...OVERFLOW_960]

test("below 960px the insert and utility tools move into the More tools menu", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 700 })
  await freshCanvas(page)
  const toolbar = page.getByRole("toolbar")
  for (const tool of OVERFLOW_960)
    await expect(toolbar.getByTestId(`toolbar-${tool}`)).toHaveCount(0)
  await expect(page.getByTestId("toolbar-arrow")).toBeVisible()

  for (const tool of OVERFLOW_960) {
    await page.getByTestId("toolbar-more-tools").click()
    await page.getByRole("menu").getByTestId(`toolbar-${tool}`).click()
    // The menu closes on pick and the trigger shows an overflow tool is active.
    await expect(page.getByRole("menu")).toHaveCount(0)
    await expect(page.getByTestId("toolbar-more-tools")).toHaveAttribute("aria-pressed", "true")
  }
})

test("at 600px the draw tools also move into the More tools menu and stay usable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 600, height: 700 })
  await freshCanvas(page)
  await expect(page.getByTestId("toolbar-rectangle")).toBeVisible()
  await page.getByTestId("toolbar-more-tools").click()
  const menu = page.getByRole("menu")
  for (const tool of OVERFLOW_600) await expect(menu.getByTestId(`toolbar-${tool}`)).toBeVisible()
  await expect(page.getByTestId("toolbar-more-tools")).toBeInViewport({ ratio: 1 })

  await menu.getByTestId("toolbar-text").click()
  await expect(menu).toHaveCount(0)
  await page.keyboard.press("Escape")
  // Shortcut keys still reach overflowed tools.
  await page.keyboard.press("e")
  await expect(page.getByTestId("toolbar-more-tools")).toHaveAttribute("aria-pressed", "true")
})

test("at 1280px no More tools menu is shown", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await freshCanvas(page)
  await expect(page.getByTestId("toolbar-more-tools")).toHaveCount(0)
  await expect(page.getByTestId("toolbar-comment")).toBeVisible()
})
