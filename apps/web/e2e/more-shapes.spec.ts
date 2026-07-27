import { expect, test, type Page } from "@playwright/test"
import { dragOnCanvas } from "./_helpers"

type SceneEl = {
  id: string
  type: string
  x: number
  y: number
  width: number
  height: number
  text?: string
  containerId?: string | null
  isDeleted?: boolean
}

const readScene = async (page: Page): Promise<SceneEl[]> => {
  const json = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  const data = JSON.parse(json!) as { elements: SceneEl[] }
  return data.elements.filter((e) => !e.isDeleted)
}

const freshCanvas = async (page: Page): Promise<void> => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-more-shapes"]').waitFor({ state: "visible" })
}

const dblClickCanvas = async (page: Page, at: { x: number; y: number }): Promise<void> => {
  const canvas = page.locator("canvas").first()
  const box = await canvas.boundingBox()
  if (!box) throw new Error("canvas not found")
  await page.mouse.dblclick(box.x + at.x, box.y + at.y)
}

const drawViaFlyout = async (
  page: Page,
  shape: "pentagon" | "octagon",
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> => {
  await page.locator('[data-testid="toolbar-more-shapes"]').click()
  await page.locator(`[data-testid="toolbar-${shape}"]`).click()
  await dragOnCanvas(page, from, to)
  await page.waitForTimeout(120)
}

test("opens the flyout, draws pentagon and octagon, and closes automatically after selection", async ({
  page,
}) => {
  await freshCanvas(page)

  // flyout starts closed: pentagon/octagon testids are not in the DOM
  await expect(page.locator('[data-testid="toolbar-pentagon"]')).toHaveCount(0)

  await page.locator('[data-testid="toolbar-more-shapes"]').click()
  await expect(page.locator('[data-testid="toolbar-pentagon"]')).toBeVisible()
  await expect(page.locator('[data-testid="toolbar-octagon"]')).toBeVisible()

  await page.locator('[data-testid="toolbar-pentagon"]').click()
  // selecting a shape closes the popout
  await expect(page.locator('[data-testid="toolbar-octagon"]')).toHaveCount(0)
  await dragOnCanvas(page, { x: 60, y: 60 }, { x: 160, y: 140 })
  await page.waitForTimeout(120)

  await drawViaFlyout(page, "octagon", { x: 220, y: 60 }, { x: 340, y: 160 })

  await page.waitForTimeout(900)
  const els = await readScene(page)
  const types = els.map((e) => e.type).sort()
  expect(types).toEqual(["octagon", "pentagon"])

  const pentagon = els.find((e) => e.type === "pentagon")!
  expect(pentagon.width).toBeCloseTo(100, 0)
  expect(pentagon.height).toBeCloseTo(80, 0)

  const octagon = els.find((e) => e.type === "octagon")!
  expect(octagon.width).toBeCloseTo(120, 0)
  expect(octagon.height).toBeCloseTo(100, 0)
})

test("keyboard shortcuts 5 and 8 select pentagon/octagon directly without opening the flyout", async ({
  page,
}) => {
  await freshCanvas(page)

  await page.keyboard.press("5")
  await expect(page.locator('[data-testid="toolbar-pentagon"]')).toHaveCount(0)
  await dragOnCanvas(page, { x: 60, y: 60 }, { x: 160, y: 140 })
  await page.waitForTimeout(120)

  await page.keyboard.press("8")
  await expect(page.locator('[data-testid="toolbar-octagon"]')).toHaveCount(0)
  await dragOnCanvas(page, { x: 220, y: 60 }, { x: 340, y: 160 })

  await page.waitForTimeout(900)
  const types = (await readScene(page)).map((e) => e.type).sort()
  expect(types).toEqual(["octagon", "pentagon"])
})

test("Escape closes the open flyout", async ({ page }) => {
  await freshCanvas(page)

  await page.locator('[data-testid="toolbar-more-shapes"]').click()
  await expect(page.locator('[data-testid="toolbar-pentagon"]')).toBeVisible()

  await page.keyboard.press("Escape")
  await expect(page.locator('[data-testid="toolbar-pentagon"]')).toHaveCount(0)
})

test("double-click a pentagon and an octagon each add a label", async ({ page }) => {
  await freshCanvas(page)

  await drawViaFlyout(page, "pentagon", { x: 100, y: 100 }, { x: 220, y: 180 })
  await page.locator('[data-testid="toolbar-selection"]').click()
  await dblClickCanvas(page, { x: 160, y: 140 })
  let textarea = page.locator("textarea")
  await textarea.waitFor({ state: "visible" })
  await textarea.fill("Pentagon label")
  await page.mouse.click(500, 400)
  await page.waitForTimeout(900)

  let els = await readScene(page)
  const pentagon = els.find((e) => e.type === "pentagon")!
  let label = els.find((e) => e.type === "text" && e.containerId === pentagon.id)!
  expect(label.text).toBe("Pentagon label")

  await drawViaFlyout(page, "octagon", { x: 300, y: 100 }, { x: 420, y: 180 })
  await page.locator('[data-testid="toolbar-selection"]').click()
  await dblClickCanvas(page, { x: 360, y: 140 })
  textarea = page.locator("textarea")
  await textarea.waitFor({ state: "visible" })
  await textarea.fill("Octagon label")
  await page.mouse.click(500, 450)
  await page.waitForTimeout(900)

  els = await readScene(page)
  const octagon = els.find((e) => e.type === "octagon")!
  label = els.find((e) => e.type === "text" && e.containerId === octagon.id)!
  expect(label.text).toBe("Octagon label")
})
