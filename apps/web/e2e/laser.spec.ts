import type { Page } from "@playwright/test"
import { expect, test } from "@playwright/test"
import { parseStoredScene } from "./_helpers"

async function pressed(page: Page, testId: string): Promise<string | null> {
  return page.locator(`[data-testid="${testId}"]`).getAttribute("aria-pressed")
}

test("laser trail leaves no persisted elements and the tool is sticky", async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-laser"]').waitFor({ state: "visible" })

  await page.locator('[data-testid="toolbar-laser"]').click()
  expect(await pressed(page, "toolbar-laser")).toBe("true")

  const box = await page.locator("canvas").first().boundingBox()
  if (!box) throw new Error("canvas not found")
  await page.mouse.move(box.x + 150, box.y + 150)
  for (let i = 0; i < 12; i += 1) {
    await page.mouse.move(box.x + 150 + i * 18, box.y + 150 + i * 7)
  }
  await page.waitForTimeout(200)
  // Visual aid for debugging the trail; `test-results/` is gitignored.
  await page.screenshot({ path: "test-results/_laser.png" })

  // sticky: still the active tool after the sweep
  expect(await pressed(page, "toolbar-laser")).toBe("true")

  // ephemeral: nothing landed in the scene
  const json = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  expect(parseStoredScene(json).elements.length).toBe(0)
})

test("k selects the laser tool and Escape returns to selection", async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-laser"]').waitFor({ state: "visible" })

  await page.keyboard.press("k")
  await page.waitForTimeout(100)
  expect(await pressed(page, "toolbar-laser")).toBe("true")

  await page.keyboard.press("Escape")
  await page.waitForTimeout(100)
  expect(await pressed(page, "toolbar-selection")).toBe("true")
})
