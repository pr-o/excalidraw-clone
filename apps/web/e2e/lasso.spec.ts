import { expect, test, type Page } from "@playwright/test"
import { dragOnCanvas, parseStoredScene } from "./_helpers"

type Pt = { x: number; y: number }

/** Fresh canvas with two 60×60 rectangles, far apart. */
const drawTwoRects = async (page: Page): Promise<void> => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-rectangle"]').waitFor({ state: "visible" })
  for (const [from, to] of [
    [
      { x: 100, y: 150 },
      { x: 160, y: 210 },
    ],
    [
      { x: 400, y: 150 },
      { x: 460, y: 210 },
    ],
  ] as const) {
    await page.locator('[data-testid="toolbar-rectangle"]').click()
    await dragOnCanvas(page, from, to)
    await page.waitForTimeout(120)
  }
}

/** Switch to the lasso (S) and drag a closed loop through `path` (canvas coords). */
const lassoLoop = async (page: Page, path: readonly Pt[]): Promise<void> => {
  await page.keyboard.press("s")
  expect(await page.locator('[data-testid="toolbar-lasso"]').getAttribute("aria-pressed")).toBe(
    "true",
  )
  const box = await page.locator("canvas").first().boundingBox()
  if (!box) throw new Error("canvas not found")
  await page.mouse.move(box.x + path[0]!.x, box.y + path[0]!.y)
  await page.mouse.down()
  for (const p of [...path.slice(1), { x: path[0]!.x + 8, y: path[0]!.y + 10 }]) {
    await page.mouse.move(box.x + p.x, box.y + p.y, { steps: 5 })
  }
  await page.mouse.up()
  await page.waitForTimeout(100)
}

/** Delete the selection, then count live elements in the persisted scene. */
const deleteAndCountLive = async (page: Page): Promise<number> => {
  await page.keyboard.press("Delete")
  await page.waitForTimeout(900)
  const json = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  return parseStoredScene<{ isDeleted?: boolean }>(json).elements.filter((e) => !e.isDeleted).length
}

const AROUND_FIRST: readonly Pt[] = [
  { x: 80, y: 130 },
  { x: 200, y: 140 },
  { x: 190, y: 240 },
  { x: 70, y: 230 },
]
const AROUND_SECOND: readonly Pt[] = AROUND_FIRST.map((p) => ({ x: p.x + 300, y: p.y }))

test("lasso selects only the enclosed shape, then returns to the selection tool", async ({
  page,
}) => {
  await drawTwoRects(page)
  await lassoLoop(page, AROUND_FIRST)
  expect(await page.locator('[data-testid="toolbar-selection"]').getAttribute("aria-pressed")).toBe(
    "true",
  )
  expect(await deleteAndCountLive(page)).toBe(1)
})

test("shift + lasso adds to the existing selection", async ({ page }) => {
  await drawTwoRects(page)
  await lassoLoop(page, AROUND_FIRST)
  await page.keyboard.down("Shift")
  await lassoLoop(page, AROUND_SECOND)
  await page.keyboard.up("Shift")
  expect(await deleteAndCountLive(page)).toBe(0)
})
