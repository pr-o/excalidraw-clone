import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { FindOverlay, type FindOverlayProps } from "../src/FindOverlay"

const t = (key: string): string => key

function props(overrides: Partial<FindOverlayProps> = {}): FindOverlayProps {
  return {
    t,
    open: true,
    onClose: vi.fn(),
    query: "",
    onQueryChange: vi.fn(),
    matchIndex: 0,
    matchCount: 0,
    onNext: vi.fn(),
    onPrev: vi.fn(),
    ...overrides,
  }
}

describe("FindOverlay", () => {
  it("renders nothing when closed", () => {
    const { container } = render(<FindOverlay {...props({ open: false })} />)
    expect(container.firstChild).toBeNull()
  })

  it("shows the query and the counter when open", () => {
    render(<FindOverlay {...props({ query: "hello", matchIndex: 1, matchCount: 2 })} />)
    expect(screen.getByTestId("find-input")).toHaveValue("hello")
    expect(screen.getByTestId("find-counter")).toHaveTextContent("1 of 2")
  })

  it("shows '0 of 0' when there are no matches", () => {
    render(<FindOverlay {...props({ query: "zzz", matchIndex: 0, matchCount: 0 })} />)
    expect(screen.getByTestId("find-counter")).toHaveTextContent("0 of 0")
  })

  it("typing calls onQueryChange with the new value and does not filter internally", async () => {
    const onQueryChange = vi.fn()
    render(<FindOverlay {...props({ query: "", onQueryChange })} />)
    await userEvent.type(screen.getByTestId("find-input"), "a")
    expect(onQueryChange).toHaveBeenCalledWith("a")
    // controlled: the input still shows the prop value, not internal state
    expect(screen.getByTestId("find-input")).toHaveValue("")
  })

  it("Enter calls onNext and not onPrev", async () => {
    const onNext = vi.fn()
    const onPrev = vi.fn()
    render(<FindOverlay {...props({ query: "a", matchIndex: 1, matchCount: 2, onNext, onPrev })} />)
    await userEvent.type(screen.getByTestId("find-input"), "{Enter}")
    expect(onNext).toHaveBeenCalledTimes(1)
    expect(onPrev).not.toHaveBeenCalled()
  })

  it("Shift+Enter calls onPrev and not onNext", async () => {
    const onNext = vi.fn()
    const onPrev = vi.fn()
    render(<FindOverlay {...props({ query: "a", matchIndex: 1, matchCount: 2, onNext, onPrev })} />)
    await userEvent.type(screen.getByTestId("find-input"), "{Shift>}{Enter}{/Shift}")
    expect(onPrev).toHaveBeenCalledTimes(1)
    expect(onNext).not.toHaveBeenCalled()
  })

  it("Escape calls onClose", async () => {
    const onClose = vi.fn()
    render(<FindOverlay {...props({ query: "a", onClose })} />)
    await userEvent.type(screen.getByTestId("find-input"), "{Escape}")
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("clicking the close button calls onClose", async () => {
    const onClose = vi.fn()
    render(<FindOverlay {...props({ query: "a", onClose })} />)
    await userEvent.click(screen.getByTestId("find-close"))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it.each([
    ["Ctrl", { ctrlKey: true }],
    ["Meta", { metaKey: true }],
  ])("%s+F on the focused input is trapped and selects the query", (_label, modifier) => {
    const onClose = vi.fn()
    const onNext = vi.fn()
    const onPrev = vi.fn()
    render(
      <FindOverlay
        {...props({ query: "abc", matchIndex: 1, matchCount: 2, onClose, onNext, onPrev })}
      />,
    )
    const input = screen.getByTestId<HTMLInputElement>("find-input")

    const handled = fireEvent.keyDown(input, { key: "f", ...modifier })

    // fireEvent returns false when a handler called preventDefault().
    expect(handled).toBe(false)
    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe(3)
    expect(onClose).not.toHaveBeenCalled()
    expect(onNext).not.toHaveBeenCalled()
    expect(onPrev).not.toHaveBeenCalled()
  })

  it("clicking next / prev calls onNext / onPrev", async () => {
    const onNext = vi.fn()
    const onPrev = vi.fn()
    render(<FindOverlay {...props({ query: "a", matchIndex: 1, matchCount: 2, onNext, onPrev })} />)
    await userEvent.click(screen.getByTestId("find-next"))
    expect(onNext).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByTestId("find-prev"))
    expect(onPrev).toHaveBeenCalledTimes(1)
  })

  it("disables next / prev when there are no matches", () => {
    render(<FindOverlay {...props({ query: "zzz", matchIndex: 0, matchCount: 0 })} />)
    expect(screen.getByTestId("find-next")).toBeDisabled()
    expect(screen.getByTestId("find-prev")).toBeDisabled()
  })

  it("enables next / prev when there are matches", () => {
    render(<FindOverlay {...props({ query: "a", matchIndex: 1, matchCount: 2 })} />)
    expect(screen.getByTestId("find-next")).toBeEnabled()
    expect(screen.getByTestId("find-prev")).toBeEnabled()
  })
})
