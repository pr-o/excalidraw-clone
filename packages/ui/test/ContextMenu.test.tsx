import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { ContextMenu, type ContextMenuItem } from "../src/ContextMenu"

const items = (): ContextMenuItem[] => [
  { id: "copy", label: "Copy", hint: "Ctrl+C", perform: vi.fn() },
  { id: "delete", label: "Delete", perform: vi.fn() },
]

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
})
