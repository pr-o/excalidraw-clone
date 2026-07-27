import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { Toolbar } from "../src/Toolbar"

const t = (key: string): string => key

const baseProps = () => ({
  t,
  activeTool: "selection" as const,
  onSelectTool: () => {},
  lockActiveTool: false,
  onToggleLock: () => {},
  moreShapesOpen: false,
  onMoreShapesOpenChange: () => {},
})

describe("Toolbar", () => {
  it("renders all 10 tool buttons + lock toggle", () => {
    render(<Toolbar {...baseProps()} />)
    for (const name of [
      "selection",
      "rectangle",
      "ellipse",
      "diamond",
      "line",
      "arrow",
      "freedraw",
      "text",
      "image",
      "eraser",
      "frame",
    ]) {
      expect(screen.getByTestId(`toolbar-${name}`)).toBeInTheDocument()
    }
    expect(screen.getByTestId("toolbar-lock")).toBeInTheDocument()
  })

  it("renders a note tool button", () => {
    render(<Toolbar {...baseProps()} />)
    expect(screen.getByTestId("toolbar-note")).toBeInTheDocument()
  })

  it("renders the flowchart shape buttons", () => {
    render(<Toolbar {...baseProps()} />)
    expect(screen.getByTestId("toolbar-triangle")).toBeInTheDocument()
    expect(screen.getByTestId("toolbar-parallelogram")).toBeInTheDocument()
    expect(screen.getByTestId("toolbar-hexagon")).toBeInTheDocument()
  })

  it("marks the active tool as pressed", () => {
    render(<Toolbar {...baseProps()} activeTool="rectangle" />)
    expect(screen.getByTestId("toolbar-rectangle")).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByTestId("toolbar-selection")).toHaveAttribute("aria-pressed", "false")
  })

  it("calls onSelectTool with the tool name on click", async () => {
    const onSelectTool = vi.fn()
    render(<Toolbar {...baseProps()} onSelectTool={onSelectTool} />)
    await userEvent.click(screen.getByTestId("toolbar-rectangle"))
    expect(onSelectTool).toHaveBeenCalledWith("rectangle")
  })

  it("toggles lock and calls onToggleLock with negated value", async () => {
    const onToggleLock = vi.fn()
    render(<Toolbar {...baseProps()} onToggleLock={onToggleLock} />)
    await userEvent.click(screen.getByTestId("toolbar-lock"))
    expect(onToggleLock).toHaveBeenCalledWith(true)
  })

  it("renders the more-shapes trigger right after hexagon, closed by default", () => {
    render(<Toolbar {...baseProps()} />)
    expect(screen.getByTestId("toolbar-more-shapes")).toBeInTheDocument()
    expect(screen.queryByTestId("toolbar-pentagon")).not.toBeInTheDocument()
    expect(screen.queryByTestId("toolbar-octagon")).not.toBeInTheDocument()
  })

  it("shows pentagon/octagon buttons when moreShapesOpen is true", () => {
    render(<Toolbar {...baseProps()} moreShapesOpen />)
    expect(screen.getByTestId("toolbar-pentagon")).toBeInTheDocument()
    expect(screen.getByTestId("toolbar-octagon")).toBeInTheDocument()
  })

  it("clicking the more-shapes trigger calls onMoreShapesOpenChange", async () => {
    const onMoreShapesOpenChange = vi.fn()
    render(<Toolbar {...baseProps()} onMoreShapesOpenChange={onMoreShapesOpenChange} />)
    await userEvent.click(screen.getByTestId("toolbar-more-shapes"))
    expect(onMoreShapesOpenChange).toHaveBeenCalledWith(true)
  })

  it("selecting pentagon from the flyout calls onSelectTool", async () => {
    const onSelectTool = vi.fn()
    render(<Toolbar {...baseProps()} onSelectTool={onSelectTool} moreShapesOpen />)
    await userEvent.click(screen.getByTestId("toolbar-pentagon"))
    expect(onSelectTool).toHaveBeenCalledWith("pentagon")
  })
})
