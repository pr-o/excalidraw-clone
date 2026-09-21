import { expect, test } from "@playwright/test"
import { dragOnCanvas, parseStoredScene } from "./_helpers"

test("history panel: labeled entries, click-to-jump, and future truncation on new edit", async ({
  page,
}) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-rectangle"]').waitFor({ state: "visible" })

  const draw = async (from: { x: number; y: number }, to: { x: number; y: number }) => {
    await page.locator('[data-testid="toolbar-rectangle"]').click()
    await dragOnCanvas(page, from, to)
    await page.waitForTimeout(120)
  }

  // Panel starts closed.
  await expect(page.locator('[data-testid="history-panel"]')).toHaveCount(0)

  await draw({ x: 100, y: 100 }, { x: 160, y: 160 })
  await draw({ x: 220, y: 100 }, { x: 280, y: 160 })
  await page.keyboard.press("Escape")
  await page.waitForTimeout(700)

  let scene = parseStoredScene<{ type: string; isDeleted?: boolean }>(
    await page.evaluate(() => localStorage.getItem("excalidraw-scene")),
  )
  expect(scene.elements.filter((e) => !e.isDeleted).length).toBe(2)

  await page.locator('[data-testid="history-toggle"]').click()
  await expect(page.locator('[data-testid="history-panel"]')).toBeVisible()

  const rows = page.locator('[data-testid^="history-row-"]')
  await expect(rows).toHaveCount(3) // initial + two adds

  // Newest first.
  await expect(page.locator('[data-testid="history-jump-2"]')).toHaveText(/Added 1 element/)
  await expect(page.locator('[data-testid="history-jump-1"]')).toHaveText(/Added 1 element/)
  await expect(page.locator('[data-testid="history-jump-0"]')).toHaveText(/Initial state/)

  // Jump directly back to the initial (empty) state — a two-step undo in one click.
  await page.locator('[data-testid="history-jump-0"]').click()
  await page.waitForTimeout(700)

  scene = parseStoredScene(await page.evaluate(() => localStorage.getItem("excalidraw-scene")))
  expect(scene.elements.filter((e) => !e.isDeleted).length).toBe(0)

  // A new edit after jumping back truncates the future entries.
  await draw({ x: 400, y: 100 }, { x: 460, y: 160 })
  await page.waitForTimeout(700)

  await expect(page.locator('[data-testid^="history-row-"]')).toHaveCount(2) // initial + the new add only
})

test("history panel: a plain click-to-select does not add a history entry", async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-rectangle"]').waitFor({ state: "visible" })

  await page.locator('[data-testid="toolbar-rectangle"]').click()
  await dragOnCanvas(page, { x: 100, y: 100 }, { x: 200, y: 200 })
  await page.keyboard.press("Escape")
  await page.waitForTimeout(700)

  await page.locator('[data-testid="history-toggle"]').click()
  await expect(page.locator('[data-testid="history-panel"]')).toBeVisible()

  const rows = page.locator('[data-testid^="history-row-"]')
  await expect(rows).toHaveCount(2) // initial + the add

  // Plain click-to-select (no drag) must be a no-op for history.
  await page.locator('[data-testid="toolbar-selection"]').click()
  const box = await page.locator("canvas").first().boundingBox()
  if (!box) throw new Error("canvas not found")
  for (let i = 0; i < 3; i += 1) {
    await page.mouse.click(box.x + 150, box.y + 150)
    await page.waitForTimeout(100)
  }

  await expect(rows).toHaveCount(2)
})
