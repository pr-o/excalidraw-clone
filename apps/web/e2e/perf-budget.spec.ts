import { expect, test } from "@playwright/test"
import { seedAndLoad } from "./perf/measure"

/**
 * Regression guard for large scenes. Mostly deterministic counts (DOM rows,
 * DOM rewrites) rather than timings; the one timing budget is ~5x looser than
 * the fixed behaviour and ~10x tighter than the old one, so it can't flake.
 */
test.use({ viewport: { width: 1920, height: 1080 } })

test("2000-element scene: layers panel is windowed and drags don't rewrite the chrome", async ({
  page,
}) => {
  test.setTimeout(90_000)
  await seedAndLoad(page, 2000)
  await page.locator('[data-testid="toolbar-selection"]').click()

  await page.locator('[data-testid="layers-toggle"]').click()
  await expect(page.locator('[data-testid="layers-panel"]')).toBeVisible()
  // Windowed: a few dozen rows, not 2000 (each with five buttons).
  expect(await page.locator('[data-testid^="layer-row-"]').count()).toBeLessThan(200)

  await page.evaluate(() => {
    const w = window as unknown as { spanRewrites: number }
    w.spanRewrites = 0
    new MutationObserver((list) => {
      for (const m of list) if ((m.target as Element).tagName === "SPAN") w.spanRewrites += 1
    }).observe(document.body, { subtree: true, childList: true })
  })

  const t0 = Date.now()
  await page.mouse.move(380, 355)
  await page.mouse.down()
  await page.mouse.move(480, 455, { steps: 10 })
  await page.mouse.up()
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))))
  const dragMs = Date.now() - t0

  // Icons must not have their innerHTML re-applied on every scene re-render
  // (was ~300 icon rewrites per pointer move).
  expect(
    await page.evaluate(() => (window as unknown as { spanRewrites: number }).spanRewrites),
  ).toBeLessThan(100)
  // Was ~35s for these 10 moves before windowing; now well under 1s.
  expect(dragMs).toBeLessThan(6000)
})
