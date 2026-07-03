import { expect, test, type Page } from "@playwright/test"
import { dragOnCanvas } from "./_helpers"

type SceneEl = { id: string; type: string; x: number; y: number; isDeleted?: boolean }

const readScene = async (page: Page): Promise<SceneEl[]> => {
  const json = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  const data = JSON.parse(json!) as { elements: SceneEl[] }
  return data.elements.filter((e) => !e.isDeleted)
}

test("align top makes selected rectangles share a top edge", async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-rectangle"]').waitFor({ state: "visible" })

  // Three rectangles at different heights.
  const draw = async (from: { x: number; y: number }, to: { x: number; y: number }) => {
    await page.locator('[data-testid="toolbar-rectangle"]').click()
    await dragOnCanvas(page, from, to)
    await page.waitForTimeout(120)
  }
  await draw({ x: 100, y: 120 }, { x: 160, y: 180 })
  await draw({ x: 220, y: 220 }, { x: 280, y: 300 })
  await draw({ x: 340, y: 160 }, { x: 400, y: 220 })

  // Marquee-select all three.
  await page.locator('[data-testid="toolbar-selection"]').click()
  await dragOnCanvas(page, { x: 80, y: 90 }, { x: 430, y: 330 })
  await page.waitForTimeout(150)

  // Align their tops. Wait past the 500ms auto-save debounce before reading.
  await page.locator('[data-testid="align-top"]').click()
  await page.waitForTimeout(900)

  const rects = (await readScene(page)).filter((e) => e.type === "rectangle")
  expect(rects.length).toBe(3)
  const tops = rects.map((r) => r.y)
  const minTop = Math.min(...tops)
  for (const top of tops) {
    expect(Math.abs(top - minTop)).toBeLessThan(1)
  }
})
