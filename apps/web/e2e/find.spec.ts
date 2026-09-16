import { expect, test, type Page } from "@playwright/test"
import { dragOnCanvas } from "./_helpers"

// Brightest channel value in a region — stroke pixels are jittery (roughjs), so
// scan a box instead of a single coordinate (ported from zoom-pan.spec.ts).
const maxChannelIn = async (
  page: Page,
  x: number,
  y: number,
  w: number,
  h: number,
): Promise<number> =>
  page.evaluate(
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

// maxChannelIn detects light strokes against a dark canvas; on the default light
// theme the background is white (255) and content vanishes into it, so the pixel
// assertions below must run in dark mode (same setup as zoom-pan.spec.ts).
const setDarkTheme = async (page: Page): Promise<void> => {
  await page.getByRole("button", { name: /menu/i }).click()
  await page.locator('[data-testid="theme-dark"]').click()
  await page.waitForTimeout(300)
}

/**
 * Draws a sticky note and labels it. The note tool opens its bound-text editor
 * on pointerUp, so the label can be typed and committed (sticky-note.spec.ts);
 * the search index treats a bound label like any other text element.
 */
const labelledNote = async (
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  label: string,
): Promise<void> => {
  await page.locator('[data-testid="toolbar-note"]').click()
  await dragOnCanvas(page, from, to)
  const editor = page.locator("textarea")
  await editor.waitFor({ state: "visible" })
  await editor.fill(label)
  await editor.blur() // TextEditingOverlay commits onBlur
  await page.waitForTimeout(300)
}

const canvasBox = async (page: Page): Promise<{ width: number; height: number }> => {
  const box = await page.locator("canvas").first().boundingBox()
  if (!box) throw new Error("canvas not found")
  return box
}

const panAway = async (page: Page): Promise<void> => {
  const box = await page.locator("canvas").first().boundingBox()
  if (!box) throw new Error("canvas not found")
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  for (let i = 0; i < 4; i += 1) await page.mouse.wheel(1200, 1200)
  await page.waitForTimeout(300)
}

const zoomPercent = (page: Page) => page.locator('[data-testid="zoom-reset"]')

test("Ctrl+F finds an off-screen text element and cycling to a second match moves the view again", async ({
  page,
}) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-note"]').waitFor({ state: "visible" })
  await setDarkTheme(page)

  // Two matches on deliberately different-sized elements, so the fit-to-content
  // jump computes a different zoom for each one.
  await labelledNote(page, { x: 150, y: 120 }, { x: 280, y: 200 }, "findtarget-one")
  await labelledNote(page, { x: 460, y: 380 }, { x: 900, y: 480 }, "findtarget-two")
  await page.locator('[data-testid="toolbar-selection"]').click()

  // Pan far enough that neither note is anywhere near the viewport centre.
  await panAway(page)
  const box = await canvasBox(page)
  const cx = box.width / 2 - 30
  const cy = box.height / 2 - 15
  const before = await maxChannelIn(page, cx, cy, 60, 30)
  expect(before).toBeLessThan(50)

  // Open find, search, and jump to the first match.
  await page.keyboard.down("Control")
  await page.keyboard.press("f")
  await page.keyboard.up("Control")
  await page.locator('[data-testid="find-input"]').fill("findtarget")
  await expect(page.locator('[data-testid="find-counter"]')).toHaveText("1 of 2")

  await page.keyboard.press("Enter")
  await page.waitForTimeout(500) // let the 300ms jump animation settle

  const afterFirstJump = await maxChannelIn(page, cx, cy, 60, 30)
  expect(afterFirstJump).toBeGreaterThan(before)
  const zoomAfterFirst = await zoomPercent(page).textContent()

  // Cycle to the second (differently-sized) match — the view moves again.
  await page.keyboard.press("Enter")
  await expect(page.locator('[data-testid="find-counter"]')).toHaveText("2 of 2")
  await page.waitForTimeout(500)

  const zoomAfterSecond = await zoomPercent(page).textContent()
  expect(zoomAfterSecond).not.toBe(zoomAfterFirst)

  await page.keyboard.press("Escape")
  await expect(page.locator('[data-testid="find-input"]')).toHaveCount(0)
})
