import { expect, test, type Page } from "@playwright/test"
import { parseStoredScene } from "./_helpers"

type SceneEl = {
  id: string
  type: string
  text?: string
  containerId?: string | null
  startBinding?: { elementId: string } | null
  endBinding?: { elementId: string } | null
  isDeleted?: boolean
}

const readScene = async (page: Page): Promise<SceneEl[]> => {
  const json = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  return parseStoredScene<SceneEl>(json).elements.filter((e) => !e.isDeleted)
}

test("import a Mermaid flowchart from the menu, then undo it in one step", async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()

  await page.getByRole("button", { name: "Menu" }).click()
  await page.locator('[data-testid="menu-import-mermaid"]').click()
  await page
    .locator('[data-testid="mermaid-input"]')
    .fill("graph LR; A[Start] --> B{Ok?}; B -->|yes| C[Done]")
  await expect(page.locator('[data-testid="mermaid-warning"]')).toHaveCount(0)
  await page.locator('[data-testid="mermaid-insert"]').click()
  await expect(page.locator('[data-testid="mermaid-input"]')).toHaveCount(0)
  await page.waitForTimeout(700)

  const els = await readScene(page)
  const shapes = els.filter((e) => e.type === "rectangle" || e.type === "diamond")
  expect(shapes).toHaveLength(3)
  const shapeIds = new Set(shapes.map((s) => s.id))
  const arrows = els.filter((e) => e.type === "arrow")
  expect(arrows).toHaveLength(2)
  for (const a of arrows) {
    expect(shapeIds.has(a.startBinding!.elementId)).toBe(true)
    expect(shapeIds.has(a.endBinding!.elementId)).toBe(true)
  }
  const labels = els.filter((e) => e.type === "text").map((e) => e.text)
  expect(labels.sort()).toEqual(["Done", "Ok?", "Start", "yes"])

  const isMac = process.platform === "darwin"
  await page.keyboard.press(isMac ? "Meta+Z" : "Control+Z")
  await page.waitForTimeout(700)
  expect(await readScene(page)).toHaveLength(0)
})
