import { newEllipse, newRectangle } from "@excalidraw-clone/scene"
import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { LayersPanel } from "../src/LayersPanel"

const t = (key: string): string => key

const handlers = {
  onToggle: vi.fn(),
  onSelect: vi.fn(),
  onSendToBack: vi.fn(),
  onSendBackward: vi.fn(),
  onBringForward: vi.fn(),
  onBringToFront: vi.fn(),
}

describe("LayersPanel", () => {
  it("shows only the toggle button when closed", () => {
    const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    render(<LayersPanel t={t} elements={[a]} selectedIds={[]} open={false} {...handlers} />)
    expect(screen.queryByTestId(`layer-row-${a.id}`)).toBeNull()
    expect(screen.getByTestId("layers-toggle")).toBeInTheDocument()
  })

  it("renders rows in reverse scene order (front-most element first)", () => {
    const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const b = newEllipse({ x: 20, y: 0, width: 10, height: 10 })
    render(<LayersPanel t={t} elements={[a, b]} selectedIds={[]} open {...handlers} />)
    const rows = screen.getAllByTestId(/^layer-row-/)
    expect(rows.map((r) => r.dataset.testid)).toEqual([`layer-row-${b.id}`, `layer-row-${a.id}`])
  })

  it("excludes deleted elements", () => {
    const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const dead = { ...newRectangle({ x: 20, y: 0, width: 10, height: 10 }), isDeleted: true }
    render(<LayersPanel t={t} elements={[a, dead]} selectedIds={[]} open {...handlers} />)
    expect(screen.queryByTestId(`layer-row-${dead.id}`)).toBeNull()
  })

  it("highlights rows present in selectedIds", () => {
    const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    render(<LayersPanel t={t} elements={[a]} selectedIds={[a.id]} open {...handlers} />)
    expect(screen.getByTestId(`layer-row-${a.id}`).className).toContain("bg-violet-100")
  })

  it("calls onSelect with additive:false on a plain click", async () => {
    const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const onSelect = vi.fn()
    render(
      <LayersPanel t={t} elements={[a]} selectedIds={[]} open {...handlers} onSelect={onSelect} />,
    )
    await userEvent.click(screen.getByTestId(`layer-select-${a.id}`))
    expect(onSelect).toHaveBeenCalledWith(a.id, { additive: false })
  })

  it("calls onSelect with additive:true on a shift-click", () => {
    const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const onSelect = vi.fn()
    render(
      <LayersPanel t={t} elements={[a]} selectedIds={[]} open {...handlers} onSelect={onSelect} />,
    )
    fireEvent.click(screen.getByTestId(`layer-select-${a.id}`), { shiftKey: true })
    expect(onSelect).toHaveBeenCalledWith(a.id, { additive: true })
  })

  it("calls the matching reorder callback with the row's id", async () => {
    const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const onBringToFront = vi.fn()
    render(
      <LayersPanel
        t={t}
        elements={[a]}
        selectedIds={[]}
        open
        {...handlers}
        onBringToFront={onBringToFront}
      />,
    )
    await userEvent.click(screen.getByTestId(`layer-bring-to-front-${a.id}`))
    expect(onBringToFront).toHaveBeenCalledWith(a.id)
  })
})
