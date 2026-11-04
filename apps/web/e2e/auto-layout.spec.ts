import { expect, test } from "@playwright/test"
import { drawRect, dragOnCanvas, freshCanvas, readScene } from "./_helpers"

type SceneEl = {
  id: string
  type: string
  x: number
  y: number
  width: number
  height: number
  isDeleted?: boolean
}

const rects = (els: SceneEl[]): SceneEl[] => els.filter((e) => e.type === "rectangle")

test("auto layout (tree) arranges a connected hub and spokes in layers", async ({ page }) => {
  await freshCanvas(page)

  // A hub with two spokes scattered at odd positions, joined by two arrows.
  await drawRect(page, { x: 400, y: 300 }, { x: 480, y: 340 })
  await drawRect(page, { x: 200, y: 200 }, { x: 280, y: 240 })
  await drawRect(page, { x: 640, y: 420 }, { x: 720, y: 460 })
  await page.locator('[data-testid="toolbar-arrow"]').click()
  await dragOnCanvas(page, { x: 396, y: 316 }, { x: 284, y: 226 })
  await page.locator('[data-testid="toolbar-arrow"]').click()
  await dragOnCanvas(page, { x: 484, y: 330 }, { x: 636, y: 436 })

  await page.locator('[data-testid="toolbar-selection"]').click()
  await dragOnCanvas(page, { x: 150, y: 150 }, { x: 780, y: 520 })
  await expect(page.locator('[data-testid="auto-layout-tree-down"]')).toBeEnabled()
  await page.locator('[data-testid="auto-layout-tree-down"]').click()
  await page.waitForTimeout(900)

  const placed = rects(await readScene<SceneEl>(page))
  // Exactly one rectangle is the root (top layer); the other two share the lower layer.
  const ys = placed.map((r) => r.y).sort((p, q) => p - q)
  expect(placed).toHaveLength(3)
  expect(ys[1]).toBeGreaterThan(ys[0]! + 40)
  expect(ys[2]).toBe(ys[1])
})

test("auto layout is disabled when the selection has no connecting arrows", async ({ page }) => {
  await freshCanvas(page)
  await drawRect(page, { x: 200, y: 200 }, { x: 280, y: 240 })
  await drawRect(page, { x: 400, y: 300 }, { x: 480, y: 340 })
  await page.locator('[data-testid="toolbar-selection"]').click()
  await dragOnCanvas(page, { x: 150, y: 150 }, { x: 560, y: 400 })
  await expect(page.locator('[data-testid="auto-layout-radial"]')).toBeDisabled()
})
