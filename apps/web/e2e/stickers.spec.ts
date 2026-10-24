import { expect, test, type Page } from "@playwright/test"
import { readFileSync } from "node:fs"
import { parseStoredScene } from "./_helpers"

type SceneEl = {
  id: string
  type: string
  text?: string
  fontSize?: number
  x: number
  y: number
  width: number
  height: number
  isDeleted?: boolean
}

const readScene = async (page: Page): Promise<SceneEl[]> => {
  const json = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  return parseStoredScene<SceneEl>(json).elements.filter((e) => !e.isDeleted)
}

const isMac = process.platform === "darwin"

test("pick a sticker from the More shapes flyout: inserted, rendered, movable, one undo step", async ({
  page,
}) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()

  await page.locator('[data-testid="toolbar-more-shapes"]').click()
  await page.locator('[data-testid="toolbar-stickers"]').click()
  await page.locator('[data-testid="sticker-search"]').fill("cat")
  await expect(page.locator('[data-testid^="sticker-option"]')).toHaveCount(1)
  await page.locator('[data-testid="sticker-option-cat"]').click()
  await expect(page.locator('[data-testid="sticker-search"]')).toHaveCount(0)
  await page.waitForTimeout(700)

  const [sticker, ...rest] = await readScene(page)
  expect(rest).toHaveLength(0)
  expect(sticker).toMatchObject({ type: "text", text: "🐱", fontSize: 64 })
  expect(sticker!.width).toBeGreaterThan(30)

  // The emoji is painted on the canvas in colour (not tofu / blank) at the viewport centre.
  const vp = page.viewportSize()!
  const coloured = await page.evaluate(
    ({ x, y }) =>
      [...document.querySelectorAll("canvas")].some((c) => {
        const ctx = c.getContext("2d")
        if (!ctx) return false
        const sx = c.width / c.getBoundingClientRect().width
        const r = c.getBoundingClientRect()
        const d = ctx.getImageData(
          (x - r.left - 30) * sx,
          (y - r.top - 30) * sx,
          60 * sx,
          60 * sx,
        ).data
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3]! > 200 && Math.abs(d[i]! - d[i + 2]!) > 60) return true
        }
        return false
      }),
    { x: vp.width / 2, y: vp.height / 2 },
  )
  expect(coloured).toBe(true)

  // Drag moves it like any element.
  await page.mouse.move(vp.width / 2, vp.height / 2)
  await page.mouse.down()
  await page.mouse.move(vp.width / 2 + 100, vp.height / 2 + 50, { steps: 6 })
  await page.mouse.up()
  await page.waitForTimeout(700)
  const [moved] = await readScene(page)
  expect(moved!.x).toBeCloseTo(sticker!.x + 100, 0)

  // Double-click opens the text editor on the emoji; Escape commits it unchanged.
  await page.mouse.dblclick(vp.width / 2 + 100, vp.height / 2 + 50)
  await expect(page.locator("textarea")).toHaveValue("🐱")
  await page.keyboard.press("Escape")
  await page.waitForTimeout(700)
  expect((await readScene(page)).map((e) => e.text)).toEqual(["🐱"])

  // SVG export carries the emoji as text.
  await page.getByRole("button", { name: /menu/i }).click()
  await page.getByText("Export image…").click()
  await page.locator('[data-testid="format-svg"]').click()
  const downloadPromise = page.waitForEvent("download")
  await page.getByRole("button", { name: "Export", exact: true }).click()
  const svg = readFileSync(await (await downloadPromise).path(), "utf8")
  expect(svg).toContain("🐱")

  // Undo: move, then insert — the insert is a single step.
  await page.keyboard.press(isMac ? "Meta+Z" : "Control+Z")
  await page.keyboard.press(isMac ? "Meta+Z" : "Control+Z")
  await page.waitForTimeout(700)
  expect(await readScene(page)).toHaveLength(0)
})

test("Stickers is in the command palette but not in view mode", async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-rectangle"]').waitFor()

  await page.keyboard.press(isMac ? "Meta+/" : "Control+/")
  await page.keyboard.type("Stickers")
  await page.keyboard.press("Enter")
  await expect(page.locator('[data-testid="sticker-search"]')).toBeVisible()
  await page.keyboard.press("Escape")

  await page.keyboard.press("Alt+R")
  await expect(page.locator('[data-testid="toolbar-more-shapes"]')).toHaveCount(0)
  await page.keyboard.press(isMac ? "Meta+/" : "Control+/")
  await page.keyboard.type("Stickers")
  await expect(page.getByRole("option", { name: /Stickers/ })).toHaveCount(0)
})
