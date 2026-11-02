import { expect, test, type Page } from "@playwright/test"
import JSZip from "jszip"
import { readFileSync } from "node:fs"
import { inflateSync } from "node:zlib"
import { dragOnCanvas, drawRect, freshCanvas } from "./_helpers"

type ExportedPNG = { filename: string; width: number; height: number; bytes: Buffer }
type ExportedPDF = { filename: string; width: number; height: number; bytes: Buffer }

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

/** Every page's MediaBox size, in page order (page dictionaries are never
 *  compressed, so the raw bytes can be scanned). */
const pdfMediaBoxes = (bytes: Buffer): { width: number; height: number }[] =>
  [
    ...bytes
      .toString("latin1")
      .matchAll(/\/MediaBox \[\s*([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s*\]/g),
  ].map((m) => {
    const [x0, y0, x1, y1] = m.slice(1).map(Number) as [number, number, number, number]
    return { width: x1 - x0, height: y1 - y0 }
  })

/** Click Export and read the downloaded PDF's name and its single page's size. */
const exportPDF = async (page: Page): Promise<ExportedPDF> => {
  const downloadPromise = page.waitForEvent("download")
  await exportButton(page).click()
  const download = await downloadPromise
  const bytes = readFileSync(await download.path())
  expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-")
  const boxes = pdfMediaBoxes(bytes)
  expect(boxes).toHaveLength(1) // one page
  return { filename: download.suggestedFilename(), ...boxes[0]!, bytes }
}

/** Every Flate-compressed stream of a PDF, inflated and concatenated. */
const pdfStreams = (bytes: Buffer): string => {
  const latin = bytes.toString("latin1")
  const out: string[] = []
  for (const m of latin.matchAll(/(?<!end)stream\r?\n/g)) {
    const start = m.index + m[0].length
    const end = latin.indexOf("endstream", start)
    try {
      out.push(inflateSync(bytes.subarray(start, end)).toString("latin1"))
    } catch {
      // not a Flate stream
    }
  }
  return out.join("\n")
}

/** Every string a PDF draws with Tj, decoded to Unicode: literal `(…)` strings
 *  as-is, and embedded-font `<hex>` glyph strings through the fonts' ToUnicode
 *  CMaps (so this proves the text is real, extractable text). */
const pdfTexts = (bytes: Buffer): string[] => {
  const streams = pdfStreams(bytes)
  const toUnicode = new Map<string, string>()
  for (const block of streams.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const [, gid, uni] of block[1]!.matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) {
      toUnicode.set(gid!.toLowerCase(), String.fromCharCode(parseInt(uni!, 16)))
    }
  }
  return [...streams.matchAll(/(?:\(([^)]*)\)|<([0-9a-fA-F]+)>) Tj/g)].map(([, literal, hex]) =>
    literal !== undefined
      ? literal
      : (hex!.toLowerCase().match(/.{4}/g) ?? []).map((g) => toUnicode.get(g) ?? "?").join(""),
  )
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

test("PDF export is one vector page sized like the PNG, for the page or the selection", async ({
  page,
}) => {
  await freshCanvas(page)
  await drawTwoRectsAndSelectFirst(page)

  await openExportDialog(page)
  await page.locator('[data-testid="format-pdf"]').click()
  // Scale has no meaning for a content-sized vector page.
  await expect(page.locator('[data-testid="scale-1"]')).toHaveCount(0)
  const whole = await exportPDF(page)
  expect(whole.filename).toBe("Page 1.pdf")
  // Same box as the PNG test above: bbox 400×280 plus 20px padding per side.
  expectNear(whole.width, 440)
  expectNear(whole.height, 320)
  // Shapes are drawn as vector paths, not an embedded raster.
  expect(whole.bytes.toString("latin1")).not.toContain("/Subtype /Image")

  await openExportDialog(page)
  await page.locator('[data-testid="format-pdf"]').click()
  await page.locator('[data-testid="scope-selection"]').click()
  const selection = await exportPDF(page)
  expect(selection.filename).toBe("Page 1-selection.pdf")
  expectNear(selection.width, 100)
  expectNear(selection.height, 100)
})

test("PDF export keeps text as real PDF text", async ({ page }) => {
  await freshCanvas(page)
  const canvas = page.locator("canvas").first()
  const box = await canvas.boundingBox()
  if (!box) throw new Error("canvas not found")
  await page.locator('[data-testid="toolbar-text"]').click()
  await page.mouse.click(box.x + 200, box.y + 200)
  const editor = page.locator("textarea")
  await editor.waitFor({ state: "visible" })
  await page.keyboard.type("hello pdf")
  await editor.blur()
  await page.waitForTimeout(300)

  await openExportDialog(page)
  await page.locator('[data-testid="format-pdf"]').click()
  const pdf = await exportPDF(page)
  expect(pdf.filename).toBe("Page 1.pdf")
  // The default hand-drawn family embeds Caveat (TrueType) instead of a Times fallback.
  const raw = pdf.bytes.toString("latin1")
  expect(raw).toContain("/BaseFont /Caveat")
  expect(raw).toContain("/FontFile2")
  expect(raw).not.toContain("/Times-Roman")
  expect(pdfTexts(pdf.bytes)).toContain("hello pdf")
})

test("PDF export of a table draws its grid and cell text as vector + real text", async ({
  page,
}) => {
  await freshCanvas(page)
  await page.locator('[data-testid="toolbar-more-shapes"]').click()
  await page.locator('[data-testid="toolbar-table"]').click()
  await dragOnCanvas(page, { x: 100, y: 100 }, { x: 400, y: 220 })
  await page.waitForTimeout(120)
  const box = await page.locator("canvas").first().boundingBox()
  if (!box) throw new Error("canvas not found")
  await page.mouse.dblclick(box.x + 150, box.y + 120)
  await page.keyboard.type("Name")
  await page.keyboard.press("Tab")
  await page.keyboard.type("Qty")
  await page.keyboard.press("Enter") // row 1, col 1
  await page.keyboard.type("bold")
  await page.keyboard.press("Control+a")
  await page.keyboard.press("Control+b")
  await page.keyboard.press("Escape")
  // a gradient background (the fill must be non-transparent to show it)
  await page.locator('[data-testid="bg-ffc9c9"]').click()
  await page.locator('[data-testid="gradient-toggle"]').click()
  await page.waitForTimeout(300)

  await openExportDialog(page)
  await page.locator('[data-testid="format-pdf"]').click()
  const pdf = await exportPDF(page)
  // 300x120 table + 20px padding per side (stroke may add a pixel or two)
  expectNear(pdf.width, 340)
  expectNear(pdf.height, 160)
  expect(pdf.bytes.toString("latin1")).not.toContain("/Subtype /Image")
  const texts = pdfTexts(pdf.bytes)
  expect(texts).toContain("Name")
  expect(texts).toContain("Qty")
  expect(texts).toContain("bold")
  // Every string here is bold (header row + the bolded cell), so the one embedded
  // face must be Caveat Bold: its FontBBox is the bold TTF's head-table bbox
  // (Caveat Regular's is [-111 -290 911 960]).
  const raw = pdf.bytes.toString("latin1")
  expect(raw.match(/\/FontFile2/g)).toHaveLength(1)
  expect(raw).toContain("/FontBBox [-118 -290 984 960]")
  // the gradient background is a real axial shading, not flattened
  expect(pdf.bytes.toString("latin1")).toMatch(/\/ShadingType 2/)
})

test("export all pages downloads a zip with one entry per page", async ({ page }) => {
  await freshCanvas(page)
  await drawRect(page, { x: 100, y: 100 }, { x: 160, y: 160 }) // page 1

  await page.locator('[data-testid="page-add"]').click()
  await expect(page.locator('[data-testid^="page-tab-"]')).toHaveCount(2)
  await drawRect(page, { x: 100, y: 100 }, { x: 400, y: 300 }) // page 2
  await page.locator('[data-testid="toolbar-selection"]').click()
  await page.waitForTimeout(120)

  await openExportDialog(page)
  await page.locator('[data-testid="format-svg"]').click()
  await expect(page.locator('[data-testid="export-all-pages"]')).toBeVisible()
  await page.locator('[data-testid="export-all-pages"]').check()
  await expect(page.locator('[data-testid="export-page"]')).toHaveCount(0)

  const downloadPromise = page.waitForEvent("download")
  await exportButton(page).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe("export.zip")
  const bytes = readFileSync(await download.path())
  const zip = await JSZip.loadAsync(bytes)
  expect(Object.keys(zip.files).sort()).toEqual(["Page 1.svg", "Page 2.svg"])
  const page1Svg = await zip.file("Page 1.svg")?.async("text")
  expect(page1Svg).toContain("<svg")
})

test("export all pages disambiguates pages that share a name", async ({ page }) => {
  await freshCanvas(page)
  await drawRect(page, { x: 100, y: 100 }, { x: 160, y: 160 })
  await page.locator('[data-testid="page-add"]').click()
  await expect(page.locator('[data-testid^="page-tab-"]')).toHaveCount(2)
  const secondId = (await page
    .locator('[data-testid^="page-tab-"]')
    .nth(1)
    .getAttribute("data-testid"))!.replace("page-tab-", "")

  // Rename page 2 to "Page 1" so both pages share a name.
  await page.locator(`[data-testid="page-switch-${secondId}"]`).dblclick()
  const input = page.locator(`[data-testid="page-rename-input-${secondId}"]`)
  await input.fill("Page 1")
  await input.press("Enter")
  await expect(input).toHaveCount(0)

  await openExportDialog(page)
  await page.locator('[data-testid="export-all-pages"]').check()
  const downloadPromise = page.waitForEvent("download")
  await exportButton(page).click()
  const bytes = readFileSync(await (await downloadPromise).path())
  const zip = await JSZip.loadAsync(bytes)
  expect(Object.keys(zip.files).sort()).toEqual(["Page 1 (2).png", "Page 1.png"])
})

test("export all pages as PDF downloads one multi-page export.pdf", async ({ page }) => {
  await freshCanvas(page)
  await drawRect(page, { x: 100, y: 100 }, { x: 160, y: 160 }) // page 1: 60×60

  await page.locator('[data-testid="page-add"]').click()
  await expect(page.locator('[data-testid^="page-tab-"]')).toHaveCount(2)
  await drawRect(page, { x: 100, y: 100 }, { x: 400, y: 300 }) // page 2: 300×200
  await page.locator('[data-testid="toolbar-selection"]').click()
  await page.waitForTimeout(120)

  await openExportDialog(page)
  await page.locator('[data-testid="format-pdf"]').click()
  await page.locator('[data-testid="export-all-pages"]').check()

  const downloadPromise = page.waitForEvent("download")
  await exportButton(page).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe("export.pdf")
  const bytes = readFileSync(await download.path())
  expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-")

  // One PDF page per scene page, in page order, each sized to its own
  // content (bbox + 20px padding per side), not a uniform page size.
  const boxes = pdfMediaBoxes(bytes)
  expect(boxes).toHaveLength(2)
  expectNear(boxes[0]!.width, 100)
  expectNear(boxes[0]!.height, 100)
  expectNear(boxes[1]!.width, 340)
  expectNear(boxes[1]!.height, 240)
  expect(boxes[0]!.width).not.toBe(boxes[1]!.width)
  // Still vector output.
  expect(bytes.toString("latin1")).not.toContain("/Subtype /Image")
})

test("SVG export embeds Caveat only when hand-drawn text is present", async ({ page }) => {
  const exportSVG = async (): Promise<string> => {
    await openExportDialog(page)
    await page.locator('[data-testid="format-svg"]').click()
    const downloadPromise = page.waitForEvent("download")
    await exportButton(page).click()
    const svg = readFileSync(await (await downloadPromise).path(), "utf8")
    await page.keyboard.press("Escape")
    return svg
  }
  await freshCanvas(page)
  await drawRect(page, { x: 100, y: 100 }, { x: 160, y: 160 })
  const plain = await exportSVG()
  expect(plain).not.toContain("@font-face")

  const box = await page.locator("canvas").first().boundingBox()
  if (!box) throw new Error("canvas not found")
  await page.locator('[data-testid="toolbar-text"]').click()
  await page.mouse.click(box.x + 300, box.y + 300)
  await page.locator("textarea").waitFor({ state: "visible" })
  await page.keyboard.type("hand drawn")
  await page.locator("textarea").blur()
  await page.waitForTimeout(300)
  const withText = await exportSVG()
  expect(withText).toContain('<defs><style>@font-face{font-family:"Caveat"')
  expect(withText).toContain("data:font/woff2;base64,")
})

test("italic hand-drawn text uses the oblique Caveat face on canvas, in SVG and in PDF", async ({
  page,
}) => {
  await freshCanvas(page)
  const box = await page.locator("canvas").first().boundingBox()
  if (!box) throw new Error("canvas not found")
  await page.locator('[data-testid="toolbar-text"]').click()
  await page.mouse.click(box.x + 200, box.y + 200)
  await page.locator("textarea").waitFor({ state: "visible" })
  await page.keyboard.type("slanted")
  await page.keyboard.press("ControlOrMeta+a")
  await page.keyboard.press("ControlOrMeta+i")
  await page.locator("textarea").blur()
  await page.waitForTimeout(300)

  // Canvas: the oblique face is fetched and loaded (no browser-faked slant).
  await expect
    .poll(() =>
      page.evaluate(() =>
        [...document.fonts].some(
          (f) => f.family.includes("Caveat") && f.style === "italic" && f.status === "loaded",
        ),
      ),
    )
    .toBe(true)

  await openExportDialog(page)
  await page.locator('[data-testid="format-svg"]').click()
  const svgDownload = page.waitForEvent("download")
  await exportButton(page).click()
  const svg = readFileSync(await (await svgDownload).path(), "utf8")
  expect(svg).toContain('font-family:"Caveat";font-style:italic;font-weight:400;unicode-range:')
  await page.keyboard.press("Escape")

  await openExportDialog(page)
  await page.locator('[data-testid="format-pdf"]').click()
  const pdf = await exportPDF(page)
  const raw = pdf.bytes.toString("latin1")
  // Only the oblique face is used: its FontBBox is the skewed outlines' bbox
  // (upright Caveat Regular's is [-111 -290 911 960]).
  expect(raw.match(/\/FontFile2/g)).toHaveLength(1)
  expect(raw).toContain("/FontBBox [-134 -290 1115 960]")
  expect(raw).toContain("/ItalicAngle -12")
  expect(pdfTexts(pdf.bytes)).toContain("slanted")
})
