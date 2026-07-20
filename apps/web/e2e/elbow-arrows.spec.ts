import { expect, test, type Page } from "@playwright/test"
import { dragOnCanvas } from "./_helpers"

type SceneEl = {
  id: string
  type: string
  x: number
  y: number
  points?: { x: number; y: number }[]
  elbowed?: boolean
  startBinding?: { elementId: string } | null
  endBinding?: { elementId: string } | null
  isDeleted?: boolean
}

const readScene = async (page: Page): Promise<SceneEl[]> => {
  const json = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  const data = JSON.parse(json!) as { elements: SceneEl[] }
  return data.elements.filter((e) => !e.isDeleted)
}

const orthogonal = (pts: readonly { x: number; y: number }[]): boolean => {
  for (let i = 0; i < pts.length - 1; i += 1) {
    const a = pts[i]!
    const b = pts[i + 1]!
    if (Math.abs(a.x - b.x) > 0.01 && Math.abs(a.y - b.y) > 0.01) return false
  }
  return true
}

test("toggle to elbow routes orthogonally, re-routes on shape drag, persists", async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-rectangle"]').waitFor({ state: "visible" })

  // Rect A and rect B, then a bound arrow between them.
  await page.locator('[data-testid="toolbar-rectangle"]').click()
  await dragOnCanvas(page, { x: 100, y: 200 }, { x: 200, y: 300 })
  await page.locator('[data-testid="toolbar-rectangle"]').click()
  await dragOnCanvas(page, { x: 500, y: 300 }, { x: 600, y: 400 })
  await page.locator('[data-testid="toolbar-arrow"]').click()
  await dragOnCanvas(page, { x: 150, y: 250 }, { x: 550, y: 350 })
  await page.waitForTimeout(300)

  // Select the arrow (selection tool is active after the auto-switch):
  // click a point on the straight diagonal between the shapes.
  await dragOnCanvas(page, { x: 350, y: 300 }, { x: 350, y: 300 })
  await page.waitForTimeout(120)

  await page.locator('[data-testid="arrow-type-elbow"]').click()
  await page.waitForTimeout(900)

  let arrow = (await readScene(page)).find((e) => e.type === "arrow")!
  expect(arrow.elbowed).toBe(true)
  expect(arrow.startBinding).not.toBeNull()
  expect(arrow.endBinding).not.toBeNull()
  expect(orthogonal(arrow.points!)).toBe(true)

  // Drag rect B; the elbow re-routes and stays orthogonal + bound.
  await dragOnCanvas(page, { x: 580, y: 390 }, { x: 580, y: 480 })
  await page.waitForTimeout(900)
  arrow = (await readScene(page)).find((e) => e.type === "arrow")!
  expect(orthogonal(arrow.points!)).toBe(true)
  expect(arrow.endBinding).not.toBeNull()

  // Reload: elbowed flag and route persist.
  await page.reload()
  await page.locator('[data-testid="toolbar-rectangle"]').waitFor({ state: "visible" })
  arrow = (await readScene(page)).find((e) => e.type === "arrow")!
  expect(arrow.elbowed).toBe(true)
  expect(orthogonal(arrow.points!)).toBe(true)
})
