import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { ExportDialog } from "../src/ExportDialog"

const t = (key: string): string => key

describe("ExportDialog", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <ExportDialog t={t} open={false} onClose={() => {}} onExport={() => {}} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it("default options export PNG @ 1x white", async () => {
    const onExport = vi.fn()
    render(<ExportDialog t={t} open onClose={() => {}} onExport={onExport} />)
    await userEvent.click(screen.getByRole("button", { name: /export\.confirm/i }))
    expect(onExport).toHaveBeenCalledWith({
      format: "png",
      scale: 1,
      background: "white",
      embedScene: false,
    })
  })

  it("changes propagate: SVG + 2x + dark + embed", async () => {
    const onExport = vi.fn()
    render(<ExportDialog t={t} open onClose={() => {}} onExport={onExport} />)
    await userEvent.click(screen.getByTestId("format-svg"))
    await userEvent.click(screen.getByTestId("scale-2"))
    await userEvent.click(screen.getByTestId("bg-dark"))
    await userEvent.click(screen.getByLabelText(/embed/i))
    await userEvent.click(screen.getByRole("button", { name: /export\.confirm/i }))
    expect(onExport).toHaveBeenCalledWith({
      format: "svg",
      scale: 2,
      background: "dark",
      embedScene: true,
    })
  })
})
