import { expect, test, type Page } from "@playwright/test"
import { freshCanvas } from "./_helpers"

// Retina-class screens: the canvas backing store is twice its CSS size.
test.use({ deviceScaleFactor: 2 })

/** Darkest channel value in a CSS-pixel box of the main canvas (read in device pixels). */
const darkestIn = (page: Page, x: number, y: number, w: number, h: number): Promise<number> =>
  page.evaluate(
    ([cx, cy, cw, ch]) => {
      const c = document.querySelector("canvas")!
      const r = c.width / c.clientWidth
      const d = c.getContext("2d")!.getImageData(cx! * r, cy! * r, cw! * r, ch! * r).data
      let min = 255
      for (let i = 0; i < d.length; i += 4) min = Math.min(min, d[i]!, d[i + 1]!, d[i + 2]!)
      return min
    },
    [x, y, w, h],
  )

test("on a 2x screen a shape is drawn where it was dragged", async ({ page }) => {
  await freshCanvas(page)
  await page.getByTestId("toolbar-rectangle").click()
  await page.mouse.move(400, 300)
  await page.mouse.down()
  await page.mouse.move(600, 450, { steps: 8 })
  await page.mouse.up()
  await page.keyboard.press("Escape") // drop the selection chrome so only the stroke is dark
  // The top edge runs along y = 300 between x = 400 and 600 (CSS px).
  await expect.poll(() => darkestIn(page, 480, 294, 40, 12)).toBeLessThan(100)
  // The bug drew everything at half scale: the edge would sit near (200..300, 150).
  expect(await darkestIn(page, 220, 144, 60, 12)).toBeGreaterThan(200)
})
