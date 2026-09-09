import { expect, test, type Page } from "@playwright/test"
import { dragOnCanvas, parseStoredScene } from "./_helpers"

type SceneEl = { type: string; isDeleted?: boolean }

const freshCanvas = async (page: Page): Promise<void> => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-frame"]').waitFor({ state: "visible" })
}

const readElements = async (page: Page): Promise<SceneEl[]> => {
  const json = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  return parseStoredScene<SceneEl>(json).elements.filter((e) => !e.isDeleted)
}

const countOf = async (page: Page, type: string): Promise<number> =>
  (await readElements(page)).filter((e) => e.type === type).length

const drawFrame = async (
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> => {
  await page.locator('[data-testid="toolbar-frame"]').click()
  await dragOnCanvas(page, from, to)
  await page.waitForTimeout(150)
}

const clickCanvasAt = async (page: Page, at: { x: number; y: number }): Promise<void> => {
  const box = await page.locator("canvas").first().boundingBox()
  if (!box) throw new Error("canvas not found")
  await page.mouse.click(box.x + at.x, box.y + at.y)
}

/** Opens the hamburger menu and starts the presentation. */
const startPresentation = async (page: Page): Promise<void> => {
  await page.locator('button[aria-label="Menu"]').click()
  const item = page.locator('[data-testid="menu-presentation"]')
  await expect(item).toBeVisible()
  // Enabled only when the active page has at least one frame.
  await expect(item).not.toHaveAttribute("aria-disabled", "true")
  await item.click()
}

const counter = (page: Page) => page.locator('[data-testid="presentation-counter"]')

test("presentation mode steps through frames, hides chrome, no wrap, Escape restores", async ({
  page,
}) => {
  await freshCanvas(page)

  await drawFrame(page, { x: 80, y: 80 }, { x: 280, y: 240 })
  await drawFrame(page, { x: 360, y: 80 }, { x: 560, y: 240 })

  // Let the debounced autosave land before reading the persisted scene.
  await page.waitForTimeout(900)
  expect(await countOf(page, "frame")).toBe(2)

  await startPresentation(page)

  // Overlay up (it stays mounted even when the idle-fade dims it), chrome gone.
  await expect(page.locator('[data-testid="presentation-overlay"]')).toHaveCount(1)
  await expect(counter(page)).toHaveText("1 / 2")
  await expect(page.locator('[data-testid="toolbar-selection"]')).toHaveCount(0)

  // Advance, then hit the wall — no wrap-around past the last slide.
  await page.keyboard.press("ArrowRight")
  await expect(counter(page)).toHaveText("2 / 2")
  await page.keyboard.press("ArrowRight")
  await expect(counter(page)).toHaveText("2 / 2")

  // ...and no wrap below the first slide either.
  await page.keyboard.press("ArrowLeft")
  await expect(counter(page)).toHaveText("1 / 2")
  await page.keyboard.press("ArrowLeft")
  await expect(counter(page)).toHaveText("1 / 2")

  // Exit restores the chrome and drops the overlay.
  await page.keyboard.press("Escape")
  await expect(page.locator('[data-testid="toolbar-selection"]')).toBeVisible()
  await expect(page.locator('[data-testid="presentation-overlay"]')).toHaveCount(0)

  // The whole flow never mutated the scene.
  await page.waitForTimeout(700)
  expect(await countOf(page, "frame")).toBe(2)
})

test("presenting is read-only: armed library item is not placed, wheel and right-click are inert", async ({
  page,
}) => {
  await freshCanvas(page)

  // A frame is required for the menu entry to be enabled.
  await drawFrame(page, { x: 80, y: 80 }, { x: 280, y: 240 })

  // Draw + select a rectangle, add it to the library, then arm placement.
  await page.locator('[data-testid="toolbar-rectangle"]').click()
  await dragOnCanvas(page, { x: 340, y: 300 }, { x: 440, y: 380 })
  await page.waitForTimeout(150)
  await page.locator('[data-testid="toolbar-selection"]').click()
  await clickCanvasAt(page, { x: 390, y: 340 })
  await page.waitForTimeout(100)

  await page.locator('[data-testid="library-toggle"]').click()
  await page.locator('[data-testid="library-add"]').click()
  const libItem = page.locator('[data-testid^="library-item-"]').first()
  await expect(libItem).toBeVisible()
  await libItem.locator("button").first().click()

  await page.waitForTimeout(800)
  const rectsBefore = await countOf(page, "rectangle")
  expect(rectsBefore).toBe(1)

  await startPresentation(page)
  await expect(counter(page)).toHaveText("1 / 1")

  // Clicks land on the slide, not on the placement flow.
  await clickCanvasAt(page, { x: 500, y: 420 })
  await clickCanvasAt(page, { x: 560, y: 460 })
  await clickCanvasAt(page, { x: 620, y: 300 })
  await page.waitForTimeout(200)

  // Wheel is inert: the viewport is owned by the slide framing and the
  // presentation state is untouched. (The viewport itself is not persisted,
  // so the counter is the observable signal here.)
  await page.mouse.wheel(0, 200)
  await page.waitForTimeout(150)
  await expect(counter(page)).toHaveText("1 / 1")

  // Right-click opens no editor context menu while presenting.
  const box = await page.locator("canvas").first().boundingBox()
  if (!box) throw new Error("canvas not found")
  await page.mouse.click(box.x + 400, box.y + 300, { button: "right" })
  await page.waitForTimeout(200)
  await expect(page.locator('[data-testid="context-menu"]')).toHaveCount(0)

  await page.keyboard.press("Escape")
  await expect(page.locator('[data-testid="toolbar-selection"]')).toBeVisible()

  await page.waitForTimeout(800)
  expect(await countOf(page, "rectangle")).toBe(rectsBefore)
  expect(await countOf(page, "frame")).toBe(1)
})

test("editor shortcuts are swallowed while presenting", async ({ page }) => {
  await freshCanvas(page)
  await drawFrame(page, { x: 80, y: 80 }, { x: 280, y: 240 })

  await page.locator('[data-testid="toolbar-selection"]').click()
  await expect(page.locator('[data-testid="toolbar-selection"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  )

  await startPresentation(page)
  await expect(counter(page)).toHaveText("1 / 1")

  // `r` would normally pick the rectangle tool; presenting is read-only.
  await page.keyboard.press("r")
  await page.waitForTimeout(150)

  await page.keyboard.press("Escape")
  await expect(page.locator('[data-testid="toolbar-selection"]')).toBeVisible()
  await expect(page.locator('[data-testid="toolbar-selection"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  )
  await expect(page.locator('[data-testid="toolbar-rectangle"]')).toHaveAttribute(
    "aria-pressed",
    "false",
  )
})

test("menu entry is disabled with no frames on the page", async ({ page }) => {
  await freshCanvas(page)

  await page.locator('button[aria-label="Menu"]').click()
  const item = page.locator('[data-testid="menu-presentation"]')
  await expect(item).toBeVisible()
  await expect(item).toBeDisabled()
})
