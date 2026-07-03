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
})
