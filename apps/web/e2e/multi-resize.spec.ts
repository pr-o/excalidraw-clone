import { expect, test, type Page } from "@playwright/test"
import { dragOnCanvas, parseStoredScene } from "./_helpers"

interface SceneEl {
  id: string
  type: string
  x: number
  y: number
  width: number
  height: number
  points?: { x: number; y: number }[]
  isDeleted?: boolean
}

const readScene = async (page: Page): Promise<SceneEl[]> => {
  const json = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  return parseStoredScene<SceneEl>(json).elements.filter((e) => !e.isDeleted)
}

const freshCanvas = async (page: Page): Promise<void> => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-rectangle"]').waitFor({ state: "visible" })
}

const draw = async (
  page: Page,
  toolTestId: string,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> => {
  await page.locator(`[data-testid="${toolTestId}"]`).click()
  await dragOnCanvas(page, from, to)
  await page.waitForTimeout(120)
}

test("multi-select two rectangles, drag a corner handle: both scale proportionally and persist", async ({
  page,
}) => {
  await freshCanvas(page)
  await draw(page, "toolbar-rectangle", { x: 100, y: 100 }, { x: 200, y: 200 })
  await draw(page, "toolbar-rectangle", { x: 300, y: 100 }, { x: 400, y: 200 })

  // Marquee-select both from empty canvas space.
  await page.locator('[data-testid="toolbar-selection"]').click()
  await dragOnCanvas(page, { x: 60, y: 60 }, { x: 440, y: 220 })
  await page.waitForTimeout(150)

  // Combined bbox is x:100..400, y:100..200 — drag its SE handle outward.
  await dragOnCanvas(page, { x: 400, y: 200 }, { x: 700, y: 300 })
  await page.waitForTimeout(900) // autosave debounce

  const rects = (await readScene(page)).filter((e) => e.type === "rectangle")
  expect(rects).toHaveLength(2)
  const [first, second] = rects.sort((a, b) => a.x - b.x)
  // sx = sy = 2 from the combined bounds (300x100 -> 600x200)
  expect(first!.x).toBeCloseTo(100)
  expect(first!.y).toBeCloseTo(100)
  expect(first!.width).toBeCloseTo(200)
  expect(first!.height).toBeCloseTo(200)
  expect(second!.x).toBeCloseTo(500)
  expect(second!.y).toBeCloseTo(100)
  expect(second!.width).toBeCloseTo(200)
  expect(second!.height).toBeCloseTo(200)
})

test("multi-select a rectangle and a line, drag a handle: the line's width/height stay consistent with its scaled points", async ({
  page,
}) => {
  await freshCanvas(page)
  await draw(page, "toolbar-rectangle", { x: 100, y: 100 }, { x: 200, y: 200 })
  await draw(page, "toolbar-line", { x: 300, y: 100 }, { x: 380, y: 180 })

  await page.locator('[data-testid="toolbar-selection"]').click()
  await dragOnCanvas(page, { x: 60, y: 60 }, { x: 420, y: 220 })
  await page.waitForTimeout(150)

  // Combined bbox is x:100..380, y:100..200 — drag its SE handle outward.
  await dragOnCanvas(page, { x: 380, y: 200 }, { x: 680, y: 300 })
  await page.waitForTimeout(900)

  const scene = await readScene(page)
  const line = scene.find((e) => e.type === "line")!
  expect(line.points).toBeDefined()
  const xs = line.points!.map((p) => p.x)
  const ys = line.points!.map((p) => p.y)
  const freshWidth = Math.max(...xs) - Math.min(...xs)
  const freshHeight = Math.max(...ys) - Math.min(...ys)
  expect(line.width).toBeCloseTo(freshWidth, 5)
  expect(line.height).toBeCloseTo(freshHeight, 5)
  // Sanity: the line actually scaled up, not left at its original 80x80 box.
  expect(line.width).toBeGreaterThan(80)
})
