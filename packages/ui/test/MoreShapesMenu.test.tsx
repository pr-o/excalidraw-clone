import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { MoreShapesMenu, type MoreShapesMenuProps } from "../src/MoreShapesMenu"

const t = (key: string): string => key

const baseProps = (): MoreShapesMenuProps => ({
  t,
  activeTool: "selection",
  open: false,
  onOpenChange: vi.fn(),
  onSelectTool: vi.fn(),
})

describe("MoreShapesMenu", () => {
  it("trigger is visible when closed; pentagon/octagon buttons are not", () => {
    render(<MoreShapesMenu {...baseProps()} />)
    expect(screen.getByTestId("toolbar-more-shapes")).toBeInTheDocument()
    expect(screen.queryByTestId("toolbar-pentagon")).not.toBeInTheDocument()
    expect(screen.queryByTestId("toolbar-octagon")).not.toBeInTheDocument()
  })

  it("renders pentagon and octagon buttons when open", () => {
    render(<MoreShapesMenu {...baseProps()} open />)
    expect(screen.getByTestId("toolbar-pentagon")).toBeInTheDocument()
    expect(screen.getByTestId("toolbar-octagon")).toBeInTheDocument()
  })

  it("clicking the trigger toggles open via onOpenChange", async () => {
    const onOpenChange = vi.fn()
    render(<MoreShapesMenu {...baseProps()} onOpenChange={onOpenChange} />)
    await userEvent.click(screen.getByTestId("toolbar-more-shapes"))
    expect(onOpenChange).toHaveBeenCalledWith(true)
  })

  it("selecting pentagon calls onSelectTool and closes the popout", async () => {
    const onSelectTool = vi.fn()
    const onOpenChange = vi.fn()
    render(
      <MoreShapesMenu
        {...baseProps()}
        open
        onSelectTool={onSelectTool}
        onOpenChange={onOpenChange}
      />,
    )
    await userEvent.click(screen.getByTestId("toolbar-pentagon"))
    expect(onSelectTool).toHaveBeenCalledWith("pentagon")
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("selecting octagon calls onSelectTool and closes the popout", async () => {
    const onSelectTool = vi.fn()
    const onOpenChange = vi.fn()
    render(
      <MoreShapesMenu
        {...baseProps()}
        open
        onSelectTool={onSelectTool}
        onOpenChange={onOpenChange}
      />,
    )
    await userEvent.click(screen.getByTestId("toolbar-octagon"))
    expect(onSelectTool).toHaveBeenCalledWith("octagon")
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("marks the trigger active when the active tool is pentagon or octagon", () => {
    render(<MoreShapesMenu {...baseProps()} activeTool="pentagon" />)
    expect(screen.getByTestId("toolbar-more-shapes")).toHaveAttribute("aria-pressed", "true")
  })

  it("marks the trigger active when the active tool is octagon", () => {
    render(<MoreShapesMenu {...baseProps()} activeTool="octagon" />)
    expect(screen.getByTestId("toolbar-more-shapes")).toHaveAttribute("aria-pressed", "true")
  })

  it("exposes aria-haspopup and aria-expanded on the trigger reflecting open state", () => {
    const closed = render(<MoreShapesMenu {...baseProps()} />)
    const trigger = screen.getByTestId("toolbar-more-shapes")
    expect(trigger).toHaveAttribute("aria-haspopup", "true")
    expect(trigger).toHaveAttribute("aria-expanded", "false")
    closed.unmount()

    render(<MoreShapesMenu {...baseProps()} open />)
    const openTrigger = screen.getByTestId("toolbar-more-shapes")
    expect(openTrigger).toHaveAttribute("aria-haspopup", "true")
    expect(openTrigger).toHaveAttribute("aria-expanded", "true")
  })

  it("Escape closes the menu when open", async () => {
    const onOpenChange = vi.fn()
    render(<MoreShapesMenu {...baseProps()} open onOpenChange={onOpenChange} />)
    await userEvent.keyboard("{Escape}")
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("Escape does nothing when the menu is closed", async () => {
    const onOpenChange = vi.fn()
    render(<MoreShapesMenu {...baseProps()} onOpenChange={onOpenChange} />)
    await userEvent.keyboard("{Escape}")
    expect(onOpenChange).not.toHaveBeenCalled()
  })
})
