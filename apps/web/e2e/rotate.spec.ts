import { expect, test, type Page } from "@playwright/test"
import { dragOnCanvas, parseStoredScene } from "./_helpers"

/** Draws a rectangle spanning canvas (200,200)-(320,300) and selects it. */
async function drawAndSelectRect(page: Page): Promise<void> {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-rectangle"]').waitFor({ state: "visible" })
  await page.locator('[data-testid="toolbar-rectangle"]').click()
  await dragOnCanvas(page, { x: 200, y: 200 }, { x: 320, y: 300 })
  await page.waitForTimeout(500)
  await page.locator('[data-testid="toolbar-selection"]').click()
  const box = await page.locator("canvas").first().boundingBox()
  if (!box) throw new Error("canvas not found")
  await page.mouse.click(box.x + 260, box.y + 250)
  await page.waitForTimeout(150)
}

async function readAngle(page: Page): Promise<number> {
  const json = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  const { elements } = parseStoredScene<{ type: string; angle: number }>(json)
  return elements.find((e) => e.type === "rectangle")?.angle ?? Number.NaN
}

test("dragging the rotation handle rotates the selected element ~90°", async ({ page }) => {
  await drawAndSelectRect(page)
  expect(await readAngle(page)).toBe(0)

  // Handle sits ~20px above the top-edge midpoint (260,200) → (260,180).
  // Center is (260,250); dragging the handle to (360,250) sweeps it from
  // straight-up (−π/2) to straight-right (0), i.e. +90° clockwise.
  await dragOnCanvas(page, { x: 260, y: 180 }, { x: 360, y: 250 })
  await page.waitForTimeout(500)

  const angle = await readAngle(page)
  expect(Number.isNaN(angle)).toBe(false)
  expect(Math.abs(angle - Math.PI / 2)).toBeLessThan(0.15)
})

test("Shift while rotating snaps the angle to 15° steps", async ({ page }) => {
  await drawAndSelectRect(page)

  // A tiny 3px horizontal nudge of the handle is well under 15°; with Shift
  // held it must snap back to exactly 0 rather than a sub-degree value.
  const box = await page.locator("canvas").first().boundingBox()
  if (!box) throw new Error("canvas not found")
  await page.keyboard.down("Shift")
  await page.mouse.move(box.x + 260, box.y + 180)
  await page.mouse.down()
  await page.mouse.move(box.x + 263, box.y + 180, { steps: 4 })
  await page.mouse.up()
  await page.keyboard.up("Shift")
  await page.waitForTimeout(500)

  expect(await readAngle(page)).toBe(0)
})
