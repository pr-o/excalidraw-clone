import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { ExportDialog, type ExportOptions } from "../src/ExportDialog"

const t = (key: string): string => key
const ONE_PAGE = [{ id: "p1", name: "Page 1" }]
const TWO_PAGES = [
  { id: "p1", name: "Page 1" },
  { id: "p2", name: "Notes" },
]
type CopyFn = (opts: ExportOptions) => Promise<void>
const confirm = () => screen.getByRole("button", { name: /export\.confirm/i })

describe("ExportDialog", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <ExportDialog
        t={t}
        open={false}
        onClose={() => {}}
        onExport={() => {}}
        pages={ONE_PAGE}
        activePageId="p1"
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it("default options export PNG @ 1x white, whole active page", async () => {
    const onExport = vi.fn()
    render(
      <ExportDialog
        t={t}
        open
        onClose={() => {}}
        onExport={onExport}
        pages={ONE_PAGE}
        activePageId="p1"
      />,
    )
    await userEvent.click(confirm())
    expect(onExport).toHaveBeenCalledWith({
      format: "png",
      scale: 1,
      background: "white",
      embedScene: false,
      scope: "page",
      pageId: "p1",
    })
  })

  it("changes propagate: SVG + 2x + dark + embed", async () => {
    const onExport = vi.fn()
    render(
      <ExportDialog
        t={t}
        open
        onClose={() => {}}
        onExport={onExport}
        pages={ONE_PAGE}
        activePageId="p1"
      />,
    )
    await userEvent.click(screen.getByTestId("format-svg"))
    await userEvent.click(screen.getByTestId("scale-2"))
    await userEvent.click(screen.getByTestId("bg-dark"))
    await userEvent.click(screen.getByLabelText(/embed/i))
    await userEvent.click(confirm())
    expect(onExport).toHaveBeenCalledWith({
      format: "svg",
      scale: 2,
      background: "dark",
      embedScene: true,
      scope: "page",
      pageId: "p1",
    })
  })
})

