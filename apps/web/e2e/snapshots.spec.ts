import { expect, test, type Page } from "@playwright/test"
import { dragOnCanvas, parseStoredScene } from "./_helpers"

type Doc = { pages: { elements: { isDeleted?: boolean }[] }[] }

const liveCount = (doc: Doc): number =>
  doc.pages.flatMap((p) => p.elements).filter((e) => !e.isDeleted).length

async function storedLiveCount(page: Page): Promise<number> {
  const data = parseStoredScene<{ isDeleted?: boolean }>(
    await page.evaluate(() => localStorage.getItem("excalidraw-scene")),
  )
  return data.elements.filter((e) => !e.isDeleted).length
}

// Reads every snapshot straight from IndexedDB.
async function readSnapshots(page: Page): Promise<{ name: string; document: Doc }[]> {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open("excalidraw-clone")
        req.onerror = () => reject(new Error(String(req.error)))
        req.onsuccess = () => {
          const db = req.result
          const all = db.transaction("snapshots").objectStore("snapshots").getAll()
          all.onsuccess = () => {
            db.close()
            resolve(all.result)
          }
          all.onerror = () => reject(new Error(String(all.error)))
        }
      }),
  )
}

async function drawRect(page: Page, x: number): Promise<void> {
  await page.locator('[data-testid="toolbar-rectangle"]').click()
  await dragOnCanvas(page, { x, y: 200 }, { x: x + 80, y: 280 })
  await page.locator('[data-testid="toolbar-selection"]').click()
}

async function openSnapshots(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Menu" }).click()
  await page.getByRole("menuitem", { name: "Snapshots…" }).click()
}

test("snapshots: save, restore (with a Before restore checkpoint), survive reload", async ({
  page,
}) => {
  await page.goto("/")
  await page.evaluate(() => {
    localStorage.clear()
    indexedDB.deleteDatabase("excalidraw-clone")
  })
  await page.reload()

  await drawRect(page, 150)
  await openSnapshots(page)
  await page.getByTestId("snapshots-name").fill("One rect")
  await page.getByTestId("snapshots-save").click()
  await expect(page.getByTestId("snapshot-row")).toHaveCount(1)
  await page.keyboard.press("Escape")

  await drawRect(page, 350)
  await expect.poll(() => storedLiveCount(page)).toBe(2)

  await openSnapshots(page)
  await page.getByTestId("snapshot-restore").click()
  await expect(page.getByText(/can't be undone with Undo/)).toBeVisible()
  await page.getByTestId("snapshot-restore-confirm").click()

  await expect.poll(() => storedLiveCount(page)).toBe(1)
  const snaps = await readSnapshots(page)
  const before = snaps.find((s) => s.name === "Before restore")
  expect(before).toBeDefined()
  expect(liveCount(before!.document)).toBe(2)

  // Restoring is not on the undo stack.
  await page.keyboard.press("Control+z")
  await page.waitForTimeout(700)
  expect(await storedLiveCount(page)).toBe(1)

  await page.reload()
  await openSnapshots(page)
  await expect(page.getByTestId("snapshot-row")).toHaveCount(2)
  await expect(page.getByTestId("snapshot-row").first()).toContainText("Before restore")
})
