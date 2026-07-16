import { expect, test, type Page } from "@playwright/test"
import { dragOnCanvas } from "./_helpers"

type SceneEl = {
  id: string
  type: string
  x: number
  y: number
  locked?: boolean
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

const drawRect = async (
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> => {
  await page.locator('[data-testid="toolbar-rectangle"]').click()
  await dragOnCanvas(page, from, to)
  await page.waitForTimeout(120)
}

const clickCanvas = async (page: Page, at: { x: number; y: number }): Promise<void> => {
  await page.locator('[data-testid="toolbar-selection"]').click()
  await dragOnCanvas(page, at, at) // zero-length drag = click
  await page.waitForTimeout(120)
}

test("locked element is click-through and Unlock all restores it", async ({ page }) => {
  await freshCanvas(page)

  // A below, B on top, overlapping in (150,150)-(200,200).
  await drawRect(page, { x: 100, y: 100 }, { x: 200, y: 200 })
  await drawRect(page, { x: 150, y: 150 }, { x: 250, y: 250 })

  // Select B via a point only inside B, lock it from the panel.
  await clickCanvas(page, { x: 240, y: 240 })
  await expect(page.locator('[data-testid="panel-lock"]')).toBeVisible()
  await page.locator('[data-testid="panel-lock"]').click()
  await page.waitForTimeout(120)

  // Locking clears the selection: panel gone, floating Unlock all appears.
  await expect(page.locator('[data-testid="panel-lock"]')).toHaveCount(0)
  await expect(page.locator('[data-testid="unlock-all"]')).toBeVisible()

  // Click a point only inside locked B: nothing gets selected.
  await clickCanvas(page, { x: 240, y: 240 })
  await expect(page.locator('[data-testid="panel-lock"]')).toHaveCount(0)

  // Click the overlap: B is topmost but locked, so A gets selected.
  await clickCanvas(page, { x: 175, y: 175 })
  await expect(page.locator('[data-testid="panel-lock"]')).toBeVisible()
  await page.keyboard.press("Escape")

  // Unlock all: button disappears, B is selectable again.
  await page.locator('[data-testid="unlock-all"]').click()
  await page.waitForTimeout(120)
  await expect(page.locator('[data-testid="unlock-all"]')).toHaveCount(0)
  await clickCanvas(page, { x: 240, y: 240 })
  await expect(page.locator('[data-testid="panel-lock"]')).toBeVisible()

  await page.waitForTimeout(900)
  const rects = await readScene(page)
  expect(rects.every((r) => !r.locked)).toBe(true)
})

test("marquee selects only unlocked elements", async ({ page }) => {
  await freshCanvas(page)

  // Side by side: A at x≈100, B at x≈220.
  await drawRect(page, { x: 100, y: 100 }, { x: 160, y: 160 })
  await drawRect(page, { x: 220, y: 100 }, { x: 280, y: 160 })

  // Lock B.
  await clickCanvas(page, { x: 250, y: 130 })
  await page.locator('[data-testid="panel-lock"]').click()
  await page.waitForTimeout(120)

  // Marquee over both, then Delete: only unlocked A dies.
  await page.locator('[data-testid="toolbar-selection"]').click()
  await dragOnCanvas(page, { x: 80, y: 80 }, { x: 300, y: 180 })
  await page.waitForTimeout(150)
  await page.keyboard.press("Delete")
  await page.waitForTimeout(900)

  const rects = (await readScene(page)).filter((e) => e.type === "rectangle")
  expect(rects.length).toBe(1)
  expect(Math.abs(rects[0]!.x - 220)).toBeLessThan(1)
  expect(rects[0]!.locked).toBe(true)
})

test("lock persists across reload (Ctrl+Shift+L path)", async ({ page }) => {
  await freshCanvas(page)

  await drawRect(page, { x: 100, y: 100 }, { x: 160, y: 160 })
  await clickCanvas(page, { x: 130, y: 130 })
  await page.keyboard.press("Control+Shift+KeyL")
  await page.waitForTimeout(900) // let auto-save flush

  await page.reload()
  await page.locator('[data-testid="toolbar-rectangle"]').waitFor({ state: "visible" })

  // Still locked after reload: floating button shows, element not clickable.
  await expect(page.locator('[data-testid="unlock-all"]')).toBeVisible()
  await clickCanvas(page, { x: 130, y: 130 })
  await expect(page.locator('[data-testid="panel-lock"]')).toHaveCount(0)

  const rects = (await readScene(page)).filter((e) => e.type === "rectangle")
  expect(rects[0]!.locked).toBe(true)
})
