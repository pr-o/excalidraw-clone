import { newRectangle } from "@excalidraw-clone/scene"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { HistoryPanel } from "../src/HistoryPanel"

const t = (key: string, options?: { count: number }): string =>
  options ? `${key}:${options.count}` : key

const handlers = {
  onToggle: vi.fn(),
  onJump: vi.fn(),
}

describe("HistoryPanel", () => {
  it("shows only the toggle button when closed, keeping a11y attributes", () => {
    render(<HistoryPanel t={t} history={[[]]} currentIndex={0} open={false} {...handlers} />)
    expect(screen.queryByTestId("history-panel")).toBeNull()
    expect(screen.queryByTestId(/^history-row-/)).toBeNull()
    const toggle = screen.getByTestId("history-toggle")
    expect(toggle).toBeInTheDocument()
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    expect(toggle).toHaveAttribute("aria-label", "history.toggle")
  })

  it("keeps toggle a11y attributes when open", () => {
    render(<HistoryPanel t={t} history={[[]]} currentIndex={0} open {...handlers} />)
    const toggle = screen.getByTestId("history-toggle")
    expect(toggle).toHaveAttribute("aria-expanded", "true")
    expect(toggle).toHaveAttribute("aria-label", "history.toggle")
  })

  it("renders one row per history entry, newest first", () => {
    const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    render(<HistoryPanel t={t} history={[[], [a]]} currentIndex={1} open {...handlers} />)
    const rows = screen.getAllByTestId(/^history-row-/)
    expect(rows.map((r) => r.dataset.testid)).toEqual(["history-row-1", "history-row-0"])
  })

  it("labels the initial entry using history.initial", () => {
    render(<HistoryPanel t={t} history={[[]]} currentIndex={0} open {...handlers} />)
    expect(screen.getByTestId("history-jump-0")).toHaveTextContent("history.initial")
  })

  it("labels an added-element entry with the added category and count", () => {
    const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    render(<HistoryPanel t={t} history={[[], [a]]} currentIndex={1} open {...handlers} />)
    expect(screen.getByTestId("history-jump-1")).toHaveTextContent("history.added:1")
  })

  it("highlights the row at currentIndex and no other", () => {
    const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    render(<HistoryPanel t={t} history={[[], [a]]} currentIndex={0} open {...handlers} />)
    expect(screen.getByTestId("history-jump-0").className).toContain("bg-accent-soft")
    expect(screen.getByTestId("history-jump-1").className).not.toContain("bg-accent-soft")
  })

  it("calls onJump with the clicked entry's index", async () => {
    const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const onJump = vi.fn()
    render(
      <HistoryPanel
        t={t}
        history={[[], [a]]}
        currentIndex={1}
        open
        {...handlers}
        onJump={onJump}
      />,
    )
    await userEvent.click(screen.getByTestId("history-jump-0"))
    expect(onJump).toHaveBeenCalledWith(0)
  })

  it("calls onToggle when the toggle button is clicked", async () => {
    const onToggle = vi.fn()
    render(
      <HistoryPanel
        t={t}
        history={[[]]}
        currentIndex={0}
        open={false}
        {...handlers}
        onToggle={onToggle}
      />,
    )
    await userEvent.click(screen.getByTestId("history-toggle"))
    expect(onToggle).toHaveBeenCalled()
  })
})
