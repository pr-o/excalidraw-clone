import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { MermaidExportDialog } from "../src/MermaidExportDialog"

const t = (key: string): string => key

describe("MermaidExportDialog", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <MermaidExportDialog t={t} open={false} onClose={() => {}} text="flowchart TD" />,
    )
    expect(container.firstChild).toBeNull()
  })

  it("shows the text read-only and copies it", async () => {
    const writeText = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
    render(<MermaidExportDialog t={t} open onClose={() => {}} text={"flowchart TD\n  A"} />)
    const area = screen.getByTestId("mermaid-output")
    expect(area).toHaveValue("flowchart TD\n  A")
    expect(area).toHaveAttribute("readonly")
    await userEvent.click(screen.getByTestId("mermaid-copy"))
    expect(writeText).toHaveBeenCalledWith("flowchart TD\n  A")
    expect(await screen.findByRole("status")).toHaveTextContent("mermaid.copied")
  })

  it("reports a failed copy", async () => {
    const writeText = vi.fn(() => Promise.reject(new Error("denied")))
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
    render(<MermaidExportDialog t={t} open onClose={() => {}} text="flowchart TD" />)
    await userEvent.click(screen.getByTestId("mermaid-copy"))
    expect(await screen.findByRole("alert")).toHaveTextContent("mermaid.copyFailed")
  })
})
