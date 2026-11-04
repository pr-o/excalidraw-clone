import { expect, test, type Page } from "@playwright/test"
import { dragOnCanvas, freshCanvas } from "./_helpers"

/** Red channel and green channel of one main-canvas pixel (device pixels). */
async function pixel(page: Page, x: number, y: number) {
  return page.evaluate(
    ([px, py]) => {
      const c = document.querySelector("canvas")!
      const d = c.getContext("2d")!.getImageData(px!, py!, 1, 1).data
      return { r: d[0]!, g: d[1]!, b: d[2]! }
    },
    [x, y],
  )
}

test("the Opacity control lightens the element on the canvas", async ({ page }) => {
  await freshCanvas(page)
  await page.locator('[data-testid="toolbar-rectangle"]').click()
  await dragOnCanvas(page, { x: 120, y: 120 }, { x: 260, y: 220 })
  await page.waitForTimeout(150)

  // Solid, strongly coloured fill so the effect is measurable.
  await page.locator('[data-testid="bg-ffc9c9"]').click()
  await page.getByRole("button", { name: /solid/i }).first().click()
  await page.waitForTimeout(150)
  const dpr = await page.evaluate(() => window.devicePixelRatio)
  const probe = { x: Math.round(190 * dpr), y: Math.round(170 * dpr) }
  const before = await pixel(page, probe.x, probe.y)

  await page.locator('[data-testid="opacity-25"]').click()
  await page.waitForTimeout(250)
  const after = await pixel(page, probe.x, probe.y)

  // Fading toward the white background raises the green/blue channels of a pink fill.
  expect(after.g).toBeGreaterThan(before.g)
})
