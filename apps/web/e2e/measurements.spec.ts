import { expect, test, type Page } from "@playwright/test"
import { drawRect, freshCanvas } from "./_helpers"

/** Pixels of the measurement red (#e03131) in a region of the selection overlay canvas. */
const redPixelsIn = (page: Page, x: number, y: number, w: number, h: number): Promise<number> =>
  page.evaluate(
    ([rx, ry, rw, rh]) => {
      const overlay = document.querySelectorAll("canvas")[1]!
      const d = overlay.getContext("2d")!.getImageData(rx!, ry!, rw!, rh!).data
      let n = 0
      for (let i = 0; i < d.length; i += 4) {
        if (d[i]! > 180 && d[i + 1]! < 110 && d[i + 2]! < 110 && d[i + 3]! > 0) n += 1
      }
      return n
    },
    [x, y, w, h],
  )

const menuItem = async (page: Page) => {
  await page.getByRole("button", { name: /menu/i }).click()
  return page.getByTestId("menu-measurements")
}

test("measurement mode shows the gap between the selection and its neighbour", async ({ page }) => {
  await freshCanvas(page)
  await drawRect(page, { x: 200, y: 200 }, { x: 300, y: 300 })
  await drawRect(page, { x: 400, y: 200 }, { x: 500, y: 300 }) // stays selected
  // The gap line runs along y = 250 between x = 300 and x = 400.
  const gap = () => redPixelsIn(page, 310, 240, 80, 20)
  expect(await gap()).toBe(0)

  await page.keyboard.press("Shift+M")
  await expect.poll(gap).toBeGreaterThan(20)

  // The menu reflects the mode, and toggling it there turns the read-out off again.
  const item = await menuItem(page)
  await expect(item).toHaveAttribute("aria-checked", "true")
  await item.click()
  await expect.poll(gap).toBe(0)
})

test("measurement mode is remembered across reloads", async ({ page }) => {
  await freshCanvas(page)
  await page.keyboard.press("Shift+M")
  await page.waitForTimeout(800) // UI preferences save after 500 ms
  await page.reload()
  await page.getByTestId("toolbar-rectangle").waitFor({ state: "visible" })
  await expect(await menuItem(page)).toHaveAttribute("aria-checked", "true")
})
