import { expect, test, type Page } from "@playwright/test"
import { dragOnCanvas } from "./_helpers"

type SceneEl = {
  id: string
  type: string
  x: number
  y: number
  groupIds?: string[]
  isDeleted?: boolean
}

const readScene = async (page: Page): Promise<SceneEl[]> => {
  const json = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  const data = JSON.parse(json!) as { elements: SceneEl[] }
  return data.elements.filter((e) => !e.isDeleted)
}

test("grouped rectangles drag together; ungrouped drag independently", async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-rectangle"]').waitFor({ state: "visible" })

  // Two rectangles: A at (100,100)-(160,160), B at (220,100)-(280,160).
  const draw = async (from: { x: number; y: number }, to: { x: number; y: number }) => {
    await page.locator('[data-testid="toolbar-rectangle"]').click()
    await dragOnCanvas(page, from, to)
    await page.waitForTimeout(120)
  }
  await draw({ x: 100, y: 100 }, { x: 160, y: 160 })
  await draw({ x: 220, y: 100 }, { x: 280, y: 160 })

  // Marquee-select both and group.
  await page.locator('[data-testid="toolbar-selection"]').click()
  await dragOnCanvas(page, { x: 80, y: 80 }, { x: 300, y: 180 })
  await page.waitForTimeout(150)
  await page.keyboard.press("Control+KeyG")
  await page.keyboard.press("Escape")

  // Drag A by (+40,+60): the whole group must move.
  await dragOnCanvas(page, { x: 130, y: 130 }, { x: 170, y: 190 })
  await page.waitForTimeout(900)
  let rects = (await readScene(page)).filter((e) => e.type === "rectangle")
  expect(rects.length).toBe(2)
  rects.sort((p, q) => p.x - q.x)
  expect(Math.abs(rects[0]!.x - 140)).toBeLessThan(1)
  expect(Math.abs(rects[1]!.x - 260)).toBeLessThan(1)
  expect(rects.every((r) => (r.groupIds ?? []).length === 1)).toBe(true)

  // Select the group via one member (zero-length drag = click), ungroup, deselect.
  await dragOnCanvas(page, { x: 170, y: 190 }, { x: 170, y: 190 }) // click A center
  await page.waitForTimeout(120)
  await page.keyboard.press("Control+Shift+KeyG")
  await page.keyboard.press("Escape")

  // Drag A by (+0,+50): only A moves now.
  await dragOnCanvas(page, { x: 170, y: 190 }, { x: 170, y: 240 })
  await page.waitForTimeout(900)
  rects = (await readScene(page)).filter((e) => e.type === "rectangle")
  rects.sort((p, q) => p.x - q.x)
  expect(Math.abs(rects[0]!.y - 210)).toBeLessThan(1)
  expect(Math.abs(rects[1]!.y - 160)).toBeLessThan(1)
  expect(rects.every((r) => (r.groupIds ?? []).length === 0)).toBe(true)
})