describe("ExportDialog — page picker", () => {
  it("hides the page picker when there is only one page", () => {
    render(
      <ExportDialog
        t={t}
        open
        onClose={() => {}}
        onExport={() => {}}
        pages={ONE_PAGE}
        activePageId="p1"
      />,
    )
    expect(screen.queryByTestId("export-page")).toBeNull()
  })

  it("lists every page by name and defaults to the active page", () => {
    render(
      <ExportDialog
        t={t}
        open
        onClose={() => {}}
        onExport={() => {}}
        pages={TWO_PAGES}
        activePageId="p2"
      />,
    )
    const picker = screen.getByTestId("export-page")
    expect(picker).toHaveAccessibleName("export.page")
    expect(picker).toHaveValue("p2")
    expect(
      within(picker)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Page 1", "Notes"])
  })

  it("exports the picked page", async () => {
    const onExport = vi.fn()
    render(
      <ExportDialog
        t={t}
        open
        onClose={() => {}}
        onExport={onExport}
        pages={TWO_PAGES}
        activePageId="p1"
      />,
    )
    await userEvent.selectOptions(screen.getByTestId("export-page"), "p2")
    await userEvent.click(confirm())
    expect(onExport).toHaveBeenCalledWith(expect.objectContaining({ pageId: "p2", scope: "page" }))
  })

  it("falls back to the active page when the picked page disappears", async () => {
    const onExport = vi.fn()
    const { rerender } = render(
      <ExportDialog
        t={t}
        open
        onClose={() => {}}
        onExport={onExport}
        pages={TWO_PAGES}
        activePageId="p1"
      />,
    )
    await userEvent.selectOptions(screen.getByTestId("export-page"), "p2")
    rerender(
      <ExportDialog
        t={t}
        open
        onClose={() => {}}
        onExport={onExport}
        pages={ONE_PAGE}
        activePageId="p1"
      />,
    )
    await userEvent.click(confirm())
    expect(onExport).toHaveBeenCalledWith(expect.objectContaining({ pageId: "p1" }))
  })
})

describe("ExportDialog — selection scope", () => {
  it("hides the scope toggle when there is no selection", () => {
    render(
      <ExportDialog
        t={t}
        open
        onClose={() => {}}
        onExport={() => {}}
        pages={ONE_PAGE}
        activePageId="p1"
      />,
    )
    expect(screen.queryByTestId("scope-selection")).toBeNull()
    expect(screen.queryByTestId("scope-page")).toBeNull()
  })

  it("shows the scope toggle with a selection, defaulting to the whole page", async () => {
    const onExport = vi.fn()
    render(
      <ExportDialog
        t={t}
        open
        onClose={() => {}}
        onExport={onExport}
        pages={ONE_PAGE}
        activePageId="p1"
        hasSelection
      />,
    )
    expect(screen.getByTestId("scope-page")).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByTestId("scope-selection")).toHaveAttribute("aria-pressed", "false")
    expect(screen.getByTestId("scope-page")).toHaveTextContent("export.scopePage")
    expect(screen.getByTestId("scope-selection")).toHaveTextContent("export.scopeSelection")
    await userEvent.click(confirm())
    expect(onExport).toHaveBeenCalledWith(expect.objectContaining({ scope: "page" }))
  })

  it("exports scope 'selection' when chosen", async () => {
    const onExport = vi.fn()
    render(
      <ExportDialog
        t={t}
        open
        onClose={() => {}}
        onExport={onExport}
        pages={ONE_PAGE}
        activePageId="p1"
        hasSelection
      />,
    )
    await userEvent.click(screen.getByTestId("scope-selection"))
    expect(screen.getByTestId("scope-selection")).toHaveAttribute("aria-pressed", "true")
    await userEvent.click(confirm())
    expect(onExport).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "selection", pageId: "p1" }),
    )
  })

  it("hides the scope toggle and forces whole-page scope when another page is picked", async () => {
    const onExport = vi.fn()
    render(
      <ExportDialog
        t={t}
        open
        onClose={() => {}}
        onExport={onExport}
        pages={TWO_PAGES}
        activePageId="p1"
        hasSelection
      />,
    )
    await userEvent.click(screen.getByTestId("scope-selection"))
    await userEvent.selectOptions(screen.getByTestId("export-page"), "p2")
    expect(screen.queryByTestId("scope-selection")).toBeNull()
    await userEvent.click(confirm())
    expect(onExport).toHaveBeenCalledWith(expect.objectContaining({ scope: "page", pageId: "p2" }))
  })

  it("reopening resets scope, page and copy status", async () => {
    const onExport = vi.fn()
    const onCopy = vi.fn<CopyFn>(() => Promise.reject(new Error("denied")))
    const props = {
      t,
      onClose: () => {},
      onExport,
      onCopy,
      pages: TWO_PAGES,
      activePageId: "p1",
      hasSelection: true,
    }
    const { rerender } = render(<ExportDialog {...props} open />)
    await userEvent.click(screen.getByTestId("scope-selection"))
    await userEvent.click(screen.getByTestId("export-copy"))
    await screen.findByTestId("export-copy-error")
    await userEvent.selectOptions(screen.getByTestId("export-page"), "p2")
    rerender(<ExportDialog {...props} open={false} />)
    rerender(<ExportDialog {...props} open />)
    expect(screen.queryByTestId("export-copy-error")).toBeNull()
    expect(screen.getByTestId("export-page")).toHaveValue("p1")
    expect(screen.getByTestId("scope-page")).toHaveAttribute("aria-pressed", "true")
    await userEvent.click(confirm())
    expect(onExport).toHaveBeenCalledWith(expect.objectContaining({ scope: "page", pageId: "p1" }))
  })
})

