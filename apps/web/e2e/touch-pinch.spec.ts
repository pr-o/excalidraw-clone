import { expect, test, type Page } from "@playwright/test"
import { parseStoredScene } from "./_helpers"

type Touch = { id: number; x: number; y: number }

/** Dispatch a synthetic touch pointer event on the canvas (Playwright has no multi-touch). */
const touch = (page: Page, type: "pointerdown" | "pointermove" | "pointerup", t: Touch) =>
  page.evaluate(
    ([type, t]) => {
      const canvas = document.querySelector("canvas")!
      const r = canvas.getBoundingClientRect()
      const init = {
        pointerId: t.id,
        pointerType: "touch",
        isPrimary: t.id === 1,
        button: type === "pointermove" ? -1 : 0,
        buttons: type === "pointerup" ? 0 : 1,
        clientX: r.left + t.x,
        clientY: r.top + t.y,
        bubbles: true,
      }
      // Synthetic ids have no active browser pointer, so capture calls must not throw.
      canvas.setPointerCapture = () => {}
      canvas.releasePointerCapture = () => {}
      canvas.dispatchEvent(new PointerEvent(type, init))
    },
    [type, t] as const,
  )

test("a second finger cancels the one-finger gesture, then pinch zooms and pans", async ({
  page,
}) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-rectangle"]').click()

  // Finger 1 starts drawing a rectangle.
  await touch(page, "pointerdown", { id: 1, x: 300, y: 300 })
  await touch(page, "pointermove", { id: 1, x: 360, y: 340 })
  // Finger 2 lands: the rectangle is cancelled, pinch begins.
  await touch(page, "pointerdown", { id: 2, x: 400, y: 300 })
  await touch(page, "pointermove", { id: 2, x: 600, y: 300 })
  await touch(page, "pointermove", { id: 1, x: 200, y: 300 })
  await touch(page, "pointerup", { id: 2, x: 600, y: 300 })
  // The remaining finger is inert: lifting it must not create anything.
  await touch(page, "pointermove", { id: 1, x: 250, y: 320 })
  await touch(page, "pointerup", { id: 1, x: 250, y: 320 })
  await page.waitForTimeout(700)

  const zoom = await page.locator('[data-testid="zoom-reset"]').innerText()
  expect(parseInt(zoom)).toBeGreaterThan(100)
  const json = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  const els = json ? parseStoredScene<{ isDeleted?: boolean }>(json).elements : []
  expect(els.filter((e) => !e.isDeleted)).toHaveLength(0)

  // A fresh single touch draws normally again.
  await touch(page, "pointerdown", { id: 3, x: 300, y: 300 })
  await touch(page, "pointermove", { id: 3, x: 400, y: 380 })
  await touch(page, "pointerup", { id: 3, x: 400, y: 380 })
  await page.waitForTimeout(700)
  const after = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  expect(
    parseStoredScene<{ isDeleted?: boolean }>(after).elements.filter((e) => !e.isDeleted),
  ).toHaveLength(1)
})
