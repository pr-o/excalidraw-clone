import { expect, test, type Page } from "@playwright/test"
import { dragOnCanvas, parseStoredScene } from "./_helpers"

type SceneEl = {
  id: string
  type: string
  x: number
  y: number
  width: number
  endBinding?: { elementId: string } | null
  isDeleted?: boolean
}

const readScene = async (page: Page): Promise<SceneEl[]> => {
  const json = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  const data = parseStoredScene<SceneEl>(json)
  return data.elements.filter((e) => !e.isDeleted)
}

const freshCanvas = async (page: Page): Promise<void> => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-triangle"]').waitFor({ state: "visible" })
}

test("draws triangle, parallelogram, and hexagon", async ({ page }) => {
  await freshCanvas(page)

  const draw = async (
    tool: string,
    from: { x: number; y: number },
    to: { x: number; y: number },
  ) => {
    await page.locator(`[data-testid="toolbar-${tool}"]`).click()
    await dragOnCanvas(page, from, to)
    await page.waitForTimeout(120)
  }
  await draw("triangle", { x: 60, y: 60 }, { x: 140, y: 120 })
  await draw("parallelogram", { x: 180, y: 60 }, { x: 280, y: 120 })
  await draw("hexagon", { x: 320, y: 60 }, { x: 420, y: 120 })

  await page.waitForTimeout(900)
  const types = (await readScene(page)).map((e) => e.type).sort()
  expect(types).toEqual(["hexagon", "parallelogram", "triangle"])
})

test("arrow binds to a hexagon", async ({ page }) => {
  await freshCanvas(page)

  await page.locator('[data-testid="toolbar-hexagon"]').click()
  await dragOnCanvas(page, { x: 300, y: 100 }, { x: 400, y: 160 })
  await page.waitForTimeout(120)

  // Draw an arrow from empty space into the hexagon's center.
  await page.locator('[data-testid="toolbar-arrow"]').click()
  await dragOnCanvas(page, { x: 120, y: 130 }, { x: 350, y: 130 })
  await page.waitForTimeout(900)

  const els = await readScene(page)
  const hex = els.find((e) => e.type === "hexagon")
  const arrow = els.find((e) => e.type === "arrow")
  expect(hex).toBeDefined()
  expect(arrow?.endBinding?.elementId).toBe(hex!.id)
  // bound endpoint retracts to the hexagon's left point (x=300) plus the
  // binding gap — it must not reach into the shape's interior
  expect(arrow!.x + arrow!.width).toBeLessThanOrEqual(305)
})

test("Ctrl+ArrowRight chains a connected rectangle and selects it", async ({ page }) => {
  await freshCanvas(page)

  await page.locator('[data-testid="toolbar-rectangle"]').click()
  await dragOnCanvas(page, { x: 100, y: 100 }, { x: 200, y: 160 })
  await page.waitForTimeout(120)
  // The rectangle tool leaves the new shape selected.
  await page.keyboard.press("Control+ArrowRight")
  await page.waitForTimeout(900)

  const els = await readScene(page)
  const rects = els.filter((e) => e.type === "rectangle")
  const arrows = els.filter((e) => e.type === "arrow")
  expect(rects).toHaveLength(2)
  expect(arrows).toHaveLength(1)
  const [first, second] = [...rects].sort((a, b) => a.x - b.x)
  expect(second!.x).toBeCloseTo(first!.x + first!.width + 80, 0)
  expect(second!.y).toBeCloseTo(first!.y, 0)
  expect(arrows[0]!.endBinding?.elementId).toBe(second!.id)

  // The new rectangle is selected: a second press chains again from it.
  await page.keyboard.press("Control+ArrowRight")
  await page.waitForTimeout(900)
  const after = await readScene(page)
  const third = after.filter((e) => e.type === "rectangle").sort((a, b) => a.x - b.x)[2]
  expect(third!.x).toBeCloseTo(second!.x + second!.width + 80, 0)
  expect(after.filter((e) => e.type === "arrow")).toHaveLength(2)
})
