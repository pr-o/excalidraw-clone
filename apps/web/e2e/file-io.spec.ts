import { expect, test } from "@playwright/test"
import { dragOnCanvas } from "./_helpers"

test("save as → open round-trips the scene", async ({ page }) => {
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
  const data = JSON.parse(
    (await page.evaluate(() => localStorage.getItem("excalidraw-scene")))!,
  ) as { elements: { type: string }[] }
  expect(data.elements[0]?.type).toBe("diamond")
})
