import { expect, test, type Page } from "@playwright/test"
import { drawRect, freshCanvas, readScene } from "./_helpers"

type SceneEl = {
  id: string
  type: string
  x: number
  containerId?: string | null
  text?: string
  boundElements?: { id: string; type: string }[] | null
  isDeleted?: boolean
}

const canvas = (page: Page) => page.getByTestId("drawing-canvas")
const live = (page: Page) => page.getByTestId("live-announcer")

test.beforeEach(async ({ page }) => {
  await freshCanvas(page)
  await drawRect(page, { x: 200, y: 200 }, { x: 300, y: 260 })
  await drawRect(page, { x: 400, y: 200 }, { x: 500, y: 260 })
  await drawRect(page, { x: 600, y: 200 }, { x: 700, y: 260 })
  await page.keyboard.press("Escape")
  await expect.poll(async () => (await readScene<SceneEl>(page)).length).toBe(3)
})

test("Tab reaches the canvas, then walks elements in z-order with announcements", async ({
  page,
}) => {
  // Keyboard only from the top of the document: the canvas is the first stop.
  await page.reload()
  await page.getByTestId("toolbar-rectangle").waitFor()
  await page.keyboard.press("Tab")
  await expect(canvas(page)).toBeFocused()

  await page.keyboard.press("Tab")
  await expect(live(page)).toContainText("Rectangle, x 200, y 200, 100 by 60, 1 of 3")
  await page.keyboard.press("Tab")
  await expect(live(page)).toContainText("x 400, y 200, 100 by 60, 2 of 3")
  await page.keyboard.press("Shift+Tab")
  await expect(live(page)).toContainText("1 of 3")
  await expect(canvas(page)).toBeFocused()

  // Arrow keys nudge the keyboard-selected element (existing shortcut).
  const before = (await readScene<SceneEl>(page))[0]!.x
  await page.keyboard.press("ArrowRight")
  await page.keyboard.press("Shift+ArrowRight")
  await expect.poll(async () => (await readScene<SceneEl>(page))[0]!.x).toBe(before + 11)

  // Escape clears the selection and says so.
  await page.keyboard.press("Escape")
  await expect(live(page)).toContainText("Selection cleared")
  await page.keyboard.press("Tab")
  await expect(live(page)).toContainText("1 of 3")
})

test("Enter labels the selected shape; the label is announced on the next visit", async ({
  page,
}) => {
  await canvas(page).focus()
  await page.keyboard.press("Tab")
  await page.keyboard.press("Enter")
  const editor = page.locator("textarea")
  await expect(editor).toBeFocused()
  await page.keyboard.type("Start")
  await page.keyboard.press("Escape") // commits, like clicking away
  await expect(editor).toHaveCount(0)

  await expect
    .poll(async () => (await readScene<SceneEl>(page)).find((e) => e.type === "text")?.text)
    .toBe("Start")
  const els = await readScene<SceneEl>(page)
  const label = els.find((e) => e.type === "text")!
  expect(els[0]!.boundElements?.some((b) => b.id === label.id)).toBe(true)

  // Focus comes back to the canvas, so navigation continues without the mouse.
  await expect(canvas(page)).toBeFocused()
  await page.keyboard.press("Escape")
  await page.keyboard.press("Tab")
  await expect(live(page)).toContainText("Rectangle “Start”, x 200")
})

test("Tab past the last element leaves the canvas (no keyboard trap)", async ({ page }) => {
  await canvas(page).focus()
  for (let i = 0; i < 3; i += 1) await page.keyboard.press("Tab")
  await expect(live(page)).toContainText("3 of 3")
  await page.keyboard.press("Tab")
  await expect(canvas(page)).not.toBeFocused()

  // And Shift+Tab before the first element leaves backwards.
  await canvas(page).focus()
  await page.keyboard.press("Escape")
  await page.keyboard.press("Shift+Tab")
  await expect(live(page)).toContainText("3 of 3")
})

test("tool keys, undo and redo still work and are announced", async ({ page }) => {
  await canvas(page).focus()
  await page.keyboard.press("r")
  await expect(page.getByTestId("toolbar-rectangle")).toHaveAttribute("aria-pressed", "true")
  await expect(live(page)).toContainText("Rectangle tool")
  // Tab selects an element and returns to the selection tool.
  await page.keyboard.press("Tab")
  await expect(page.getByTestId("toolbar-selection")).toHaveAttribute("aria-pressed", "true")

  await page.keyboard.press("Control+z")
  await expect(live(page)).toContainText("Undo")
  await expect.poll(async () => (await readScene<SceneEl>(page)).length).toBe(2)
  await page.keyboard.press("Control+Shift+z")
  await expect(live(page)).toContainText("Redo")
  await expect.poll(async () => (await readScene<SceneEl>(page)).length).toBe(3)
})
