import { expect, test, type Page } from "@playwright/test"
import { dragOnCanvas, parseStoredScene } from "./_helpers"

type SceneEl = {
  id: string
  type: string
  x: number
  y: number
  width: number
  height: number
  isDeleted?: boolean
}

const readScene = async (page: Page): Promise<SceneEl[]> => {
  const json = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  const data = parseStoredScene<SceneEl>(json)
  return data.elements.filter((e) => !e.isDeleted)
}

test("tidy up lays scattered rectangles out in a row with 24px gaps", async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-rectangle"]').waitFor({ state: "visible" })

  // Three same-size rectangles, roughly in a row but with uneven spacing and heights.
  const draw = async (from: { x: number; y: number }, to: { x: number; y: number }) => {
    await page.locator('[data-testid="toolbar-rectangle"]').click()
    await dragOnCanvas(page, from, to)
    await page.waitForTimeout(120)
  }
  await draw({ x: 100, y: 140 }, { x: 160, y: 200 })
  await draw({ x: 200, y: 150 }, { x: 260, y: 210 })
  await draw({ x: 380, y: 130 }, { x: 440, y: 190 })

  await page.locator('[data-testid="toolbar-selection"]').click()
  await dragOnCanvas(page, { x: 80, y: 100 }, { x: 470, y: 240 })
  await page.waitForTimeout(150)

  // Wait past the 500ms auto-save debounce before reading.
  await page.locator('[data-testid="tidy-up"]').click()
  await page.waitForTimeout(900)

  const rects = (await readScene(page))
    .filter((e) => e.type === "rectangle")
    .sort((a, b) => a.x - b.x)
  expect(rects.length).toBe(3)
  for (let i = 1; i < rects.length; i += 1) {
    const prev = rects[i - 1]!
    expect(Math.abs(rects[i]!.x - (prev.x + prev.width) - 24)).toBeLessThan(1)
    expect(Math.abs(rects[i]!.y - prev.y)).toBeLessThan(1)
  }
})
