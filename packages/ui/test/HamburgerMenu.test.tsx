import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { HamburgerMenu, type HamburgerMenuProps } from "../src/HamburgerMenu"

const t = (key: string): string => key

const baseProps = (): HamburgerMenuProps => ({
  t,
  open: false,
  onOpenChange: vi.fn(),
  theme: "light",
  onThemeChange: vi.fn(),
  locale: "en",
  onLocaleChange: vi.fn(),
  zenMode: false,
  onZenModeToggle: vi.fn(),
  onOpenFile: vi.fn(),
  onSaveFile: vi.fn(),
  onExport: vi.fn(),
  onReset: vi.fn(),
  onHelp: vi.fn(),
})

describe("HamburgerMenu", () => {
  it("button is visible when closed; menu items are not", () => {
    render(<HamburgerMenu {...baseProps()} />)
    expect(screen.getByRole("button", { name: /menu/i })).toBeInTheDocument()
    expect(screen.queryByText("menu.open")).not.toBeInTheDocument()
  })

  it("renders menu items when open", () => {
    render(<HamburgerMenu {...baseProps()} open />)
    expect(screen.getByText("menu.open")).toBeInTheDocument()
    expect(screen.getByText("menu.saveAs")).toBeInTheDocument()
    expect(screen.getByText("menu.export")).toBeInTheDocument()
    expect(screen.getByText("menu.reset")).toBeInTheDocument()
    expect(screen.getByText("menu.help")).toBeInTheDocument()
  })

  it("clicking the trigger toggles open via onOpenChange", async () => {
    const onOpenChange = vi.fn()
    render(<HamburgerMenu {...baseProps()} onOpenChange={onOpenChange} />)
    await userEvent.click(screen.getByRole("button", { name: /menu/i }))
    expect(onOpenChange).toHaveBeenCalledWith(true)
  })

  it("clicking 'Open file' fires onOpenFile and closes the menu", async () => {
    const onOpenFile = vi.fn()
    const onOpenChange = vi.fn()
    render(
      <HamburgerMenu {...baseProps()} open onOpenFile={onOpenFile} onOpenChange={onOpenChange} />,
    )
    await userEvent.click(screen.getByText("menu.open"))
    expect(onOpenFile).toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("theme buttons emit onThemeChange and reflect current theme", async () => {
    const onThemeChange = vi.fn()
    render(<HamburgerMenu {...baseProps()} open theme="dark" onThemeChange={onThemeChange} />)
    expect(screen.getByTestId("theme-dark")).toHaveAttribute("aria-pressed", "true")
    await userEvent.click(screen.getByTestId("theme-light"))
    expect(onThemeChange).toHaveBeenCalledWith("light")
  })

  it("locale buttons emit onLocaleChange", async () => {
    const onLocaleChange = vi.fn()
    render(<HamburgerMenu {...baseProps()} open onLocaleChange={onLocaleChange} />)
    await userEvent.click(screen.getByTestId("locale-ko"))
    expect(onLocaleChange).toHaveBeenCalledWith("ko")
  })
})
