import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { SnapshotsDialog } from "../src/SnapshotsDialog"

const t = (key: string): string => key
const snapshots = [
  { id: "b", name: "Second", createdAt: 2000 },
  { id: "a", name: "First", createdAt: 1000 },
]

function setup(overrides: Partial<Parameters<typeof SnapshotsDialog>[0]> = {}) {
  const props = {
    t,
    open: true,
    onClose: vi.fn(),
    snapshots,
    onSave: vi.fn(),
    onRestore: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  }
  render(<SnapshotsDialog {...props} />)
  return props
}

describe("SnapshotsDialog", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <SnapshotsDialog
        t={t}
        open={false}
        onClose={() => {}}
        snapshots={snapshots}
        onSave={() => {}}
        onRestore={() => {}}
        onDelete={() => {}}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it("prefills a default name and saves the edited name", async () => {
    const props = setup()
    const input = screen.getByTestId<HTMLInputElement>("snapshots-name")
    expect(input.value).toMatch(/^snapshots\.defaultName /)
    await userEvent.clear(input)
    await userEvent.type(input, "Mine")
    await userEvent.click(screen.getByTestId("snapshots-save"))
    expect(props.onSave).toHaveBeenCalledWith("Mine")
  })

  it("lists snapshots in the given order", () => {
    setup()
    const rows = screen.getAllByTestId("snapshot-row")
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining("Second"),
      expect.stringContaining("First"),
    ])
  })

  it("delete is immediate", async () => {
    const props = setup()
    await userEvent.click(screen.getAllByTestId("snapshot-delete")[1]!)
    expect(props.onDelete).toHaveBeenCalledWith("a")
  })

  it("restore asks for confirmation first", async () => {
    const props = setup()
    await userEvent.click(screen.getAllByTestId("snapshot-restore")[0]!)
    expect(props.onRestore).not.toHaveBeenCalled()
    expect(screen.getByText("snapshots.confirmRestore")).toBeTruthy()
    await userEvent.click(screen.getByTestId("snapshot-restore-confirm"))
    expect(props.onRestore).toHaveBeenCalledWith("b")
  })
})
