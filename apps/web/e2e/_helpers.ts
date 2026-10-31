import type { Page } from "@playwright/test"

/**
 * Reads the persisted document (v3: `pages[]` + `activePageId`) and exposes the
 * active page's elements under `.elements`, which is what the specs assert on.
 */
export function parseStoredScene<T>(json: string | null): { elements: T[] } {
  const data = JSON.parse(json ?? "null") as {
    pages?: { id: string; elements: T[] }[]
    activePageId?: string
  } | null
  const pages = data?.pages
  if (!pages) return { elements: [] }
  const active = pages.find((p) => p.id === data?.activePageId) ?? pages[0]
  return { elements: active?.elements ?? [] }
}

export async function dragOnCanvas(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> {
  const canvas = page.locator("canvas").first()
  const box = await canvas.boundingBox()
  if (!box) throw new Error("canvas not found")
  await page.mouse.move(box.x + from.x, box.y + from.y)
  await page.mouse.down()
  await page.mouse.move(box.x + to.x, box.y + to.y, { steps: 8 })
  await page.mouse.up()
}

type XY = { x: number; y: number }

/** Live (non-deleted) elements of the persisted active page. */
export async function readScene<T extends { isDeleted?: boolean }>(page: Page): Promise<T[]> {
  const json = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  return parseStoredScene<T>(json).elements.filter((e) => !e.isDeleted)
}

/** Load the app with empty storage and wait until `readyTestId` is visible. */
export async function freshCanvas(page: Page, readyTestId = "toolbar-rectangle"): Promise<void> {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator(`[data-testid="${readyTestId}"]`).waitFor({ state: "visible" })
}

export async function drawRect(page: Page, from: XY, to: XY): Promise<void> {
  await page.locator('[data-testid="toolbar-rectangle"]').click()
  await dragOnCanvas(page, from, to)
  await page.waitForTimeout(120)
}

export async function dblClickCanvas(page: Page, at: XY): Promise<void> {
  const canvas = page.locator("canvas").first()
  const box = await canvas.boundingBox()
  if (!box) throw new Error("canvas not found")
  await page.mouse.dblclick(box.x + at.x, box.y + at.y)
}

/** Brightest RGB channel in a canvas-pixel region of the main canvas. */
export async function maxChannelIn(
  page: Page,
  x: number,
  y: number,
  w: number,
  h: number,
): Promise<number> {
  return page.evaluate(
    ([rx, ry, rw, rh]) => {
      const c = document.querySelector("canvas")!
      const ctx = c.getContext("2d")!
      const d = ctx.getImageData(rx!, ry!, rw!, rh!).data
      let max = 0
      for (let i = 0; i < d.length; i += 4) max = Math.max(max, d[i]!, d[i + 1]!, d[i + 2]!)
      return max
    },
    [x, y, w, h],
  )
}

export async function setDarkTheme(page: Page): Promise<void> {
  await page.getByRole("button", { name: /menu/i }).click()
  await page.locator('[data-testid="theme-dark"]').click()
  await page.waitForTimeout(300)
}

/** An 8x8 solid-red PNG, rendered in the page. */
export async function redPngBuffer(page: Page): Promise<Buffer> {
  const dataURL = await page.evaluate(() => {
    const c = document.createElement("canvas")
    c.width = 8
    c.height = 8
    const ctx = c.getContext("2d")!
    ctx.fillStyle = "#ff0000"
    ctx.fillRect(0, 0, 8, 8)
    return c.toDataURL("image/png")
  })
  return Buffer.from(dataURL.split(",")[1]!, "base64")
}
