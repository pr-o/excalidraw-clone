import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { LibraryItem } from "@excalidraw-clone/scene"
import { describe, expect, it, vi } from "vitest"
import { LibraryPanel } from "../src/LibraryPanel"

const t = (key: string): string => key

const template: LibraryItem = {
  id: "builtin-flowchart",
  name: "Flowchart",
  created: 0,
  elements: [],
}
const userItem: LibraryItem = { id: "u1", name: "My shape", created: 1, elements: [] }

function renderPanel(over: Partial<React.ComponentProps<typeof LibraryPanel>> = {}) {
  const props = {
    t,
    open: true,
    onToggle: () => {},
    items: [] as LibraryItem[],
    templates: [] as LibraryItem[],
    selectedCount: 0,
    onAddFromSelection: () => {},
    onItemClick: vi.fn(),
    onImport: () => {},
    onExport: () => {},
    onRename: () => {},
    onDelete: () => {},
    renderThumbnail: () => "<svg></svg>",
    ...over,
  }
  render(<LibraryPanel {...props} />)
  return props
}

describe("LibraryPanel templates section", () => {
  it("lists built-in templates under the TEMPLATES header", () => {
    renderPanel({ templates: [template] })
    expect(screen.getByText("library.templates")).toBeInTheDocument()
    expect(screen.getByTestId("template-item-builtin-flowchart")).toBeInTheDocument()
  })

  it("calls onItemClick when a template tile is clicked", async () => {
    const props = renderPanel({ templates: [template] })
    await userEvent.click(
      screen.getByTestId("template-item-builtin-flowchart").querySelector("button")!,
    )
    expect(props.onItemClick).toHaveBeenCalledWith(template)
  })

  it("renders no rename/delete menu on template tiles", () => {
    renderPanel({ templates: [template] })
    const tile = screen.getByTestId("template-item-builtin-flowchart")
    expect(tile.querySelector('[aria-label="more"]')).toBeNull()
  })

  it("still renders user items with their menu", () => {
    renderPanel({ items: [userItem] })
    const tile = screen.getByTestId("library-item-u1")
    expect(tile.querySelector('[aria-label="more"]')).not.toBeNull()
  })

  it("shows only the toggle button when closed, keeping a11y attributes", () => {
    renderPanel({ open: false })
    expect(screen.queryByTestId("library-panel")).toBeNull()
    expect(screen.queryByTestId("library-import")).toBeNull()
    const toggle = screen.getByTestId("library-toggle")
    expect(toggle).toBeInTheDocument()
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    expect(toggle).toHaveAttribute("aria-label", "library.toggle")
    expect(toggle).toHaveTextContent("‹")
  })

  it("keeps toggle a11y attributes when open", () => {
    renderPanel({ open: true })
    const toggle = screen.getByTestId("library-toggle")
    expect(toggle).toHaveAttribute("aria-expanded", "true")
    expect(toggle).toHaveAttribute("aria-label", "library.toggle")
    expect(toggle).toHaveTextContent("›")
  })
})
