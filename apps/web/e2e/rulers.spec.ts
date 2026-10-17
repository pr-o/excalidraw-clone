import { expect, test, type Page } from "@playwright/test"
import { parseStoredScene } from "./_helpers"

interface Rect {
  type: string
  y: number
  height: number
  isDeleted?: boolean
}

const storedGuides = async (page: Page): Promise<{ x: number[]; y: number[] } | undefined> =>
  page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem("excalidraw-scene") ?? "null") as {
      pages: { id: string; guides?: { x: number[]; y: number[] } }[]
      activePageId: string
    }
    return data.pages.find((p) => p.id === data.activePageId)?.guides
  })

const canvasBox = async (page: Page) => {
  const box = await page.locator("canvas").first().boundingBox()
  if (!box) throw new Error("canvas not found")
  return box
}

test("rulers: create a guide from the top ruler, snap to it, persist, delete", async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-rectangle"]').waitFor({ state: "visible" })

  await expect(page.getByTestId("ruler-top")).toHaveCount(0)
  await page.keyboard.press("Shift+R")
  await expect(page.getByTestId("ruler-top")).toBeVisible()
  await expect(page.getByTestId("ruler-left")).toBeVisible()

  const box = await canvasBox(page)
  // Drag out of the top ruler (left of the toolbar) to viewport y = 300.
  await page.mouse.move(box.x + 150, box.y + 10)
  await page.mouse.down()
  await page.mouse.move(box.x + 150, box.y + 300, { steps: 6 })
  await page.mouse.up()
  await page.waitForTimeout(900)
  expect(await storedGuides(page)).toEqual({ x: [], y: [300] })

  // Draw a rectangle, then drag it so its bottom edge lands 3px above the guide.
  await page.getByTestId("toolbar-rectangle").click()
  await page.mouse.move(box.x + 400, box.y + 100)
  await page.mouse.down()
  await page.mouse.move(box.x + 500, box.y + 200, { steps: 8 })
  await page.mouse.up()
  await page.getByTestId("toolbar-selection").click()
  await page.mouse.move(box.x + 450, box.y + 150)
  await page.mouse.down()
  await page.mouse.move(box.x + 450, box.y + 247, { steps: 1 })
  await page.mouse.up()
  await page.waitForTimeout(900)
  const json = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  const rect = parseStoredScene<Rect>(json).elements.find(
    (e) => e.type === "rectangle" && !e.isDeleted,
  )!
  expect(rect.y + rect.height).toBeCloseTo(300, 5)

  // Guides and ruler visibility survive a reload.
  await page.reload()
  await expect(page.getByTestId("ruler-top")).toBeVisible()
  expect(await storedGuides(page)).toEqual({ x: [], y: [300] })

  // Drag the guide (away from the rectangle) back onto the top ruler to delete it.
  const box2 = await canvasBox(page)
  await page.getByTestId("toolbar-selection").click()
  await page.mouse.move(box2.x + 800, box2.y + 300)
  await page.mouse.down()
  await page.mouse.move(box2.x + 800, box2.y + 8, { steps: 6 })
  await page.mouse.up()
  await page.waitForTimeout(900)
  expect(await storedGuides(page)).toBeUndefined()
  // The rectangle was not moved by the guide drag.
  const after = parseStoredScene<Rect>(
    await page.evaluate(() => localStorage.getItem("excalidraw-scene")),
  ).elements.find((e) => e.type === "rectangle" && !e.isDeleted)!
  expect(after.y).toBeCloseTo(rect.y, 5)
})

test("rulers: palette command and menu entry toggle rulers", async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByRole("button", { name: "Menu" }).click()
  await page.getByTestId("menu-rulers").click()
  await expect(page.getByTestId("ruler-left")).toBeVisible()
  await page.keyboard.press("Control+/")
  await page.keyboard.type("Rulers")
  await page.keyboard.press("Enter")
  await expect(page.getByTestId("ruler-left")).toHaveCount(0)
})
