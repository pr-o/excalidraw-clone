import { expect, test, type Page } from "@playwright/test"
import { readFileSync } from "node:fs"
import { dragOnCanvas } from "./_helpers"

test("theme toggle changes data-theme attr", async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByRole("button", { name: /menu/i }).click()
  await page.locator('[data-testid="theme-dark"]').click()
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark")
  await expect(page.locator('[role="menu"]')).toBeHidden() // selection closes the menu
})

const bgPixel = async (page: Page): Promise<[number, number, number]> =>
  page.evaluate(() => {
    const c = document.querySelector("canvas")!
    const ctx = c.getContext("2d")!
    const d = ctx.getImageData(30, 30, 1, 1).data
    return [d[0], d[1], d[2]] as [number, number, number]
  })

// Brightest channel value in a region — stroke pixels are jittery (roughjs),
// so scan a box instead of a single coordinate.
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

const setThemeVia = async (page: Page, testId: string): Promise<void> => {
  await page.getByRole("button", { name: /menu/i }).click()
  await page.locator(`[data-testid="${testId}"]`).click()
  await page.waitForTimeout(300)
}

test("dark theme paints the canvas dark and keeps default strokes visible", async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-rectangle"]').click()
  await dragOnCanvas(page, { x: 200, y: 200 }, { x: 400, y: 320 })
  await setThemeVia(page, "theme-dark")

  const [r, g, b] = await bgPixel(page)
  expect(Math.max(r, g, b)).toBeLessThan(70) // dark background

  // Top border of the rect runs near y=200 between x=200..400; the default
  // ink stroke must now be light. Scan a box straddling the border.
  expect(await maxChannelIn(page, 280, 190, 40, 20)).toBeGreaterThan(180)
})

test("system theme follows OS preference live", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" })
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await setThemeVia(page, "theme-system")
  expect((await bgPixel(page))[0]).toBeGreaterThan(200)

  await page.emulateMedia({ colorScheme: "dark" })
  await page.waitForTimeout(300)
  expect((await bgPixel(page))[0]).toBeLessThan(70)
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark")

  // Leaving "system" detaches the listener: explicit light wins over dark OS.
  await setThemeVia(page, "theme-light")
  expect((await bgPixel(page))[0]).toBeGreaterThan(200)
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light")
})

test("dark theme persists across reload", async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await setThemeVia(page, "theme-dark")
  await page.reload()
  await page.locator("canvas").first().waitFor()
  await page.waitForTimeout(500)
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark")
  expect((await bgPixel(page))[0]).toBeLessThan(70)
})

test("export dialog defaults to dark and dark PNG has a dark background", async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await setThemeVia(page, "theme-dark")

  await page.getByRole("button", { name: /menu/i }).click()
  await page.getByText("Export image…").click()
  await expect(page.locator('[data-testid="bg-dark"]')).toHaveAttribute("aria-pressed", "true")

  const downloadPromise = page.waitForEvent("download")
  await page.getByRole("button", { name: "Export", exact: true }).click()
  const download = await downloadPromise
  const path = await download.path()
  const b64 = readFileSync(path).toString("base64")

  // Decode in the page: corner pixel of the exported PNG must be dark.
  const corner = await page.evaluate(async (data) => {
    const img = new Image()
    img.src = `data:image/png;base64,${data}`
    await new Promise((res) => (img.onload = res))
    const c = document.createElement("canvas")
    c.width = img.width
    c.height = img.height
    const ctx = c.getContext("2d")!
    ctx.drawImage(img, 0, 0)
    const d = ctx.getImageData(1, 1, 1, 1).data
    return [d[0], d[1], d[2]]
  }, b64)
  expect(Math.max(corner[0]!, corner[1]!, corner[2]!)).toBeLessThan(70)
})
