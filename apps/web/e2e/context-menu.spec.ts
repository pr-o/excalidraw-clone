import { expect, test, type Page } from "@playwright/test"
import { dragOnCanvas, parseStoredScene } from "./_helpers"

test.use({ permissions: ["clipboard-read", "clipboard-write"] })

type SceneEl = {
  id: string
  type: string
  x: number
  y: number
  isDeleted?: boolean
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

test("right-click an element opens the menu and Delete removes it", async ({ page }) => {
  await drawRect(page)
  const canvas = page.locator("canvas").first()
  const box = await canvas.boundingBox()
  if (!box) throw new Error("canvas not found")
  await page.mouse.click(box.x + 200, box.y + 185, { button: "right" })

  await expect(page.locator('[data-testid="context-menu"]')).toBeVisible()
  await expect(page.locator('[data-testid="context-menu-item-delete"]')).toBeVisible()

  await page.locator('[data-testid="context-menu-item-delete"]').click()
  await expect(page.locator('[data-testid="context-menu"]')).toHaveCount(0)

  // Nothing left to right-click — a right-click now hits empty canvas.
  await page.mouse.click(box.x + 200, box.y + 185, { button: "right" })
  await expect(page.locator('[data-testid="context-menu-item-select-all"]')).toBeVisible()
})

test("right-click empty canvas shows the canvas menu", async ({ page }) => {
  const canvas = page.locator("canvas").first()
  const box = await canvas.boundingBox()
  if (!box) throw new Error("canvas not found")
  await page.mouse.click(box.x + 400, box.y + 400, { button: "right" })

  await expect(page.locator('[data-testid="context-menu-item-paste"]')).toBeVisible()
  await expect(page.locator('[data-testid="context-menu-item-select-all"]')).toBeVisible()
  // No content yet, so zoom-to-fit is hidden.
  await expect(page.locator('[data-testid="context-menu-item-zoom-to-fit"]')).toHaveCount(0)
})

test("right-click a locked element shows only Copy and Unlock; Unlock unlocks it", async ({
  page,
}) => {
  await drawRect(page)
  const canvas = page.locator("canvas").first()
  const box = await canvas.boundingBox()
  if (!box) throw new Error("canvas not found")

  // Select the rectangle, then lock it via the keyboard shortcut.
  await page.mouse.click(box.x + 200, box.y + 185)
  await page.keyboard.press("Control+Shift+l")

  await page.mouse.click(box.x + 200, box.y + 185, { button: "right" })
  await expect(page.locator('[data-testid="context-menu-item-copy"]')).toBeVisible()
  await expect(page.locator('[data-testid="context-menu-item-unlock"]')).toBeVisible()
  await expect(page.locator('[data-testid="context-menu-item-delete"]')).toHaveCount(0)

  await page.locator('[data-testid="context-menu-item-unlock"]').click()

  // Now unlocked: right-clicking it again shows the full unlocked menu.
  await page.mouse.click(box.x + 200, box.y + 185, { button: "right" })
  await expect(page.locator('[data-testid="context-menu-item-delete"]')).toBeVisible()
})

test("Escape and outside-click both close the menu without side effects", async ({ page }) => {
  await drawRect(page)
  const canvas = page.locator("canvas").first()
  const box = await canvas.boundingBox()
  if (!box) throw new Error("canvas not found")

  await page.mouse.click(box.x + 200, box.y + 185, { button: "right" })
  await expect(page.locator('[data-testid="context-menu"]')).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(page.locator('[data-testid="context-menu"]')).toHaveCount(0)

  await page.mouse.click(box.x + 200, box.y + 185, { button: "right" })
  await expect(page.locator('[data-testid="context-menu"]')).toBeVisible()
  await page.mouse.click(box.x + 50, box.y + 500)
  await expect(page.locator('[data-testid="context-menu"]')).toHaveCount(0)
})

test("right-clicking an already-selected element keeps the whole multi-selection", async ({
  page,
}) => {
  // Two rectangles side by side: A at (100,100)-(160,160), B at (220,100)-(280,160).
  const draw = async (from: { x: number; y: number }, to: { x: number; y: number }) => {
    await page.locator('[data-testid="toolbar-rectangle"]').click()
    await dragOnCanvas(page, from, to)
    await page.waitForTimeout(120)
  }
  await draw({ x: 100, y: 100 }, { x: 160, y: 160 })
  await draw({ x: 220, y: 100 }, { x: 280, y: 160 })

  // Marquee-select both (same idiom as locking.spec.ts / group.spec.ts — the
  // canvas has no additive shift-click selection).
  await page.locator('[data-testid="toolbar-selection"]').click()
  await dragOnCanvas(page, { x: 80, y: 80 }, { x: 300, y: 180 })
  await page.waitForTimeout(150)

  const canvas = page.locator("canvas").first()
  const box = await canvas.boundingBox()
  if (!box) throw new Error("canvas not found")

  // Right-click A, which is already part of the selection: the menu must keep
  // both elements as its target instead of collapsing to just A.
  await page.mouse.click(box.x + 130, box.y + 130, { button: "right" })
  await expect(page.locator('[data-testid="context-menu"]')).toBeVisible()
  // Group is only offered for 2+ selected elements — first proof both survived.
  await expect(page.locator('[data-testid="context-menu-item-group"]')).toBeVisible()

  // Second proof: Delete must remove both rectangles, not only the clicked one.
  await page.locator('[data-testid="context-menu-item-delete"]').click()
  await page.waitForTimeout(900)

  const json = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  const rects = parseStoredScene<SceneEl>(json).elements.filter(
    (e) => !e.isDeleted && e.type === "rectangle",
  )
  expect(rects.length).toBe(0)
})

test("menu Copy then menu Paste duplicates the element at the paste point", async ({ page }) => {
  // drawRect draws (150,150)-(250,220) — a 100x70 rect centred at (200,185).
  await drawRect(page)
  const canvas = page.locator("canvas").first()
  const box = await canvas.boundingBox()
  if (!box) throw new Error("canvas not found")

  await page.mouse.click(box.x + 200, box.y + 185, { button: "right" })
  await page.locator('[data-testid="context-menu-item-copy"]').click()
  await expect(page.locator('[data-testid="context-menu"]')).toHaveCount(0)

  // Right-click empty canvas well clear of the rect, then paste there.
  await page.mouse.click(box.x + 500, box.y + 350, { button: "right" })
  await page.locator('[data-testid="context-menu-item-paste"]').click()
  await page.waitForTimeout(900)

  const json = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  const rects = parseStoredScene<SceneEl>(json).elements.filter(
    (e) => !e.isDeleted && e.type === "rectangle",
  )
  expect(rects.length).toBe(2)
  // The copy's bbox centre lands on the paste point (500,350) → origin (450,315).
  const xs = rects.map((r) => Math.round(r.x)).sort((a, b) => a - b)
  expect(xs).toEqual([150, 450])
})
