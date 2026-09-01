import { expect, test, type Page } from "@playwright/test"
import { dragOnCanvas } from "./_helpers"

test.beforeEach(async ({ page, context }) => {
  await context.route("**://example.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<html><head><title>stub</title></head><body>ok</body></html>",
    }),
  )
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-rectangle"]').waitFor({ state: "visible" })
})

const drawRect = async (page: Page): Promise<void> => {
  await page.locator('[data-testid="toolbar-rectangle"]').click()
  await dragOnCanvas(page, { x: 150, y: 150 }, { x: 250, y: 220 })
  await page.waitForTimeout(120)
  await page.locator('[data-testid="toolbar-selection"]').click()
}

const rectCenter = async (page: Page): Promise<{ x: number; y: number }> => {
  const box = await page.locator("canvas").first().boundingBox()
  if (!box) throw new Error("canvas not found")
  return { x: box.x + 200, y: box.y + 185 }
}

const selectRect = async (page: Page): Promise<void> => {
  const c = await rectCenter(page)
  await page.mouse.click(c.x, c.y)
}

const setLinkViaShortcut = async (page: Page, url: string): Promise<void> => {
  await selectRect(page)
  await page.keyboard.press("ControlOrMeta+k")
  const input = page.locator('[data-testid="link-editor-input"]')
  await expect(input).toBeVisible()
  await input.fill(url)
  await input.press("Enter")
  await page.locator('[data-testid="toolbar-selection"]').click()
}

test("Cmd/Ctrl+K sets a link that shows an indicator and survives a reload", async ({ page }) => {
  await drawRect(page)
  await setLinkViaShortcut(page, "https://example.com")
  await selectRect(page)
  await expect(page.locator('[data-testid="link-indicator"]')).toBeVisible()

  await page.waitForTimeout(900) // autosave debounce
  await page.reload()
  await page.locator('[data-testid="toolbar-selection"]').click()
  await selectRect(page)
  await expect(page.locator('[data-testid="link-indicator"]')).toBeVisible()
})

test("Cmd/Ctrl-click on a linked element opens it in a new tab", async ({ page }) => {
  await drawRect(page)
  await setLinkViaShortcut(page, "https://example.com")

  const c = await rectCenter(page)
  await page.keyboard.down("ControlOrMeta")
  const [popup] = await Promise.all([page.waitForEvent("popup"), page.mouse.click(c.x, c.y)])
  await page.keyboard.up("ControlOrMeta")
  await popup.waitForLoadState("domcontentloaded").catch(() => {})
  expect(popup.url()).toContain("example.com")
})

test("clicking the link indicator opens the link", async ({ page }) => {
  await drawRect(page)
  await setLinkViaShortcut(page, "https://example.com")
  await selectRect(page)

  const indicator = page.locator('[data-testid="link-indicator"]')
  await expect(indicator).toBeVisible()
  const [popup] = await Promise.all([page.waitForEvent("popup"), indicator.click()])
  await popup.waitForLoadState("domcontentloaded").catch(() => {})
  expect(popup.url()).toContain("example.com")
})

test("context menu: Create link, then Edit/Remove, then the indicator is gone", async ({
  page,
}) => {
  await drawRect(page)
  const c = await rectCenter(page)

  await page.mouse.click(c.x, c.y, { button: "right" })
  await expect(page.locator('[data-testid="context-menu-item-create-link"]')).toBeVisible()
  await page.locator('[data-testid="context-menu-item-create-link"]').click()

  const input = page.locator('[data-testid="link-editor-input"]')
  await expect(input).toBeVisible()
  await input.fill("https://example.com")
  await input.press("Enter")
  await page.locator('[data-testid="toolbar-selection"]').click()

  await page.mouse.click(c.x, c.y, { button: "right" })
  await expect(page.locator('[data-testid="context-menu-item-edit-link"]')).toBeVisible()
  await expect(page.locator('[data-testid="context-menu-item-remove-link"]')).toBeVisible()
  await expect(page.locator('[data-testid="context-menu-item-create-link"]')).toHaveCount(0)

  await page.locator('[data-testid="context-menu-item-remove-link"]').click()
  await selectRect(page)
  await expect(page.locator('[data-testid="link-indicator"]')).toHaveCount(0)
})

test("no link editor opens for a multi-selection", async ({ page }) => {
  await page.locator('[data-testid="toolbar-rectangle"]').click()
  await dragOnCanvas(page, { x: 120, y: 120 }, { x: 180, y: 180 })
  await page.waitForTimeout(100)
  await page.locator('[data-testid="toolbar-rectangle"]').click()
  await dragOnCanvas(page, { x: 260, y: 120 }, { x: 320, y: 180 })
  await page.waitForTimeout(100)
  await page.locator('[data-testid="toolbar-selection"]').click()
  await dragOnCanvas(page, { x: 90, y: 90 }, { x: 350, y: 210 })
  await page.waitForTimeout(150)

  await page.keyboard.press("ControlOrMeta+k")
  await expect(page.locator('[data-testid="link-editor-input"]')).toHaveCount(0)
})
