import { newRectangle } from "@excalidraw-clone/scene"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { PropertiesPanel } from "../src/PropertiesPanel"

const t = (key: string): string => key

const noop = (): void => {}

const handlers = {
  onChange: vi.fn(),
  onDelete: vi.fn(),
  onDuplicate: vi.fn(),
  onSendToBack: noop,
  onSendBackward: noop,
  onBringForward: noop,
  onBringToFront: noop,
}

describe("PropertiesPanel", () => {
  it("renders nothing when selection is empty", () => {
    const { container } = render(<PropertiesPanel t={t} selectedElements={[]} {...handlers} />)
    expect(container.firstChild).toBeNull()
  })

  it("shows current strokeColor as the selected swatch", () => {
    const el = { ...newRectangle({ x: 0, y: 0, width: 10, height: 10 }), strokeColor: "#1e1e1e" }
    render(<PropertiesPanel t={t} selectedElements={[el]} {...handlers} />)
    const swatch = screen.getByTestId("stroke-1e1e1e")
    expect(swatch).toHaveAttribute("aria-pressed", "true")
  })

  it("emits onChange({ strokeColor }) when a swatch is clicked", async () => {
    const el = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const onChange = vi.fn()
    render(<PropertiesPanel t={t} selectedElements={[el]} {...handlers} onChange={onChange} />)
    await userEvent.click(screen.getByTestId("stroke-e03131"))
    expect(onChange).toHaveBeenCalledWith({ strokeColor: "#e03131" })
  })

  it("emits onChange({ strokeWidth }) when stroke-width button is clicked", async () => {
    const el = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const onChange = vi.fn()
    render(<PropertiesPanel t={t} selectedElements={[el]} {...handlers} onChange={onChange} />)
    await userEvent.click(screen.getByTestId("stroke-width-2"))
    expect(onChange).toHaveBeenCalledWith({ strokeWidth: 2 })
  })

  it("emits onDelete when Delete is clicked", async () => {
    const el = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const onDelete = vi.fn()
    render(<PropertiesPanel t={t} selectedElements={[el]} {...handlers} onDelete={onDelete} />)
    await userEvent.click(screen.getByRole("button", { name: /delete/i }))
    expect(onDelete).toHaveBeenCalled()
  })

  it("when selection is mixed (different strokeColors), no swatch is pressed", () => {
    const a = { ...newRectangle({ x: 0, y: 0, width: 10, height: 10 }), strokeColor: "#1e1e1e" }
    const b = { ...newRectangle({ x: 0, y: 0, width: 10, height: 10 }), strokeColor: "#e03131" }
    render(<PropertiesPanel t={t} selectedElements={[a, b]} {...handlers} />)
    expect(screen.getByTestId("stroke-1e1e1e")).toHaveAttribute("aria-pressed", "false")
    expect(screen.getByTestId("stroke-e03131")).toHaveAttribute("aria-pressed", "false")
  })

  it("emits onChange({ strokeStyle }) when a stroke-style button is clicked", async () => {
    const el = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const onChange = vi.fn()
    render(<PropertiesPanel t={t} selectedElements={[el]} {...handlers} onChange={onChange} />)
    await userEvent.click(screen.getByTestId("stroke-style-dashed"))
    expect(onChange).toHaveBeenCalledWith({ strokeStyle: "dashed" })
  })

  it("emits onChange({ fillStyle }) when a fill-style button is clicked", async () => {
    const el = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const onChange = vi.fn()
    render(<PropertiesPanel t={t} selectedElements={[el]} {...handlers} onChange={onChange} />)
    await userEvent.click(screen.getByTestId("fill-style-cross-hatch"))
    expect(onChange).toHaveBeenCalledWith({ fillStyle: "cross-hatch" })
  })

  it("emits onChange({ roundness }) when a roundness button is clicked", async () => {
    const el = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const onChange = vi.fn()
    render(<PropertiesPanel t={t} selectedElements={[el]} {...handlers} onChange={onChange} />)
    await userEvent.click(screen.getByTestId("roundness-round"))
    expect(onChange).toHaveBeenCalledWith({ roundness: { type: 1 } })
  })

  it("mixed strokeStyle selection shows no pressed style button", () => {
    const a = {
      ...newRectangle({ x: 0, y: 0, width: 10, height: 10 }),
      strokeStyle: "solid" as const,
    }
    const b = {
      ...newRectangle({ x: 0, y: 0, width: 10, height: 10 }),
      strokeStyle: "dashed" as const,
    }
    render(<PropertiesPanel t={t} selectedElements={[a, b]} {...handlers} />)
    expect(screen.getByTestId("stroke-style-solid")).toHaveAttribute("aria-pressed", "false")
    expect(screen.getByTestId("stroke-style-dashed")).toHaveAttribute("aria-pressed", "false")
  })
})
