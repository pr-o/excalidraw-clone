import { expect, test, type Page } from "@playwright/test"
import { drawRect, freshCanvas } from "./_helpers"

/** Pixels on the main canvas that differ from its top-left (background) pixel. */
const inkedPixels = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const c = document.querySelector("canvas")!
    const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data
    let n = 0
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] !== d[0] || d[i + 1] !== d[1] || d[i + 2] !== d[2] || d[i + 3] !== d[3]) n++
    }
    return n
  })

test("resizing the window redraws the canvas instead of leaving it blank", async ({ page }) => {
  await freshCanvas(page)
  await drawRect(page, { x: 120, y: 160 }, { x: 320, y: 300 })
  await page.keyboard.press("Escape")
  await expect.poll(() => inkedPixels(page)).toBeGreaterThan(100)

  await page.setViewportSize({ width: 800, height: 600 })
  await expect.poll(() => inkedPixels(page)).toBeGreaterThan(100)
})
