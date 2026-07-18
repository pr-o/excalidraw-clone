import { expect, test, type Page } from "@playwright/test"
import { dragOnCanvas } from "./_helpers"

type SceneEl = {
  id: string
  type: string
  x: number
  y: number
  width: number
  height: number
  text?: string
  containerId?: string | null
  points?: { x: number; y: number }[]
  boundElements?: { id: string; type: string }[] | null
  isDeleted?: boolean
}

const readScene = async (page: Page): Promise<SceneEl[]> => {
  const json = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  const data = JSON.parse(json!) as { elements: SceneEl[] }
  return data.elements.filter((e) => !e.isDeleted)
}

const freshCanvas = async (page: Page): Promise<void> => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-arrow"]').waitFor({ state: "visible" })
}

const dblClickCanvas = async (page: Page, at: { x: number; y: number }): Promise<void> => {
  const canvas = page.locator("canvas").first()
  const box = await canvas.boundingBox()
  if (!box) throw new Error("canvas not found")
  await page.mouse.dblclick(box.x + at.x, box.y + at.y)
}

// straight (two-point) connectors only
const pathCenter = (el: SceneEl): { x: number; y: number } => {
  const first = el.points![0]!
  const last = el.points![el.points!.length - 1]!
  return { x: el.x + (first.x + last.x) / 2, y: el.y + (first.y + last.y) / 2 }
}

test("double-click an arrow adds a midpoint label that follows rebinding and persists", async ({
  page,
}) => {
  await freshCanvas(page)

  // two rects with a bound arrow between them
  await page.locator('[data-testid="toolbar-rectangle"]').click()
  await dragOnCanvas(page, { x: 100, y: 200 }, { x: 200, y: 300 })
  await page.locator('[data-testid="toolbar-rectangle"]').click()
  await dragOnCanvas(page, { x: 500, y: 200 }, { x: 600, y: 300 })
  await page.locator('[data-testid="toolbar-arrow"]').click()
  await dragOnCanvas(page, { x: 150, y: 250 }, { x: 550, y: 250 })
  await page.waitForTimeout(700)

  // double-click ON the line but away from the segment-midpoint bend handle
  await page.locator('[data-testid="toolbar-selection"]').click()
  await dblClickCanvas(page, { x: 300, y: 250 })
  const textarea = page.locator("textarea")
  await textarea.waitFor({ state: "visible" })
  await textarea.fill("yes")
  await page.mouse.click(300, 450) // blur commits
  await page.waitForTimeout(900)

  let els = await readScene(page)
  const arrow = els.find((e) => e.type === "arrow")!
  let label = els.find((e) => e.type === "text")!
  expect(label.text).toBe("yes")
  expect(label.containerId).toBe(arrow.id)
  let mid = pathCenter(arrow)
  expect(Math.abs(label.x + label.width / 2 - mid.x)).toBeLessThanOrEqual(1)
  expect(Math.abs(label.y + label.height / 2 - mid.y)).toBeLessThanOrEqual(1)

  // drag rect B down; the bound arrow follows and the label recenters
  await dragOnCanvas(page, { x: 580, y: 220 }, { x: 580, y: 320 })
  await page.waitForTimeout(900)
  els = await readScene(page)
  const movedArrow = els.find((e) => e.type === "arrow")!
  label = els.find((e) => e.type === "text")!
  mid = pathCenter(movedArrow)
  expect(Math.abs(label.x + label.width / 2 - mid.x)).toBeLessThanOrEqual(1)
  expect(Math.abs(label.y + label.height / 2 - mid.y)).toBeLessThanOrEqual(1)

  // persists across reload
  await page.reload()
  await page.locator('[data-testid="toolbar-arrow"]').waitFor({ state: "visible" })
  els = await readScene(page)
  expect(els.find((e) => e.type === "text")?.text).toBe("yes")
})

test("escaping an empty line label leaves the scene label-free", async ({ page }) => {
  await freshCanvas(page)

  await page.locator('[data-testid="toolbar-line"]').click()
  await dragOnCanvas(page, { x: 100, y: 100 }, { x: 300, y: 200 })
  await page.waitForTimeout(120)

  // on the line at 40% along its length — off the midpoint handle
  await page.locator('[data-testid="toolbar-selection"]').click()
  await dblClickCanvas(page, { x: 180, y: 140 })
  await page.locator("textarea").waitFor({ state: "visible" })
  await page.keyboard.press("Escape")
  await page.waitForTimeout(900)

  const els = await readScene(page)
  expect(els.filter((e) => e.type === "text")).toHaveLength(0)
  expect(els).toHaveLength(1)
  expect(els[0]!.boundElements ?? null).toBeNull()
})
