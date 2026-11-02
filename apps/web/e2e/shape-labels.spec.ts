import { expect, test } from "@playwright/test"
import { dblClickCanvas, dragOnCanvas, drawRect, freshCanvas, readScene } from "./_helpers"

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

test("double-click a diamond adds a label that follows the shape and persists", async ({
  page,
}) => {
  await freshCanvas(page, "toolbar-diamond")

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

  let els = await readScene<SceneEl>(page)
  const diamond = els.find((e) => e.type === "diamond")!
  let label = els.find((e) => e.type === "text")!
  expect(label.text).toBe("OK")
  expect(label.containerId).toBe(diamond.id)
  // diamond inner box: x-offset = width/4
  expect(Math.abs(label.x - (diamond.x + diamond.width / 4))).toBeLessThanOrEqual(1)

  // drag the diamond; the label follows
  await dragOnCanvas(page, { x: 160, y: 140 }, { x: 360, y: 240 })
  await page.waitForTimeout(900)
  els = await readScene<SceneEl>(page)
  const moved = els.find((e) => e.type === "diamond")!
  label = els.find((e) => e.type === "text")!
  expect(Math.abs(label.x - (moved.x + moved.width / 4))).toBeLessThanOrEqual(1)

  // persists across reload
  await page.reload()
  await page.locator('[data-testid="toolbar-diamond"]').waitFor({ state: "visible" })
  els = await readScene<SceneEl>(page)
  expect(els.find((e) => e.type === "text")?.text).toBe("OK")
})

test("committing an empty label leaves the scene label-free", async ({ page }) => {
  await freshCanvas(page, "toolbar-diamond")

  await page.locator('[data-testid="toolbar-rectangle"]').click()
  await dragOnCanvas(page, { x: 100, y: 100 }, { x: 240, y: 180 })
  await page.waitForTimeout(120)

  await page.locator('[data-testid="toolbar-selection"]').click()
  await dblClickCanvas(page, { x: 170, y: 140 })
  await page.locator("textarea").waitFor({ state: "visible" })
  // blur with nothing typed
  await page.mouse.click(500, 400)
  await page.waitForTimeout(900)

  const els = await readScene<SceneEl>(page)
  expect(els.filter((e) => e.type === "text")).toHaveLength(0)
  expect(els).toHaveLength(1)
})

test("the label editor sits inside its shape, centred where the label renders", async ({
  page,
}) => {
  await freshCanvas(page)
  await drawRect(page, { x: 700, y: 200 }, { x: 790, y: 300 })
  await dblClickCanvas(page, { x: 745, y: 250 })
  await page.keyboard.type("Narrow")
  const canvas = (await page.locator("canvas").first().boundingBox())!
  const editor = (await page.locator("textarea").boundingBox())!
  // Container 700..790 with an 8px text inset: the editor is that box, not wider.
  expect(editor.x - canvas.x).toBeCloseTo(708, 0)
  expect(editor.x - canvas.x + editor.width).toBeLessThanOrEqual(792 + 2)
  // One line, vertically centred on the shape's middle (y = 250).
  expect(Math.abs(editor.y - canvas.y + editor.height / 2 - 250)).toBeLessThan(3)
})
