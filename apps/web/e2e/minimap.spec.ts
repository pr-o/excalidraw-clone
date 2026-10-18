import { expect, test } from "@playwright/test"
import { dragOnCanvas } from "./_helpers"

test("minimap: toggle via menu, navigate by click, close, persist, Alt+M", async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByTestId("toolbar-rectangle").waitFor({ state: "visible" })

  await expect(page.getByTestId("minimap")).toHaveCount(0)
  await page.getByRole("button", { name: /menu/i }).click()
  const item = page.getByTestId("menu-minimap")
  await expect(item).toHaveAttribute("aria-checked", "false")
  await item.click()
  await expect(page.getByTestId("minimap")).toBeVisible()
  await expect(page.getByTestId("minimap-viewport")).toHaveCount(0) // empty page

  await page.getByTestId("toolbar-rectangle").click()
  await dragOnCanvas(page, { x: 150, y: 200 }, { x: 250, y: 280 })
  // Pan far right via the zoom-independent keyboard-free route: draw second rect after panning.
  await page.mouse.move(600, 400)
  await page.mouse.wheel(3000, 0)
  await page.getByTestId("toolbar-rectangle").click()
  await dragOnCanvas(page, { x: 150, y: 200 }, { x: 250, y: 280 })
  await expect(page.getByTestId("minimap-viewport")).toBeVisible()

  const panel = page.getByTestId("minimap")
  const before = Number(await panel.getAttribute("data-scroll-x"))
  const box = (await panel.boundingBox())!
  // Click near the left edge: the first rectangle's side, far from the current view.
  await page.mouse.click(box.x + 20, box.y + 70)
  await expect
    .poll(async () => Number(await panel.getAttribute("data-scroll-x")))
    .toBeGreaterThan(before + 1000)

  await page.getByTestId("minimap-close").click()
  await expect(page.getByTestId("minimap")).toHaveCount(0)
  await page.waitForTimeout(700)
  await page.reload()
  await page.getByTestId("toolbar-rectangle").waitFor({ state: "visible" })
  await expect(page.getByTestId("minimap")).toHaveCount(0)

  await page.keyboard.press("Alt+M")
  await expect(page.getByTestId("minimap")).toBeVisible()
  await page.waitForTimeout(700)
  await page.reload()
  await expect(page.getByTestId("minimap")).toBeVisible()
  await page.keyboard.press("Alt+M")
  await expect(page.getByTestId("minimap")).toHaveCount(0)
})
