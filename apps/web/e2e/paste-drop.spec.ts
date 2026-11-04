import { expect, test, type Page } from "@playwright/test"
import { freshCanvas, readScene, redPngBuffer } from "./_helpers"

type El = { id: string; type: string; fileId?: string | null; isDeleted?: boolean }

/** Dispatches a drop of `files` (name, type, base64 body) on the canvas at (x, y). */
async function dropFiles(
  page: Page,
  files: { name: string; type: string; base64: string }[],
  at = { x: 300, y: 250 },
): Promise<void> {
  await page.evaluate(
    ({ files, at }) => {
      const dt = new DataTransfer()
      for (const f of files) {
        const bytes = Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0))
        dt.items.add(new File([bytes], f.name, { type: f.type }))
      }
      const canvas = document.querySelector("canvas[data-main-canvas]")!
      const r = canvas.getBoundingClientRect()
      const init = { dataTransfer: dt, bubbles: true, cancelable: true }
      const point = { clientX: r.left + at.x, clientY: r.top + at.y }
      canvas.dispatchEvent(new DragEvent("dragover", { ...init, ...point }))
      canvas.dispatchEvent(new DragEvent("drop", { ...init, ...point }))
    },
    { files, at },
  )
}

const redPixelAt = (page: Page, x: number, y: number) =>
  page.evaluate(
    ([px, py]) => {
      const d = document
        .querySelector<HTMLCanvasElement>("canvas[data-main-canvas]")!
        .getContext("2d")!
        .getImageData(px!, py!, 1, 1).data
      return d[0]! > 150 && d[1]! < 100 && d[2]! < 100
    },
    [x, y],
  )

test("pasting a screenshot inserts it as an image", async ({ page }) => {
  await freshCanvas(page)
  const base64 = (await redPngBuffer(page)).toString("base64")
  await page.evaluate((b64) => {
    const dt = new DataTransfer()
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    dt.items.add(new File([bytes], "image.png", { type: "image/png" }))
    document.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }),
    )
  }, base64)
  await expect
    .poll(async () => (await readScene<El>(page)).filter((e) => e.type === "image"))
    .toHaveLength(1)
  const [img] = (await readScene<El>(page)).filter((e) => e.type === "image")
  expect(img!.fileId).toBeTruthy()
})

test("dropping an image puts it where it was dropped", async ({ page }) => {
  await freshCanvas(page)
  const base64 = (await redPngBuffer(page)).toString("base64")
  await dropFiles(page, [{ name: "red.png", type: "image/png", base64 }], { x: 300, y: 250 })
  await expect
    .poll(async () => (await readScene<El>(page)).filter((e) => e.type === "image"))
    .toHaveLength(1)
  // The 8×8 image is centred on the drop point.
  await expect.poll(() => redPixelAt(page, 300, 250)).toBe(true)
})

test("dropping a .excalidraw file opens it, after confirming over existing work", async ({
  page,
}) => {
  await freshCanvas(page)
  const rect = (id: string, x: number) => ({
    id,
    type: "rectangle",
    x,
    y: 50,
    width: 80,
    height: 40,
    angle: 0,
    strokeColor: "#1e1e1e",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: null,
    seed: 1,
    versionNonce: 1,
    isDeleted: false,
    boundElements: null,
    updated: 1,
    link: null,
    locked: false,
  })
  const doc = (ids: string[]) =>
    Buffer.from(
      JSON.stringify({
        type: "excalidraw",
        version: 3,
        source: "test",
        activePageId: "p",
        pages: [{ id: "p", name: "Dropped", elements: ids.map((id, i) => rect(id, 50 + i * 120)) }],
      }),
    ).toString("base64")

  await dropFiles(page, [{ name: "a.excalidraw", type: "", base64: doc(["one", "two"]) }])
  await expect
    .poll(async () => (await readScene<El>(page)).map((e) => e.id).sort())
    .toEqual(["one", "two"])

  // Now there is work to replace: declining keeps it, accepting replaces it.
  page.once("dialog", (d) => void d.dismiss())
  await dropFiles(page, [{ name: "b.excalidraw", type: "", base64: doc(["three"]) }])
  await page.waitForTimeout(800)
  expect((await readScene<El>(page)).map((e) => e.id).sort()).toEqual(["one", "two"])

  page.once("dialog", (d) => void d.accept())
  await dropFiles(page, [{ name: "b.excalidraw", type: "", base64: doc(["three"]) }])
  await expect.poll(async () => (await readScene<El>(page)).map((e) => e.id)).toEqual(["three"])
})

test("dropping a .excalidrawlib adds it to the library", async ({ page }) => {
  await freshCanvas(page)
  const lib = Buffer.from(
    JSON.stringify({
      type: "excalidrawlib",
      version: 2,
      source: "test",
      files: {},
      libraryItems: [
        {
          id: "item-1",
          name: "Box",
          created: 1,
          elements: [{ id: "e1", type: "rectangle", x: 0, y: 0, width: 40, height: 40 }],
        },
      ],
    }),
  ).toString("base64")
  await dropFiles(page, [{ name: "shapes.excalidrawlib", type: "", base64: lib }])
  await expect(page.getByTestId("notice-toast")).toBeVisible()
  const count = await page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open("excalidraw-clone")
        open.onerror = () => reject(new Error(String(open.error)))
        open.onsuccess = () => {
          const req = open.result.transaction("library_items").objectStore("library_items").count()
          req.onsuccess = () => resolve(req.result)
        }
      }),
  )
  expect(count).toBe(1)
})
