import { expect, test } from "@playwright/test"
import { dragOnCanvas } from "./_helpers"

test("rectangle drawn with grid enabled lands on grid multiples", async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => {
    localStorage.clear()
  })
  await page.reload()
  await page.locator('[data-testid="toolbar-rectangle"]').waitFor({ state: "visible" })

  // Enable grid via Cmd/Ctrl+'. Playwright uses Control on all OS; the app accepts both.
  await page.keyboard.press("Control+Quote")

  await page.locator('[data-testid="toolbar-rectangle"]').click()

  // Drag from off-grid (123, 87) to off-grid (251, 213). With size=20, the snap
  // produces (120, 80) → (260, 220): origin 120/80, width 140, height 140 — all on grid.
  await dragOnCanvas(page, { x: 123, y: 87 }, { x: 251, y: 213 })
  await page.waitForTimeout(700)

  const sceneJson = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  expect(sceneJson).toBeTruthy()
  const data = JSON.parse(sceneJson!) as {
    elements: { type: string; x: number; y: number; width: number; height: number }[]
  }
  const rect = data.elements.find((e) => e.type === "rectangle")
  expect(rect).toBeDefined()
  if (!rect) return
  expect(rect.x % 20).toBe(0)
  expect(rect.y % 20).toBe(0)
  expect(rect.width % 20).toBe(0)
  expect(rect.height % 20).toBe(0)
})
