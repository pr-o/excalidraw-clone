import { render, screen } from "@testing-library/react"
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
})
