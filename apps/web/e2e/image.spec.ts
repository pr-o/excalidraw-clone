import { expect, test } from "@playwright/test"
import { readScene, redPngBuffer } from "./_helpers"

type SceneEl = {
  id: string
  type: string
  fileId?: string | null
  isDeleted?: boolean
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

  const images = (await readScene<SceneEl>(page)).filter((e) => e.type === "image")
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

test("a placed image is drawn again after a page reload", async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-image"]').waitFor({ state: "visible" })

  const png = await redPngBuffer(page)
  const chooserPromise = page.waitForEvent("filechooser")
  await page.locator('[data-testid="toolbar-image"]').click()
  const chooser = await chooserPromise
  await chooser.setFiles({ name: "red.png", mimeType: "image/png", buffer: png })
  await page.waitForTimeout(300)
  const box = await page.locator("canvas").first().boundingBox()
  if (!box) throw new Error("canvas not found")
  await page.mouse.click(box.x + 200, box.y + 150)
  // Past the 500ms auto-save debounce, then reload: the scene comes from localStorage
  // and the image binary from IndexedDB.
  await page.waitForTimeout(1000)
  await page.reload()
  await page.locator('[data-testid="toolbar-image"]').waitFor({ state: "visible" })

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const c = document.querySelector("canvas")!
        const d = c.getContext("2d")!.getImageData(300, 250, 1, 1).data
        return d[0]! > 150 && d[1]! < 100 && d[2]! < 100
      }),
    )
    .toBe(true)
})

test("a placed image is still drawn after switching to another page and back", async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-image"]').waitFor({ state: "visible" })

  const png = await redPngBuffer(page)
  const chooserPromise = page.waitForEvent("filechooser")
  await page.locator('[data-testid="toolbar-image"]').click()
  const chooser = await chooserPromise
  await chooser.setFiles({ name: "red.png", mimeType: "image/png", buffer: png })
  await page.waitForTimeout(300)
  const box = await page.locator("canvas").first().boundingBox()
  if (!box) throw new Error("canvas not found")
  await page.mouse.click(box.x + 200, box.y + 150)
  await page.waitForTimeout(500)

  await page.locator('[data-testid="page-add"]').click()
  await page.waitForTimeout(400)
  await page.locator('[data-testid^="page-switch-"]').first().click()
  await page.waitForTimeout(400)

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const c = document.querySelector("canvas")!
        const d = c.getContext("2d")!.getImageData(300, 250, 1, 1).data
        return d[0]! > 150 && d[1]! < 100 && d[2]! < 100
      }),
    )
    .toBe(true)
})

test("on startup, old unreferenced images are cleaned up and used ones are kept", async ({
  page,
}) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-image"]').waitFor({ state: "visible" })

  const png = await redPngBuffer(page)
  const chooserPromise = page.waitForEvent("filechooser")
  await page.locator('[data-testid="toolbar-image"]').click()
  const chooser = await chooserPromise
  await chooser.setFiles({ name: "red.png", mimeType: "image/png", buffer: png })
  await page.waitForTimeout(300)
  const box = await page.locator("canvas").first().boundingBox()
  if (!box) throw new Error("canvas not found")
  await page.mouse.click(box.x + 200, box.y + 150)
  await page.waitForTimeout(1000)

  // A day-old picture that no element uses (a deleted image's leftover).
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("excalidraw-clone")
        open.onerror = () => reject(new Error(String(open.error)))
        open.onsuccess = () => {
          const tx = open.result.transaction("files", "readwrite")
          tx.objectStore("files").put({
            id: "orphan",
            mimeType: "image/png",
            dataURL: "data:image/png;base64,AAAA",
            created: 1,
          })
          tx.oncomplete = () => resolve()
          tx.onerror = () => reject(new Error(String(tx.error)))
        }
      }),
  )
  const storedIds = (): Promise<string[]> =>
    page.evaluate(
      () =>
        new Promise<string[]>((resolve, reject) => {
          const open = indexedDB.open("excalidraw-clone")
          open.onerror = () => reject(new Error(String(open.error)))
          open.onsuccess = () => {
            const req = open.result.transaction("files").objectStore("files").getAllKeys()
            req.onsuccess = () => resolve((req.result as string[]).sort())
            req.onerror = () => reject(new Error(String(req.error)))
          }
        }),
    )
  expect(await storedIds()).toContain("orphan")

  await page.reload()
  await page.locator('[data-testid="toolbar-image"]').waitFor({ state: "visible" })
  await expect.poll(storedIds).not.toContain("orphan")
  expect((await storedIds()).length).toBe(1)
})
