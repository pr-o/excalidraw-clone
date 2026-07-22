import { expect, test, type Page } from "@playwright/test"
import { dragOnCanvas } from "./_helpers"

type SceneEl = { id: string; type: string; isDeleted?: boolean }

// The scene is persisted to localStorage on a 500ms auto-save debounce, so reads
// must poll rather than assume a fixed sub-debounce wait has flushed it.
const readScene = async (page: Page): Promise<SceneEl[]> => {
  const json = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  if (json === null) return []
  const data = JSON.parse(json) as { elements: SceneEl[] }
  return data.elements.filter((e) => !e.isDeleted)
}

const sceneIds = async (page: Page): Promise<string[]> => (await readScene(page)).map((e) => e.id)

test("layers panel: z-order display, reorder buttons, and click-to-select", async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-rectangle"]').waitFor({ state: "visible" })

  const draw = async (from: { x: number; y: number }, to: { x: number; y: number }) => {
    await page.locator('[data-testid="toolbar-rectangle"]').click()
    await dragOnCanvas(page, from, to)
    await page.waitForTimeout(120)
  }
  await draw({ x: 100, y: 100 }, { x: 160, y: 160 }) // drawn first -> back
  await draw({ x: 220, y: 100 }, { x: 280, y: 160 }) // drawn second -> front

  await page.locator('[data-testid="toolbar-selection"]').click()

  // Wait for the auto-save debounce to persist both rectangles, then read ids.
  await expect.poll(async () => (await readScene(page)).length).toBe(2)
  const [a, b] = await readScene(page)
  expect(a).toBeDefined()
  expect(b).toBeDefined()

  // Panel starts closed.
  await expect(page.locator('[data-testid^="layer-row-"]')).toHaveCount(0)
  await page.locator('[data-testid="layers-toggle"]').click()

  const rows = page.locator('[data-testid^="layer-row-"]')
  await expect(rows).toHaveCount(2)
  // Top row = front-most element (drawn second), bottom row = back-most (drawn first).
  await expect(rows.nth(0)).toHaveAttribute("data-testid", `layer-row-${b!.id}`)
  await expect(rows.nth(1)).toHaveAttribute("data-testid", `layer-row-${a!.id}`)

  // Send the front element (b) to back: array order flips, panel order follows.
  await page.locator(`[data-testid="layer-send-to-back-${b!.id}"]`).click()
  await expect.poll(() => sceneIds(page)).toEqual([b!.id, a!.id])
  await expect(rows.nth(0)).toHaveAttribute("data-testid", `layer-row-${a!.id}`)
  await expect(rows.nth(1)).toHaveAttribute("data-testid", `layer-row-${b!.id}`)

  // Clicking a's row selects it on canvas; Delete removes only a.
  await page.locator(`[data-testid="layer-select-${a!.id}"]`).click()
  await page.waitForTimeout(120)
  await page.keyboard.press("Delete")
  await expect.poll(() => sceneIds(page)).toEqual([b!.id])
})
