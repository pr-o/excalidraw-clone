import { expect, test, type Page } from "@playwright/test"
import { readFileSync } from "node:fs"
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

test("a shape's label rotates with it: stored, exported to SVG and edited at that angle", async ({
  page,
}) => {
  await drawAndSelectRect(page)
  await page.mouse.dblclick(260, 250)
  await page.keyboard.type("Turn")
  await page.locator("textarea").blur()
  await page.mouse.click(260, 250)
  // Shift-drag the handle a quarter turn so the angle is exactly π/2.
  await page.keyboard.down("Shift")
  await dragOnCanvas(page, { x: 260, y: 180 }, { x: 360, y: 250 })
  await page.keyboard.up("Shift")
  await page.waitForTimeout(600)

  type El = { type: string; x: number; y: number; width: number; height: number; angle: number }
  const els = parseStoredScene<El>(
    await page.evaluate(() => localStorage.getItem("excalidraw-scene")),
  ).elements
  const rect = els.find((e) => e.type === "rectangle")!
  const label = els.find((e) => e.type === "text")!
  expect(rect.angle).toBeCloseTo(Math.PI / 2, 5)
  expect(label.angle).toBeCloseTo(Math.PI / 2, 5)
  expect(label.x + label.width / 2).toBeCloseTo(rect.x + rect.width / 2, 5)
  expect(label.y + label.height / 2).toBeCloseTo(rect.y + rect.height / 2, 5)

  await page.getByRole("button", { name: /menu/i }).click()
  await page.getByText("Export image…").click()
  await page.locator('[data-testid="format-svg"]').click()
  const download = page.waitForEvent("download")
  await page.getByRole("button", { name: "Export", exact: true }).click()
  const svg = readFileSync(await (await download).path(), "utf8")
  // Both the rectangle and its label carry the quarter-turn.
  expect(svg.match(/rotate\(90 /g)?.length ?? 0).toBeGreaterThanOrEqual(2)

  await page.mouse.dblclick(260, 250)
  const wrapper = page.locator("textarea").locator("..")
  await expect(wrapper).toHaveCSS("transform", /^matrix\([-\d.e]+, 1, -1, /)
})
