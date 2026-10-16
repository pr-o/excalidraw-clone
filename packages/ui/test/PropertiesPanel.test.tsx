import {
  newArrow,
  newImage,
  newLabelFor,
  newLine,
  newRectangle,
  newText,
} from "@excalidraw-clone/scene"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { PropertiesPanel } from "../src/PropertiesPanel"

const t = (key: string): string => key

const noop = (): void => {}

const handlers = {
  onChange: vi.fn(),
  onDelete: vi.fn(),
  onDuplicate: vi.fn(),
  onAlign: noop,
  onDistribute: noop,
  onTidy: noop,
  onGroup: vi.fn(),
  onUngroup: vi.fn(),
  onLock: vi.fn(),
  onFlip: vi.fn(),
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

  it.each([
    [
      "emits onChange({ strokeColor }) when a swatch is clicked",
      "stroke-e03131",
      { strokeColor: "#e03131" },
    ],
    [
      "emits onChange({ strokeWidth }) when stroke-width button is clicked",
      "stroke-width-2",
      { strokeWidth: 2 },
    ],
    [
      "emits onChange({ strokeStyle }) when a stroke-style button is clicked",
      "stroke-style-dashed",
      { strokeStyle: "dashed" },
    ],
    [
      "emits onChange({ fillStyle }) when a fill-style button is clicked",
      "fill-style-cross-hatch",
      { fillStyle: "cross-hatch" },
    ],
    [
      "emits onChange({ roundness }) when a roundness button is clicked",
      "roundness-round",
      { roundness: { type: 1 } },
    ],
    [
      "emits onChange({ roughness: 2 }) when the Cartoonist button is clicked",
      "roughness-2",
      { roughness: 2 },
    ],
  ])("%s", async (_name, testId, patch) => {
    const el = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const onChange = vi.fn()
    render(<PropertiesPanel t={t} selectedElements={[el]} {...handlers} onChange={onChange} />)
    await userEvent.click(screen.getByTestId(testId))
    expect(onChange).toHaveBeenCalledWith(patch)
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

  it("marks the common roughness level as pressed (default 1)", () => {
    const el = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    render(<PropertiesPanel t={t} selectedElements={[el]} {...handlers} />)
    expect(screen.getByTestId("roughness-1")).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByTestId("roughness-0")).toHaveAttribute("aria-pressed", "false")
    expect(screen.getByTestId("roughness-2")).toHaveAttribute("aria-pressed", "false")
  })

  it("no roughness button pressed for a mixed selection", () => {
    const a = { ...newRectangle({ x: 0, y: 0, width: 10, height: 10 }), roughness: 0 as const }
    const b = { ...newRectangle({ x: 20, y: 0, width: 10, height: 10 }), roughness: 2 as const }
    render(<PropertiesPanel t={t} selectedElements={[a, b]} {...handlers} />)
    expect(screen.getByTestId("roughness-0")).toHaveAttribute("aria-pressed", "false")
    expect(screen.getByTestId("roughness-1")).toHaveAttribute("aria-pressed", "false")
    expect(screen.getByTestId("roughness-2")).toHaveAttribute("aria-pressed", "false")
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

  it("hides the Arrange section when fewer than 2 elements are selected", () => {
    const el = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    render(<PropertiesPanel t={t} selectedElements={[el]} {...handlers} />)
    expect(screen.queryByTestId("align-left")).toBeNull()
  })

  it("shows the Arrange section when 2+ elements are selected", () => {
    const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const b = newRectangle({ x: 50, y: 0, width: 10, height: 10 })
    render(<PropertiesPanel t={t} selectedElements={[a, b]} {...handlers} />)
    expect(screen.getByTestId("align-left")).toBeInTheDocument()
  })

  it("calls onAlign with the edge when an align button is clicked", async () => {
    const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const b = newRectangle({ x: 50, y: 0, width: 10, height: 10 })
    const onAlign = vi.fn()
    render(<PropertiesPanel t={t} selectedElements={[a, b]} {...handlers} onAlign={onAlign} />)
    await userEvent.click(screen.getByTestId("align-centerX"))
    expect(onAlign).toHaveBeenCalledWith("centerX")
  })

  it("disables distribute with 2 selected and enables + fires it with 3", async () => {
    const mk = (x: number) => newRectangle({ x, y: 0, width: 10, height: 10 })
    const onDistribute = vi.fn()
    const { rerender } = render(
      <PropertiesPanel
        t={t}
        selectedElements={[mk(0), mk(50)]}
        {...handlers}
        onDistribute={onDistribute}
      />,
    )
    expect(screen.getByTestId("distribute-horizontal")).toBeDisabled()
    rerender(
      <PropertiesPanel
        t={t}
        selectedElements={[mk(0), mk(50), mk(100)]}
        {...handlers}
        onDistribute={onDistribute}
      />,
    )
    const btn = screen.getByTestId("distribute-horizontal")
    expect(btn).toBeEnabled()
    await userEvent.click(btn)
    expect(onDistribute).toHaveBeenCalledWith("horizontal")
  })

  it("fires Tidy up from the Arrange section", async () => {
    const mk = (x: number) => newRectangle({ x, y: 0, width: 10, height: 10 })
    const onTidy = vi.fn()
    render(
      <PropertiesPanel t={t} selectedElements={[mk(0), mk(50)]} {...handlers} onTidy={onTidy} />,
    )
    await userEvent.click(screen.getByTestId("tidy-up"))
    expect(onTidy).toHaveBeenCalledTimes(1)
  })

  it("enables Group and disables Ungroup for 2 ungrouped elements", () => {
    const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const b = newRectangle({ x: 20, y: 0, width: 10, height: 10 })
    render(<PropertiesPanel t={t} selectedElements={[a, b]} {...handlers} />)
    expect(screen.getByTestId("group-selection")).toBeEnabled()
    expect(screen.getByTestId("ungroup-selection")).toBeDisabled()
  })

  it("hides the Group section for a single ungrouped element", () => {
    const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    render(<PropertiesPanel t={t} selectedElements={[a]} {...handlers} />)
    expect(screen.queryByTestId("group-selection")).toBeNull()
  })

  it("enables Ungroup when a selected element is grouped", () => {
    const a = { ...newRectangle({ x: 0, y: 0, width: 10, height: 10 }), groupIds: ["g1"] }
    render(<PropertiesPanel t={t} selectedElements={[a]} {...handlers} />)
    expect(screen.getByTestId("ungroup-selection")).toBeEnabled()
    expect(screen.getByTestId("group-selection")).toBeDisabled()
  })

  it("emits onGroup and onUngroup when clicked", async () => {
    const a = { ...newRectangle({ x: 0, y: 0, width: 10, height: 10 }), groupIds: ["g1"] }
    const b = { ...newRectangle({ x: 20, y: 0, width: 10, height: 10 }), groupIds: ["g1"] }
    const onGroup = vi.fn()
    const onUngroup = vi.fn()
    render(
      <PropertiesPanel
        t={t}
        selectedElements={[a, b]}
        {...handlers}
        onGroup={onGroup}
        onUngroup={onUngroup}
      />,
    )
    await userEvent.click(screen.getByTestId("group-selection"))
    expect(onGroup).toHaveBeenCalled()
    await userEvent.click(screen.getByTestId("ungroup-selection"))
    expect(onUngroup).toHaveBeenCalled()
  })

  it("renders the Lock button whenever a selection exists", () => {
    const el = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    render(<PropertiesPanel t={t} selectedElements={[el]} {...handlers} />)
    expect(screen.getByTestId("panel-lock")).toBeInTheDocument()
  })

  it("fires onLock when the Lock button is clicked", async () => {
    const el = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const onLock = vi.fn()
    render(<PropertiesPanel t={t} selectedElements={[el]} {...handlers} onLock={onLock} />)
    await userEvent.click(screen.getByTestId("panel-lock"))
    expect(onLock).toHaveBeenCalled()
  })

  it("shows the flip row for a single selected element", () => {
    const el = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    render(<PropertiesPanel t={t} selectedElements={[el]} {...handlers} />)
    expect(screen.getByTestId("flip-x")).toBeInTheDocument()
    expect(screen.getByTestId("flip-y")).toBeInTheDocument()
    // independent of the >= 2-gated Arrange section
    expect(screen.queryByTestId("align-left")).toBeNull()
  })

  it("shows the flip row for a multi-element selection", () => {
    const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const b = newRectangle({ x: 50, y: 0, width: 10, height: 10 })
    render(<PropertiesPanel t={t} selectedElements={[a, b]} {...handlers} />)
    expect(screen.getByTestId("flip-x")).toBeInTheDocument()
    expect(screen.getByTestId("flip-y")).toBeInTheDocument()
  })

  it("calls onFlip with the axis when a flip button is clicked", async () => {
    const el = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const onFlip = vi.fn()
    render(<PropertiesPanel t={t} selectedElements={[el]} {...handlers} onFlip={onFlip} />)
    await userEvent.click(screen.getByTestId("flip-x"))
    expect(onFlip).toHaveBeenCalledWith("x")
    await userEvent.click(screen.getByTestId("flip-y"))
    expect(onFlip).toHaveBeenCalledWith("y")
  })

  describe("eyedropper", () => {
    const el = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const stub = (open: () => Promise<{ sRGBHex: string }>) => {
      ;(globalThis as Record<string, unknown>).EyeDropper = class {
        open = open
      }
    }
    afterEach(() => {
      delete (globalThis as Record<string, unknown>).EyeDropper
    })

    it("applies the picked colour to stroke and background", async () => {
      stub(() => Promise.resolve({ sRGBHex: "#123456" }))
      const onChange = vi.fn()
      render(<PropertiesPanel t={t} selectedElements={[el]} {...handlers} onChange={onChange} />)
      await userEvent.click(screen.getByTestId("stroke-eyedropper"))
      await waitFor(() => expect(onChange).toHaveBeenCalledWith({ strokeColor: "#123456" }))
      await userEvent.click(screen.getByTestId("bg-eyedropper"))
      await waitFor(() => expect(onChange).toHaveBeenCalledWith({ backgroundColor: "#123456" }))
    })

    it("does nothing when the pick is cancelled", async () => {
      stub(() => Promise.reject(new Error("cancelled")))
      const onChange = vi.fn()
      render(<PropertiesPanel t={t} selectedElements={[el]} {...handlers} onChange={onChange} />)
      await userEvent.click(screen.getByTestId("stroke-eyedropper"))
      await new Promise((r) => setTimeout(r, 0))
      expect(onChange).not.toHaveBeenCalled()
    })

    it("is hidden when the browser has no EyeDropper", () => {
      render(<PropertiesPanel t={t} selectedElements={[el]} {...handlers} />)
      expect(screen.queryByTestId("stroke-eyedropper")).toBeNull()
    })
  })

  it("offers Reset crop only for a single cropped image", async () => {
    const onResetCrop = vi.fn()
    const img = newImage({ x: 0, y: 0, width: 10, height: 10 })
    const cropped = { ...img, crop: { x: 0.1, y: 0, width: 0.9, height: 1 } }
    const { rerender } = render(
      <PropertiesPanel t={t} selectedElements={[img]} {...handlers} onResetCrop={onResetCrop} />,
    )
    expect(screen.queryByTestId("reset-crop")).toBeNull()
    rerender(
      <PropertiesPanel
        t={t}
        selectedElements={[cropped]}
        {...handlers}
        onResetCrop={onResetCrop}
      />,
    )
    await userEvent.click(screen.getByTestId("reset-crop"))
    expect(onResetCrop).toHaveBeenCalled()
  })

  it("hides the flip row when every selected element is locked", () => {
    const el = { ...newRectangle({ x: 0, y: 0, width: 10, height: 10 }), locked: true }
    render(<PropertiesPanel t={t} selectedElements={[el]} {...handlers} />)
    expect(screen.queryByTestId("flip-x")).toBeNull()
    expect(screen.queryByTestId("flip-y")).toBeNull()
  })

  it("keeps the flip row when only some selected elements are locked", () => {
    const a = { ...newRectangle({ x: 0, y: 0, width: 10, height: 10 }), locked: true }
    const b = newRectangle({ x: 50, y: 0, width: 10, height: 10 })
    render(<PropertiesPanel t={t} selectedElements={[a, b]} {...handlers} />)
    expect(screen.getByTestId("flip-x")).toBeInTheDocument()
  })

  it("shows Arrowheads section when all selected are linear", () => {
    const arrow = newArrow({ x: 0, y: 0 })
    const line = newLine({ x: 0, y: 0 })
    render(<PropertiesPanel t={t} selectedElements={[arrow, line]} {...handlers} />)
    expect(screen.getByTestId("arrowhead-end-arrow")).toBeInTheDocument()
    expect(screen.getByTestId("arrowhead-start-none")).toBeInTheDocument()
  })

  it("hides Arrowheads section when selection includes a non-linear element", () => {
    const arrow = newArrow({ x: 0, y: 0 })
    const rect = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    render(<PropertiesPanel t={t} selectedElements={[arrow, rect]} {...handlers} />)
    expect(screen.queryByTestId("arrowhead-end-arrow")).toBeNull()
  })

  it("marks the common end arrowhead as pressed (arrow default: end 'arrow')", () => {
    const arrow = newArrow({ x: 0, y: 0 })
    render(<PropertiesPanel t={t} selectedElements={[arrow]} {...handlers} />)
    expect(screen.getByTestId("arrowhead-end-arrow")).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByTestId("arrowhead-start-none")).toHaveAttribute("aria-pressed", "true")
  })

  it("mixed values → no arrowhead button pressed", () => {
    const a = newArrow({ x: 0, y: 0 }) // end "arrow"
    const l = newLine({ x: 0, y: 0 }) // end null
    render(<PropertiesPanel t={t} selectedElements={[a, l]} {...handlers} />)
    expect(screen.getByTestId("arrowhead-end-arrow")).toHaveAttribute("aria-pressed", "false")
    expect(screen.getByTestId("arrowhead-end-none")).toHaveAttribute("aria-pressed", "false")
  })

  it("emits onChange({ startArrowhead: 'dot' }) when a start kind is clicked", async () => {
    const arrow = newArrow({ x: 0, y: 0 })
    const onChange = vi.fn()
    render(<PropertiesPanel t={t} selectedElements={[arrow]} {...handlers} onChange={onChange} />)
    await userEvent.click(screen.getByTestId("arrowhead-start-dot"))
    expect(onChange).toHaveBeenCalledWith({ startArrowhead: "dot" })
  })

  it("emits onChange({ endArrowhead: null }) when end None is clicked", async () => {
    const arrow = newArrow({ x: 0, y: 0 })
    const onChange = vi.fn()
    render(<PropertiesPanel t={t} selectedElements={[arrow]} {...handlers} onChange={onChange} />)
    await userEvent.click(screen.getByTestId("arrowhead-end-none"))
    expect(onChange).toHaveBeenCalledWith({ endArrowhead: null })
  })

  it("shows the Arrow type control for arrow selections and patches elbowed", async () => {
    const arrow = newArrow({ x: 0, y: 0 })
    const onChange = vi.fn()
    render(<PropertiesPanel t={t} selectedElements={[arrow]} {...handlers} onChange={onChange} />)
    await userEvent.click(screen.getByTestId("arrow-type-elbow"))
    expect(onChange).toHaveBeenCalledWith({ elbowed: true })
    await userEvent.click(screen.getByTestId("arrow-type-sharp"))
    expect(onChange).toHaveBeenCalledWith({ elbowed: false })
  })

  it("hides the Arrow type control when selection has no arrow", () => {
    const rect = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    render(<PropertiesPanel t={t} selectedElements={[rect]} {...handlers} />)
    expect(screen.queryByTestId("arrow-type-elbow")).toBeNull()
  })
})

describe("PropertiesPanel — Text section", () => {
  it("shows the Text section for an all-text selection", () => {
    const a = newText({ x: 0, y: 0, text: "a" })
    const b = newText({ x: 0, y: 40, text: "b" })
    render(<PropertiesPanel t={t} selectedElements={[a, b]} {...handlers} />)
    expect(screen.getByText("properties.text")).toBeInTheDocument()
    expect(screen.getByTestId("font-family-1")).toBeInTheDocument()
    expect(screen.getByTestId("font-bold")).toBeInTheDocument()
    expect(screen.getByTestId("font-italic")).toBeInTheDocument()
  })

  it("hides the Text section for a non-text selection", () => {
    const el = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    render(<PropertiesPanel t={t} selectedElements={[el]} {...handlers} />)
    expect(screen.queryByTestId("font-family-1")).toBeNull()
    expect(screen.queryByTestId("font-bold")).toBeNull()
  })

  it("hides the Text section for a mixed text + shape selection", () => {
    const a = newText({ x: 0, y: 0, text: "a" })
    const b = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    render(<PropertiesPanel t={t} selectedElements={[a, b]} {...handlers} />)
    expect(screen.queryByTestId("font-family-1")).toBeNull()
  })

  it("shows the Text section for a labelled shape", () => {
    const rect = newRectangle({ x: 0, y: 0, width: 100, height: 60 })
    const label = { ...newLabelFor(rect), text: "hi" }
    render(
      <PropertiesPanel t={t} selectedElements={[rect]} labelElements={[label]} {...handlers} />,
    )
    expect(screen.getByTestId("font-family-1")).toBeInTheDocument()
    expect(screen.getByTestId("text-align-center")).toBeInTheDocument()
  })

  it("marks the label's font family and alignment as pressed for a labelled shape", () => {
    const rect = newRectangle({ x: 0, y: 0, width: 100, height: 60 })
    const label = {
      ...newLabelFor(rect),
      text: "hi",
      fontFamily: 3 as const,
      textAlign: "right" as const,
    }
    render(
      <PropertiesPanel t={t} selectedElements={[rect]} labelElements={[label]} {...handlers} />,
    )
    expect(screen.getByTestId("font-family-3")).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByTestId("text-align-right")).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByTestId("text-align-center")).toHaveAttribute("aria-pressed", "false")
  })

  it.each(["left", "center", "right"] as const)(
    "emits onChange({ textAlign: %s }) from its labelled button",
    async (align) => {
      const el = newText({ x: 0, y: 0, text: "a" })
      const onChange = vi.fn()
      render(<PropertiesPanel t={t} selectedElements={[el]} {...handlers} onChange={onChange} />)
      const button = screen.getByTestId(`text-align-${align}`)
      expect(button).toHaveTextContent(`properties.textAlign_${align}`)
      await userEvent.click(button)
      expect(onChange).toHaveBeenCalledWith({ textAlign: align })
    },
  )

  it("groups the align buttons under an accessible label", () => {
    const el = newText({ x: 0, y: 0, text: "a" })
    render(<PropertiesPanel t={t} selectedElements={[el]} {...handlers} />)
    expect(screen.getByRole("group", { name: "properties.textAlign" })).toBeInTheDocument()
  })

  it("hides the align row when an arrow is selected", () => {
    const arrow = newArrow({ x: 0, y: 0 })
    const label = { ...newText({ x: 0, y: 0, text: "hi" }), containerId: arrow.id }
    render(
      <PropertiesPanel t={t} selectedElements={[arrow]} labelElements={[label]} {...handlers} />,
    )
    expect(screen.getByTestId("font-family-1")).toBeInTheDocument()
    expect(screen.queryByTestId("text-align-left")).toBeNull()
  })

  it.each([
    [1, "properties.fontFamily_handDrawn"],
    [2, "properties.fontFamily_normal"],
    [3, "properties.fontFamily_code"],
  ] as const)("emits onChange({ fontFamily: %i }) from its labelled button", async (n, label) => {
    const el = newText({ x: 0, y: 0, text: "a" })
    const onChange = vi.fn()
    render(<PropertiesPanel t={t} selectedElements={[el]} {...handlers} onChange={onChange} />)
    const button = screen.getByTestId(`font-family-${n}`)
    expect(button).toHaveTextContent(label)
    await userEvent.click(button)
    expect(onChange).toHaveBeenCalledWith({ fontFamily: n })
  })

  it("marks the element's font family as pressed", () => {
    const el = newText({ x: 0, y: 0, text: "a", fontFamily: 3 })
    render(<PropertiesPanel t={t} selectedElements={[el]} {...handlers} />)
    expect(screen.getByTestId("font-family-3")).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByTestId("font-family-1")).toHaveAttribute("aria-pressed", "false")
    expect(screen.getByTestId("font-family-2")).toHaveAttribute("aria-pressed", "false")
  })

  it("no font family pressed for a mixed selection", () => {
    const a = newText({ x: 0, y: 0, text: "a", fontFamily: 1 })
    const b = newText({ x: 0, y: 40, text: "b", fontFamily: 2 })
    render(<PropertiesPanel t={t} selectedElements={[a, b]} {...handlers} />)
    for (const n of [1, 2, 3]) {
      expect(screen.getByTestId(`font-family-${n}`)).toHaveAttribute("aria-pressed", "false")
    }
  })

  it("bold: not pressed by default and clicking sets bold", async () => {
    const el = newText({ x: 0, y: 0, text: "a" })
    const onChange = vi.fn()
    render(<PropertiesPanel t={t} selectedElements={[el]} {...handlers} onChange={onChange} />)
    const bold = screen.getByTestId("font-bold")
    expect(bold).toHaveAttribute("aria-pressed", "false")
    await userEvent.click(bold)
    expect(onChange).toHaveBeenCalledWith({ fontWeight: "bold" })
  })

  it("bold: pressed when bold and clicking sets normal", async () => {
    const el = newText({ x: 0, y: 0, text: "a", fontWeight: "bold" })
    const onChange = vi.fn()
    render(<PropertiesPanel t={t} selectedElements={[el]} {...handlers} onChange={onChange} />)
    const bold = screen.getByTestId("font-bold")
    expect(bold).toHaveAttribute("aria-pressed", "true")
    await userEvent.click(bold)
    expect(onChange).toHaveBeenCalledWith({ fontWeight: "normal" })
  })

  it("italic: not pressed by default and clicking sets italic", async () => {
    const el = newText({ x: 0, y: 0, text: "a" })
    const onChange = vi.fn()
    render(<PropertiesPanel t={t} selectedElements={[el]} {...handlers} onChange={onChange} />)
    const italic = screen.getByTestId("font-italic")
    expect(italic).toHaveAttribute("aria-pressed", "false")
    await userEvent.click(italic)
    expect(onChange).toHaveBeenCalledWith({ fontStyle: "italic" })
  })

  it("italic: pressed when italic and clicking sets normal", async () => {
    const el = newText({ x: 0, y: 0, text: "a", fontStyle: "italic" })
    const onChange = vi.fn()
    render(<PropertiesPanel t={t} selectedElements={[el]} {...handlers} onChange={onChange} />)
    const italic = screen.getByTestId("font-italic")
    expect(italic).toHaveAttribute("aria-pressed", "true")
    await userEvent.click(italic)
    expect(onChange).toHaveBeenCalledWith({ fontStyle: "normal" })
  })

  it("mixed bold/italic selection shows not pressed; clicking applies to all", async () => {
    const a = newText({ x: 0, y: 0, text: "a", fontWeight: "bold", fontStyle: "italic" })
    const b = newText({ x: 0, y: 40, text: "b" })
    const onChange = vi.fn()
    render(<PropertiesPanel t={t} selectedElements={[a, b]} {...handlers} onChange={onChange} />)
    expect(screen.getByTestId("font-bold")).toHaveAttribute("aria-pressed", "false")
    expect(screen.getByTestId("font-italic")).toHaveAttribute("aria-pressed", "false")
    await userEvent.click(screen.getByTestId("font-bold"))
    expect(onChange).toHaveBeenCalledWith({ fontWeight: "bold" })
  })

  it("treats legacy text without fontWeight/fontStyle as normal", () => {
    const { fontWeight: _w, fontStyle: _s, ...legacy } = newText({ x: 0, y: 0, text: "a" })
    render(<PropertiesPanel t={t} selectedElements={[legacy]} {...handlers} />)
    expect(screen.getByTestId("font-bold")).toHaveAttribute("aria-pressed", "false")
    expect(screen.getByTestId("font-italic")).toHaveAttribute("aria-pressed", "false")
  })

  it("shows a labelled font-size group for an all-text selection", () => {
    const el = newText({ x: 0, y: 0, text: "a" })
    render(<PropertiesPanel t={t} selectedElements={[el]} {...handlers} />)
    const group = screen.getByRole("group", { name: "properties.fontSize" })
    for (const n of [16, 20, 28, 36]) {
      expect(group).toContainElement(screen.getByTestId(`font-size-${n}`))
    }
  })

  it("hides the font-size buttons for a non-text selection", () => {
    const el = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    render(<PropertiesPanel t={t} selectedElements={[el]} {...handlers} />)
    expect(screen.queryByTestId("font-size-20")).toBeNull()
  })

  it.each([
    [16, "properties.fontSize_s"],
    [20, "properties.fontSize_m"],
    [28, "properties.fontSize_l"],
    [36, "properties.fontSize_xl"],
  ] as const)("emits onChange({ fontSize: %i }) from its labelled button", async (n, label) => {
    const el = newText({ x: 0, y: 0, text: "a" })
    const onChange = vi.fn()
    render(<PropertiesPanel t={t} selectedElements={[el]} {...handlers} onChange={onChange} />)
    const button = screen.getByTestId(`font-size-${n}`)
    expect(button).toHaveTextContent(label)
    await userEvent.click(button)
    expect(onChange).toHaveBeenCalledWith({ fontSize: n })
  })

  it("marks M (20) as pressed for a default text element", () => {
    const el = newText({ x: 0, y: 0, text: "a" })
    render(<PropertiesPanel t={t} selectedElements={[el]} {...handlers} />)
    expect(screen.getByTestId("font-size-20")).toHaveAttribute("aria-pressed", "true")
    for (const n of [16, 28, 36]) {
      expect(screen.getByTestId(`font-size-${n}`)).toHaveAttribute("aria-pressed", "false")
    }
  })

  it("marks the element's font size as pressed", () => {
    const el = newText({ x: 0, y: 0, text: "a", fontSize: 28 })
    render(<PropertiesPanel t={t} selectedElements={[el]} {...handlers} />)
    expect(screen.getByTestId("font-size-28")).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByTestId("font-size-20")).toHaveAttribute("aria-pressed", "false")
  })

  it("no font size pressed for a mixed-size selection; clicking applies to all", async () => {
    const a = newText({ x: 0, y: 0, text: "a", fontSize: 16 })
    const b = newText({ x: 0, y: 40, text: "b", fontSize: 36 })
    const onChange = vi.fn()
    render(<PropertiesPanel t={t} selectedElements={[a, b]} {...handlers} onChange={onChange} />)
    for (const n of [16, 20, 28, 36]) {
      expect(screen.getByTestId(`font-size-${n}`)).toHaveAttribute("aria-pressed", "false")
    }
    await userEvent.click(screen.getByTestId("font-size-28"))
    expect(onChange).toHaveBeenCalledWith({ fontSize: 28 })
  })

  it("no font size pressed for a non-preset size", () => {
    const el = newText({ x: 0, y: 0, text: "a", fontSize: 24 })
    render(<PropertiesPanel t={t} selectedElements={[el]} {...handlers} />)
    for (const n of [16, 20, 28, 36]) {
      expect(screen.getByTestId(`font-size-${n}`)).toHaveAttribute("aria-pressed", "false")
    }
  })
})
