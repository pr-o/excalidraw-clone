import { expect, test, type Page } from "@playwright/test"
import { parseStoredScene } from "./_helpers"

const clickCanvas = async (page: Page, at: { x: number; y: number }): Promise<void> => {
  const canvas = page.locator("canvas").first()
  const box = await canvas.boundingBox()
  if (!box) throw new Error("canvas not found")
  await page.mouse.click(box.x + at.x, box.y + at.y)
}

const freshCanvas = async (page: Page): Promise<void> => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-text"]').waitFor({ state: "visible" })
}

test("a single click with the text tool, then typing, commits real text (no stray empty element)", async ({
  page,
}) => {
  await freshCanvas(page)

  await page.locator('[data-testid="toolbar-text"]').click()
  await clickCanvas(page, { x: 200, y: 200 })

  const editor = page.locator("textarea")
  await editor.waitFor({ state: "visible" })
  await page.keyboard.type("hello")
  await editor.blur()
  await page.waitForTimeout(900)

  const sceneJson = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  const data = parseStoredScene<{ type: string; text?: string; isDeleted?: boolean }>(sceneJson)
  const live = data.elements.filter((e) => !e.isDeleted)
  const texts = live.filter((e) => e.type === "text")
  expect(texts).toHaveLength(1)
  expect(texts[0]?.text).toBe("hello")
})

test("a single click with the text tool, then blurring without typing, leaves no stray element", async ({
  page,
}) => {
  await freshCanvas(page)

  await page.locator('[data-testid="toolbar-text"]').click()
  await clickCanvas(page, { x: 200, y: 200 })

  const editor = page.locator("textarea")
  await editor.waitFor({ state: "visible" })
  await editor.blur()
  await page.waitForTimeout(900)

  const sceneJson = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  const data = parseStoredScene<{ type: string; isDeleted?: boolean }>(sceneJson)
  const live = data.elements.filter((e) => !e.isDeleted)
  expect(live).toHaveLength(0)
})
