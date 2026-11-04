import { expect, test, type Page } from "@playwright/test"
import { drawRect, freshCanvas } from "./_helpers"

type Fsa = { saves: number; opens: number; writes: { name: string; text: string }[] }

/** Fake File System Access pickers: they hand out in-memory handles and record writes. */
async function stubFileSystemAccess(page: Page, openContent = ""): Promise<void> {
  await page.addInitScript((content) => {
    const fsa: Fsa = { saves: 0, opens: 0, writes: [] }
    ;(window as unknown as { __fsa: Fsa }).__fsa = fsa
    const handle = (name: string, body = "") => ({
      kind: "file",
      name,
      getFile: () => Promise.resolve(new File([body], name)),
      createWritable: () =>
        Promise.resolve({
          write: async (data: Blob) => {
            fsa.writes.push({ name, text: await data.text() })
          },
          close: () => Promise.resolve(),
        }),
    })
    const w = window as unknown as Record<string, unknown>
    w.showSaveFilePicker = () => {
      fsa.saves += 1
      return Promise.resolve(handle("my-plan.excalidraw"))
    }
    w.showOpenFilePicker = () => {
      fsa.opens += 1
      return Promise.resolve([handle("opened.excalidraw", content)])
    }
  }, openContent)
}

const fsaState = (page: Page): Promise<Fsa> =>
  page.evaluate(() => (window as unknown as { __fsa: Fsa }).__fsa)

const rectCount = (text: string): number =>
  (JSON.parse(text) as { pages: { elements: { type: string }[] }[] }).pages[0]!.elements.filter(
    (e) => e.type === "rectangle",
  ).length

test("Ctrl+S asks where to save once, then saves back to the same file", async ({ page }) => {
  await stubFileSystemAccess(page)
  await freshCanvas(page)
  await drawRect(page, { x: 100, y: 120 }, { x: 200, y: 200 })

  await page.keyboard.press("ControlOrMeta+s")
  await expect.poll(async () => (await fsaState(page)).writes.length).toBe(1)
  await expect(page.getByTestId("notice-toast")).toContainText("my-plan.excalidraw")

  await drawRect(page, { x: 300, y: 120 }, { x: 400, y: 200 })
  await page.keyboard.press("ControlOrMeta+s")
  await expect.poll(async () => (await fsaState(page)).writes.length).toBe(2)
  const state = await fsaState(page)
  expect(state.saves).toBe(1)
  expect(state.writes.map((w) => w.name)).toEqual(["my-plan.excalidraw", "my-plan.excalidraw"])
  expect(rectCount(state.writes[1]!.text)).toBe(2)
})

test("a drawing opened from a file is saved back to that file", async ({ page }) => {
  const doc = JSON.stringify({
    type: "excalidraw",
    version: 3,
    source: "test",
    activePageId: "p",
    pages: [{ id: "p", name: "Opened", elements: [] }],
  })
  await stubFileSystemAccess(page, doc)
  await freshCanvas(page)
  await page.getByRole("button", { name: /menu/i }).click()
  await page.getByText("Open…").click()
  await expect.poll(async () => (await fsaState(page)).opens).toBe(1)

  await drawRect(page, { x: 100, y: 120 }, { x: 200, y: 200 })
  await page.getByRole("button", { name: /menu/i }).click()
  await page.getByTestId("menu-save").click()
  await expect.poll(async () => (await fsaState(page)).writes.length).toBe(1)
  const state = await fsaState(page)
  expect(state.saves).toBe(0)
  expect(state.writes[0]!.name).toBe("opened.excalidraw")
  expect(rectCount(state.writes[0]!.text)).toBe(1)
})

test("Ctrl+Shift+S always asks for a new location", async ({ page }) => {
  await stubFileSystemAccess(page)
  await freshCanvas(page)
  await drawRect(page, { x: 100, y: 120 }, { x: 200, y: 200 })
  await page.keyboard.press("ControlOrMeta+s")
  await expect.poll(async () => (await fsaState(page)).saves).toBe(1)
  await page.keyboard.press("ControlOrMeta+Shift+s")
  await expect.poll(async () => (await fsaState(page)).saves).toBe(2)
})
