import { expect, test } from "@playwright/test"
import { dragOnCanvas, parseStoredScene } from "./_helpers"

test("eyedropper applies the picked colour to the selected shape's stroke", async ({ page }) => {
  // Playwright cannot drive the native sampler, so stub it.
  await page.addInitScript(() => {
    ;(window as unknown as { EyeDropper: unknown }).EyeDropper = class {
      open() {
        return Promise.resolve({ sRGBHex: "#12ab34" })
      }
    }
  })
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-rectangle"]').click()
  await dragOnCanvas(page, { x: 300, y: 200 }, { x: 420, y: 300 })
  await page.locator('[data-testid="stroke-eyedropper"]').click()
  await page.waitForTimeout(700)

  const json = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  const els = parseStoredScene<{ type: string; strokeColor: string; isDeleted?: boolean }>(
    json,
  ).elements.filter((e) => !e.isDeleted)
  expect(els).toHaveLength(1)
  expect(els[0]!.strokeColor).toBe("#12ab34")
})
