import { expect, test } from "@playwright/test"
import { dragOnCanvas, parseStoredScene } from "./_helpers"

test("the Cartoonist sloppiness button sets roughness = 2 on the selected shape", async ({
  page,
}) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-rectangle"]').waitFor({ state: "visible" })

  await page.locator('[data-testid="toolbar-rectangle"]').click()
  await dragOnCanvas(page, { x: 120, y: 120 }, { x: 260, y: 220 })
  await page.waitForTimeout(120)

  await page.locator('[data-testid="toolbar-selection"]').click()
  await page
    .locator("canvas")
    .first()
    .click({ position: { x: 190, y: 170 } })
  await page.waitForTimeout(120)

  // default is Artist (roughness 1)
  await expect(page.locator('[data-testid="roughness-1"]')).toHaveAttribute("aria-pressed", "true")

  await page.locator('[data-testid="roughness-2"]').click()
  await expect(page.locator('[data-testid="roughness-2"]')).toHaveAttribute("aria-pressed", "true")

  await page.waitForTimeout(900)
  const sceneJson = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  const data = parseStoredScene<{ type: string; roughness?: number; isDeleted?: boolean }>(
    sceneJson,
  )
  const rects = data.elements.filter((e) => e.type === "rectangle" && !e.isDeleted)
  expect(rects.length).toBe(1)
  expect(rects[0]?.roughness).toBe(2)
})
