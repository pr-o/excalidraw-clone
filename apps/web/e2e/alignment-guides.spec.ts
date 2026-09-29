import { expect, test, type Page } from "@playwright/test"
import { parseStoredScene } from "./_helpers"

interface SceneEl {
  id: string
  type: string
  x: number
  y: number
  width: number
  height: number
  isDeleted?: boolean
}

const readScene = async (page: Page): Promise<SceneEl[]> => {
  const json = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  return parseStoredScene<SceneEl>(json).elements.filter((e) => !e.isDeleted)
}

const freshCanvas = async (page: Page): Promise<void> => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-rectangle"]').waitFor({ state: "visible" })
}

const draw = async (
  page: Page,
  toolTestId: string,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> => {
  await page.locator(`[data-testid="${toolTestId}"]`).click()
  const canvas = page.locator("canvas").first()
  const box = await canvas.boundingBox()
  if (!box) throw new Error("canvas not found")
  await page.mouse.move(box.x + from.x, box.y + from.y)
  await page.mouse.down()
  await page.mouse.move(box.x + to.x, box.y + to.y, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(120)
}

/** A single-hop drag (no interpolation): one pointerDown, one pointerMove
 *  straight to the target, one pointerUp. Alignment-guide snapping
 *  recomputes its correction on every pointerMove, so a multi-step
 *  interpolated drag would make the exact resting position depend on the
 *  interpolation step count. A single hop keeps the arithmetic exact. */
const dragSingleStep = async (
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> => {
  const canvas = page.locator("canvas").first()
  const box = await canvas.boundingBox()
  if (!box) throw new Error("canvas not found")
  await page.mouse.move(box.x + from.x, box.y + from.y)
  await page.mouse.down()
  await page.mouse.move(box.x + to.x, box.y + to.y, { steps: 1 })
  await page.mouse.up()
  await page.waitForTimeout(900) // autosave debounce
}

const setUpTwoRectangles = async (page: Page): Promise<void> => {
  await freshCanvas(page)
  // A: x 105..205 (far edge 205, deliberately off the 20px grid lattice so a
  // grid-snapped result can never coincide with it).
  await draw(page, "toolbar-rectangle", { x: 105, y: 100 }, { x: 205, y: 200 })
  // B: x 325..425 (near edge 325, 120px from A's far edge).
  await draw(page, "toolbar-rectangle", { x: 325, y: 100 }, { x: 425, y: 200 })
  await page.locator('[data-testid="toolbar-selection"]').click()
}

test("dragging near another element's edge snaps exactly to it", async ({ page }) => {
  await setUpTwoRectangles(page)
  // Drag B so its near edge lands at 207 (2px from A's far edge, inside the 8px threshold).
  await dragSingleStep(page, { x: 335, y: 110 }, { x: 217, y: 110 })

  const rects = (await readScene(page))
    .filter((e) => e.type === "rectangle")
    .sort((a, b) => a.x - b.x)
  expect(rects).toHaveLength(2)
  expect(rects[1]!.x).toBeCloseTo(205, 5)
})

test("enabling the grid suppresses the alignment snap for the same drag", async ({ page }) => {
  await setUpTwoRectangles(page)
  await page.keyboard.press("Control+Quote") // toggle grid on (size 20)
  await dragSingleStep(page, { x: 335, y: 110 }, { x: 217, y: 110 })

  const rects = (await readScene(page))
    .filter((e) => e.type === "rectangle")
    .sort((a, b) => a.x - b.x)
  expect(rects).toHaveLength(2)
  // Grid governs instead: always lands on a 20px multiple, never on 205
  // (which is not itself a multiple of 20).
  expect(rects[1]!.x % 20).toBe(0)
  expect(rects[1]!.x).not.toBeCloseTo(205, 5)
})

test("holding Ctrl during the drag bypasses the alignment snap", async ({ page }) => {
  await setUpTwoRectangles(page)
  await page.keyboard.down("Control")
  await dragSingleStep(page, { x: 335, y: 110 }, { x: 217, y: 110 })
  await page.keyboard.up("Control")

  const rects = (await readScene(page))
    .filter((e) => e.type === "rectangle")
    .sort((a, b) => a.x - b.x)
  expect(rects).toHaveLength(2)
  // Pure pointer delta (325 - 118 = 207), no snap correction to 205.
  expect(rects[1]!.x).toBeCloseTo(207, 5)
})
