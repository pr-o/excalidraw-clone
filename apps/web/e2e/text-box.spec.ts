import { expect, test, type Page } from "@playwright/test"
import { dragOnCanvas, parseStoredScene } from "./_helpers"

type TextEl = {
  type: string
  x: number
  y: number
  width: number
  height: number
  autoResize?: boolean
  isDeleted?: boolean
}

const readText = async (page: Page): Promise<TextEl> => {
  const json = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  const texts = parseStoredScene<TextEl>(json).elements.filter(
    (e) => e.type === "text" && !e.isDeleted,
  )
  expect(texts).toHaveLength(1)
  return texts[0]!
}

test("dragging a free text's east handle narrower wraps it into a fixed-width box", async ({
  page,
}) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-text"]').click()
  const box = await page.locator("canvas").first().boundingBox()
  if (!box) throw new Error("canvas not found")
  await page.mouse.click(box.x + 200, box.y + 200)
  const editor = page.locator("textarea")
  await editor.waitFor({ state: "visible" })
  await page.keyboard.type("hello wide world")
  await editor.blur()
  await expect(editor).toHaveCount(0)

  await page.locator('[data-testid="toolbar-selection"]').click()
  await page.keyboard.press("ControlOrMeta+a")
  await page.waitForTimeout(900)
  const before = await readText(page)
  expect(before.autoResize).toBe(true)

  // Scroll is 0 and zoom 1 on a fresh canvas, so scene coords = canvas coords.
  const handle = { x: before.x + before.width, y: before.y + before.height / 2 }
  await dragOnCanvas(page, handle, { x: before.x + before.width * 0.45, y: handle.y })
  await page.waitForTimeout(900)
  const after = await readText(page)
  expect(after.autoResize).toBe(false)
  expect(after.width).toBeLessThan(before.width)
  expect(after.height).toBeGreaterThan(before.height * 1.5)

  await page.reload()
  await page.locator('[data-testid="toolbar-text"]').waitFor({ state: "visible" })
  const reloaded = await readText(page)
  expect(reloaded.autoResize).toBe(false)
  expect(reloaded.width).toBeCloseTo(after.width)
  expect(reloaded.height).toBeCloseTo(after.height)

  // Double-clicking a side handle restores auto-sizing (natural width, one line).
  await page.locator('[data-testid="toolbar-selection"]').click()
  await page.keyboard.press("ControlOrMeta+a")
  await page.waitForTimeout(150)
  const east = { x: box.x + after.x + after.width, y: box.y + after.y + after.height / 2 }
  await page.mouse.dblclick(east.x, east.y)
  await page.waitForTimeout(900)
  const restored = await readText(page)
  expect(restored.autoResize).toBe(true)
  expect(restored.width).toBeCloseTo(before.width)
  expect(restored.height).toBeCloseTo(before.height)
})
