import { expect, test, type Page } from "@playwright/test"
import { freshCanvas, readScene } from "./_helpers"

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

  test("the More shapes flyout is not covered by the side panel toggles", async ({ page }) => {
    await freshCanvas(page)
    await page.getByTestId("toolbar-more-shapes").tap()
    // tap() refuses an element another one intercepts.
    await page.getByTestId("toolbar-stickers").tap({ timeout: 3000 })
    await expect(page.getByTestId("sticker-search")).toBeVisible()
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

  test("double-tap on a shape labels it, even without a native dblclick (iOS)", async ({
    page,
  }) => {
    await freshCanvas(page)
    await drawRectByTouch(page)
    for (let i = 0; i < 2; i += 1) {
      await touch(page, "pointerdown", 150, 360)
      await touch(page, "pointerup", 150, 360)
    }
    await expect(page.locator("textarea")).toBeFocused()
    await page.keyboard.type("Hi")
    await page.locator("textarea").blur()
    await expect
      .poll(async () =>
        (await readScene<{ text?: string; isDeleted?: boolean }>(page)).map((e) => e.text ?? null),
      )
      .toEqual([null, "Hi"])
  })

  test("a real double-tap (native dblclick too) edits once and the canvas blocks callouts", async ({
    page,
  }) => {
    await freshCanvas(page)
    await drawRectByTouch(page)
    await page.touchscreen.tap(150, 360)
    await page.touchscreen.tap(150, 360)
    await expect(page.locator("textarea")).toHaveCount(1)
    await page.keyboard.type("One")
    await page.locator("textarea").blur()
    await expect
      .poll(
        async () =>
          (await readScene<{ text?: string; isDeleted?: boolean }>(page)).filter((e) => e.text)
            .length,
      )
      .toBe(1)
    const css = await page
      .locator("canvas")
      .first()
      .evaluate((c) => {
        const s = getComputedStyle(c) as CSSStyleDeclaration & { webkitTouchCallout?: string }
        return [s.touchAction, s.userSelect, s.webkitTouchCallout]
      })
    expect(css.slice(0, 2)).toEqual(["none", "none"])
  })

  test("a moving finger never turns into a long-press", async ({ page }) => {
    await freshCanvas(page)
    await touch(page, "pointerdown", 150, 360)
    await touch(page, "pointermove", 200, 400)
    await page.waitForTimeout(700)
    await touch(page, "pointerup", 200, 400)
    await expect(page.getByTestId("context-menu")).toHaveCount(0)
  })

  test("text fields are at least 16px so iOS does not zoom on focus", async ({ page }) => {
    await freshCanvas(page)
    const fontPx = (testId: string) =>
      page.getByTestId(testId).evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
    await page.keyboard.press("Control+f")
    expect(await fontPx("find-input")).toBeGreaterThanOrEqual(16)
    await page.keyboard.press("Escape")

    const tab = page.locator('[data-testid^="page-tab-"]').first()
    const id = (await tab.getAttribute("data-testid"))!.replace("page-tab-", "")
    await page.getByTestId(`page-switch-${id}`).dblclick()
    expect(await fontPx(`page-rename-input-${id}`)).toBeGreaterThanOrEqual(16)
    await page.keyboard.press("Escape")

    await page.getByTestId("toolbar-more-tools").tap()
    await page.getByRole("menu").getByTestId("toolbar-comment").tap()
    await touch(page, "pointerdown", 180, 300)
    await touch(page, "pointerup", 180, 300)
    expect(await fontPx("comment-input")).toBeGreaterThanOrEqual(16)
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

test.describe("on-screen keyboard (emulated visualViewport)", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test("a text editor near the bottom scrolls above the keyboard", async ({ page }) => {
    // Chromium can't open a soft keyboard; stand in a visualViewport we can shrink.
    await page.addInitScript(() => {
      const vv = new EventTarget() as EventTarget & { height: number; offsetTop: number }
      vv.height = window.innerHeight
      vv.offsetTop = 0
      Object.defineProperty(window, "visualViewport", { value: vv, configurable: true })
      ;(window as unknown as { __keyboard: (h: number) => void }).__keyboard = (h) => {
        vv.height = h
        vv.dispatchEvent(new Event("resize"))
      }
    })
    await freshCanvas(page)
    await page.getByTestId("toolbar-more-tools").tap()
    await page.getByRole("menu").getByTestId("toolbar-text").tap()
    await page.touchscreen.tap(120, 700)
    const editor = page.locator("textarea")
    await expect(editor).toBeFocused()
    await page.evaluate(() =>
      (window as unknown as { __keyboard: (h: number) => void }).__keyboard(420),
    )
    await expect
      .poll(async () => (await editor.boundingBox())!.y + (await editor.boundingBox())!.height)
      .toBeLessThanOrEqual(420)
    await page.keyboard.type("visible")
    await expect(editor).toHaveValue("visible")

    // The comment composer is anchored on the canvas too.
    await page.locator("textarea").blur()
    await page.evaluate(() =>
      (window as unknown as { __keyboard: (h: number) => void }).__keyboard(844),
    )
    await page.getByTestId("toolbar-more-tools").tap()
    await page.getByRole("menu").getByTestId("toolbar-comment").tap()
    await touch(page, "pointerdown", 200, 640)
    await touch(page, "pointerup", 200, 640)
    const input = page.getByTestId("comment-input")
    await expect(input).toBeFocused()
    await page.evaluate(() =>
      (window as unknown as { __keyboard: (h: number) => void }).__keyboard(420),
    )
    await expect
      .poll(async () => {
        const b = (await input.boundingBox())!
        return b.y + b.height
      })
      .toBeLessThanOrEqual(420)
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

for (const width of [390, 768, 1024]) {
  test.describe(`touch targets at ${width}px`, () => {
    test.use({ viewport: { width, height: 844 }, hasTouch: true, isMobile: true })

    test("toolbar and page-tab controls are 40px and nothing collides", async ({ page }) => {
      await freshCanvas(page)
      const toolbar = page.getByRole("toolbar")
      const bar = (await toolbar.boundingBox())!
      expect(bar.x).toBeGreaterThanOrEqual(0)
      expect(bar.x + bar.width).toBeLessThanOrEqual(width)
      for (const name of [
        "Menu",
        "Toggle history panel",
        "Toggle library",
        "Toggle layers panel",
      ]) {
        const other = (await page.getByRole("button", { name, exact: true }).boundingBox())!
        expect(overlaps(bar, other), name).toBe(false)
      }
      for (const b of await toolbar.getByRole("button").all()) {
        const r = (await b.boundingBox())!
        expect(Math.min(r.width, r.height)).toBeGreaterThanOrEqual(40)
      }
      if (width >= 1024) await expect(page.getByTestId("toolbar-more-tools")).toHaveCount(0)

      await page.getByTestId("page-add").tap()
      const tabs = page.locator('[data-testid^="page-tab-"]')
      const [first, second] = [tabs.nth(0), tabs.nth(1)]
      // Page 2 is active: its controls are touch-sized, page 1's are hidden.
      for (const b of await second.getByRole("button").all()) {
        if (!(await b.isVisible())) continue
        const label = await b.getAttribute("aria-label")
        if (label?.startsWith("Move page") || label?.includes("page")) {
          const r = (await b.boundingBox())!
          expect(Math.min(r.width, r.height), label ?? "").toBeGreaterThanOrEqual(40)
        }
      }
      await expect(first.getByRole("button", { name: "Delete page" })).toBeHidden()
      await expect(second.getByRole("button", { name: "Delete page" })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
    })
  })
}
