import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
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

  it("offers the table tool in the more-shapes flyout", async () => {
    const onSelectTool = vi.fn()
    render(<Toolbar {...baseProps()} onSelectTool={onSelectTool} moreShapesOpen />)
    await userEvent.click(screen.getByTestId("toolbar-table"))
    expect(onSelectTool).toHaveBeenCalledWith("table")
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

  it("renders a laser pointer tool button", () => {
    render(<Toolbar {...baseProps()} />)
    expect(screen.getByTestId("toolbar-laser")).toBeInTheDocument()
  })

  it("calls onSelectTool with 'laser' on click", async () => {
    const onSelectTool = vi.fn()
    render(<Toolbar {...baseProps()} onSelectTool={onSelectTool} />)
    await userEvent.click(screen.getByTestId("toolbar-laser"))
    expect(onSelectTool).toHaveBeenCalledWith("laser")
  })

  describe("below 960px", () => {
    const stubWidth = (width: number): void => {
      vi.stubGlobal("matchMedia", (q: string) => ({
        matches: width >= Number(/min-width: (\d+)px/.exec(q)?.[1]),
        addEventListener: () => {},
        removeEventListener: () => {},
      }))
    }
    afterEach(() => vi.unstubAllGlobals())

    it("moves insert + utility groups into the more-tools menu at 800px", async () => {
      stubWidth(800)
      const onSelectTool = vi.fn()
      render(<Toolbar {...baseProps()} onSelectTool={onSelectTool} activeTool="laser" />)
      expect(screen.getByTestId("toolbar-arrow")).toBeInTheDocument()
      expect(screen.queryByTestId("toolbar-image")).not.toBeInTheDocument()
      const more = screen.getByTestId("toolbar-more-tools")
      expect(more).toHaveAttribute("aria-pressed", "true")
      await userEvent.click(more)
      for (const name of ["image", "note", "frame", "eraser", "laser", "comment"]) {
        expect(screen.getByTestId(`toolbar-${name}`)).toBeInTheDocument()
      }
      await userEvent.click(screen.getByTestId("toolbar-comment"))
      expect(onSelectTool).toHaveBeenCalledWith("comment")
      expect(screen.queryByTestId("toolbar-image")).not.toBeInTheDocument()
    })

    it("also moves the draw group below 768px, and Escape closes the menu", async () => {
      stubWidth(600)
      render(<Toolbar {...baseProps()} />)
      expect(screen.queryByTestId("toolbar-arrow")).not.toBeInTheDocument()
      await userEvent.click(screen.getByTestId("toolbar-more-tools"))
      expect(screen.getByTestId("toolbar-arrow")).toHaveAttribute("title", "toolbar.arrow (A)")
      await userEvent.keyboard("{Escape}")
      expect(screen.queryByTestId("toolbar-arrow")).not.toBeInTheDocument()
    })

    it("keeps everything inline with no more-tools button when wide", () => {
      stubWidth(1280)
      render(<Toolbar {...baseProps()} />)
      expect(screen.getByTestId("toolbar-comment")).toBeInTheDocument()
      expect(screen.queryByTestId("toolbar-more-tools")).not.toBeInTheDocument()
    })
  })
})
