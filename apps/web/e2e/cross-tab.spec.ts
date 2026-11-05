import { expect, test } from "@playwright/test"
import { drawRect, readScene } from "./_helpers"

type El = { id: string; type: string; isDeleted?: boolean }

const SYNCED = "Updated with changes from another tab"

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
  // document, wiping A's rectangle; now it has adopted A's save and keeps both. Wait for
  // the adoption itself (announced in the live region), not a fixed delay.
  await expect(tabB.getByTestId("live-announcer")).toContainText(SYNCED)
  await tabB.bringToFront()
  await drawRect(tabB, { x: 300, y: 120 }, { x: 400, y: 200 })
  await expect
    .poll(async () => (await readScene<El>(tabB)).filter((e) => e.type === "rectangle").length)
    .toBe(2)

  // And back in tab A, B's rectangle arrives the same way.
  await expect(tabA.getByTestId("live-announcer")).toContainText(SYNCED)
  await tabA.bringToFront()
  await drawRect(tabA, { x: 100, y: 300 }, { x: 200, y: 380 })
  await expect
    .poll(async () => (await readScene<El>(tabA)).filter((e) => e.type === "rectangle").length)
    .toBe(3)
})

test("edits made in two tabs at the same moment are merged, not lost", async ({
  page: tabA,
  context,
}) => {
  await tabA.goto("/")
  await tabA.evaluate(() => localStorage.clear())
  await tabA.reload()
  await tabA.locator('[data-testid="toolbar-rectangle"]').waitFor({ state: "visible" })
  const tabB = await context.newPage()
  await tabB.goto("/")
  await tabB.locator('[data-testid="toolbar-rectangle"]').waitFor({ state: "visible" })
  await tabB.waitForTimeout(800) // both tabs settled on the same stored document

  // Tab B draws; its save is still pending (the auto-save waits half a second)...
  await tabB.bringToFront()
  await drawRect(tabB, { x: 300, y: 120 }, { x: 400, y: 200 })
  // ...when the other tab saves an edit of its own: a shape with a known id.
  await tabA.evaluate(() => {
    const doc = JSON.parse(localStorage.getItem("excalidraw-scene")!) as {
      pages: { elements: unknown[] }[]
    }
    doc.pages[0]!.elements.push({
      id: "from-other-tab",
      type: "rectangle",
      x: 50,
      y: 300,
      width: 80,
      height: 40,
    })
    localStorage.setItem("excalidraw-scene", JSON.stringify(doc))
  })

  // Tab B merges instead of overwriting: both shapes end up stored.
  await expect
    .poll(async () => (await readScene<El>(tabB)).filter((e) => e.type === "rectangle").length)
    .toBe(2)
  const stored = await readScene<El>(tabB)
  expect(stored.map((e) => e.id)).toContain("from-other-tab")
})
