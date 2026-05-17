import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { CommandPalette, type PaletteCommand } from "../src/CommandPalette"

const t = (key: string): string => key

let cmds: PaletteCommand[]

beforeEach(() => {
  cmds = [
    { id: "undo", label: "Undo", perform: vi.fn(), hint: "Cmd+Z" },
    { id: "redo", label: "Redo", perform: vi.fn(), hint: "Cmd+Shift+Z" },
    { id: "delete", label: "Delete selection", perform: vi.fn(), keywords: ["remove"] },
    { id: "select-all", label: "Select all", perform: vi.fn() },
  ]
})

describe("CommandPalette", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <CommandPalette t={t} open={false} onClose={() => {}} commands={cmds} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it("shows all commands when open with empty query", () => {
    render(<CommandPalette t={t} open onClose={() => {}} commands={cmds} />)
    expect(screen.getByText("Undo")).toBeInTheDocument()
    expect(screen.getByText("Select all")).toBeInTheDocument()
  })

  it("filters by label and keywords (case-insensitive)", async () => {
    render(<CommandPalette t={t} open onClose={() => {}} commands={cmds} />)
    await userEvent.type(screen.getByPlaceholderText("palette.placeholder"), "remove")
    expect(screen.getByText("Delete selection")).toBeInTheDocument()
    expect(screen.queryByText("Undo")).not.toBeInTheDocument()
  })

  it("Enter on highlighted command invokes perform and closes", async () => {
    const onClose = vi.fn()
    render(<CommandPalette t={t} open onClose={onClose} commands={cmds} />)
    await userEvent.type(screen.getByPlaceholderText("palette.placeholder"), "undo{Enter}")
    expect(cmds[0]?.perform).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it("ArrowDown moves highlight; Enter invokes the new highlight", async () => {
    const onClose = vi.fn()
    render(<CommandPalette t={t} open onClose={onClose} commands={cmds} />)
    await userEvent.type(screen.getByPlaceholderText("palette.placeholder"), "{ArrowDown}{Enter}")
    expect(cmds[1]?.perform).toHaveBeenCalled()
  })

  it("Escape closes the palette without invoking anything", async () => {
    const onClose = vi.fn()
    render(<CommandPalette t={t} open onClose={onClose} commands={cmds} />)
    await userEvent.type(screen.getByPlaceholderText("palette.placeholder"), "{Escape}")
    expect(onClose).toHaveBeenCalled()
    for (const c of cmds) expect(c.perform).not.toHaveBeenCalled()
  })
})
