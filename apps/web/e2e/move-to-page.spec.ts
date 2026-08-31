import { expect, test, type Page } from "@playwright/test"
import { dragOnCanvas } from "./_helpers"

type SceneDoc = {
  pages: {
    id: string
    name: string
    elements: { id: string; type: string; isDeleted?: boolean }[]
  }[]
  activePageId: string
}

const readDoc = async (page: Page): Promise<SceneDoc | null> => {
  const json = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  if (json === null) return null
  return JSON.parse(json) as SceneDoc
}

test.beforeEach(async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-rectangle"]').waitFor({ state: "visible" })
})

const drawRect = async (page: Page) => {
  await page.locator('[data-testid="toolbar-rectangle"]').click()
  await dragOnCanvas(page, { x: 150, y: 150 }, { x: 250, y: 220 })
  await page.waitForTimeout(120)
  await page.locator('[data-testid="toolbar-selection"]').click()
}

test("move to page relocates the element, switches view, selects it, and refreshes both tab thumbnails", async ({
  page,
}) => {
  await drawRect(page)
  const firstTab = page.locator('[data-testid^="page-tab-"]')
  const firstId = (await firstTab.getAttribute("data-testid"))!.replace("page-tab-", "")

  // Capture the source thumbnail with the rectangle still on it, before the move.
  await expect
    .poll(async () => page.locator(`[data-testid="page-thumb-${firstId}"]`).getAttribute("src"), {
      timeout: 3000,
    })
    .toMatch(/^data:image\/png;base64,/)
  const beforeMoveThumb = await page
    .locator(`[data-testid="page-thumb-${firstId}"]`)
    .getAttribute("src")

  await page.locator('[data-testid="page-add"]').click()
  await expect(page.locator('[data-testid^="page-tab-"]')).toHaveCount(2)
  await expect.poll(async () => (await readDoc(page))?.pages.length).toBe(2)
  const doc1 = await readDoc(page)
  const secondId = doc1!.pages[1]!.id

  await page.locator(`[data-testid="page-switch-${firstId}"]`).click()
  await expect.poll(async () => (await readDoc(page))?.activePageId).toBe(firstId)

  const canvas = page.locator("canvas").first()
  const box = await canvas.boundingBox()
  if (!box) throw new Error("canvas not found")
  await page.mouse.click(box.x + 200, box.y + 185, { button: "right" })
  await expect(page.locator('[data-testid="context-menu-item-move-to-page"]')).toBeVisible()
  await page.locator('[data-testid="context-menu-item-move-to-page"]').click()

  await expect(page.locator('[data-testid="context-menu"]')).toHaveCount(0)
  await expect(page.locator('[data-testid="page-picker-flyout"]')).toBeVisible()
  await expect(page.locator(`[data-testid="page-picker-item-${secondId}"]`)).toBeVisible()
  await page.locator(`[data-testid="page-picker-item-${secondId}"]`).click()

  await expect(page.locator('[data-testid="page-picker-flyout"]')).toHaveCount(0)
  await expect.poll(async () => (await readDoc(page))?.activePageId).toBe(secondId)

  await expect
    .poll(async () => {
      const doc = await readDoc(page)
      return doc?.pages
        .find((p) => p.id === firstId)
        ?.elements.filter((e) => !e.isDeleted && e.type === "rectangle").length
    })
    .toBe(0)
  await expect
    .poll(async () => {
      const doc = await readDoc(page)
      return doc?.pages
        .find((p) => p.id === secondId)
        ?.elements.filter((e) => !e.isDeleted && e.type === "rectangle").length
    })
    .toBe(1)
  const finalDoc = await readDoc(page)
  const sourceRectId = doc1!.pages[0]!.elements.find((e) => e.type === "rectangle")!.id
  const destRectId = finalDoc!.pages
    .find((p) => p.id === secondId)!
    .elements.find((e) => e.type === "rectangle" && !e.isDeleted)!.id
  expect(destRectId).toBe(sourceRectId) // same id — a move, not a copy

  // Selected on arrival: PropertiesPanel only renders when something is selected.
  await expect(page.locator('[data-testid="panel-lock"]')).toBeVisible()

  // Source page's thumbnail no longer shows the moved rectangle.
  await page.locator(`[data-testid="page-switch-${firstId}"]`).click()
  await expect
    .poll(async () => page.locator(`[data-testid="page-thumb-${firstId}"]`).getAttribute("src"), {
      timeout: 3000,
    })
    .not.toBe(beforeMoveThumb)
})

test("negative: item absent for a multi-selection, a bound element, and when only one page exists", async ({
  page,
}) => {
  await drawRect(page)
  const canvas = page.locator("canvas").first()
  const box = await canvas.boundingBox()
  if (!box) throw new Error("canvas not found")

  // Only one page: absent even for an otherwise-eligible element.
  await page.mouse.click(box.x + 200, box.y + 185, { button: "right" })
  await expect(page.locator('[data-testid="context-menu-item-move-to-page"]')).toHaveCount(0)
  await page.keyboard.press("Escape")

  // Add a second page so the item would otherwise be eligible to appear.
  await page.locator('[data-testid="page-add"]').click()
  const firstTab = page.locator('[data-testid^="page-tab-"]').first()
  const firstId = (await firstTab.getAttribute("data-testid"))!.replace("page-tab-", "")
  await page.locator(`[data-testid="page-switch-${firstId}"]`).click()

  // Draw a second rectangle clear of the first, marquee-select both, right-click
  // one of them: multi-selection hides the item (elementIds.length > 1). This
  // path also covers grouped elements — right-clicking any grouped member always
  // expands the selection to the whole group first, so it is unreachable through
  // the UI with a single element id; canMoveElementToPage's own groupIds check
  // (Task 3) is unit-tested directly instead.
  await page.locator('[data-testid="toolbar-rectangle"]').click()
  await dragOnCanvas(page, { x: 280, y: 150 }, { x: 340, y: 210 })
  await page.waitForTimeout(120)
  await page.locator('[data-testid="toolbar-selection"]').click()
  await dragOnCanvas(page, { x: 130, y: 130 }, { x: 360, y: 240 })
  await page.waitForTimeout(150)
  await page.mouse.click(box.x + 200, box.y + 185, { button: "right" })
  await expect(page.locator('[data-testid="context-menu-item-move-to-page"]')).toHaveCount(0)
  await page.keyboard.press("Escape")

  // A rectangle that another arrow points at: hidden as a binding target.
  await page.locator('[data-testid="toolbar-rectangle"]').click()
  await dragOnCanvas(page, { x: 500, y: 150 }, { x: 560, y: 210 })
  await page.locator('[data-testid="toolbar-arrow"]').click()
  await dragOnCanvas(page, { x: 200, y: 185 }, { x: 530, y: 180 })
  await page.waitForTimeout(700)
  await page.locator('[data-testid="toolbar-selection"]').click()
  await page.mouse.click(box.x + 530, box.y + 200, { button: "right" })
  await expect(page.locator('[data-testid="context-menu-item-move-to-page"]')).toHaveCount(0)
})
