import { expect, test, type Page } from "@playwright/test"

type SceneEl = {
  id: string
  type: string
  fileId?: string | null
  isDeleted?: boolean
}

const readScene = async (page: Page): Promise<SceneEl[]> => {
  const json = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  const data = JSON.parse(json!) as { elements: SceneEl[] }
  return data.elements.filter((e) => !e.isDeleted)
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

test("placing an uploaded image renders it and persists its fileId", async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-image"]').waitFor({ state: "visible" })

  const png = await redPngBuffer(page)
  const chooserPromise = page.waitForEvent("filechooser")
  await page.locator('[data-testid="toolbar-image"]').click()
  const chooser = await chooserPromise
  await chooser.setFiles({ name: "red.png", mimeType: "image/png", buffer: png })

  // Upload → IndexedDB → imageReady puts the tool in "placing"; click to place.
  await page.waitForTimeout(300)
  const canvas = page.locator("canvas").first()
  const box = await canvas.boundingBox()
  if (!box) throw new Error("canvas not found")
  await page.mouse.click(box.x + 200, box.y + 150)
  await page.waitForTimeout(700)

  const images = (await readScene(page)).filter((e) => e.type === "image")
  expect(images).toHaveLength(1)
  expect(images[0]!.fileId).toBeTruthy()

  // The 200×200 placement at (200,150) centers on (300,250): assert red pixels
  // on the main canvas — the regression guard the original bug lacked.
  const pixel = await page.evaluate(() => {
    const c = document.querySelector("canvas")!
    const ctx = c.getContext("2d")!
    const d = ctx.getImageData(300, 250, 1, 1).data
    return [d[0], d[1], d[2]]
  })
  expect(pixel[0]!).toBeGreaterThan(150)
  expect(pixel[1]!).toBeLessThan(100)
  expect(pixel[2]!).toBeLessThan(100)
})
