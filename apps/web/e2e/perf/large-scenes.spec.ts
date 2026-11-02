import { expect, test, type Page } from "@playwright/test"
import { writeFileSync } from "node:fs"
import { measure, seedAndLoad, type Sample } from "./measure"

/**
 * Perf measurement harness (not a gate): run with
 *   PERF=1 pnpm exec playwright test e2e/perf/large-scenes.spec.ts
 * PERF_SIZES=500,2000 limits sizes; PERF_PROFILE=1 adds CPU-profile hot spots;
 * PERF_OUT=file.json writes the samples.
 */
test.skip(!process.env.PERF, "perf harness: set PERF=1")
test.use({ viewport: { width: 1920, height: 1080 }, actionTimeout: 15_000 })
test.setTimeout(600_000)

const SIZES = (process.env.PERF_SIZES ?? "500,2000,5000").split(",").map(Number)
const results: Record<string, Sample[]> = {}

const drag = async (page: Page, from: [number, number], to: [number, number], steps = 30) => {
  await page.mouse.move(...from)
  await page.mouse.down()
  await page.mouse.move(...to, { steps })
  await page.mouse.up()
}

for (const n of SIZES) {
  test(`scene of ${n} elements`, async ({ page }) => {
    const cdp = process.env.PERF_PROFILE ? await page.context().newCDPSession(page) : undefined
    const out: (Sample & { profile?: string })[] = []
    const m = async (label: string, action: () => Promise<void>) => {
      if (process.env.PERF_VERBOSE) console.log("step:", label)
      const s = await measure(page, label, action, cdp)
      out.push(s)
      if (process.env.PERF_VERBOSE) console.log(JSON.stringify(s))
    }

    const loadMs = await seedAndLoad(page, n)
    out.push({
      label: "load (nav→painted)",
      wallMs: Math.round(loadMs),
      frames: 0,
      p95FrameMs: 0,
      maxFrameMs: 0,
      longTaskMs: 0,
      stringifyAndStorageMs: 0,
    })
    await page.waitForTimeout(1500) // let the load-time autosave + fonts settle

    await page.locator('[data-testid="toolbar-selection"]').click()
    await m("drag 1 element", () => drag(page, [380, 355], [480, 455]))
    await m("undo", () => page.keyboard.press("Control+z"))
    await m("redo", () => page.keyboard.press("Control+Shift+z"))
    await m("autosave flush (after edit)", async () => {
      await page.keyboard.press("Control+z")
      await page.waitForTimeout(800)
    })
    await page.keyboard.press("Escape")

    await m("marquee select", () => drag(page, [5, 190], [1295, 990], 20))
    await page.keyboard.press("Alt+/")
    const count = await page
      .locator('[data-testid="stats-multi-count"], [data-testid="stats-element-count"]')
      .first()
      .textContent({ timeout: 5000 })
    await page.keyboard.press("Alt+/")
    out.push({
      label: `  (selected: ${count})`,
      wallMs: 0,
      frames: 0,
      p95FrameMs: 0,
      maxFrameMs: 0,
      longTaskMs: 0,
      stringifyAndStorageMs: 0,
    })
    if (process.env.PERF_VERBOSE)
      await page.screenshot({ path: `${process.env.PERF_VERBOSE}/sel-${n}.png` })
    await m("drag selection", () => drag(page, [380, 355], [440, 415]))
    if (process.env.PERF_VERBOSE)
      await page.screenshot({ path: `${process.env.PERF_VERBOSE}/dragsel-${n}.png` })
    await m("align top (selection)", () => page.locator('[data-testid="align-top"]').click())
    await m("undo align", () => page.keyboard.press("Control+z"))
    await page.keyboard.press("Escape")

    await m("pan (30 wheel)", async () => {
      await page.mouse.move(960, 600)
      for (let i = 0; i < 30; i += 1) await page.mouse.wheel(0, i < 15 ? 60 : -60)
    })
    await m("zoom (20 ctrl+wheel)", async () => {
      await page.keyboard.down("Control")
      for (let i = 0; i < 20; i += 1) await page.mouse.wheel(0, i < 10 ? 50 : -50)
      await page.keyboard.up("Control")
    })
    await page.keyboard.press("Control+0")
    await page.waitForTimeout(300)

    await m("history panel open", async () => {
      await page.locator('[data-testid="history-toggle"]').click()
      await expect(page.locator('[data-testid="history-panel"]')).toBeVisible()
    })
    await page.locator('[data-testid="history-toggle"]').click()
    await m("layers panel open", async () => {
      await page.locator('[data-testid="layers-toggle"]').click()
      await expect(page.locator('[data-testid="layers-panel"]')).toBeVisible()
    })
    // Few steps: before windowing each frame cost seconds at 5000 rows.
    await m("drag 1 element (layers open, 5 moves)", () =>
      drag(page, [380, 355], [480, 455], Number(process.env.PERF_LAYER_STEPS ?? 5)),
    )
    await page.locator('[data-testid="layers-toggle"]').first().click()
    await m("minimap open", async () => {
      await page.keyboard.press("Alt+m")
      await expect(page.getByTestId("minimap")).toBeVisible()
    })
    await m("pan (minimap open)", async () => {
      await page.mouse.move(960, 600)
      for (let i = 0; i < 30; i += 1) await page.mouse.wheel(0, i < 15 ? 60 : -60)
    })
    await page.keyboard.press("Alt+m")

    await m("find", async () => {
      await page.keyboard.press("Control+f")
      await page.locator('[data-testid="find-input"]').fill("note 1")
      await expect(page.locator('[data-testid="find-counter"]')).not.toHaveText("")
    })
    await page.keyboard.press("Escape")

    for (const fmt of ["png", "svg", "pdf"] as const) {
      await page.getByRole("button", { name: /menu/i }).click()
      await page.getByText("Export image…").click()
      await page.locator(`[data-testid="format-${fmt}"]`).click()
      await m(`export ${fmt}`, async () => {
        const dl = page.waitForEvent("download", { timeout: 300_000 })
        await page.getByRole("button", { name: "Export", exact: true }).click()
        await dl
      })
      await page.keyboard.press("Escape")
    }

    results[n] = out
    console.log(`\n=== ${n} elements ===`)
    for (const s of out) {
      console.log(
        `${s.label.padEnd(30)} wall ${String(s.wallMs).padStart(6)}ms  p95 ${String(s.p95FrameMs).padStart(4)}  max ${String(s.maxFrameMs).padStart(5)}  long ${String(s.longTaskMs).padStart(6)}  json+ls ${s.stringifyAndStorageMs}`,
      )
      if (s.profile) console.log(s.profile)
    }
    if (process.env.PERF_OUT)
      writeFileSync(`${process.env.PERF_OUT}.${n}.json`, JSON.stringify(out, null, 1))
  })
}
