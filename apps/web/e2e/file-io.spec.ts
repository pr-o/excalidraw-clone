import { expect, test } from "@playwright/test"
import { dragOnCanvas, parseStoredScene } from "./_helpers"

test("save as → open round-trips the scene (browsers without file handles)", async ({ page }) => {
  // Without the File System Access API, "Save as" downloads and "Open" uses a file input.
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>
    delete w.showSaveFilePicker
    delete w.showOpenFilePicker
  })
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-diamond"]').click()
  await dragOnCanvas(page, { x: 50, y: 50 }, { x: 200, y: 200 })

  const downloadPromise = page.waitForEvent("download")
  await page.getByRole("button", { name: /menu/i }).click()
  await page.getByText("Save as…").click()
  const download = await downloadPromise
  const path = await download.path()
  expect(path).toBeTruthy()

  await page.evaluate(() => localStorage.clear())
  await page.reload()

  const fileChooserPromise = page.waitForEvent("filechooser")
  await page.getByRole("button", { name: /menu/i }).click()
  await page.getByText("Open…").click()
  const chooser = await fileChooserPromise
  await chooser.setFiles(path)

  await page.waitForTimeout(700)
  const data = parseStoredScene<{ type: string }>(
    await page.evaluate(() => localStorage.getItem("excalidraw-scene")),
  )
  expect(data.elements[0]?.type).toBe("diamond")
})
