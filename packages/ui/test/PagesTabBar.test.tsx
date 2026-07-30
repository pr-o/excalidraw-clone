import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { PagesTabBar } from "../src/PagesTabBar"

const t = (key: string): string => key

const pages = [
  { id: "p1", name: "Page 1" },
  { id: "p2", name: "Page 2" },
]

const handlers = {
  onSwitch: vi.fn(),
  onAdd: vi.fn(),
  onDelete: vi.fn(),
  onRename: vi.fn(),
  onDuplicate: vi.fn(),
  onReorder: vi.fn(),
  onMove: vi.fn(),
}

const firePointer = (
  el: Element,
  type: "pointerdown" | "pointermove" | "pointerup",
  clientX = 0,
): boolean => fireEvent(el, new MouseEvent(type, { clientX, bubbles: true }))

const stubRect = (el: HTMLElement, rect: { left: number; width: number }): void => {
  el.getBoundingClientRect = () => ({
    left: rect.left,
    right: rect.left + rect.width,
    width: rect.width,
    top: 0,
    bottom: 33,
    height: 33,
    x: rect.left,
    y: 0,
    toJSON: () => ({}),
  })
}

describe("PagesTabBar", () => {
  it("renders one tab per page", () => {
    render(<PagesTabBar t={t} pages={pages} activePageId="p1" {...handlers} />)
    expect(screen.getByTestId("page-tab-p1")).toBeInTheDocument()
    expect(screen.getByTestId("page-tab-p2")).toBeInTheDocument()
  })

  it("clicking a tab calls onSwitch with its id", async () => {
    const onSwitch = vi.fn()
    render(<PagesTabBar t={t} pages={pages} activePageId="p1" {...handlers} onSwitch={onSwitch} />)
    await userEvent.click(screen.getByTestId("page-switch-p2"))
    expect(onSwitch).toHaveBeenCalledWith("p2")
  })

  it("clicking + calls onAdd", async () => {
    const onAdd = vi.fn()
    render(<PagesTabBar t={t} pages={pages} activePageId="p1" {...handlers} onAdd={onAdd} />)
    await userEvent.click(screen.getByTestId("page-add"))
    expect(onAdd).toHaveBeenCalled()
  })

  it("delete is disabled when only one page remains", () => {
    render(<PagesTabBar t={t} pages={[pages[0]!]} activePageId="p1" {...handlers} />)
    expect(screen.getByTestId("page-delete-p1")).toBeDisabled()
  })

  it("delete is enabled with multiple pages and calls onDelete with the id", async () => {
    const onDelete = vi.fn()
    render(<PagesTabBar t={t} pages={pages} activePageId="p1" {...handlers} onDelete={onDelete} />)
    await userEvent.click(screen.getByTestId("page-delete-p2"))
    expect(onDelete).toHaveBeenCalledWith("p2")
  })

  it("clicking duplicate calls onDuplicate with the id", async () => {
    const onDuplicate = vi.fn()
    render(
      <PagesTabBar t={t} pages={pages} activePageId="p1" {...handlers} onDuplicate={onDuplicate} />,
    )
    await userEvent.click(screen.getByTestId("page-duplicate-p1"))
    expect(onDuplicate).toHaveBeenCalledWith("p1")
  })

  it("reorder-left is disabled for the first tab, reorder-right disabled for the last", () => {
    render(<PagesTabBar t={t} pages={pages} activePageId="p1" {...handlers} />)
    expect(screen.getByTestId("page-reorder-left-p1")).toBeDisabled()
    expect(screen.getByTestId("page-reorder-right-p2")).toBeDisabled()
    expect(screen.getByTestId("page-reorder-right-p1")).not.toBeDisabled()
  })

  it("clicking reorder-right calls onReorder with the id and direction", async () => {
    const onReorder = vi.fn()
    render(
      <PagesTabBar t={t} pages={pages} activePageId="p1" {...handlers} onReorder={onReorder} />,
    )
    await userEvent.click(screen.getByTestId("page-reorder-right-p1"))
    expect(onReorder).toHaveBeenCalledWith("p1", "right")
  })

  it("double-clicking a tab name enters rename mode, Enter commits via onRename", async () => {
    const onRename = vi.fn()
    render(<PagesTabBar t={t} pages={pages} activePageId="p1" {...handlers} onRename={onRename} />)
    await userEvent.dblClick(screen.getByTestId("page-switch-p1"))
    const input = screen.getByTestId("page-rename-input-p1")
    await userEvent.clear(input)
    await userEvent.type(input, "Renamed{Enter}")
    expect(onRename).toHaveBeenCalledWith("p1", "Renamed")
  })

  it("renders a thumbnail image when a thumbnail entry exists for a page", () => {
    render(
      <PagesTabBar
        t={t}
        pages={pages}
        activePageId="p1"
        thumbnails={{ p1: "data:image/png;base64,AAAA" }}
        {...handlers}
      />,
    )
    const thumb = screen.getByTestId("page-thumb-p1")
    expect(thumb.tagName).toBe("IMG")
    expect(thumb).toHaveAttribute("src", "data:image/png;base64,AAAA")
  })

  it("renders a blank box when no thumbnail entry exists for a page", () => {
    render(<PagesTabBar t={t} pages={pages} activePageId="p1" {...handlers} />)
    const thumb = screen.getByTestId("page-thumb-p1")
    expect(thumb.tagName).toBe("DIV")
  })

  it("dragging a tab past a sibling's midpoint calls onMove with the resulting target index", () => {
    const onMove = vi.fn()
    render(<PagesTabBar t={t} pages={pages} activePageId="p1" {...handlers} onMove={onMove} />)
    const tab1 = screen.getByTestId("page-tab-p1")
    const tab2 = screen.getByTestId("page-tab-p2")
    stubRect(tab1, { left: 0, width: 100 })
    stubRect(tab2, { left: 100, width: 100 })
    const bar = screen.getByTestId("pages-tab-bar")

    firePointer(tab1, "pointerdown")
    firePointer(bar, "pointermove", 160)
    firePointer(bar, "pointerup")

    expect(onMove).toHaveBeenCalledWith("p1", 1)
  })

  it("dragging a tab left past a sibling's midpoint calls onMove with the resulting target index", () => {
    const onMove = vi.fn()
    render(<PagesTabBar t={t} pages={pages} activePageId="p1" {...handlers} onMove={onMove} />)
    const tab1 = screen.getByTestId("page-tab-p1")
    const tab2 = screen.getByTestId("page-tab-p2")
    stubRect(tab1, { left: 0, width: 100 })
    stubRect(tab2, { left: 100, width: 100 })
    const bar = screen.getByTestId("pages-tab-bar")

    firePointer(tab2, "pointerdown")
    firePointer(bar, "pointermove", 20)
    firePointer(bar, "pointerup")

    expect(onMove).toHaveBeenCalledWith("p2", 0)
  })

  it("a drag that never crosses a sibling midpoint is a no-op", () => {
    const onMove = vi.fn()
    render(<PagesTabBar t={t} pages={pages} activePageId="p1" {...handlers} onMove={onMove} />)
    const tab1 = screen.getByTestId("page-tab-p1")
    const bar = screen.getByTestId("pages-tab-bar")

    firePointer(tab1, "pointerdown")
    firePointer(bar, "pointerup")

    expect(onMove).not.toHaveBeenCalled()
  })

  it("renders the drop-line indicator only while a drag with a computed target is in progress", () => {
    render(<PagesTabBar t={t} pages={pages} activePageId="p1" {...handlers} />)
    expect(screen.queryByTestId("page-drop-line")).not.toBeInTheDocument()

    const tab1 = screen.getByTestId("page-tab-p1")
    const tab2 = screen.getByTestId("page-tab-p2")
    stubRect(tab1, { left: 0, width: 100 })
    stubRect(tab2, { left: 100, width: 100 })
    const bar = screen.getByTestId("pages-tab-bar")

    firePointer(tab1, "pointerdown")
    firePointer(bar, "pointermove", 160)
    expect(screen.getByTestId("page-drop-line")).toBeInTheDocument()

    firePointer(bar, "pointerup")
    expect(screen.queryByTestId("page-drop-line")).not.toBeInTheDocument()
  })

  it("pointerdown on a reorder/duplicate/delete button does not start a drag", () => {
    const onMove = vi.fn()
    render(<PagesTabBar t={t} pages={pages} activePageId="p1" {...handlers} onMove={onMove} />)
    const bar = screen.getByTestId("pages-tab-bar")

    firePointer(screen.getByTestId("page-reorder-right-p1"), "pointerdown")
    firePointer(bar, "pointermove", 160)
    firePointer(bar, "pointerup")

    expect(onMove).not.toHaveBeenCalled()
    expect(screen.queryByTestId("page-drop-line")).not.toBeInTheDocument()
  })
})
