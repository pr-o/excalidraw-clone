import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { PagePickerFlyout, type PagePickerPage } from "../src/PagePickerFlyout"

const pages = (): PagePickerPage[] => [
  { id: "b", name: "Page B" },
  { id: "c", name: "Page C" },
  { id: "d", name: "Page D" },
]

const itemButton = (id: string): HTMLElement => screen.getByTestId(`page-picker-item-${id}`)

describe("PagePickerFlyout", () => {
  it("renders one row per page passed in (the caller has already excluded the current page)", () => {
    render(
      <PagePickerFlyout x={10} y={10} pages={pages()} onSelect={() => {}} onClose={() => {}} />,
    )
    expect(screen.getByText("Page B")).toBeInTheDocument()
    expect(screen.getByText("Page C")).toBeInTheDocument()
    expect(screen.getByText("Page D")).toBeInTheDocument()
    expect(screen.queryByText("Page A")).not.toBeInTheDocument()
  })

  it("focuses the first row when it opens", () => {
    render(
      <PagePickerFlyout x={10} y={10} pages={pages()} onSelect={() => {}} onClose={() => {}} />,
    )
    expect(itemButton("b")).toHaveFocus()
  })

  it("clicking a row calls onSelect with that page's id, and does not call onClose", async () => {
    const onSelect = vi.fn()
    const onClose = vi.fn()
    render(<PagePickerFlyout x={10} y={10} pages={pages()} onSelect={onSelect} onClose={onClose} />)
    await userEvent.click(screen.getByText("Page C"))
    expect(onSelect).toHaveBeenCalledWith("c")
    expect(onClose).not.toHaveBeenCalled()
  })

  it("Enter on the focused row calls onSelect with that page's id", async () => {
    const onSelect = vi.fn()
    render(
      <PagePickerFlyout x={10} y={10} pages={pages()} onSelect={onSelect} onClose={() => {}} />,
    )
    await userEvent.keyboard("{ArrowDown}{Enter}")
    expect(onSelect).toHaveBeenCalledWith("c")
  })

  it("ArrowDown focuses the next row and ArrowUp the previous", async () => {
    render(
      <PagePickerFlyout x={10} y={10} pages={pages()} onSelect={() => {}} onClose={() => {}} />,
    )
    await userEvent.keyboard("{ArrowDown}")
    expect(itemButton("c")).toHaveFocus()
    await userEvent.keyboard("{ArrowDown}")
    expect(itemButton("d")).toHaveFocus()
    await userEvent.keyboard("{ArrowUp}")
    expect(itemButton("c")).toHaveFocus()
  })

  it("ArrowDown from the last row wraps to the first", async () => {
    render(
      <PagePickerFlyout x={10} y={10} pages={pages()} onSelect={() => {}} onClose={() => {}} />,
    )
    await userEvent.keyboard("{ArrowUp}")
    expect(itemButton("d")).toHaveFocus()
    await userEvent.keyboard("{ArrowDown}")
    expect(itemButton("b")).toHaveFocus()
  })

  it("Home focuses the first row and End the last", async () => {
    render(
      <PagePickerFlyout x={10} y={10} pages={pages()} onSelect={() => {}} onClose={() => {}} />,
    )
    await userEvent.keyboard("{End}")
    expect(itemButton("d")).toHaveFocus()
    await userEvent.keyboard("{Home}")
    expect(itemButton("b")).toHaveFocus()
  })

  it("Escape calls onClose without invoking onSelect", async () => {
    const onSelect = vi.fn()
    const onClose = vi.fn()
    render(<PagePickerFlyout x={10} y={10} pages={pages()} onSelect={onSelect} onClose={onClose} />)
    await userEvent.keyboard("{Escape}")
    expect(onClose).toHaveBeenCalled()
    expect(onSelect).not.toHaveBeenCalled()
  })

  it("a pointerdown outside the flyout calls onClose", async () => {
    const onClose = vi.fn()
    render(
      <div>
        <button type="button">outside</button>
        <PagePickerFlyout x={10} y={10} pages={pages()} onSelect={() => {}} onClose={onClose} />
      </div>,
    )
    await userEvent.click(screen.getByText("outside"))
    expect(onClose).toHaveBeenCalled()
  })

  it("assigns each row and the flyout a stable data-testid for e2e targeting", () => {
    render(
      <PagePickerFlyout x={10} y={10} pages={pages()} onSelect={() => {}} onClose={() => {}} />,
    )
    expect(document.querySelector('[data-testid="page-picker-flyout"]')).not.toBeNull()
    expect(document.querySelector('[data-testid="page-picker-item-b"]')).not.toBeNull()
  })
})
