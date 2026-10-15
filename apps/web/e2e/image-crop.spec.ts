import { expect, test, type Page } from "@playwright/test"
import { readFileSync } from "node:fs"
import { inflateSync } from "node:zlib"
import { dragOnCanvas, parseStoredScene } from "./_helpers"

type SceneEl = {
  id: string
  type: string
  x: number
  width: number
  isDeleted?: boolean
  crop?: { x: number; y: number; width: number; height: number } | null
}

const readImages = async (page: Page): Promise<SceneEl[]> => {
  const json = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  return parseStoredScene<SceneEl>(json).elements.filter((e) => e.type === "image" && !e.isDeleted)
}

const redPngBuffer = async (page: Page): Promise<Buffer> => {
  const dataURL = await page.evaluate(() => {
    const c = document.createElement("canvas")
    c.width = 8
    c.height = 8
    const ctx = c.getContext("2d")!
    ctx.fillStyle = "#ff0000"
    ctx.fillRect(0, 0, 8, 8)
    return c.toDataURL("image/png")
  })
  return Buffer.from(dataURL.split(",")[1]!, "base64")
}

const pixelAt = (page: Page, x: number, y: number) =>
  page.evaluate(
    ([px, py]) => {
      const d = document
        .querySelector("canvas")!
        .getContext("2d")!
        .getImageData(px!, py!, 1, 1).data
      return [d[0]!, d[1]!, d[2]!]
    },
    [x, y],
  )

/** Upload the 8×8 red PNG, place it 200×200 at (200,150), crop 60px off its west side. */
const placeAndCropImage = async (page: Page): Promise<void> => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-image"]').waitFor({ state: "visible" })

  const chooserPromise = page.waitForEvent("filechooser")
  await page.locator('[data-testid="toolbar-image"]').click()
  const chooser = await chooserPromise
  await chooser.setFiles({
    name: "red.png",
    mimeType: "image/png",
    buffer: await redPngBuffer(page),
  })
  await page.waitForTimeout(300)
  const box = (await page.locator("canvas").first().boundingBox())!
  await page.mouse.click(box.x + 200, box.y + 150) // image now spans (200,150)-(400,350)
  await page.waitForTimeout(500)

  // Enter crop mode, drag the west handle 60px inward, leave with Escape.
  await page.mouse.dblclick(box.x + 300, box.y + 250)
  await page.waitForTimeout(100)
  await dragOnCanvas(page, { x: 200, y: 250 }, { x: 260, y: 250 })
  await page.keyboard.press("Escape")
  await page.waitForTimeout(700)
}

test("double-click crops an image from its west handle; persisted and rendered", async ({
  page,
}) => {
  await placeAndCropImage(page)

  const [img] = await readImages(page)
  expect(img!.x).toBeCloseTo(260, 0)
  expect(img!.width).toBeCloseTo(140, 0)
  expect(img!.crop!.x).toBeCloseTo(0.3, 2)
  expect(img!.crop!.width).toBeCloseTo(0.7, 2)

  // Cropped-away strip is background (white); the kept part is still red.
  const gone = await pixelAt(page, 230, 250)
  const kept = await pixelAt(page, 330, 250)
  expect(gone[1]!).toBeGreaterThan(200)
  expect(kept[0]!).toBeGreaterThan(150)
  expect(kept[1]!).toBeLessThan(100)

  // Survives a reload.
  await page.reload()
  await page.waitForTimeout(500)
  const [after] = await readImages(page)
  expect(after!.crop!.x).toBeCloseTo(0.3, 2)
})

const exportAs = async (page: Page, format: "svg" | "pdf"): Promise<Buffer> => {
  await page.getByRole("button", { name: /menu/i }).click()
  await page.getByText("Export image…").click()
  await page.locator(`[data-testid="format-${format}"]`).click()
  const downloadPromise = page.waitForEvent("download")
  await page.getByRole("button", { name: "Export", exact: true }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe(`Page 1.${format}`)
  return readFileSync(await download.path())
}

test("a cropped image exports clipped to SVG and exports to PDF", async ({ page }) => {
  await placeAndCropImage(page)

  const svg = (await exportAs(page, "svg")).toString("utf8")
  expect(svg).toMatch(/<clipPath id="crop-[^"]+"/)
  expect(svg).toMatch(/<image[^>]*clip-path="url\(#crop-/)

  const pdf = await exportAs(page, "pdf")
  const latin = pdf.toString("latin1")
  expect(latin.startsWith("%PDF-")).toBe(true)
  expect(latin).toContain("/Subtype /Image")
  // svg2pdf turns the clip-path into a 140×200 clip (`W n`) set before the image is drawn.
  const start = latin.search(/stream\r?\n/) + latin.match(/stream\r?\n/)![0].length
  const content = inflateSync(pdf.subarray(start, latin.indexOf("endstream", start))).toString(
    "latin1",
  )
  expect(content).toMatch(/140\. 0\. l\n140\. 200\. l\n0\. 200\. l\nh\nW\nn[\s\S]*\/I0 Do/)
})
