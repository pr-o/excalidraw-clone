import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { ContextMenu, type ContextMenuItem } from "../src/ContextMenu"

const items = (): ContextMenuItem[] => [
  { id: "copy", label: "Copy", hint: "Ctrl+C", perform: vi.fn() },
  { id: "delete", label: "Delete", perform: vi.fn() },
  { id: "duplicate", label: "Duplicate", perform: vi.fn() },
]

const itemButton = (id: string): HTMLElement => screen.getByTestId(`context-menu-item-${id}`)

describe("ContextMenu", () => {
  it("renders every item's label and hint", () => {
    render(<ContextMenu x={10} y={10} items={items()} onClose={() => {}} />)
    expect(screen.getByText("Copy")).toBeInTheDocument()
    expect(screen.getByText("Ctrl+C")).toBeInTheDocument()
    expect(screen.getByText("Delete")).toBeInTheDocument()
  })

  it("clicking an item calls perform then onClose", async () => {
    const onClose = vi.fn()
    const list = items()
    render(<ContextMenu x={10} y={10} items={list} onClose={onClose} />)
    await userEvent.click(screen.getByText("Delete"))
    expect(list[1]!.perform).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it("Escape closes without invoking any item", async () => {
    const onClose = vi.fn()
    const list = items()
    render(<ContextMenu x={10} y={10} items={list} onClose={onClose} />)
    await userEvent.keyboard("{Escape}")
    expect(onClose).toHaveBeenCalled()
    for (const item of list) expect(item.perform).not.toHaveBeenCalled()
  })

  it("a pointerdown outside the menu closes it", async () => {
    const onClose = vi.fn()
    render(
      <div>
        <button type="button">outside</button>
        <ContextMenu x={10} y={10} items={items()} onClose={onClose} />
      </div>,
    )
    await userEvent.click(screen.getByText("outside"))
    expect(onClose).toHaveBeenCalled()
  })

  it("assigns each item a stable data-testid for e2e targeting", () => {
    render(<ContextMenu x={10} y={10} items={items()} onClose={() => {}} />)
    expect(document.querySelector('[data-testid="context-menu-item-copy"]')).not.toBeNull()
    expect(document.querySelector('[data-testid="context-menu-item-delete"]')).not.toBeNull()
  })

  it("focuses the first item when the menu opens", () => {
    render(<ContextMenu x={10} y={10} items={items()} onClose={() => {}} />)
    expect(itemButton("copy")).toHaveFocus()
  })

  it("ArrowDown focuses the next item and ArrowUp the previous", async () => {
    render(<ContextMenu x={10} y={10} items={items()} onClose={() => {}} />)
    await userEvent.keyboard("{ArrowDown}")
    expect(itemButton("delete")).toHaveFocus()
    await userEvent.keyboard("{ArrowDown}")
    expect(itemButton("duplicate")).toHaveFocus()
    await userEvent.keyboard("{ArrowUp}")
    expect(itemButton("delete")).toHaveFocus()
  })

  it("ArrowDown from the last item wraps to the first", async () => {
    render(<ContextMenu x={10} y={10} items={items()} onClose={() => {}} />)
    await userEvent.keyboard("{ArrowUp}")
    expect(itemButton("duplicate")).toHaveFocus()
    await userEvent.keyboard("{ArrowDown}")
    expect(itemButton("copy")).toHaveFocus()
  })

  it("Home focuses the first item and End the last", async () => {
    render(<ContextMenu x={10} y={10} items={items()} onClose={() => {}} />)
    await userEvent.keyboard("{End}")
    expect(itemButton("duplicate")).toHaveFocus()
    await userEvent.keyboard("{Home}")
    expect(itemButton("copy")).toHaveFocus()
  })

  it("Enter on the focused item calls perform then onClose", async () => {
    const onClose = vi.fn()
    const list = items()
    render(<ContextMenu x={10} y={10} items={list} onClose={onClose} />)
    await userEvent.keyboard("{ArrowDown}{Enter}")
    expect(list[1]!.perform).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it("Space on the focused item calls perform then onClose", async () => {
    const onClose = vi.fn()
    const list = items()
    render(<ContextMenu x={10} y={10} items={list} onClose={onClose} />)
    await userEvent.keyboard("{ArrowUp}[Space]")
    expect(list[2]!.perform).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })
})
