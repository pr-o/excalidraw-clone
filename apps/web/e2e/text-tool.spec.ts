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

test("typing then pressing Escape commits the text (same as click-away)", async ({ page }) => {
  await freshCanvas(page)

  await page.locator('[data-testid="toolbar-text"]').click()
  await clickCanvas(page, { x: 200, y: 200 })

  const editor = page.locator("textarea")
  await editor.waitFor({ state: "visible" })
  await page.keyboard.type("hello")
  await page.keyboard.press("Escape")
  await expect(editor).toHaveCount(0)
  await page.waitForTimeout(900)

  const sceneJson = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  const data = parseStoredScene<{ type: string; text?: string; isDeleted?: boolean }>(sceneJson)
  const live = data.elements.filter((e) => !e.isDeleted)
  const texts = live.filter((e) => e.type === "text")
  expect(texts).toHaveLength(1)
  expect(texts[0]?.text).toBe("hello")
})

test("the Bold toggle in the properties panel persists fontWeight = bold on the selected text", async ({
  page,
}) => {
  await freshCanvas(page)

  await page.locator('[data-testid="toolbar-text"]').click()
  await clickCanvas(page, { x: 200, y: 200 })

  const editor = page.locator("textarea")
  await editor.waitFor({ state: "visible" })
  await page.keyboard.type("hello")
  await editor.blur()
  await expect(editor).toHaveCount(0)

  // Select via Ctrl/Cmd+A (click-to-select is covered by its own test below).
  await page.locator('[data-testid="toolbar-selection"]').click()
  await page.keyboard.press("ControlOrMeta+a")

  const bold = page.locator('[data-testid="font-bold"]')
  await expect(bold).toHaveAttribute("aria-pressed", "false")
  await bold.click()
  await expect(bold).toHaveAttribute("aria-pressed", "true")

  await page.waitForTimeout(900)
  const sceneJson = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  const data = parseStoredScene<{ type: string; fontWeight?: string; isDeleted?: boolean }>(
    sceneJson,
  )
  const texts = data.elements.filter((e) => e.type === "text" && !e.isDeleted)
  expect(texts).toHaveLength(1)
  expect(texts[0]?.fontWeight).toBe("bold")
})

test("committed free text can be selected by clicking on it", async ({ page }) => {
  await freshCanvas(page)

  await page.locator('[data-testid="toolbar-text"]').click()
  await clickCanvas(page, { x: 200, y: 200 })

  const editor = page.locator("textarea")
  await editor.waitFor({ state: "visible" })
  await page.keyboard.type("hello world")
  await page.keyboard.press("Escape")
  await expect(editor).toHaveCount(0)

  await page.locator('[data-testid="toolbar-selection"]').click()
  // Click an empty spot first so nothing is selected.
  await clickCanvas(page, { x: 600, y: 500 })
  const bold = page.locator('[data-testid="font-bold"]')
  await expect(bold).toHaveCount(0)

  // Click inside the rendered text (a few px right/below its top-left origin).
  await clickCanvas(page, { x: 215, y: 210 })
  await expect(bold).toBeVisible()
})
