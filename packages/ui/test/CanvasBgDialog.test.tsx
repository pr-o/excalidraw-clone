import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { CanvasBgDialog } from "../src/CanvasBgDialog"

const t = (key: string): string => key

describe("CanvasBgDialog", () => {
  it("renders the current selection as pressed", () => {
    render(<CanvasBgDialog t={t} open onClose={() => {}} value="#ffffff" onChange={() => {}} />)
    expect(screen.getByTestId("canvas-bg-ffffff")).toHaveAttribute("aria-pressed", "true")
  })

  it("clicking a swatch fires onChange and closes", async () => {
    const onChange = vi.fn()
    const onClose = vi.fn()
    render(<CanvasBgDialog t={t} open onClose={onClose} value="#ffffff" onChange={onChange} />)
    await userEvent.click(screen.getByTestId("canvas-bg-f8f9fa"))
    expect(onChange).toHaveBeenCalledWith("#f8f9fa")
    expect(onClose).toHaveBeenCalled()
  })
})
