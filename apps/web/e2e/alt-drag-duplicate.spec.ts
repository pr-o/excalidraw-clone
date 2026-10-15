import { expect, test, type Page } from "@playwright/test"
import { dragOnCanvas, parseStoredScene } from "./_helpers"

type SceneEl = { id: string; type: string; x: number; y: number; isDeleted?: boolean }

const rects = async (page: Page): Promise<SceneEl[]> => {
  await page.waitForTimeout(700)
  const json = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  return parseStoredScene<SceneEl>(json).elements.filter(
    (e) => e.type === "rectangle" && !e.isDeleted,
  )
}

test("Alt-drag leaves the original and drags a copy; one undo removes the copy", async ({
  page,
}) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-rectangle"]').click()
  await dragOnCanvas(page, { x: 200, y: 200 }, { x: 300, y: 280 })
  await page.locator('[data-testid="toolbar-selection"]').click()
  await page.waitForTimeout(150)
  const [orig] = await rects(page)

  await page.keyboard.down("Alt")
  await dragOnCanvas(page, { x: 250, y: 240 }, { x: 450, y: 440 })
  await page.keyboard.up("Alt")

  const after = await rects(page)
  expect(after).toHaveLength(2)
  const original = after.find((r) => r.id === orig!.id)!
  const copy = after.find((r) => r.id !== orig!.id)!
  expect(original.x).toBeCloseTo(orig!.x, 0)
  expect(copy.x - original.x).toBeCloseTo(200, 0)
  expect(copy.y - original.y).toBeCloseTo(200, 0)

  await page.keyboard.press("ControlOrMeta+z")
  const undone = await rects(page)
  expect(undone).toHaveLength(1)
  expect(undone[0]!.id).toBe(orig!.id)
})
