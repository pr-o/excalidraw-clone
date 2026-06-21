import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { Toolbar } from "../src/Toolbar"

const t = (key: string): string => key

describe("Toolbar", () => {
  it("renders all 10 tool buttons + lock toggle", () => {
    render(
      <Toolbar
        t={t}
        activeTool="selection"
        onSelectTool={() => {}}
        lockActiveTool={false}
        onToggleLock={() => {}}
      />,
    )
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
    render(
      <Toolbar
        t={t}
        activeTool="selection"
        onSelectTool={() => {}}
        lockActiveTool={false}
        onToggleLock={() => {}}
      />,
    )
    expect(screen.getByTestId("toolbar-note")).toBeInTheDocument()
  })

  it("marks the active tool as pressed", () => {
    render(
      <Toolbar
        t={t}
        activeTool="rectangle"
        onSelectTool={() => {}}
        lockActiveTool={false}
        onToggleLock={() => {}}
      />,
    )
    expect(screen.getByTestId("toolbar-rectangle")).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByTestId("toolbar-selection")).toHaveAttribute("aria-pressed", "false")
  })

  it("calls onSelectTool with the tool name on click", async () => {
    const onSelectTool = vi.fn()
    render(
      <Toolbar
        t={t}
        activeTool="selection"
        onSelectTool={onSelectTool}
        lockActiveTool={false}
        onToggleLock={() => {}}
      />,
    )
    await userEvent.click(screen.getByTestId("toolbar-rectangle"))
    expect(onSelectTool).toHaveBeenCalledWith("rectangle")
  })

  it("toggles lock and calls onToggleLock with negated value", async () => {
    const onToggleLock = vi.fn()
    render(
      <Toolbar
        t={t}
        activeTool="selection"
        onSelectTool={() => {}}
        lockActiveTool={false}
        onToggleLock={onToggleLock}
      />,
    )
    await userEvent.click(screen.getByTestId("toolbar-lock"))
    expect(onToggleLock).toHaveBeenCalledWith(true)
  })
})
