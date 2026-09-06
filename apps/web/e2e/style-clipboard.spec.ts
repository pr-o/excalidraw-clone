import { expect, test } from "@playwright/test"
import { dragOnCanvas, parseStoredScene } from "./_helpers"

test("Ctrl+Alt+C / Ctrl+Alt+V copies a shape's style onto another shape", async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-rectangle"]').waitFor({ state: "visible" })

  const draw = async (from: { x: number; y: number }, to: { x: number; y: number }) => {
    await page.locator('[data-testid="toolbar-rectangle"]').click()
    await dragOnCanvas(page, from, to)
    await page.waitForTimeout(120)
  }

  // A at (100,100)-(200,180) gets a dashed stroke; B at (280,100)-(380,180) stays solid.
  await draw({ x: 100, y: 100 }, { x: 200, y: 180 })
  await page.locator('[data-testid="stroke-style-dashed"]').click()
  await draw({ x: 280, y: 100 }, { x: 380, y: 180 })
  await expect(page.locator('[data-testid="stroke-style-dashed"]')).toHaveAttribute(
    "aria-pressed",
    "false",
  )

  // Select A and copy its style.
  await page.locator('[data-testid="toolbar-selection"]').click()
  await page
    .locator("canvas")
    .first()
    .click({ position: { x: 150, y: 140 } })
  await page.waitForTimeout(120)
  await expect(page.locator('[data-testid="stroke-style-dashed"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  )
  await page.keyboard.press("Control+Alt+KeyC")

  // Select B and paste the style onto it.
  await page
    .locator("canvas")
    .first()
    .click({ position: { x: 330, y: 140 } })
  await page.waitForTimeout(120)
  await page.keyboard.press("Control+Alt+KeyV")

  // The panel reflects the pasted style, and it lands in the persisted scene.
  await expect(page.locator('[data-testid="stroke-style-dashed"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  )
  await page.waitForTimeout(900)
  const sceneJson = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  const data = parseStoredScene<{ type: string; strokeStyle?: string; isDeleted?: boolean }>(
    sceneJson,
  )
  const rects = data.elements.filter((e) => e.type === "rectangle" && !e.isDeleted)
  expect(rects.length).toBe(2)
  expect(rects.every((r) => r.strokeStyle === "dashed")).toBe(true)
})
