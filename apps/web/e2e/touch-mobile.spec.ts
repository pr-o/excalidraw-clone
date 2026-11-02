import { expect, test, type Page } from "@playwright/test"
import { freshCanvas } from "./_helpers"

type Box = { x: number; y: number; width: number; height: number }
const box = async (page: Page, testId: string): Promise<Box> => {
  const b = await page.getByTestId(testId).boundingBox()
  if (!b) throw new Error(`${testId} not visible`)
  return b
}
const overlaps = (a: Box, b: Box): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

/** Synthetic touch pointer events on the canvas (Playwright has no multi-touch / long-press). */
const touch = (
  page: Page,
  type: "pointerdown" | "pointermove" | "pointerup",
  x: number,
  y: number,
) =>
  page.evaluate(
    ([type, x, y]) => {
      const canvas = document.querySelector("canvas")!
      canvas.setPointerCapture = () => {}
      canvas.releasePointerCapture = () => {}
      canvas.dispatchEvent(
        new PointerEvent(type, {
          pointerId: 7,
          pointerType: "touch",
          isPrimary: true,
          button: type === "pointermove" ? -1 : 0,
          buttons: type === "pointerup" ? 0 : 1,
          clientX: x,
          clientY: y,
          bubbles: true,
        }),
      )
    },
    [type, x, y] as const,
  )

const drawRectByTouch = async (page: Page): Promise<void> => {
  await page.getByTestId("toolbar-rectangle").tap()
  await touch(page, "pointerdown", 80, 300)
  await touch(page, "pointermove", 160, 360)
  await touch(page, "pointerup", 230, 420)
}

test.describe("phone 360x640", () => {
  test.use({ viewport: { width: 360, height: 640 }, hasTouch: true, isMobile: true })

  test("toolbar fits on screen and every tool is reachable through More tools", async ({
    page,
  }) => {
    await freshCanvas(page)
    const toolbar = await page.getByRole("toolbar").boundingBox()
    expect(toolbar!.x).toBeGreaterThanOrEqual(0)
    expect(toolbar!.x + toolbar!.width).toBeLessThanOrEqual(360)
    expect(
      overlaps(toolbar!, (await page.getByRole("button", { name: "Menu" }).boundingBox())!),
    ).toBe(false)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360)

    for (const tool of [
      "lock",
      "lasso",
      "diamond",
      "hexagon",
      "arrow",
      "text",
      "note",
      "comment",
    ]) {
      await page.getByTestId("toolbar-more-tools").tap()
      const item = page.getByRole("menu").getByTestId(`toolbar-${tool}`)
      await expect(item).toBeInViewport({ ratio: 1 })
      await item.tap()
      if (tool === "lock") await page.keyboard.press("Escape")
    }
    await expect(page.getByTestId("toolbar-more-tools")).toHaveAttribute("aria-pressed", "true")
  })

  test("properties open as a bottom sheet on demand and close again", async ({ page }) => {
    await freshCanvas(page)
    await drawRectByTouch(page)
    const panel = page.getByRole("complementary", { name: "Properties" })
    await expect(panel).toBeHidden()
    await page.getByTestId("properties-open").tap()
    await expect(panel).toBeVisible()
    const sheet = (await panel.boundingBox())!
    expect(sheet.width).toBe(360)
    expect(sheet.y + sheet.height).toBeCloseTo(640, 0)
    expect(sheet.height).toBeLessThanOrEqual(640 / 2)

    await page.getByTestId("properties-close").tap()
    await expect(panel).toBeHidden()
    await expect(page.getByTestId("properties-open")).toBeVisible()
  })

  test("long-press on a shape opens its context menu", async ({ page }) => {
    await freshCanvas(page)
    await drawRectByTouch(page)
    await page.getByTestId("toolbar-selection").tap()
    await touch(page, "pointerdown", 150, 360)
    await page.waitForTimeout(700)
    await touch(page, "pointerup", 150, 360)
    await expect(page.getByTestId("context-menu")).toBeVisible()
    await expect(page.getByTestId("context-menu-item-delete")).toBeVisible()
  })

  test("a moving finger never turns into a long-press", async ({ page }) => {
    await freshCanvas(page)
    await touch(page, "pointerdown", 150, 360)
    await touch(page, "pointermove", 200, 400)
    await page.waitForTimeout(700)
    await touch(page, "pointerup", 200, 400)
    await expect(page.getByTestId("context-menu")).toHaveCount(0)
  })

  test("pages bar keeps Add page reachable with many pages", async ({ page }) => {
    await freshCanvas(page)
    for (let i = 0; i < 4; i += 1) await page.getByTestId("page-add").tap()
    await expect(page.locator('[data-testid^="page-tab-"]')).toHaveCount(5)
    await expect(page.getByTestId("page-add")).toBeInViewport({ ratio: 1 })
    expect(overlaps(await box(page, "pages-tab-bar"), await box(page, "zoom-in"))).toBe(false)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360)
  })
})

test.describe("tablet 768x1024", () => {
  test.use({ viewport: { width: 768, height: 1024 }, hasTouch: true, isMobile: true })

  test("chrome does not overlap and the side panel properties stay", async ({ page }) => {
    await freshCanvas(page)
    const toolbar = (await page.getByRole("toolbar").boundingBox())!
    expect(
      overlaps(toolbar, (await page.getByRole("button", { name: "Menu" }).boundingBox())!),
    ).toBe(false)
    await page.getByTestId("page-add").tap()
    expect(overlaps(await box(page, "pages-tab-bar"), await box(page, "help-button"))).toBe(false)
    await drawRectByTouch(page)
    await expect(page.getByRole("complementary", { name: "Properties" })).toBeVisible()
    await expect(page.getByTestId("properties-open")).toBeHidden()
  })
})
