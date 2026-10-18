import { expect, test, type Page } from "@playwright/test"
import { readFileSync } from "node:fs"
import { parseStoredScene } from "./_helpers"

type TextEl = {
  type: string
  text?: string
  isDeleted?: boolean
  spans?: { start: number; end: number; bold?: true; italic?: true }[]
}

const readTexts = async (page: Page): Promise<TextEl[]> => {
  const json = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  return parseStoredScene<TextEl>(json).elements.filter((e) => e.type === "text" && !e.isDeleted)
}

const freshCanvas = async (page: Page): Promise<void> => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-text"]').waitFor({ state: "visible" })
}

const startText = async (page: Page): Promise<void> => {
  await page.locator('[data-testid="toolbar-text"]').click()
  const box = await page.locator("canvas").first().boundingBox()
  if (!box) throw new Error("canvas not found")
  await page.mouse.click(box.x + 200, box.y + 200)
  await page.locator("textarea").waitFor({ state: "visible" })
}

const commit = async (page: Page): Promise<void> => {
  await page.locator("textarea").blur()
  await expect(page.locator("textarea")).toHaveCount(0)
  await page.waitForTimeout(900)
}

test("Ctrl+B bolds the selected word: stored, persisted and exported as a bold tspan", async ({
  page,
}) => {
  await freshCanvas(page)
  await startText(page)
  await page.keyboard.type("hello world")
  for (let i = 0; i < 5; i += 1) await page.keyboard.press("Shift+ArrowLeft")
  await page.keyboard.press("ControlOrMeta+b")
  await commit(page)

  expect((await readTexts(page))[0]).toMatchObject({
    text: "hello world",
    spans: [{ start: 6, end: 11, bold: true }],
  })

  await page.reload()
  await page.locator('[data-testid="toolbar-text"]').waitFor({ state: "visible" })
  expect((await readTexts(page))[0]!.spans).toEqual([{ start: 6, end: 11, bold: true }])

  await page.getByRole("button", { name: /menu/i }).click()
  await page.getByText("Export image…").click()
  await page.locator('[data-testid="format-svg"]').click()
  const download = page.waitForEvent("download")
  await page.getByRole("button", { name: "Export", exact: true }).click()
  const svg = readFileSync(await (await download).path(), "utf8")
  expect(svg).toMatch(/<tspan font-weight="bold">world<\/tspan>/)
})

test("typing '- item', Enter, 'next' produces a bullet list", async ({ page }) => {
  await freshCanvas(page)
  await startText(page)
  await page.keyboard.type("- item")
  await page.keyboard.press("Enter")
  await page.keyboard.type("next")
  await commit(page)
  expect((await readTexts(page))[0]!.text).toBe("• item\n• next")
})

test("the panel B button bolds a whole selected text element", async ({ page }) => {
  await freshCanvas(page)
  await startText(page)
  await page.keyboard.type("whole")
  await commit(page)
  await page.locator('[data-testid="toolbar-selection"]').click()
  await page.keyboard.press("ControlOrMeta+a")
  await page.locator('[data-testid="text-bold"]').click()
  await page.waitForTimeout(900)
  expect((await readTexts(page))[0]!.spans).toEqual([{ start: 0, end: 5, bold: true }])
})
