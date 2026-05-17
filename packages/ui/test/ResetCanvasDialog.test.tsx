import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { ResetCanvasDialog } from "../src/ResetCanvasDialog"

const t = (key: string): string => key

describe("ResetCanvasDialog", () => {
  it("nothing when closed", () => {
    const { container } = render(
      <ResetCanvasDialog t={t} open={false} onClose={() => {}} onConfirm={() => {}} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it("Confirm calls onConfirm", async () => {
    const onConfirm = vi.fn()
    render(<ResetCanvasDialog t={t} open onClose={() => {}} onConfirm={onConfirm} />)
    await userEvent.click(screen.getByRole("button", { name: /reset\.confirm/i }))
    expect(onConfirm).toHaveBeenCalled()
  })

  it("Cancel calls onClose without onConfirm", async () => {
    const onClose = vi.fn()
    const onConfirm = vi.fn()
    render(<ResetCanvasDialog t={t} open onClose={onClose} onConfirm={onConfirm} />)
    await userEvent.click(screen.getByRole("button", { name: /reset\.cancel/i }))
    expect(onClose).toHaveBeenCalled()
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
