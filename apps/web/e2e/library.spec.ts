import { expect, test, type Page } from "@playwright/test"
import { dragOnCanvas } from "./_helpers"

async function resetStorage(page: Page): Promise<void> {
  await page.goto("/")
  await page.evaluate(async () => {
    localStorage.clear()
    const dbs = (await indexedDB.databases?.()) ?? []
    await Promise.all(
      dbs.map(
        (info) =>
          new Promise<void>((resolve) => {
            if (!info.name) {
              resolve()
              return
            }
            const req = indexedDB.deleteDatabase(info.name)
            req.onsuccess = () => resolve()
            req.onerror = () => resolve()
            req.onblocked = () => resolve()
          }),
      ),
    )
  })
  await page.reload()
}

async function drawAndSelectRect(page: Page): Promise<void> {
  await page.locator('[data-testid="toolbar-rectangle"]').click()
  await dragOnCanvas(page, { x: 100, y: 100 }, { x: 220, y: 200 })
  await page.waitForTimeout(150)
  await page.locator('[data-testid="toolbar-selection"]').click()
  const canvas = page.locator("canvas").first()
  const box = await canvas.boundingBox()
  if (!box) throw new Error("canvas not found")
  await page.mouse.click(box.x + 160, box.y + 150)
  await page.waitForTimeout(100)
}

test("add selection to library and place it on the canvas", async ({ page }) => {
  await resetStorage(page)
  await drawAndSelectRect(page)

  await page.locator('[data-testid="library-toggle"]').click()
  await page.locator('[data-testid="library-add"]').click()
  const item = page.locator('[data-testid^="library-item-"]').first()
  await expect(item).toBeVisible()

  await item.locator("button").first().click()
  const canvas = page.locator("canvas").first()
  const box = await canvas.boundingBox()
  if (!box) throw new Error("canvas not found")
  await page.mouse.move(box.x + 400, box.y + 400)
  await page.mouse.click(box.x + 400, box.y + 400)
  await page.waitForTimeout(800)

  const sceneJson = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  expect(sceneJson).toBeTruthy()
  const data = JSON.parse(sceneJson!) as { elements: { type: string; isDeleted?: boolean }[] }
  const rects = data.elements.filter((e) => e.type === "rectangle" && !e.isDeleted)
  expect(rects.length).toBeGreaterThanOrEqual(2)
})

test("Escape cancels pending placement", async ({ page }) => {
  await resetStorage(page)
  await drawAndSelectRect(page)

  await page.locator('[data-testid="library-toggle"]').click()
  await page.locator('[data-testid="library-add"]').click()
  const item = page.locator('[data-testid^="library-item-"]').first()
  await expect(item).toBeVisible()
  await item.locator("button").first().click()
  await page.keyboard.press("Escape")

  const canvas = page.locator("canvas").first()
  const box = await canvas.boundingBox()
  if (!box) throw new Error("canvas not found")
  await page.mouse.click(box.x + 400, box.y + 400)
  await page.waitForTimeout(800)

  const data = JSON.parse(
    (await page.evaluate(() => localStorage.getItem("excalidraw-scene")))!,
  ) as { elements: { type: string; isDeleted?: boolean }[] }
  const rects = data.elements.filter((e) => e.type === "rectangle" && !e.isDeleted)
  expect(rects.length).toBe(1)
})

test("library item persists across reload", async ({ page }) => {
  await resetStorage(page)
  await drawAndSelectRect(page)

  await page.locator('[data-testid="library-toggle"]').click()
  await page.locator('[data-testid="library-add"]').click()
  await expect(page.locator('[data-testid^="library-item-"]')).toHaveCount(1)

  await page.reload()
  await page.locator('[data-testid="library-toggle"]').click()
  await expect(page.locator('[data-testid^="library-item-"]')).toHaveCount(1)
})
