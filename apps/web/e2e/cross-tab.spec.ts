import { expect, test } from "@playwright/test"
import { drawRect, readScene } from "./_helpers"

type El = { id: string; type: string; isDeleted?: boolean }

test("two tabs no longer overwrite each other's work", async ({ page: tabA, context }) => {
  await tabA.goto("/")
  await tabA.evaluate(() => localStorage.clear())
  await tabA.reload()
  await tabA.locator('[data-testid="toolbar-rectangle"]').waitFor({ state: "visible" })

  const tabB = await context.newPage()
  await tabB.goto("/")
  await tabB.locator('[data-testid="toolbar-rectangle"]').waitFor({ state: "visible" })

  // Tab A draws; its save reaches tab B through the shared storage.
  await tabA.bringToFront()
  await drawRect(tabA, { x: 100, y: 120 }, { x: 200, y: 200 })
  await expect.poll(async () => (await readScene<El>(tabA)).length).toBe(1)

  // Tab B, which loaded before A drew, now draws too. Before the fix it saved its stale
  // document, wiping A's rectangle; now it has adopted A's save and keeps both.
  await tabB.bringToFront()
  await tabB.waitForTimeout(300)
  await drawRect(tabB, { x: 300, y: 120 }, { x: 400, y: 200 })
  await expect
    .poll(async () => (await readScene<El>(tabB)).filter((e) => e.type === "rectangle").length)
    .toBe(2)

  // And back in tab A, B's rectangle arrives the same way.
  await tabA.bringToFront()
  await drawRect(tabA, { x: 100, y: 300 }, { x: 200, y: 380 })
  await expect
    .poll(async () => (await readScene<El>(tabA)).filter((e) => e.type === "rectangle").length)
    .toBe(3)
})
