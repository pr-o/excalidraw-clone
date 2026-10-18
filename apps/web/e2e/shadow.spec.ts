import { expect, test } from "@playwright/test"
import { readFileSync } from "node:fs"
import { dragOnCanvas, parseStoredScene } from "./_helpers"

type Stored = { type: string; shadow?: { blur: number; offsetX: number }; isDeleted?: boolean }

test("shadow toggle + Soft preset persists, exports feDropShadow, toggles off, undoes in one step", async ({
  page,
}) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-rectangle"]').waitFor({ state: "visible" })

  await page.locator('[data-testid="toolbar-rectangle"]').click()
  await dragOnCanvas(page, { x: 120, y: 120 }, { x: 260, y: 220 })
  await page.waitForTimeout(120)
  await page.locator('[data-testid="toolbar-selection"]').click()
  await page
    .locator("canvas")
    .first()
    .click({ position: { x: 190, y: 170 } })
  await page.waitForTimeout(120)

  const stored = async (): Promise<Stored | undefined> => {
    await page.waitForTimeout(900)
    const json = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
    return parseStoredScene<Stored>(json).elements.find(
      (e) => e.type === "rectangle" && !e.isDeleted,
    )
  }

  await page.locator('[data-testid="shadow-toggle"]').click()
  await page.locator('[data-testid="shadow-size-soft"]').click()
  expect((await stored())?.shadow).toMatchObject({ blur: 12, offsetX: 4 })

  await page.getByRole("button", { name: /menu/i }).click()
  await page.getByText("Export image…").click()
  await page.locator('[data-testid="format-svg"]').click()
  const downloadPromise = page.waitForEvent("download")
  await page.getByRole("button", { name: "Export", exact: true }).click()
  expect(readFileSync(await (await downloadPromise).path(), "utf8")).toContain("<feDropShadow")
  await page.keyboard.press("Escape")
  await page
    .locator("canvas")
    .first()
    .click({ position: { x: 190, y: 170 } })

  await page.locator('[data-testid="shadow-toggle"]').click()
  expect((await stored())?.shadow).toBeUndefined()

  await page.keyboard.press("ControlOrMeta+z")
  expect((await stored())?.shadow).toMatchObject({ blur: 12, offsetX: 4 })
})
