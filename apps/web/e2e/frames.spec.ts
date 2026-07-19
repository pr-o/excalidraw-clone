import { expect, test, type Page } from "@playwright/test"
import { dragOnCanvas } from "./_helpers"

type SceneEl = {
  id: string
  type: string
  x: number
  y: number
  frameId?: string | null
  name?: string | null
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
  await page.locator('[data-testid="toolbar-frame"]').waitFor({ state: "visible" })
}

const dblClickCanvas = async (page: Page, at: { x: number; y: number }): Promise<void> => {
  const canvas = page.locator("canvas").first()
  const box = await canvas.boundingBox()
  if (!box) throw new Error("canvas not found")
  await page.mouse.dblclick(box.x + at.x, box.y + at.y)
}

const drawRect = async (
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> => {
  await page.locator('[data-testid="toolbar-rectangle"]').click()
  await dragOnCanvas(page, from, to)
  await page.waitForTimeout(120)
}

const drawSurroundingFrame = async (page: Page): Promise<void> => {
  await page.locator('[data-testid="toolbar-frame"]').click()
  await dragOnCanvas(page, { x: 100, y: 100 }, { x: 300, y: 220 })
  await page.waitForTimeout(120)
}

test("frame claims contained elements and dragging it moves them; persists across reload", async ({
  page,
}) => {
  await freshCanvas(page)

  await drawRect(page, { x: 120, y: 120 }, { x: 160, y: 160 })
  await drawRect(page, { x: 200, y: 120 }, { x: 240, y: 160 })
  await drawSurroundingFrame(page)
  await page.waitForTimeout(900)

  let els = await readScene(page)
  const frame = els.find((e) => e.type === "frame")!
  let rects = els.filter((e) => e.type === "rectangle")
  expect(rects.length).toBe(2)
  expect(rects.every((r) => r.frameId === frame.id)).toBe(true)

  // Drag the frame by its empty interior: members move by the same delta.
  await page.locator('[data-testid="toolbar-selection"]').click()
  await dragOnCanvas(page, { x: 270, y: 190 }, { x: 310, y: 240 })
  await page.waitForTimeout(900)

  els = await readScene(page)
  const movedFrame = els.find((e) => e.type === "frame")!
  rects = els.filter((e) => e.type === "rectangle")
  rects.sort((p, q) => p.x - q.x)
  expect(Math.abs(movedFrame.x - 140)).toBeLessThan(1)
  expect(Math.abs(rects[0]!.x - 160)).toBeLessThan(1)
  expect(Math.abs(rects[0]!.y - 170)).toBeLessThan(1)
  expect(Math.abs(rects[1]!.x - 240)).toBeLessThan(1)
  expect(rects.every((r) => r.frameId === movedFrame.id)).toBe(true)

  // Membership and positions survive a reload.
  await page.reload()
  await page.locator('[data-testid="toolbar-frame"]').waitFor({ state: "visible" })
  els = await readScene(page)
  rects = els.filter((e) => e.type === "rectangle")
  expect(rects.every((r) => r.frameId === movedFrame.id)).toBe(true)
})

test("double-click renames a frame", async ({ page }) => {
  await freshCanvas(page)
  await drawSurroundingFrame(page)

  await page.locator('[data-testid="toolbar-selection"]').click()
  await dblClickCanvas(page, { x: 200, y: 160 })
  const input = page.locator('[data-testid="frame-name-input"]')
  await input.waitFor({ state: "visible" })
  await input.fill("Login flow")
  await page.keyboard.press("Enter")
  await page.waitForTimeout(900)

  const els = await readScene(page)
  const frame = els.find((e) => e.type === "frame")!
  expect(frame.name).toBe("Login flow")
})

test("dragging a member out clears frameId; deleting the frame releases members", async ({
  page,
}) => {
  await freshCanvas(page)

  await drawRect(page, { x: 120, y: 120 }, { x: 160, y: 160 })
  await drawRect(page, { x: 200, y: 120 }, { x: 240, y: 160 })
  await drawSurroundingFrame(page)

  // Drag rect A out of the frame: its membership clears, B keeps its.
  await page.locator('[data-testid="toolbar-selection"]').click()
  await dragOnCanvas(page, { x: 140, y: 140 }, { x: 500, y: 140 })
  await page.waitForTimeout(900)

  let els = await readScene(page)
  const frame = els.find((e) => e.type === "frame")!
  let rects = els.filter((e) => e.type === "rectangle")
  rects.sort((p, q) => p.x - q.x)
  expect(rects[1]!.frameId).toBeNull()
  expect(rects[0]!.frameId).toBe(frame.id)

  // Select the frame (empty interior click) and delete it: members survive, released.
  await dragOnCanvas(page, { x: 270, y: 190 }, { x: 270, y: 190 })
  await page.waitForTimeout(120)
  await page.keyboard.press("Delete")
  await page.waitForTimeout(900)

  els = await readScene(page)
  expect(els.find((e) => e.type === "frame")).toBeUndefined()
  rects = els.filter((e) => e.type === "rectangle")
  expect(rects.length).toBe(2)
  expect(rects.every((r) => r.frameId === null)).toBe(true)
})
