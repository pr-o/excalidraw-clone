import { expect, test, type Page } from "@playwright/test"
import { dragOnCanvas, parseStoredScene } from "./_helpers"

type SceneEl = { type: string; x: number; y: number; isDeleted?: boolean }

const stored = async (page: Page): Promise<SceneEl[]> => {
  await page.waitForTimeout(700)
  const json = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  return parseStoredScene<SceneEl>(json).elements.filter((e) => !e.isDeleted)
}

const maxChannelIn = async (page: Page, x: number, y: number, w: number, h: number) =>
  page.evaluate(
    ([rx, ry, rw, rh]) => {
      const d = document
        .querySelector("canvas")!
        .getContext("2d")!
        .getImageData(rx!, ry!, rw!, rh!).data
      let max = 0
      for (let i = 0; i < d.length; i += 4) max = Math.max(max, d[i]!, d[i + 1]!, d[i + 2]!)
      return max
    },
    [x, y, w, h],
  )

test("view mode: read-only canvas, pan allowed, exit pill, preference persists", async ({
  page,
}) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByTestId("toolbar-rectangle").waitFor({ state: "visible" })
  // Dark theme so stroke pixels are bright against the canvas.
  await page.getByRole("button", { name: /menu/i }).click()
  await page.getByTestId("theme-dark").click()

  await page.getByTestId("toolbar-rectangle").click()
  await dragOnCanvas(page, { x: 200, y: 200 }, { x: 260, y: 260 })
  const before = await stored(page)
  expect(before).toHaveLength(1)
  const pixelBefore = await maxChannelIn(page, 195, 195, 70, 10)
  expect(pixelBefore).toBeGreaterThan(50)

  await page.keyboard.press("Alt+r")
  await expect(page.getByTestId("view-mode-exit")).toBeVisible()
  await expect(page.getByTestId("toolbar-rectangle")).toHaveCount(0)

  // Editing gestures do nothing.
  await page.keyboard.press("Control+a")
  await page.keyboard.press("Delete")
  const box = (await page.locator("canvas").first().boundingBox())!
  await page.mouse.dblclick(box.x + 230, box.y + 230)
  await page.keyboard.press("t")
  await dragOnCanvas(page, { x: 600, y: 200 }, { x: 700, y: 260 })
  expect(await stored(page)).toEqual(before)

  // Left-drag (even starting on the rect) pans instead of moving it.
  await dragOnCanvas(page, { x: 230, y: 230 }, { x: 330, y: 330 })
  await page.waitForTimeout(300)
  expect(await maxChannelIn(page, 195, 195, 70, 10)).toBeLessThan(pixelBefore)
  expect(await stored(page)).toEqual(before)

  // Reload keeps the preference.
  await page.reload()
  await expect(page.getByTestId("view-mode-exit")).toBeVisible()
  await expect(page.getByTestId("toolbar-rectangle")).toHaveCount(0)

  await page.getByTestId("view-mode-exit").click()
  await expect(page.getByTestId("toolbar-rectangle")).toBeVisible()
  await expect(page.getByTestId("view-mode-exit")).toHaveCount(0)
})
