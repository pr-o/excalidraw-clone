import { readFileSync } from "node:fs"
import { expect, test, type Page } from "@playwright/test"
import { dragOnCanvas, parseStoredScene } from "./_helpers"

type TableEl = {
  id: string
  type: string
  x: number
  y: number
  width: number
  height: number
  rows: number
  cols: number
  colWidths: number[]
  rowHeights: number[]
  cells: string[][]
  headerRow: boolean
  isDeleted?: boolean
}

const readTables = async (page: Page): Promise<TableEl[]> => {
  await page.waitForTimeout(900) // autosave debounce
  const json = await page.evaluate(() => localStorage.getItem("excalidraw-scene"))
  return parseStoredScene<TableEl>(json).elements.filter((e) => e.type === "table" && !e.isDeleted)
}

const freshCanvas = async (page: Page): Promise<void> => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('[data-testid="toolbar-more-shapes"]').waitFor({ state: "visible" })
}

const at = async (page: Page, p: { x: number; y: number }) => {
  const box = await page.locator("canvas").first().boundingBox()
  if (!box) throw new Error("canvas not found")
  return { x: box.x + p.x, y: box.y + p.y }
}

const drawTable = async (page: Page): Promise<void> => {
  await page.locator('[data-testid="toolbar-more-shapes"]').click()
  await page.locator('[data-testid="toolbar-table"]').click()
  await dragOnCanvas(page, { x: 100, y: 100 }, { x: 400, y: 220 })
  await page.waitForTimeout(120)
}

test("drag creates a 3x3 table; click creates the default size", async ({ page }) => {
  await freshCanvas(page)
  await drawTable(page)
  let tables = await readTables(page)
  expect(tables).toHaveLength(1)
  expect(tables[0]).toMatchObject({ rows: 3, cols: 3, width: 300, height: 120 })
  expect(tables[0]!.colWidths).toEqual([100, 100, 100])

  await page.locator('[data-testid="toolbar-more-shapes"]').click()
  await page.locator('[data-testid="toolbar-table"]').click()
  const p = await at(page, { x: 100, y: 400 })
  await page.mouse.click(p.x, p.y)
  tables = await readTables(page)
  expect(tables).toHaveLength(2)
  expect(tables[1]).toMatchObject({ width: 360, height: 120 })
  expect(tables[1]!.colWidths).toEqual([120, 120, 120])
})

test("type in cells with Tab navigation, add row via panel (one undo), resize a column, persist, export", async ({
  page,
}) => {
  await freshCanvas(page)
  await drawTable(page)

  // double-click the first cell and type, Tab, type, Escape
  const first = await at(page, { x: 150, y: 120 })
  await page.mouse.dblclick(first.x, first.y)
  const input = page.locator('[data-testid="table-cell-input"]')
  await expect(input).toBeVisible()
  await page.keyboard.type("Hello")
  await page.keyboard.press("Tab")
  await page.keyboard.type("World")
  await page.keyboard.press("Escape")
  await expect(input).toHaveCount(0)

  let [table] = await readTables(page)
  expect(table!.cells[0]).toEqual(["Hello", "World", ""])

  // add a row from the panel (acts after the last-edited cell's row)
  await page.locator('[data-testid="table-add-row"]').click()
  ;[table] = await readTables(page)
  expect(table!.rows).toBe(4)
  expect(table!.height).toBe(160)
  expect(table!.cells[0]).toEqual(["Hello", "World", ""])

  // a single undo removes the row and nothing else
  await page.keyboard.press("Control+z")
  ;[table] = await readTables(page)
  expect(table!.rows).toBe(3)
  expect(table!.cells[0]).toEqual(["Hello", "World", ""])

  // header toggle
  await page.locator('[data-testid="table-header-toggle"]').click()
  ;[table] = await readTables(page)
  expect(table!.headerRow).toBe(false)

  // drag the border between column 0 and 1 (x = 200) to the right by 40
  const from = await at(page, { x: 200, y: 160 })
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + 40, from.y, { steps: 6 })
  await page.mouse.up()
  ;[table] = await readTables(page)
  expect(table!.colWidths).toEqual([140, 100, 100])
  expect(table!.width).toBe(340)

  // survives a reload and is still editable
  await page.reload()
  await page.locator('[data-testid="toolbar-more-shapes"]').waitFor({ state: "visible" })
  ;[table] = await readTables(page)
  expect(table!.cells[0]).toEqual(["Hello", "World", ""])
  const again = await at(page, { x: 150, y: 120 })
  await page.mouse.click(again.x, again.y)
  await page.mouse.dblclick(again.x, again.y)
  await expect(page.locator('[data-testid="table-cell-input"]')).toHaveValue("Hello")
  await page.keyboard.press("Escape")

  // the exported SVG carries the cell text
  await page.getByRole("button", { name: /menu/i }).click()
  await page.getByText("Export image…").click()
  await page.locator('[data-testid="format-svg"]').click()
  const downloadPromise = page.waitForEvent("download")
  await page.getByRole("button", { name: "Export", exact: true }).click()
  const svg = readFileSync(await (await downloadPromise).path(), "utf8")
  expect(svg).toContain(">Hello</text>")
  expect(svg).toContain(">World</text>")
})

test("context menu on a cell inserts a column to its right", async ({ page }) => {
  await freshCanvas(page)
  await drawTable(page)
  const mid = await at(page, { x: 250, y: 120 }) // column 1
  await page.mouse.click(mid.x, mid.y, { button: "right" })
  await page.locator('[data-testid="context-menu-item-table-insert-col-right"]').click()
  const [table] = await readTables(page)
  expect(table!.cols).toBe(4)
  expect(table!.cells.every((r) => r.length === 4)).toBe(true)
  expect(table!.width).toBe(400)
})

test("Enter moves down a cell and the rest of the structure ops work", async ({ page }) => {
  await freshCanvas(page)
  await drawTable(page)
  const first = await at(page, { x: 150, y: 120 })
  await page.mouse.dblclick(first.x, first.y)
  await page.keyboard.type("a")
  await page.keyboard.press("Enter")
  await page.keyboard.type("b")
  await page.keyboard.press("Escape")
  await page.locator('[data-testid="table-del-col"]').click()
  const [table] = await readTables(page)
  // active cell was (1,0): column 0 deleted, taking "a" and "b" with it
  expect(table!.cols).toBe(2)
  expect(table!.cells.flat().join("")).toBe("")
})

test("find on canvas jumps to a table by cell text", async ({ page }) => {
  await freshCanvas(page)
  await drawTable(page)
  const first = await at(page, { x: 150, y: 120 })
  await page.mouse.dblclick(first.x, first.y)
  await page.keyboard.type("needle")
  await page.keyboard.press("Escape")
  await page.keyboard.press("Escape") // deselect
  await page.keyboard.press("Control+f")
  await page.locator('[data-testid="find-input"]').fill("needle")
  await page.keyboard.press("Enter")
  await expect(page.locator('[data-testid="table-add-row"]')).toBeVisible()
})
