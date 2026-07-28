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
