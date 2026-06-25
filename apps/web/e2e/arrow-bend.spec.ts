import { expect, test, type Page } from "@playwright/test"
import { dragOnCanvas } from "./_helpers"

type SceneEl = {
  id: string
  type: string
  x: number
  y: number
  points?: { x: number; y: number }[]
  isDeleted?: boolean
}

const readScene = async (page: Page): Promise<SceneEl[]> => {
  const json = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  const data = JSON.parse(json!) as { elements: SceneEl[] }
  return data.elements.filter((e) => !e.isDeleted)
}

const arrowOf = (els: SceneEl[]): SceneEl => els.find((e) => e.type === "arrow")!
const pointAbs = (a: SceneEl, i: number): { x: number; y: number } => {
  const p = a.points![i]!
  return { x: a.x + p.x, y: a.y + p.y }
}
const interiorAbs = (a: SceneEl): { x: number; y: number } => pointAbs(a, 1)

test("add a bend point, then bend survives moving a bound target", async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-rectangle"]').waitFor({ state: "visible" })

  // Rectangle on the right (target).
  await page.locator('[data-testid="toolbar-rectangle"]').click()
  await dragOnCanvas(page, { x: 500, y: 200 }, { x: 600, y: 300 })

  // Horizontal arrow on the left; end already inside the rectangle so it binds.
  await page.locator('[data-testid="toolbar-arrow"]').click()
  await dragOnCanvas(page, { x: 150, y: 250 }, { x: 550, y: 250 })
  await page.waitForTimeout(700)

  // The end is bound, so it reflowed to the rect's left edge. Compute the real
  // segment midpoint from the actual arrow endpoints before grabbing it.
  const drawn = arrowOf(await readScene(page))
  const startAbs = pointAbs(drawn, 0)
  const endAbs = pointAbs(drawn, drawn.points!.length - 1)
  const mid = { x: (startAbs.x + endAbs.x) / 2, y: (startAbs.y + endAbs.y) / 2 }

  // Select the arrow (click its body near the start, away from any endpoint).
  await page.locator('[data-testid="toolbar-selection"]').click()
  await dragOnCanvas(
    page,
    { x: startAbs.x + 40, y: startAbs.y },
    { x: startAbs.x + 40, y: startAbs.y },
  )

  // Drag the segment midpoint downward to add a bend.
  await dragOnCanvas(page, mid, { x: mid.x, y: mid.y + 150 })
  await page.waitForTimeout(700)

  const before = await readScene(page)
  const arrowBefore = arrowOf(before)
  expect(arrowBefore.points!.length).toBe(3)
  const bendBefore = interiorAbs(arrowBefore)

  // Move the rectangle; the bound end follows, the interior bend stays put.
  await dragOnCanvas(page, { x: 580, y: 290 }, { x: 780, y: 290 })
  await page.waitForTimeout(700)

  const after = await readScene(page)
  const arrowAfter = arrowOf(after)
  expect(arrowAfter.points!.length).toBe(3)
  const bendAfter = interiorAbs(arrowAfter)
  // interior bend unchanged (within 1px)
  expect(Math.abs(bendAfter.x - bendBefore.x)).toBeLessThan(1)
  expect(Math.abs(bendAfter.y - bendBefore.y)).toBeLessThan(1)
})
