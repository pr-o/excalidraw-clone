import { expect, test } from "@playwright/test"
import { freshCanvas } from "./_helpers"

test("the self-hosted Caveat font is declared and loads", async ({ page }) => {
  await freshCanvas(page)
  // The CSS pipeline can silently drop a malformed @font-face; this catches that.
  const loaded = await page.evaluate(async () => {
    const faces = await document.fonts.load('20px "Caveat"')
    return faces.map((f) => f.status)
  })
  expect(loaded).toContain("loaded")
})
