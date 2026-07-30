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

test("pages: add, switch, rename, delete-guard, and localStorage round-trip", async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-rectangle"]').waitFor({ state: "visible" })

  // Starts with exactly one page tab, delete disabled.
  await expect(page.locator('[data-testid^="page-tab-"]')).toHaveCount(1)
  const firstTab = page.locator('[data-testid^="page-tab-"]')
  const firstId = (await firstTab.getAttribute("data-testid"))!.replace("page-tab-", "")
  await expect(page.locator(`[data-testid="page-delete-${firstId}"]`)).toBeDisabled()

  // Draw a rectangle on page 1.
  await page.locator('[data-testid="toolbar-rectangle"]').click()
  await dragOnCanvas(page, { x: 100, y: 100 }, { x: 160, y: 160 })
  await page.locator('[data-testid="toolbar-selection"]').click()
  await page.waitForTimeout(120)

  // Add page 2; it auto-activates.
  await page.locator('[data-testid="page-add"]').click()
  await expect(page.locator('[data-testid^="page-tab-"]')).toHaveCount(2)
  // The tab-count assertion only reflects React state; localStorage lags behind it
  // on the 500ms auto-save debounce, so poll rather than assume it has flushed.
  await expect.poll(async () => (await readDoc(page))?.pages.length).toBe(2)
  const doc1 = await readDoc(page)
  const page2Id = doc1!.pages[1]!.id
  await expect.poll(async () => (await readDoc(page))?.activePageId).toBe(page2Id)

  // Draw on page 2.
  await page.locator('[data-testid="toolbar-rectangle"]').click()
  await dragOnCanvas(page, { x: 200, y: 200 }, { x: 260, y: 260 })
  await page.locator('[data-testid="toolbar-selection"]').click()
  await page.waitForTimeout(120)
  await expect
    .poll(async () => {
      const doc = await readDoc(page)
      return doc?.pages.find((p) => p.id === page2Id)?.elements.filter((e) => !e.isDeleted).length
    })
    .toBe(1)

  // Switch back to page 1: its rectangle is still there.
  await page.locator(`[data-testid="page-switch-${firstId}"]`).click()
  await expect.poll(async () => (await readDoc(page))?.activePageId).toBe(firstId)
  const docBack = await readDoc(page)
  const page1Elements = docBack!.pages
    .find((p) => p.id === firstId)!
    .elements.filter((e) => !e.isDeleted)
  expect(page1Elements.length).toBe(1)

  // Rename page 1.
  await page.locator(`[data-testid="page-switch-${firstId}"]`).dblclick()
  const input = page.locator(`[data-testid="page-rename-input-${firstId}"]`)
  await input.fill("Notes")
  await input.press("Enter")
  await expect
    .poll(async () => {
      const doc = await readDoc(page)
      return doc?.pages.find((p) => p.id === firstId)?.name
    })
    .toBe("Notes")

  // Alt+PageDown cycles to page 2.
  await page.keyboard.press("Alt+PageDown")
  await expect.poll(async () => (await readDoc(page))?.activePageId).toBe(page2Id)

  // Reload: both pages, the rename, and the active page survive (localStorage round-trip).
  await page.reload()
  await page.locator('[data-testid="toolbar-rectangle"]').waitFor({ state: "visible" })
  await expect(page.locator('[data-testid^="page-tab-"]')).toHaveCount(2)
  const docAfterReload = await readDoc(page)
  expect(docAfterReload?.activePageId).toBe(page2Id)
  expect(docAfterReload?.pages.find((p) => p.id === firstId)?.name).toBe("Notes")

  // Delete guard: delete page 2 down to one page, then delete is disabled again.
  await page.locator(`[data-testid="page-delete-${page2Id}"]`).click()
  await expect(page.locator('[data-testid^="page-tab-"]')).toHaveCount(1)
  await expect(page.locator(`[data-testid="page-delete-${firstId}"]`)).toBeDisabled()
})

test("pages: active tab shows a live-updating thumbnail after drawing", async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-rectangle"]').waitFor({ state: "visible" })

  const firstTab = page.locator('[data-testid^="page-tab-"]')
  const firstId = (await firstTab.getAttribute("data-testid"))!.replace("page-tab-", "")
  const thumb = page.locator(`[data-testid="page-thumb-${firstId}"]`)

  // Blank box before any drawing: it's a <div>, not an <img>, so it has no src.
  expect(await thumb.getAttribute("src")).toBeNull()

  await page.locator('[data-testid="toolbar-rectangle"]').click()
  await dragOnCanvas(page, { x: 100, y: 100 }, { x: 200, y: 200 })
  await page.locator('[data-testid="toolbar-selection"]').click()

  // The thumbnail effect mirrors the 500ms autosave debounce; poll rather than
  // assume a fixed wait has been long enough (the e2e suite's established
  // pattern for anything gated behind that debounce).
  await expect
    .poll(async () => thumb.getAttribute("src"), { timeout: 3000 })
    .toMatch(/^data:image\/png;base64,/)
})

test("pages: dragging a tab past a sibling reorders the pages array in localStorage", async ({
  page,
}) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-rectangle"]').waitFor({ state: "visible" })

  await page.locator('[data-testid="page-add"]').click()
  await expect(page.locator('[data-testid^="page-tab-"]')).toHaveCount(2)
  await expect.poll(async () => (await readDoc(page))?.pages.length).toBe(2)

  const idsBefore = await page
    .locator('[data-testid^="page-tab-"]')
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-testid")!.replace("page-tab-", "")))
  const firstId = idsBefore[0]!
  const secondId = idsBefore[1]!

  // Grab the thumbnail, not the tab's centre: a pointerdown that lands on any
  // button/input inside the tab (and the centre is the rename/switch button)
  // deliberately does not start a drag, so the thumbnail is the grab surface.
  const firstGrab = page.locator(`[data-testid="page-thumb-${firstId}"]`)
  const secondTab = page.locator(`[data-testid="page-tab-${secondId}"]`)
  const firstBox = await firstGrab.boundingBox()
  const secondBox = await secondTab.boundingBox()
  if (!firstBox || !secondBox) throw new Error("tab not found")

  await page.mouse.move(firstBox.x + firstBox.width / 2, firstBox.y + firstBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(secondBox.x + secondBox.width + 5, secondBox.y + secondBox.height / 2, {
    steps: 8,
  })
  await page.mouse.up()

  await expect
    .poll(async () => (await readDoc(page))?.pages.map((p) => p.id))
    .toEqual([secondId, firstId])
})
