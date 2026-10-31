import { expect, test } from "@playwright/test"
import { dragOnCanvas, readScene } from "./_helpers"

type SceneEl = {
  id: string
  type: string
  startArrowhead?: string | null
  endArrowhead?: string | null
  isDeleted?: boolean
}

test("picking a start arrowhead persists it; end keeps the default", async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-arrow"]').waitFor({ state: "visible" })

  // Draw one arrow.
  await page.locator('[data-testid="toolbar-arrow"]').click()
  await dragOnCanvas(page, { x: 100, y: 100 }, { x: 260, y: 100 })
  await page.waitForTimeout(120)

  // Marquee-select it.
  await page.locator('[data-testid="toolbar-selection"]').click()
  await dragOnCanvas(page, { x: 80, y: 80 }, { x: 300, y: 130 })
  await page.waitForTimeout(150)

  // Pick "dot" as the start arrowhead.
  await page.locator('[data-testid="arrowhead-start-dot"]').click()
  await page.waitForTimeout(700)

  const arrows = (await readScene<SceneEl>(page)).filter((e) => e.type === "arrow")
  expect(arrows).toHaveLength(1)
  expect(arrows[0]!.startArrowhead).toBe("dot")
  expect(arrows[0]!.endArrowhead).toBe("arrow")

  // Strip the end arrowhead via None.
  await page.locator('[data-testid="arrowhead-end-none"]').click()
  await page.waitForTimeout(700)
  const after = (await readScene<SceneEl>(page)).filter((e) => e.type === "arrow")
  expect(after[0]!.endArrowhead).toBeNull()
})