describe("ExportDialog — copy to clipboard", () => {
  it("hides the Copy button when onCopy is not provided", () => {
    render(
      <ExportDialog
        t={t}
        open
        onClose={() => {}}
        onExport={() => {}}
        pages={ONE_PAGE}
        activePageId="p1"
      />,
    )
    expect(screen.queryByTestId("export-copy")).toBeNull()
  })

  it("copies a PNG even when SVG is chosen, stays open, and confirms", async () => {
    const onClose = vi.fn()
    const onCopy = vi.fn<CopyFn>(() => Promise.resolve())
    render(
      <ExportDialog
        t={t}
        open
        onClose={onClose}
        onExport={() => {}}
        onCopy={onCopy}
        pages={ONE_PAGE}
        activePageId="p1"
      />,
    )
    await userEvent.click(screen.getByTestId("format-svg"))
    const copy = screen.getByTestId("export-copy")
    expect(copy).toHaveTextContent("export.copy")
    await userEvent.click(copy)
    expect(onCopy).toHaveBeenCalledWith(expect.objectContaining({ format: "png", pageId: "p1" }))
    expect(await screen.findByTestId("export-copy-success")).toHaveTextContent("export.copied")
    expect(screen.getByRole("status")).toBe(screen.getByTestId("export-copy-success"))
    expect(onClose).not.toHaveBeenCalled()
    expect(confirm()).toBeInTheDocument()
  })

  it("passes the selection scope through to onCopy", async () => {
    const onCopy = vi.fn<CopyFn>(() => Promise.resolve())
    render(
      <ExportDialog
        t={t}
        open
        onClose={() => {}}
        onExport={() => {}}
        onCopy={onCopy}
        pages={ONE_PAGE}
        activePageId="p1"
        hasSelection
      />,
    )
    await userEvent.click(screen.getByTestId("scope-selection"))
    await userEvent.click(screen.getByTestId("export-copy"))
    expect(onCopy).toHaveBeenCalledWith(expect.objectContaining({ scope: "selection" }))
  })

  it("a rejected copy shows an inline error and keeps the dialog open", async () => {
    const onClose = vi.fn()
    const onExport = vi.fn()
    const onCopy = vi.fn<CopyFn>(() =>
      Promise.reject(new DOMException("Write permission denied.", "NotAllowedError")),
    )
    render(
      <ExportDialog
        t={t}
        open
        onClose={onClose}
        onExport={onExport}
        onCopy={onCopy}
        pages={ONE_PAGE}
        activePageId="p1"
      />,
    )
    await userEvent.click(screen.getByTestId("export-copy"))
    const error = await screen.findByTestId("export-copy-error")
    expect(error).toHaveAttribute("role", "alert")
    expect(error).toHaveTextContent("export.copyFailed")
    expect(onClose).not.toHaveBeenCalled()
    await userEvent.click(confirm())
    expect(onExport).toHaveBeenCalledTimes(1)
  })

  it("a synchronous throw from onCopy also shows the error", async () => {
    const onCopy = vi.fn<CopyFn>(() => {
      throw new Error("boom")
    })
    render(
      <ExportDialog
        t={t}
        open
        onClose={() => {}}
        onExport={() => {}}
        onCopy={onCopy}
        pages={ONE_PAGE}
        activePageId="p1"
      />,
    )
    await userEvent.click(screen.getByTestId("export-copy"))
    expect(await screen.findByTestId("export-copy-error")).toBeInTheDocument()
  })

  it("disables Copy while copying and clears an earlier error on retry", async () => {
    let finish!: () => void
    const pending = new Promise<void>((resolve) => {
      finish = resolve
    })
    const onCopy = vi
      .fn<CopyFn>()
      .mockImplementationOnce(() => Promise.reject(new Error("denied")))
      .mockImplementationOnce(() => pending)
    render(
      <ExportDialog
        t={t}
        open
        onClose={() => {}}
        onExport={() => {}}
        onCopy={onCopy}
        pages={ONE_PAGE}
        activePageId="p1"
      />,
    )
    const copy = screen.getByTestId("export-copy")
    await userEvent.click(copy)
    await screen.findByTestId("export-copy-error")
    await userEvent.click(copy)
    expect(copy).toBeDisabled()
    expect(screen.queryByTestId("export-copy-error")).toBeNull()
    finish()
    expect(await screen.findByTestId("export-copy-success")).toBeInTheDocument()
    expect(copy).toBeEnabled()
  })
})
