import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { HelpDialog } from "../src/HelpDialog"

const t = (key: string): string => key

describe("HelpDialog", () => {
  it("renders shortcut categories when open", () => {
    render(<HelpDialog t={t} open onClose={() => {}} />)
    expect(screen.getByText("shortcuts.tools")).toBeInTheDocument()
    expect(screen.getByText("shortcuts.editor")).toBeInTheDocument()
    expect(screen.getByText("shortcuts.view")).toBeInTheDocument()
  })

  it("lists at least the canonical shortcuts", () => {
    render(<HelpDialog t={t} open onClose={() => {}} />)
    expect(screen.getByText("V")).toBeInTheDocument()
    expect(screen.getByText("R")).toBeInTheDocument()
    expect(screen.getByText("Cmd/Ctrl+Z")).toBeInTheDocument()
    expect(screen.getByText("Double-click")).toBeInTheDocument()
  })

  it("lists the pentagon and octagon shortcuts", () => {
    render(<HelpDialog t={t} open onClose={() => {}} />)
    expect(screen.getByText("5")).toBeInTheDocument()
    expect(screen.getByText("8")).toBeInTheDocument()
  })

  it("lists the element-link shortcuts", () => {
    render(<HelpDialog t={t} open onClose={() => {}} />)
    expect(screen.getByText("Cmd/Ctrl+K")).toBeInTheDocument()
    expect(screen.getByText("Cmd/Ctrl+click")).toBeInTheDocument()
    expect(screen.getByText("shortcuts:link")).toBeInTheDocument()
    expect(screen.getByText("shortcuts:openLink")).toBeInTheDocument()
  })

  it("lists the flip shortcuts", () => {
    render(<HelpDialog t={t} open onClose={() => {}} />)
    expect(screen.getByText("Shift+H")).toBeInTheDocument()
    expect(screen.getByText("Shift+V")).toBeInTheDocument()
    expect(screen.getByText("shortcuts:flipHorizontal")).toBeInTheDocument()
    expect(screen.getByText("shortcuts:flipVertical")).toBeInTheDocument()
  })

  it("lists the style clipboard shortcuts", () => {
    render(<HelpDialog t={t} open onClose={() => {}} />)
    expect(screen.getByText("Cmd/Ctrl+Alt+C")).toBeInTheDocument()
    expect(screen.getByText("Cmd/Ctrl+Alt+V")).toBeInTheDocument()
    expect(screen.getByText("shortcuts:copyStyles")).toBeInTheDocument()
    expect(screen.getByText("shortcuts:pasteStyles")).toBeInTheDocument()
  })

  it("emits onClose when the close button is clicked", async () => {
    const onClose = vi.fn()
    render(<HelpDialog t={t} open onClose={onClose} />)
    await userEvent.click(screen.getByRole("button", { name: /close/i }))
    expect(onClose).toHaveBeenCalled()
  })
})
