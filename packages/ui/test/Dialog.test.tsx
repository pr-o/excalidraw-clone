import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { Dialog } from "../src/shared/Dialog"

const t = (key: string): string => key

describe("Dialog", () => {
  it("renders children when open", () => {
    render(
      <Dialog open onClose={() => {}} title="hi" t={t}>
        <p>body</p>
      </Dialog>,
    )
    expect(screen.getByText("body")).toBeInTheDocument()
    expect(screen.getByRole("dialog")).toHaveAttribute("open")
  })

  it("calls showModal when transitioning closed → open", () => {
    const { rerender } = render(
      <Dialog open={false} onClose={() => {}} title="t" t={t}>
        <p>body</p>
      </Dialog>,
    )
    expect(screen.getByRole("dialog", { hidden: true })).not.toHaveAttribute("open")
    rerender(
      <Dialog open onClose={() => {}} title="t" t={t}>
        <p>body</p>
      </Dialog>,
    )
    expect(screen.getByRole("dialog")).toHaveAttribute("open")
  })

  it("emits onClose when the close button is clicked", async () => {
    const onClose = vi.fn()
    render(
      <Dialog open onClose={onClose} title="t" t={t}>
        <p>body</p>
      </Dialog>,
    )
    await userEvent.click(screen.getByRole("button", { name: /close/i }))
    expect(onClose).toHaveBeenCalled()
  })

  it("emits onClose when the dialog 'close' event fires (ESC)", () => {
    const onClose = vi.fn()
    render(
      <Dialog open onClose={onClose} title="t" t={t}>
        <p>body</p>
      </Dialog>,
    )
    const dlg = screen.getByRole("dialog")
    dlg.dispatchEvent(new Event("close"))
    expect(onClose).toHaveBeenCalled()
  })

  it("labels each dialog with its own title even when several are mounted", () => {
    const { container } = render(
      <>
        <Dialog t={t} open={false} onClose={() => {}} title="First">
          a
        </Dialog>
        <Dialog t={t} open={false} onClose={() => {}} title="Second">
          b
        </Dialog>
      </>,
    )
    const dialogs = [...container.querySelectorAll("dialog")]
    expect(dialogs).toHaveLength(2)
    const ids = dialogs.map((d) => d.getAttribute("aria-labelledby")!)
    expect(new Set(ids).size).toBe(2)
    expect(ids.map((id) => container.ownerDocument.getElementById(id)?.textContent)).toEqual([
      "First",
      "Second",
    ])
  })
})
