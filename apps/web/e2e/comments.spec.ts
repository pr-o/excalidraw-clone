import { expect, test, type Page } from "@playwright/test"
import { dragOnCanvas } from "./_helpers"

test.beforeEach(async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByTestId("toolbar-rectangle").waitFor()
})

const canvasPoint = async (page: Page, x: number, y: number): Promise<{ x: number; y: number }> => {
  const box = await page.locator("canvas").first().boundingBox()
  if (!box) throw new Error("canvas not found")
  return { x: box.x + x, y: box.y + y }
}

const placeComment = async (page: Page, x: number, y: number, text: string): Promise<void> => {
  await page.keyboard.press("c")
  await expect(page.getByTestId("toolbar-comment")).toHaveAttribute("aria-pressed", "true")
  const p = await canvasPoint(page, x, y)
  await page.mouse.click(p.x, p.y)
  const input = page.getByTestId("comment-input")
  await expect(input).toBeFocused()
  await input.fill(text)
  await input.press("Enter")
}

test("place, persist, resolve, filter and delete a comment", async ({ page }) => {
  // Escape on an empty draft discards it.
  await page.keyboard.press("c")
  const p = await canvasPoint(page, 300, 300)
  await page.mouse.click(p.x, p.y)
  await page.getByTestId("comment-input").press("Escape")
  await expect(page.getByTestId("comment-input")).toHaveCount(0)
  await expect(page.getByTestId("comment-pin-1")).toHaveCount(0)

  await placeComment(page, 400, 300, "Check this spacing")
  await expect(page.getByTestId("comment-pin-1")).toBeVisible()
  await expect(page.getByTestId("toolbar-selection")).toHaveAttribute("aria-pressed", "true")

  await page.waitForTimeout(700)
  await page.reload()
  const pin = page.getByTestId("comment-pin-1")
  await expect(pin).toBeVisible()

  await pin.click()
  const thread = page.getByTestId("comment-thread")
  await expect(thread).toContainText("Check this spacing")
  await page.getByTestId("comment-reply-input").fill("Agreed")
  await page.getByTestId("comment-reply-input").press("Enter")
  await expect(thread).toContainText("Agreed")
  await page.getByTestId("comment-thread-resolve").click()
  await expect(page.getByTestId("comment-thread-resolve")).toHaveText("Reopen")
  await page.getByTestId("comment-thread-close").click()
  await expect(thread).toHaveCount(0)

  await page.getByRole("button", { name: "Menu" }).click()
  await page.getByTestId("menu-comments").click()
  const panel = page.getByTestId("comments-panel")
  await expect(panel).toContainText("Check this spacing")
  await page.getByTestId("comments-filter-open").click()
  await expect(panel).not.toContainText("Check this spacing")
  await page.getByTestId("comments-filter-resolved").click()
  await expect(panel).toContainText("Check this spacing")

  // Row click opens the thread on the canvas.
  await panel.getByText("Check this spacing").click()
  await expect(thread).toBeVisible()

  await panel.getByRole("button", { name: "Delete" }).click()
  await expect(page.getByTestId("comment-pin-1")).toHaveCount(0)
  await expect(thread).toHaveCount(0)
  await expect(panel).toContainText("No comments on this page")
})

test("an element-anchored comment follows its element", async ({ page }) => {
  await page.getByTestId("toolbar-rectangle").click()
  await dragOnCanvas(page, { x: 150, y: 150 }, { x: 250, y: 220 })
  await page.getByTestId("toolbar-selection").click()

  await placeComment(page, 170, 160, "On the box")
  const pin = page.getByTestId("comment-pin-1")
  const before = await pin.boundingBox()

  await dragOnCanvas(page, { x: 200, y: 185 }, { x: 300, y: 285 })
  await expect
    .poll(async () => (await pin.boundingBox())!.x - before!.x, { timeout: 2000 })
    .toBeCloseTo(100, 0)
})

test("comments are readable but not editable in view mode", async ({ page }) => {
  await placeComment(page, 400, 300, "Read me")
  await page.keyboard.press("Alt+r")
  await page.getByTestId("comment-pin-1").click()
  await expect(page.getByTestId("comment-thread")).toContainText("Read me")
  await expect(page.getByTestId("comment-reply-input")).toHaveCount(0)
  // The comment tool key is inert in view mode.
  await page.keyboard.press("Escape")
  await page.keyboard.press("c")
  await expect(page.getByTestId("comment-input")).toHaveCount(0)
})
