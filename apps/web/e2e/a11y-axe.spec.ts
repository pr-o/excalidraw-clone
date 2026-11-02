import AxeBuilder from "@axe-core/playwright"
import { expect, test, type Page } from "@playwright/test"
import { drawRect, freshCanvas, setDarkTheme } from "./_helpers"

/** WCAG 2.x A/AA axe scan of the current page state; returns violations as text. */
async function scan(page: Page): Promise<string[]> {
  await page.waitForTimeout(250) // let transitions settle (contrast is read from the DOM)
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"])
    .analyze()
  return violations.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.nodes
        .slice(0, 3)
        .map((n) => n.target.join(" "))
        .join(" | ")}`,
  )
}

const selectRect = async (page: Page): Promise<void> => {
  await drawRect(page, { x: 300, y: 300 }, { x: 420, y: 380 })
  await page.locator('[data-testid="toolbar-selection"]').click()
  await page.mouse.click(360, 340)
}

for (const theme of ["light", "dark"] as const) {
  test.describe(`axe (${theme})`, () => {
    test.beforeEach(async ({ page }) => {
      await freshCanvas(page)
      if (theme === "dark") await setDarkTheme(page)
    })

    test("empty canvas", async ({ page }) => {
      expect(await scan(page)).toEqual([])
    })

    test("selection with properties, layers and history panels", async ({ page }) => {
      await selectRect(page)
      await page.locator('[data-testid="layers-toggle"]').click()
      await page.locator('[data-testid="history-toggle"]').click()
      await expect(page.locator('[data-testid="history-panel"]')).toBeVisible()
      expect(await scan(page)).toEqual([])
    })

    test("library panel", async ({ page }) => {
      await page.locator('[data-testid="library-toggle"]').click()
      expect(await scan(page)).toEqual([])
    })

    test("hamburger menu", async ({ page }) => {
      await page.getByRole("button", { name: /menu/i }).click()
      expect(await scan(page)).toEqual([])
    })

    test("help and export dialogs", async ({ page }) => {
      await page.getByTestId("help-button").click()
      expect(await scan(page)).toEqual([])
      await page.keyboard.press("Escape")
      await page.getByRole("button", { name: /menu/i }).click()
      await page.getByText("Export image…").click()
      expect(await scan(page)).toEqual([])
    })

    test("context menu", async ({ page }) => {
      await selectRect(page)
      await page.mouse.click(360, 340, { button: "right" })
      await expect(page.locator('[data-testid="context-menu"]')).toBeVisible()
      expect(await scan(page)).toEqual([])
    })
  })
}

test.describe("focus management", () => {
  test.beforeEach(async ({ page }) => {
    await freshCanvas(page)
  })

  test("hamburger menu: keyboard open, Tab into items, Escape returns to the button", async ({
    page,
  }) => {
    const trigger = page.getByRole("button", { name: /menu/i }).first()
    await trigger.focus()
    await page.keyboard.press("Enter")
    await expect(page.getByRole("menu")).toBeVisible()
    await page.keyboard.press("Tab")
    await expect(page.getByRole("menuitem").first()).toBeFocused()
    await page.keyboard.press("Escape")
    await expect(page.getByRole("menu")).toHaveCount(0)
    await expect(trigger).toBeFocused()
  })

  test("help dialog and context menu hand focus back to the canvas", async ({ page }) => {
    await selectRect(page)
    const canvas = page.getByTestId("drawing-canvas")
    await canvas.focus()
    await page.keyboard.press("?")
    await expect(page.getByRole("dialog")).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(page.getByRole("dialog")).toHaveCount(0)
    await expect(canvas).toBeFocused()

    await page.mouse.click(360, 340, { button: "right" })
    await expect(
      page.locator('[data-testid="context-menu"] [role="menuitem"]').first(),
    ).toBeFocused()
    await page.keyboard.press("Escape")
    await expect(page.locator('[data-testid="context-menu"]')).toHaveCount(0)
    await expect(canvas).toBeFocused()
  })

  test("reduced motion: CSS transitions are effectively off", async ({ page }) => {
    const transition = () =>
      page
        .getByTestId("toolbar-rectangle")
        .evaluate((el) => parseFloat(getComputedStyle(el).transitionDuration))
    expect(await transition()).toBeGreaterThan(0.05) // IconButton's colour transition
    await page.emulateMedia({ reducedMotion: "reduce" })
    expect(await transition()).toBeLessThan(0.001)
  })

  test("forced colors: the active tool keeps a visible marker", async ({ page }) => {
    await page.emulateMedia({ forcedColors: "active" })
    const outline = await page
      .getByTestId("toolbar-selection")
      .evaluate((el) => getComputedStyle(el).outlineStyle)
    expect(outline).toBe("solid")
  })
})
