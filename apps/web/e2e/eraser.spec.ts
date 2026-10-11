import { expect, test, type Page } from "@playwright/test"
import { dragOnCanvas, parseStoredScene } from "./_helpers"

const liveCount = async (page: Page): Promise<number> => {
  await page.waitForTimeout(900) // autosave debounce
  const json = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  return parseStoredScene<{ isDeleted?: boolean }>(json).elements.filter((e) => !e.isDeleted).length
}

/** Fresh canvas, two rects 140px apart, eraser active. Returns the canvas origin. */
const setup = async (page: Page): Promise<{ x: number; y: number }> => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-rectangle"]').waitFor({ state: "visible" })
  for (const x of [100, 300]) {
    await page.locator('[data-testid="toolbar-rectangle"]').click()
    await dragOnCanvas(page, { x, y: 150 }, { x: x + 60, y: 210 })
    await page.waitForTimeout(120)
  }
  await page.keyboard.press("e")
  expect(await page.locator('[data-testid="toolbar-eraser"]').getAttribute("aria-pressed")).toBe(
    "true",
  )
  const box = await page.locator("canvas").first().boundingBox()
  if (!box) throw new Error("canvas not found")
  return box
}

test("a fast drag erases every shape it crosses; one undo brings them all back", async ({
  page,
}) => {
  const box = await setup(page)
  await page.mouse.move(box.x + 80, box.y + 180)
  await page.mouse.down()
  // Two big jumps (80 → 240 → 400): the middle sample lands between the rects,
  // so only path interpolation can catch both.
  await page.mouse.move(box.x + 400, box.y + 180, { steps: 2 })
  await page.mouse.up()
  expect(await liveCount(page)).toBe(0)

  await page.keyboard.press(process.platform === "darwin" ? "Meta+Z" : "Control+Z")
  expect(await liveCount(page)).toBe(2)
})

test("Escape mid-erase restores everything erased so far", async ({ page }) => {
  const box = await setup(page)
  await page.mouse.move(box.x + 80, box.y + 180)
  await page.mouse.down()
  await page.mouse.move(box.x + 400, box.y + 180, { steps: 8 })
  expect(await liveCount(page)).toBe(0)
  await page.keyboard.press("Escape")
  await page.mouse.up()
  expect(await liveCount(page)).toBe(2)
})
