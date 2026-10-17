import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { MermaidFlowchart } from "@excalidraw-clone/scene"
import { describe, expect, it, vi } from "vitest"
import { MermaidImportDialog } from "../src/MermaidImportDialog"

const t = (key: string): string => key

const type = (text: string): void => {
  fireEvent.change(screen.getByTestId("mermaid-input"), { target: { value: text } })
}

describe("MermaidImportDialog", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <MermaidImportDialog t={t} open={false} onClose={() => {}} onInsert={() => {}} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it("disables insert until the input has nodes", () => {
    render(<MermaidImportDialog t={t} open onClose={() => {}} onInsert={() => {}} />)
    expect(screen.getByTestId("mermaid-insert")).toBeDisabled()
    type("graph TD")
    expect(screen.getByTestId("mermaid-insert")).toBeDisabled()
    type("graph TD\nA --> B")
    expect(screen.getByTestId("mermaid-insert")).toBeEnabled()
  })

  it("shows a parse error inline", () => {
    render(<MermaidImportDialog t={t} open onClose={() => {}} onInsert={() => {}} />)
    type("A --> B")
    expect(screen.getByTestId("mermaid-warning")).toHaveTextContent("mermaid.error")
    expect(screen.getByTestId("mermaid-insert")).toBeDisabled()
  })

  it("warns about skipped lines but still inserts the parsed chart", async () => {
    const onInsert = vi.fn()
    render(<MermaidImportDialog t={t} open onClose={() => {}} onInsert={onInsert} />)
    type("graph LR\nstyle A fill:#fff\nA --> B")
    expect(screen.getByTestId("mermaid-warning")).toHaveTextContent("style A fill:#fff")
    await userEvent.click(screen.getByTestId("mermaid-insert"))
    expect(onInsert).toHaveBeenCalledTimes(1)
    const chart = onInsert.mock.calls[0]![0] as MermaidFlowchart
    expect(chart.direction).toBe("LR")
    expect(chart.edges).toHaveLength(1)
  })

  it("Cancel calls onClose", async () => {
    const onClose = vi.fn()
    render(<MermaidImportDialog t={t} open onClose={onClose} onInsert={() => {}} />)
    await userEvent.click(screen.getByRole("button", { name: "mermaid.cancel" }))
    expect(onClose).toHaveBeenCalled()
  })
})
