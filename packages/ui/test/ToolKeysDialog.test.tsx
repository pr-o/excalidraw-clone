import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { ToolKeysDialog, type ToolKeysRow } from "../src/ToolKeysDialog"

const t = (key: string): string => key
const rows: ToolKeysRow[] = [
  { tool: "selection", key: "v", isDefault: true },
  { tool: "rectangle", key: "q", isDefault: false },
]

const setup = (onRebind = vi.fn(() => null as string | null)) => {
  const onReset = vi.fn()
  const onResetAll = vi.fn()
  render(
    <ToolKeysDialog
      t={t}
      open
      onClose={() => {}}
      rows={rows}
      onRebind={onRebind}
      onReset={onReset}
      onResetAll={onResetAll}
    />,
  )
  return { onRebind, onReset, onResetAll }
}

describe("ToolKeysDialog", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <ToolKeysDialog
        t={t}
        open={false}
        onClose={() => {}}
        rows={rows}
        onRebind={() => null}
        onReset={() => {}}
        onResetAll={() => {}}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it("shows the current keys and per-row reset only for changed rows", () => {
    setup()
    expect(screen.getByTestId("tool-key-selection")).toHaveTextContent("V")
    expect(screen.getByTestId("tool-key-rectangle")).toHaveTextContent("Q")
    expect(screen.getByTestId("tool-key-reset-selection")).toBeDisabled()
    expect(screen.getByTestId("tool-key-reset-rectangle")).toBeEnabled()
  })

  it("captures a key press and passes the modifier state", async () => {
    const { onRebind } = setup()
    await userEvent.click(screen.getByTestId("tool-key-selection"))
    expect(screen.getByTestId("tool-key-selection")).toHaveTextContent("toolKeys.press")
    fireEvent.keyDown(screen.getByTestId("tool-key-selection"), { key: "x" })
    expect(onRebind).toHaveBeenCalledWith("selection", "x", false)
    expect(screen.getByTestId("tool-key-selection")).toHaveTextContent("V")
  })

  it("shows the rejection inline and keeps capturing", async () => {
    const { onRebind } = setup(vi.fn(() => "toolKeys.error.taken"))
    await userEvent.click(screen.getByTestId("tool-key-selection"))
    fireEvent.keyDown(screen.getByTestId("tool-key-selection"), { key: "q", ctrlKey: true })
    expect(onRebind).toHaveBeenCalledWith("selection", "q", true)
    expect(screen.getByRole("alert")).toHaveTextContent("toolKeys.error.taken")
    expect(screen.getByTestId("tool-key-selection")).toHaveTextContent("toolKeys.press")
  })

  it("ignores keys when not capturing and stops on Escape", async () => {
    const { onRebind } = setup()
    fireEvent.keyDown(screen.getByTestId("tool-key-selection"), { key: "x" })
    await userEvent.click(screen.getByTestId("tool-key-selection"))
    fireEvent.keyDown(screen.getByTestId("tool-key-selection"), { key: "Escape" })
    expect(onRebind).not.toHaveBeenCalled()
    expect(screen.getByTestId("tool-key-selection")).toHaveTextContent("V")
  })

  it("resets one row or all", async () => {
    const { onReset, onResetAll } = setup()
    await userEvent.click(screen.getByTestId("tool-key-reset-rectangle"))
    expect(onReset).toHaveBeenCalledWith("rectangle")
    await userEvent.click(screen.getByTestId("tool-keys-reset-all"))
    expect(onResetAll).toHaveBeenCalled()
  })
})
