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
  })

  it("emits onClose when the close button is clicked", async () => {
    const onClose = vi.fn()
    render(<HelpDialog t={t} open onClose={onClose} />)
    await userEvent.click(screen.getByRole("button", { name: /close/i }))
    expect(onClose).toHaveBeenCalled()
  })
})
