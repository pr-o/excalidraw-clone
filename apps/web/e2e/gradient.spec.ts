import { expect, test } from "@playwright/test"
import { readFileSync } from "node:fs"
import { dragOnCanvas, parseStoredScene } from "./_helpers"

test("gradient toggle stores a gradient and the SVG export carries a linearGradient", async ({
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

  await page.locator('[data-testid="bg-ffc9c9"]').click()
  await page.locator('[data-testid="gradient-toggle"]').click()
  await expect(page.locator('[data-testid="gradient-toggle"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  )
  await page.locator('[data-testid="gradient-angle-45"]').click()

  await page.waitForTimeout(900)
  const sceneJson = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  const data = parseStoredScene<{
    type: string
    fillStyle?: string
    gradient?: { to: string; angle: number }
    isDeleted?: boolean
  }>(sceneJson)
  const rects = data.elements.filter((e) => e.type === "rectangle" && !e.isDeleted)
  expect(rects.length).toBe(1)
  expect(rects[0]?.fillStyle).toBe("solid")
  expect(rects[0]?.gradient).toEqual({ to: "#b2f2bb", angle: 45 })

  await page.getByRole("button", { name: /menu/i }).click()
  await page.getByText("Export image…").click()
  await page.locator('[data-testid="format-svg"]').click()
  const downloadPromise = page.waitForEvent("download")
  await page.getByRole("button", { name: "Export", exact: true }).click()
  const svg = readFileSync(await (await downloadPromise).path(), "utf8")
  expect(svg).toContain("<linearGradient")
  expect(svg).toMatch(/fill="url\(#gradient-/)
})
