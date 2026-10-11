import { expect, test, type Page } from "@playwright/test"
import { dragOnCanvas, parseStoredScene } from "./_helpers"

type TextEl = {
  id: string
  type: string
  width: number
  text?: string
  fontFamily?: number
  textAlign?: string
  containerId?: string | null
  isDeleted?: boolean
}

const readTexts = async (page: Page): Promise<TextEl[]> => {
  const json = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  return parseStoredScene<TextEl>(json).elements.filter((e) => e.type === "text" && !e.isDeleted)
}

const freshCanvas = async (page: Page): Promise<void> => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-text"]').waitFor({ state: "visible" })
}

const canvasPoint = async (page: Page, at: { x: number; y: number }) => {
  const box = await page.locator("canvas").first().boundingBox()
  if (!box) throw new Error("canvas not found")
  return { x: box.x + at.x, y: box.y + at.y }
}

test("free text takes font family (re-measured) and alignment from the panel", async ({ page }) => {
  await freshCanvas(page)
  await page.locator('[data-testid="toolbar-text"]').click()
  const p = await canvasPoint(page, { x: 200, y: 200 })
  await page.mouse.click(p.x, p.y)
  const editor = page.locator("textarea")
  await editor.waitFor({ state: "visible" })
  await page.keyboard.type("hello world")
  await editor.blur()
  await expect(editor).toHaveCount(0)

  await page.locator('[data-testid="toolbar-selection"]').click()
  await page.keyboard.press("ControlOrMeta+a")
  await page.waitForTimeout(900)
  const before = (await readTexts(page))[0]!

  await page.locator('[data-testid="font-family-3"]').click()
  await page.locator('[data-testid="text-align-right"]').click()
  await expect(page.locator('[data-testid="font-family-3"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  )
  await expect(page.locator('[data-testid="text-align-right"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  )

  await page.waitForTimeout(900)
  const after = (await readTexts(page))[0]!
  expect(after.fontFamily).toBe(3)
  expect(after.textAlign).toBe("right")
  // monospace fallback measures differently from the hand-drawn (cursive) fallback
  expect(after.width).not.toBe(before.width)
  expect(after.width).toBeGreaterThan(0)
})

test("a labelled rectangle's label takes font family and alignment from the panel", async ({
  page,
}) => {
  await freshCanvas(page)
  await page.locator('[data-testid="toolbar-rectangle"]').click()
  await dragOnCanvas(page, { x: 100, y: 100 }, { x: 300, y: 200 })
  await page.waitForTimeout(120)

  await page.locator('[data-testid="toolbar-selection"]').click()
  const mid = await canvasPoint(page, { x: 200, y: 150 })
  await page.mouse.dblclick(mid.x, mid.y)
  const textarea = page.locator("textarea")
  await textarea.waitFor({ state: "visible" })
  await textarea.fill("Hi")
  await page.mouse.click(500, 400)
  await expect(textarea).toHaveCount(0)

  // Ctrl/Cmd+A selects the rectangle (labels are filtered out of selection).
  await page.keyboard.press("ControlOrMeta+a")
  await expect(page.locator('[data-testid="text-align-center"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  )
  await page.locator('[data-testid="font-family-3"]').click()
  await page.locator('[data-testid="text-align-left"]').click()
  await expect(page.locator('[data-testid="text-align-left"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  )

  await page.waitForTimeout(900)
  let label = (await readTexts(page))[0]!
  expect(label.containerId).not.toBeNull()
  expect(label.fontFamily).toBe(3)
  expect(label.textAlign).toBe("left")

  // survives reload (and the reconcile that runs on every later mutation)
  await page.reload()
  await page.locator('[data-testid="toolbar-text"]').waitFor({ state: "visible" })
  label = (await readTexts(page))[0]!
  expect(label.textAlign).toBe("left")
})
