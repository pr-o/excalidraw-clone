import { newTable, Scene, type ExcalidrawTableElement } from "@excalidraw-clone/scene"
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import React from "react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { TextEditingOverlay } from "../src/components/TextEditingOverlay"
import { useAppStore } from "../src/store"

const setup = (rows = 2, cols = 2) => {
  const scene = new Scene()
  const table = { ...newTable({ x: 0, y: 0, rows, cols }), id: "T" }
  scene.mutate((d) => d.push(table))
  return scene
}
const tableOf = (scene: Scene): ExcalidrawTableElement =>
  scene.getElements().find((e) => e.id === "T") as ExcalidrawTableElement

const mount = (scene: Scene, cell = { row: 0, col: 0 }) => {
  useAppStore.getState().setTextEditElementId("T", cell)
  const utils = render(<TextEditingOverlay scene={scene} />)
  const area = async (): Promise<HTMLTextAreaElement> => {
    const node = utils.container.querySelector("textarea") as HTMLTextAreaElement
    await waitFor(() => expect(document.activeElement).toBe(node))
    return node
  }
  return { ...utils, area }
}

beforeEach(() => {
  useAppStore.getState().setTextEditElementId(null)
  useAppStore.getState().setView({ scrollX: 0, scrollY: 0, zoom: 1 })
})
afterEach(() => cleanup())

describe("TableCellEditor", () => {
  it("opens over the edited cell, sized to it", async () => {
    const scene = setup()
    const { area } = mount(scene, { row: 1, col: 1 })
    const node = await area()
    // 2x2 default: 120x40 cells => cell (1,1) at 120,40
    expect(node.style.left).toBe("120px")
    expect(node.style.top).toBe("40px")
    expect(node.style.width).toBe("120px")
    expect(node.style.height).toBe("40px")
  })

  it("Tab commits and moves to the next cell, keeping the typed text", async () => {
    const scene = setup()
    const { area } = mount(scene)
    let node = await area()
    fireEvent.change(node, { target: { value: "a" } })
    fireEvent.keyDown(node, { key: "Tab" })
    expect(tableOf(scene).cells[0]).toEqual(["a", ""])
    expect(useAppStore.getState().textEditCell).toEqual({ row: 0, col: 1 })
    node = await area()
    fireEvent.change(node, { target: { value: "b" } })
    fireEvent.keyDown(node, { key: "Tab" })
    // wraps to the start of the next row
    expect(useAppStore.getState().textEditCell).toEqual({ row: 1, col: 0 })
    expect(tableOf(scene).cells[0]).toEqual(["a", "b"])
  })

  it("Shift+Tab moves back; at the first cell it stays put", async () => {
    const scene = setup()
    const { area } = mount(scene, { row: 0, col: 1 })
    let node = await area()
    fireEvent.keyDown(node, { key: "Tab", shiftKey: true })
    expect(useAppStore.getState().textEditCell).toEqual({ row: 0, col: 0 })
    node = await area()
    fireEvent.keyDown(node, { key: "Tab", shiftKey: true })
    expect(useAppStore.getState().textEditCell).toEqual({ row: 0, col: 0 })
    expect(useAppStore.getState().textEditElementId).toBe("T")
  })

  it("Tab on the last cell appends a row and moves into it", async () => {
    const scene = setup()
    const { area } = mount(scene, { row: 1, col: 1 })
    const node = await area()
    fireEvent.change(node, { target: { value: "end" } })
    fireEvent.keyDown(node, { key: "Tab" })
    const t = tableOf(scene)
    expect(t.rows).toBe(3)
    expect(t.cells[1]![1]).toBe("end")
    expect(t.height).toBe(120)
    expect(useAppStore.getState().textEditCell).toEqual({ row: 2, col: 0 })
  })

  it("Enter commits and moves to the cell below; on the last row it exits", async () => {
    const scene = setup()
    const { area } = mount(scene)
    let node = await area()
    fireEvent.change(node, { target: { value: "x" } })
    fireEvent.keyDown(node, { key: "Enter" })
    expect(tableOf(scene).cells[0]![0]).toBe("x")
    expect(useAppStore.getState().textEditCell).toEqual({ row: 1, col: 0 })
    node = await area()
    fireEvent.change(node, { target: { value: "y" } })
    fireEvent.keyDown(node, { key: "Enter" })
    expect(tableOf(scene).cells[1]![0]).toBe("y")
    expect(useAppStore.getState().textEditElementId).toBeNull()
  })

  it("Shift+Enter is left to the textarea (newline), not a commit", async () => {
    const scene = setup()
    const { area } = mount(scene)
    const node = await area()
    const notPrevented = fireEvent.keyDown(node, { key: "Enter", shiftKey: true })
    expect(notPrevented).toBe(true)
    expect(useAppStore.getState().textEditElementId).toBe("T")
    expect(tableOf(scene).cells[0]![0]).toBe("")
  })

  it("Escape commits the cell and exits", async () => {
    const scene = setup()
    const { area } = mount(scene)
    const node = await area()
    fireEvent.change(node, { target: { value: "kept" } })
    fireEvent.keyDown(node, { key: "Escape" })
    expect(tableOf(scene).cells[0]![0]).toBe("kept")
    expect(useAppStore.getState().textEditElementId).toBeNull()
  })

  it("click-away (blur) commits once", async () => {
    const scene = setup()
    const { area } = mount(scene)
    const node = await area()
    fireEvent.change(node, { target: { value: "away" } })
    fireEvent.blur(node)
    expect(tableOf(scene).cells[0]![0]).toBe("away")
    expect(useAppStore.getState().textEditElementId).toBeNull()
  })

  it("IME composition: Enter/Tab while composing neither commit nor move", async () => {
    const scene = setup()
    const { area } = mount(scene)
    const node = await area()
    fireEvent.compositionStart(node)
    fireEvent.change(node, { target: { value: "ㅎ" } })
    fireEvent.keyDown(node, { key: "Enter", keyCode: 229, isComposing: true })
    fireEvent.keyDown(node, { key: "Tab", isComposing: true })
    expect(useAppStore.getState().textEditCell).toEqual({ row: 0, col: 0 })
    expect(tableOf(scene).cells[0]![0]).toBe("")
    fireEvent.change(node, { target: { value: "한글" } })
    fireEvent.compositionEnd(node)
    fireEvent.keyDown(node, { key: "Enter" })
    expect(tableOf(scene).cells[0]![0]).toBe("한글")
  })

  it("an unchanged cell adds no undo entry; a change is one entry", async () => {
    const scene = setup()
    const before = scene.getHistory().length
    const { area } = mount(scene)
    let node = await area()
    fireEvent.keyDown(node, { key: "Tab" })
    expect(scene.getHistory().length).toBe(before)
    node = await area()
    fireEvent.change(node, { target: { value: "z" } })
    fireEvent.keyDown(node, { key: "Tab" })
    expect(scene.getHistory().length).toBe(before + 1)
  })
})
