import { expect, test, type Page } from "@playwright/test"
import { dragOnCanvas } from "./_helpers"

// Brightest channel value in a region — stroke pixels are jittery (roughjs),
// so scan a box instead of a single coordinate (same pattern as theme.spec.ts).
const maxChannelIn = async (
  page: Page,
  x: number,
  y: number,
  w: number,
  h: number,
): Promise<number> =>
  page.evaluate(
    ([rx, ry, rw, rh]) => {
      const c = document.querySelector("canvas")!
      const ctx = c.getContext("2d")!
      const d = ctx.getImageData(rx!, ry!, rw!, rh!).data
      let max = 0
      for (let i = 0; i < d.length; i += 4) max = Math.max(max, d[i]!, d[i + 1]!, d[i + 2]!)
      return max
    },
    [x, y, w, h],
  )

// maxChannelIn detects light strokes against a dark canvas; on the default
// light theme the background is white (255) and strokes vanish into it, so
// pixel-based pan assertions must run in dark mode (same setup as theme.spec.ts).
const setDarkTheme = async (page: Page): Promise<void> => {
  await page.getByRole("button", { name: /menu/i }).click()
  await page.locator('[data-testid="theme-dark"]').click()
  await page.waitForTimeout(300)
}

test("zoom widget and Ctrl+0/+/- shortcuts change the displayed zoom percentage", async ({
  page,
}) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-rectangle"]').waitFor({ state: "visible" })

  const readout = page.locator('[data-testid="zoom-reset"]')
  await expect(readout).toHaveText("100%")

  await page.locator('[data-testid="zoom-in"]').click()
  await expect(readout).toHaveText("110%")

  await page.locator('[data-testid="zoom-out"]').click()
  await expect(readout).toHaveText("100%")

  await page.keyboard.down("Control")
  await page.keyboard.press("+")
  await page.keyboard.up("Control")
  await expect(readout).toHaveText("110%")

  await page.keyboard.down("Control")
  await page.keyboard.press("0")
  await page.keyboard.up("Control")
  await expect(readout).toHaveText("100%")

  await page.keyboard.down("Control")
  await page.keyboard.press("-")
  await page.keyboard.up("Control")
  await expect(readout).not.toHaveText("100%")
})

test("plain wheel pans the canvas; Ctrl+wheel zooms", async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await setDarkTheme(page)
  await page.locator('[data-testid="toolbar-rectangle"]').click()
  await dragOnCanvas(page, { x: 200, y: 200 }, { x: 260, y: 260 })
  await page.waitForTimeout(200)

  // Rectangle's top border sits near y=200 between x=200..260.
  const before = await maxChannelIn(page, 195, 195, 70, 10)
  expect(before).toBeGreaterThan(50)

  const canvas = page.locator("canvas").first()
  const box = await canvas.boundingBox()
  await page.mouse.move(box!.x + 400, box!.y + 400)
  await page.mouse.wheel(-200, -200)
  await page.waitForTimeout(300)

  const afterPan = await maxChannelIn(page, 195, 195, 70, 10)
  expect(afterPan).toBeLessThan(before)

  await page.keyboard.down("Control")
  await page.mouse.wheel(0, -100)
  await page.keyboard.up("Control")
  await expect(page.locator('[data-testid="zoom-reset"]')).not.toHaveText("100%")
})

test("Space+drag pans the canvas without mutating scene coordinates", async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await setDarkTheme(page)
  await page.locator('[data-testid="toolbar-rectangle"]').click()
  await dragOnCanvas(page, { x: 200, y: 200 }, { x: 260, y: 260 })
  await page.waitForTimeout(200)

  const before = await maxChannelIn(page, 195, 195, 70, 10)
  expect(before).toBeGreaterThan(50)

  await page.keyboard.down("Space")
  await dragOnCanvas(page, { x: 400, y: 400 }, { x: 300, y: 300 })
  await page.keyboard.up("Space")
  await page.waitForTimeout(300)

  const after = await maxChannelIn(page, 195, 195, 70, 10)
  expect(after).toBeLessThan(before)

  // Auto-save is debounced; wait for the draw to be persisted before reading.
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("excalidraw-scene")))
    .not.toBeNull()
  const json = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  const data = JSON.parse(json!) as { elements: { x: number; isDeleted?: boolean }[] }
  const rect = data.elements.find((e) => !e.isDeleted)!
  expect(rect.x).toBe(200) // panning is a viewport transform, not a scene mutation
})
