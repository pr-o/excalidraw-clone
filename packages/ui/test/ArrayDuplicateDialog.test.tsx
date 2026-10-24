import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { ArrayDuplicateDialog } from "../src/ArrayDuplicateDialog"

const t = (key: string): string => key

const set = (testId: string, value: string): void => {
  fireEvent.change(screen.getByTestId(testId), { target: { value } })
}

describe("ArrayDuplicateDialog", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <ArrayDuplicateDialog t={t} open={false} onClose={() => {}} onConfirm={() => {}} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it("defaults to 1 row x 3 cols with a 20px gap", async () => {
    const onConfirm = vi.fn()
    render(<ArrayDuplicateDialog t={t} open onClose={() => {}} onConfirm={onConfirm} />)
    expect(screen.getByTestId("array-copies")).toHaveTextContent("2")
    await userEvent.click(screen.getByTestId("array-duplicate-confirm"))
    expect(onConfirm).toHaveBeenCalledWith({ rows: 1, cols: 3, gapX: 20, gapY: 20 })
  })

  it("passes edited values and updates the copy count live", async () => {
    const onConfirm = vi.fn()
    render(<ArrayDuplicateDialog t={t} open onClose={() => {}} onConfirm={onConfirm} />)
    set("array-rows", "2")
    set("array-cols", "4")
    set("array-gap-x", "0")
    set("array-gap-y", "-5")
    expect(screen.getByTestId("array-copies")).toHaveTextContent("7")
    await userEvent.click(screen.getByTestId("array-duplicate-confirm"))
    expect(onConfirm).toHaveBeenCalledWith({ rows: 2, cols: 4, gapX: 0, gapY: -5 })
  })

  it("disables confirm while the grid would make no copies or values are invalid", () => {
    render(<ArrayDuplicateDialog t={t} open onClose={() => {}} onConfirm={() => {}} />)
    set("array-cols", "1")
    expect(screen.getByTestId("array-duplicate-confirm")).toBeDisabled()
    set("array-cols", "")
    expect(screen.getByTestId("array-duplicate-confirm")).toBeDisabled()
    set("array-cols", "21")
    expect(screen.getByTestId("array-duplicate-confirm")).toBeDisabled()
  })

  it("Cancel calls onClose", async () => {
    const onClose = vi.fn()
    render(<ArrayDuplicateDialog t={t} open onClose={onClose} onConfirm={() => {}} />)
    await userEvent.click(screen.getByRole("button", { name: "arrayDuplicate.cancel" }))
    expect(onClose).toHaveBeenCalled()
  })
})
