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
  canvasBg: "#ffffff",
  onCanvasBgChange: vi.fn(),
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

  it("selecting a theme closes the menu", async () => {
    const onOpenChange = vi.fn()
    render(<HamburgerMenu {...baseProps()} open onOpenChange={onOpenChange} />)
    await userEvent.click(screen.getByTestId("theme-dark"))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("selecting a locale closes the menu", async () => {
    const onOpenChange = vi.fn()
    render(<HamburgerMenu {...baseProps()} open onOpenChange={onOpenChange} />)
    await userEvent.click(screen.getByTestId("locale-ko"))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("renders exactly five canvas background swatches", () => {
    render(<HamburgerMenu {...baseProps()} open />)
    expect(screen.getByText("menu.canvasBg")).toBeInTheDocument()
    const swatches = ["ffffff", "f8f9fa", "fff5f5", "f3f0ff", "1e1e1e"].map((hex) =>
      screen.getByTestId(`canvas-bg-${hex}`),
    )
    expect(swatches).toHaveLength(5)
    for (const s of swatches) expect(s).toBeInTheDocument()
  })

  it("clicking a swatch emits onCanvasBgChange with that hex", async () => {
    const onCanvasBgChange = vi.fn()
    render(<HamburgerMenu {...baseProps()} open onCanvasBgChange={onCanvasBgChange} />)
    await userEvent.click(screen.getByTestId("canvas-bg-1e1e1e"))
    expect(onCanvasBgChange).toHaveBeenCalledWith("#1e1e1e")
  })

  it("aria-pressed is true only on the swatch matching canvasBg", () => {
    render(<HamburgerMenu {...baseProps()} open canvasBg="#f3f0ff" />)
    expect(screen.getByTestId("canvas-bg-f3f0ff")).toHaveAttribute("aria-pressed", "true")
    for (const hex of ["ffffff", "f8f9fa", "fff5f5", "1e1e1e"]) {
      expect(screen.getByTestId(`canvas-bg-${hex}`)).toHaveAttribute("aria-pressed", "false")
    }
  })

  it("selecting a canvas background closes the menu, like the theme and locale rows", async () => {
    const onOpenChange = vi.fn()
    render(<HamburgerMenu {...baseProps()} open onOpenChange={onOpenChange} />)
    await userEvent.click(screen.getByTestId("canvas-bg-f8f9fa"))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("Escape closes the menu when open", async () => {
    const onOpenChange = vi.fn()
    render(<HamburgerMenu {...baseProps()} open onOpenChange={onOpenChange} />)
    await userEvent.keyboard("{Escape}")
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("Escape does nothing when the menu is closed", async () => {
    const onOpenChange = vi.fn()
    render(<HamburgerMenu {...baseProps()} onOpenChange={onOpenChange} />)
    await userEvent.keyboard("{Escape}")
    expect(onOpenChange).not.toHaveBeenCalled()
  })
})
