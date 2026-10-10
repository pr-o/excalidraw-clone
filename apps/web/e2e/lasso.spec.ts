import { expect, test } from "@playwright/test"
import { dragOnCanvas, parseStoredScene } from "./_helpers"

test("lasso selects only the enclosed shape, then returns to the selection tool", async ({
  page,
}) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-rectangle"]').waitFor({ state: "visible" })

  for (const [from, to] of [
    [
      { x: 100, y: 150 },
      { x: 160, y: 210 },
    ],
    [
      { x: 400, y: 150 },
      { x: 460, y: 210 },
    ],
  ] as const) {
    await page.locator('[data-testid="toolbar-rectangle"]').click()
    await dragOnCanvas(page, from, to)
    await page.waitForTimeout(120)
  }

  await page.keyboard.press("s")
  expect(await page.locator('[data-testid="toolbar-lasso"]').getAttribute("aria-pressed")).toBe(
    "true",
  )
  const box = await page.locator("canvas").first().boundingBox()
  if (!box) throw new Error("canvas not found")
  // A loose loop around the first rectangle only.
  const path = [
    { x: 80, y: 130 },
    { x: 200, y: 140 },
    { x: 190, y: 240 },
    { x: 70, y: 230 },
  ]
  await page.mouse.move(box.x + path[0]!.x, box.y + path[0]!.y)
  await page.mouse.down()
  for (const p of [path[1]!, path[2]!, path[3]!, { x: 78, y: 140 }]) {
    await page.mouse.move(box.x + p.x, box.y + p.y, { steps: 5 })
  }
  await page.mouse.up()
  await page.waitForTimeout(100)

  expect(await page.locator('[data-testid="toolbar-selection"]').getAttribute("aria-pressed")).toBe(
    "true",
  )

  await page.keyboard.press("Delete")
  await page.waitForTimeout(900)
  const json = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  const live = parseStoredScene<{ isDeleted?: boolean }>(json).elements.filter((e) => !e.isDeleted)
  expect(live.length).toBe(1)
})
