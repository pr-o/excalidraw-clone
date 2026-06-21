import { expect, test } from "@playwright/test"
import { dragOnCanvas } from "./_helpers"

test("draw a sticky note, type into it — container + text persist", async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => {
    localStorage.clear()
  })
  await page.reload()
  await page.locator('[data-testid="toolbar-note"]').waitFor({ state: "visible" })

  await page.locator('[data-testid="toolbar-note"]').click()
  await dragOnCanvas(page, { x: 200, y: 200 }, { x: 320, y: 300 })

  // pointerUp on the note opens the bound-text editor (TextEditingOverlay).
  const editor = page.locator("textarea")
  await expect(editor).toBeVisible()
  await editor.fill("hello")
  await editor.blur()
  await page.waitForTimeout(700)

  const sceneJson = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  expect(sceneJson).toBeTruthy()
  const data = JSON.parse(sceneJson!) as {
    elements: { type: string; text?: string; isDeleted?: boolean }[]
  }
  const live = data.elements.filter((e) => !e.isDeleted)
  const container = live.find((e) => e.type === "rectangle")
  const text = live.find((e) => e.type === "text")
  expect(container).toBeDefined()
  expect(text).toBeDefined()
  expect(text?.text).toBe("hello")
})

test("toggling stroke style to dashed updates the selected shape", async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => {
    localStorage.clear()
  })
  await page.reload()
  await page.locator('[data-testid="toolbar-rectangle"]').waitFor({ state: "visible" })

  await page.locator('[data-testid="toolbar-rectangle"]').click()
  await dragOnCanvas(page, { x: 150, y: 150 }, { x: 260, y: 240 })

  // Shape auto-selects after draw; the properties panel exposes the style rows.
  await page.locator('[data-testid="stroke-style-dashed"]').click()

  // The panel reflects the live edit immediately (no re-selection needed).
  await expect(page.locator('[data-testid="stroke-style-dashed"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  )

  // ...and the edit lands in the scene and persists.
  await page.waitForTimeout(700)
  const sceneJson = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  const data = JSON.parse(sceneJson!) as { elements: { type: string; strokeStyle?: string }[] }
  const rect = data.elements.find((e) => e.type === "rectangle")
  expect(rect?.strokeStyle).toBe("dashed")
})
