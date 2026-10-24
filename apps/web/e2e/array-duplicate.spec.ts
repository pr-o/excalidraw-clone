import { expect, test, type Page } from "@playwright/test"
import { dragOnCanvas, parseStoredScene } from "./_helpers"

type SceneEl = { id: string; type: string; x: number; y: number; isDeleted?: boolean }

const live = async (page: Page): Promise<SceneEl[]> =>
  parseStoredScene<SceneEl>(
    await page.evaluate(() => localStorage.getItem("excalidraw-scene")),
  ).elements.filter((e) => !e.isDeleted)

test.beforeEach(async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-rectangle"]').click()
  await dragOnCanvas(page, { x: 150, y: 150 }, { x: 250, y: 220 })
  await page.locator('[data-testid="toolbar-selection"]').click()
})

test("context menu array duplicate makes a 2x3 grid, undone in one step", async ({ page }) => {
  const box = await page.locator("canvas").first().boundingBox()
  if (!box) throw new Error("canvas not found")
  await page.mouse.click(box.x + 200, box.y + 185, { button: "right" })
  await page.locator('[data-testid="context-menu-item-array-duplicate"]').click()

  await page.getByTestId("array-rows").fill("2")
  await page.getByTestId("array-cols").fill("3")
  await expect(page.getByTestId("array-copies")).toHaveText("5")
  await page.getByTestId("array-duplicate-confirm").click()

  await expect.poll(async () => (await live(page)).length).toBe(6)
  const els = await live(page)
  expect(new Set(els.map((e) => e.x)).size).toBe(3)
  expect(new Set(els.map((e) => e.y)).size).toBe(2)

  await page.keyboard.press(process.platform === "darwin" ? "Meta+Z" : "Control+Z")
  await expect.poll(async () => (await live(page)).length).toBe(1)
})

test("Ctrl/Cmd+Shift+D opens the dialog; defaults add a row of 2 copies", async ({ page }) => {
  // Click the rectangle so it is selected regardless of post-draw selection behaviour.
  const box = await page.locator("canvas").first().boundingBox()
  if (!box) throw new Error("canvas not found")
  await page.mouse.click(box.x + 200, box.y + 185)
  await page.keyboard.press(process.platform === "darwin" ? "Meta+Shift+D" : "Control+Shift+D")
  await page.getByTestId("array-duplicate-confirm").click()

  await expect.poll(async () => (await live(page)).length).toBe(3)
  const els = await live(page)
  expect(new Set(els.map((e) => e.y)).size).toBe(1)
})
