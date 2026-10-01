import { expect, test, type Page } from "@playwright/test"
import { readFileSync } from "node:fs"
import { dragOnCanvas } from "./_helpers"

type Point = { x: number; y: number }
type ExportedPNG = { filename: string; width: number; height: number; bytes: Buffer }

const freshCanvas = async (page: Page): Promise<void> => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-rectangle"]').waitFor({ state: "visible" })
}

const drawRect = async (page: Page, from: Point, to: Point): Promise<void> => {
  await page.locator('[data-testid="toolbar-rectangle"]').click()
  await dragOnCanvas(page, from, to)
  await page.waitForTimeout(120)
}

/** Rect A (60×60 at 100,100) and rect B (100×80 at 400,300); then marquee-select A only. */
const drawTwoRectsAndSelectFirst = async (page: Page): Promise<void> => {
  await drawRect(page, { x: 100, y: 100 }, { x: 160, y: 160 })
  await drawRect(page, { x: 400, y: 300 }, { x: 500, y: 380 })
  await page.locator('[data-testid="toolbar-selection"]').click()
  await dragOnCanvas(page, { x: 80, y: 80 }, { x: 180, y: 180 })
  await page.waitForTimeout(150)
}

const exportButton = (page: Page) => page.getByRole("button", { name: "Export", exact: true })

const openExportDialog = async (page: Page): Promise<void> => {
  await page.getByRole("button", { name: /menu/i }).click()
  await page.getByText("Export image…").click()
  await expect(exportButton(page)).toBeVisible()
}

/** Click Export and read the downloaded PNG's name and IHDR dimensions. */
const exportPNG = async (page: Page): Promise<ExportedPNG> => {
  const downloadPromise = page.waitForEvent("download")
  await exportButton(page).click()
  const download = await downloadPromise
  const bytes = readFileSync(await download.path())
  expect(bytes.subarray(1, 4).toString("ascii")).toBe("PNG")
  return {
    filename: download.suggestedFilename(),
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    bytes,
  }
}

const expectNear = (actual: number, expected: number): void => {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(3)
}

const embeddedRectangleCount = (bytes: Buffer): number =>
  (bytes.toString("latin1").match(/"type":"rectangle"/g) ?? []).length

test("selection-only export renders just the selected elements' bounding box", async ({ page }) => {
  await freshCanvas(page)
  await drawTwoRectsAndSelectFirst(page)

  // Whole page (default): bbox x 100..500, y 100..380, plus 20px padding per side.
  await openExportDialog(page)
  await expect(page.locator('[data-testid="scope-page"]')).toHaveAttribute("aria-pressed", "true")
  const whole = await exportPNG(page)
  expect(whole.filename).toBe("Page 1.png")
  expectNear(whole.width, 440)
  expectNear(whole.height, 320)

  // Selection only: rect A alone, 60×60 plus padding.
  await openExportDialog(page)
  await page.locator('[data-testid="scope-selection"]').click()
  const selection = await exportPNG(page)
  expect(selection.filename).toBe("Page 1-selection.png")
  expectNear(selection.width, 100)
  expectNear(selection.height, 100)
})

test("embedded scene of a selection-only PNG contains only the selection", async ({ page }) => {
  await freshCanvas(page)
  await drawTwoRectsAndSelectFirst(page)

  await openExportDialog(page)
  await page.getByLabel(/Embed scene/).check()
  const whole = await exportPNG(page)
  expect(embeddedRectangleCount(whole.bytes)).toBe(2)

  await openExportDialog(page)
  await page.getByLabel(/Embed scene/).check()
  await page.locator('[data-testid="scope-selection"]').click()
  const selection = await exportPNG(page)
  expect(embeddedRectangleCount(selection.bytes)).toBe(1)
})

test("page picker exports a non-active page's content", async ({ page }) => {
  await freshCanvas(page)
  await drawRect(page, { x: 100, y: 100 }, { x: 160, y: 160 }) // page 1: 60×60

  await page.locator('[data-testid="page-add"]').click()
  await expect(page.locator('[data-testid^="page-tab-"]')).toHaveCount(2)
  await drawRect(page, { x: 100, y: 100 }, { x: 400, y: 300 }) // page 2: 300×200
  await page.locator('[data-testid="toolbar-selection"]').click()
  await page.keyboard.press("ControlOrMeta+a")

  const [page1Id, page2Id] = await page
    .locator('[data-testid^="page-tab-"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")!.replace("page-tab-", "")))

  await openExportDialog(page)
  const picker = page.locator('[data-testid="export-page"]')
  await expect(picker).toHaveValue(page2Id!)
  await expect(page.locator('[data-testid="scope-selection"]')).toBeVisible()

  // Picking another page hides the (page-local) selection toggle.
  await picker.selectOption(page1Id!)
  await expect(page.locator('[data-testid="scope-selection"]')).toHaveCount(0)
  const other = await exportPNG(page)
  expect(other.filename).toBe("Page 1.png")
  expectNear(other.width, 100)
  expectNear(other.height, 100)

  // Reopening defaults back to the active page.
  await openExportDialog(page)
  await expect(picker).toHaveValue(page2Id!)
  const active = await exportPNG(page)
  expect(active.filename).toBe("Page 2.png")
  expectNear(active.width, 340)
  expectNear(active.height, 240)
})

test("copy to clipboard writes a PNG of the selection even when SVG is chosen", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"])
  await freshCanvas(page)
  await drawTwoRectsAndSelectFirst(page)

  await openExportDialog(page)
  await page.locator('[data-testid="format-svg"]').click()
  await page.locator('[data-testid="scope-selection"]').click()
  await page.locator('[data-testid="export-copy"]').click()
  await expect(page.locator('[data-testid="export-copy-success"]')).toHaveText(
    "Copied to clipboard",
  )
  await expect(exportButton(page)).toBeVisible() // dialog stayed open

  await page.bringToFront()
  const clip = await page.evaluate(async () => {
    const [item] = await navigator.clipboard.read()
    const blob = await item!.getType("image/png")
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const view = new DataView(bytes.buffer)
    return {
      types: [...item!.types],
      signature: Array.from(bytes.slice(0, 8)),
      width: view.getUint32(16),
      height: view.getUint32(20),
    }
  })
  expect(clip.types).toContain("image/png")
  expect(clip.signature).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
  expectNear(clip.width, 100)
  expectNear(clip.height, 100)
})

test("a failed clipboard write shows an inline error and keeps the dialog usable", async ({
  page,
}) => {
  await freshCanvas(page)
  await drawRect(page, { x: 100, y: 100 }, { x: 160, y: 160 })
  await page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, "write", {
      configurable: true,
      value: () => Promise.reject(new DOMException("Write permission denied.", "NotAllowedError")),
    })
  })

  await openExportDialog(page)
  await page.locator('[data-testid="export-copy"]').click()
  // By test id, not getByRole("alert"): Next's dev route announcer also has role=alert.
  await expect(page.locator('[data-testid="export-copy-error"]')).toHaveText(
    "Couldn't copy to the clipboard. Your browser may not allow it — use Export instead.",
  )
  await expect(exportButton(page)).toBeVisible()

  const exported = await exportPNG(page)
  expect(exported.filename).toBe("Page 1.png")
})
