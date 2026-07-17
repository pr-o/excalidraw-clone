import { expect, test, type Page } from "@playwright/test"
import { dragOnCanvas } from "./_helpers"

type SceneEl = {
  id: string
  type: string
  x: number
  y: number
  width: number
  text?: string
  containerId?: string | null
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
  await page.locator('[data-testid="toolbar-diamond"]').waitFor({ state: "visible" })
}

const dblClickCanvas = async (page: Page, at: { x: number; y: number }): Promise<void> => {
  const canvas = page.locator("canvas").first()
  const box = await canvas.boundingBox()
  if (!box) throw new Error("canvas not found")
  await page.mouse.dblclick(box.x + at.x, box.y + at.y)
}

test("double-click a diamond adds a label that follows the shape and persists", async ({
  page,
}) => {
  await freshCanvas(page)

  await page.locator('[data-testid="toolbar-diamond"]').click()
  await dragOnCanvas(page, { x: 100, y: 100 }, { x: 220, y: 180 })
  await page.waitForTimeout(120)

  await page.locator('[data-testid="toolbar-selection"]').click()
  await dblClickCanvas(page, { x: 160, y: 140 })
  const textarea = page.locator("textarea")
  await textarea.waitFor({ state: "visible" })
  await textarea.fill("OK")
  // blur commits
  await page.mouse.click(500, 400)
  await page.waitForTimeout(900)

  let els = await readScene(page)
  const diamond = els.find((e) => e.type === "diamond")!
  let label = els.find((e) => e.type === "text")!
  expect(label.text).toBe("OK")
  expect(label.containerId).toBe(diamond.id)
  // diamond inner box: x-offset = width/4
  expect(Math.abs(label.x - (diamond.x + diamond.width / 4))).toBeLessThanOrEqual(1)

  // drag the diamond; the label follows
  await dragOnCanvas(page, { x: 160, y: 140 }, { x: 360, y: 240 })
  await page.waitForTimeout(900)
  els = await readScene(page)
  const moved = els.find((e) => e.type === "diamond")!
  label = els.find((e) => e.type === "text")!
  expect(Math.abs(label.x - (moved.x + moved.width / 4))).toBeLessThanOrEqual(1)

  // persists across reload
  await page.reload()
  await page.locator('[data-testid="toolbar-diamond"]').waitFor({ state: "visible" })
  els = await readScene(page)
  expect(els.find((e) => e.type === "text")?.text).toBe("OK")
})

test("committing an empty label leaves the scene label-free", async ({ page }) => {
  await freshCanvas(page)

  await page.locator('[data-testid="toolbar-rectangle"]').click()
  await dragOnCanvas(page, { x: 100, y: 100 }, { x: 240, y: 180 })
  await page.waitForTimeout(120)

  await page.locator('[data-testid="toolbar-selection"]').click()
  await dblClickCanvas(page, { x: 170, y: 140 })
  await page.locator("textarea").waitFor({ state: "visible" })
  // blur with nothing typed
  await page.mouse.click(500, 400)
  await page.waitForTimeout(900)

  const els = await readScene(page)
  expect(els.filter((e) => e.type === "text")).toHaveLength(0)
  expect(els).toHaveLength(1)
})
