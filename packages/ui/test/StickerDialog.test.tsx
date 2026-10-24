import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { STICKERS, StickerDialog } from "../src/StickerDialog"

const t = (key: string): string => key

describe("StickerDialog", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <StickerDialog t={t} open={false} onClose={() => {}} onPick={() => {}} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it("offers a curated set of unique emoji", () => {
    expect(STICKERS.length).toBeGreaterThanOrEqual(60)
    expect(new Set(STICKERS.map((s) => s.emoji)).size).toBe(STICKERS.length)
    render(<StickerDialog t={t} open onClose={() => {}} onPick={() => {}} />)
    expect(screen.getAllByTestId(/^sticker-option/)).toHaveLength(STICKERS.length)
  })

  it("filters by name or category, case-insensitively", () => {
    render(<StickerDialog t={t} open onClose={() => {}} onPick={() => {}} />)
    fireEvent.change(screen.getByTestId("sticker-search"), { target: { value: "CAT" } })
    expect(screen.getByRole("button", { name: "cat" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "pizza" })).toBeNull()
    fireEvent.change(screen.getByTestId("sticker-search"), { target: { value: "food" } })
    expect(screen.getByRole("button", { name: "pizza" })).toBeInTheDocument()
    fireEvent.change(screen.getByTestId("sticker-search"), { target: { value: "zzzz" } })
    expect(screen.getByText("stickers.empty")).toBeInTheDocument()
  })

  it("picking a sticker reports its emoji", async () => {
    const onPick = vi.fn()
    render(<StickerDialog t={t} open onClose={() => {}} onPick={onPick} />)
    await userEvent.click(screen.getByRole("button", { name: "cat" }))
    expect(onPick).toHaveBeenCalledWith("🐱")
  })
})
