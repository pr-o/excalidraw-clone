import { expect, test } from "@playwright/test"
import { dragOnCanvas, readScene } from "./_helpers"

type SceneEl = {
  id: string
  type: string
  x: number
  points?: { x: number; y: number }[]
  startBinding?: { elementId: string } | null
  endBinding?: { elementId: string } | null
  isDeleted?: boolean
}

const arrowEndX = (els: SceneEl[]): number => {
  const a = els.find((e) => e.type === "arrow")!
  const last = a.points![a.points!.length - 1]!
  return a.x + last.x
}

test("an arrow drawn from just outside one edge to just outside another binds both ends", async ({
  page,
}) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-rectangle"]').click()
  await dragOnCanvas(page, { x: 200, y: 200 }, { x: 360, y: 280 })
  await page.locator('[data-testid="toolbar-rectangle"]').click()
  await dragOnCanvas(page, { x: 600, y: 200 }, { x: 760, y: 280 })
  await page.locator('[data-testid="toolbar-arrow"]').click()
  await dragOnCanvas(page, { x: 366, y: 240 }, { x: 594, y: 240 })
  await expect
    .poll(async () => {
      const els = await readScene<SceneEl>(page)
      const arrow = els.find((e) => e.type === "arrow")
      return [arrow?.startBinding?.elementId, arrow?.endBinding?.elementId]
    })
    .toEqual([expect.any(String), expect.any(String)])
})

test("a bound arrow follows its target shape when the shape moves", async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-rectangle"]').waitFor({ state: "visible" })

  // Rect A (left) and Rect B (right).
  await page.locator('[data-testid="toolbar-rectangle"]').click()
  await dragOnCanvas(page, { x: 100, y: 200 }, { x: 200, y: 300 })
  await page.locator('[data-testid="toolbar-rectangle"]').click()
  await dragOnCanvas(page, { x: 500, y: 200 }, { x: 600, y: 300 })

  // Arrow from inside A to inside B (binds both ends).
  await page.locator('[data-testid="toolbar-arrow"]').click()
  await dragOnCanvas(page, { x: 150, y: 250 }, { x: 550, y: 250 })

  await page.waitForTimeout(700)
  const before = await readScene<SceneEl>(page)
  const beforeEndX = arrowEndX(before)

  // Drag B to the right (selection tool is active after the arrow auto-switch).
  // Click a spot inside B that is clear of the arrow line (y=250), e.g. (580,290).
  await dragOnCanvas(page, { x: 580, y: 290 }, { x: 780, y: 290 })

  await page.waitForTimeout(700)
  const after = await readScene<SceneEl>(page)
  expect(arrowEndX(after)).toBeGreaterThan(beforeEndX)
})
