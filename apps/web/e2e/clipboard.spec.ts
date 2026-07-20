import { expect, test, type Page } from "@playwright/test"
import { dragOnCanvas } from "./_helpers"

test.use({ permissions: ["clipboard-read", "clipboard-write"] })

type SceneEl = {
  id: string
  type: string
  x: number
  y: number
  text?: string
  containerId?: string | null
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
  await page.locator('[data-testid="toolbar-rectangle"]').waitFor({ state: "visible" })
}

const moveMouseOnCanvas = async (page: Page, at: { x: number; y: number }): Promise<void> => {
  const canvas = page.locator("canvas").first()
  const box = await canvas.boundingBox()
  if (!box) throw new Error("canvas not found")
  await page.mouse.move(box.x + at.x, box.y + at.y)
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

test("select-all, copy, paste at the cursor doubles the rects", async ({ page }) => {
  await freshCanvas(page)
  await drawRect(page, { x: 100, y: 100 }, { x: 140, y: 140 })
  await drawRect(page, { x: 180, y: 100 }, { x: 220, y: 140 })

  await page.keyboard.press("Control+KeyA")
  await page.keyboard.press("Control+KeyC")
  await moveMouseOnCanvas(page, { x: 500, y: 300 })
  await page.keyboard.press("Control+KeyV")
  await page.waitForTimeout(900)

  const rects = (await readScene(page)).filter((e) => e.type === "rectangle")
  expect(rects.length).toBe(4)
  // payload bbox (100,100)-(220,140), center (160,120) → pasted at (500,300): offset (+340,+180)
  const xs = rects.map((r) => Math.round(r.x)).sort((a, b) => a - b)
  expect(xs).toEqual([100, 180, 440, 520])
})

test("cut removes the originals and paste restores them", async ({ page }) => {
  await freshCanvas(page)
  await drawRect(page, { x: 100, y: 100 }, { x: 150, y: 150 })

  await page.keyboard.press("Control+KeyA")
  await page.keyboard.press("Control+KeyX")
  await page.waitForTimeout(900)
  expect((await readScene(page)).filter((e) => e.type === "rectangle").length).toBe(0)

  await moveMouseOnCanvas(page, { x: 400, y: 300 })
  await page.keyboard.press("Control+KeyV")
  await page.waitForTimeout(900)
  const rects = (await readScene(page)).filter((e) => e.type === "rectangle")
  expect(rects.length).toBe(1)
  expect(Math.round(rects[0]!.x)).toBe(375)
  expect(Math.round(rects[0]!.y)).toBe(275)
})

test("copying a labeled shape brings the label with remapped ids", async ({ page }) => {
  await freshCanvas(page)
  await drawRect(page, { x: 100, y: 100 }, { x: 200, y: 180 })

  const canvas = page.locator("canvas").first()
  const box = (await canvas.boundingBox())!
  await page.mouse.dblclick(box.x + 150, box.y + 140)
  const textarea = page.locator("textarea")
  await textarea.waitFor({ state: "visible" })
  await textarea.fill("hi")
  await page.mouse.click(box.x + 500, box.y + 400)
  await page.waitForTimeout(300)

  await dragOnCanvas(page, { x: 150, y: 140 }, { x: 150, y: 140 }) // click-select the rect
  await page.waitForTimeout(120)
  await page.keyboard.press("Control+KeyC")
  await moveMouseOnCanvas(page, { x: 450, y: 300 })
  await page.keyboard.press("Control+KeyV")
  await page.waitForTimeout(900)

  const els = await readScene(page)
  const rects = els.filter((e) => e.type === "rectangle")
  const texts = els.filter((e) => e.type === "text")
  expect(rects.length).toBe(2)
  expect(texts.length).toBe(2)
  const newRect = rects.find((r) => Math.round(r.x) !== 100)!
  const newText = texts.find((t) => t.containerId === newRect.id)!
  expect(newText.text).toBe("hi")
  expect(newRect.boundElements?.[0]?.id).toBe(newText.id)
})

test("pasting plain text creates a text element at the cursor", async ({ page }) => {
  await freshCanvas(page)
  await page.evaluate(() => navigator.clipboard.writeText("hello canvas"))
  await moveMouseOnCanvas(page, { x: 300, y: 200 })
  await page.keyboard.press("Control+KeyV")
  await page.waitForTimeout(900)

  const texts = (await readScene(page)).filter((e) => e.type === "text")
  expect(texts.length).toBe(1)
  expect(texts[0]!.text).toBe("hello canvas")
  expect(Math.round(texts[0]!.x)).toBe(300)
  expect(Math.round(texts[0]!.y)).toBe(200)
})
