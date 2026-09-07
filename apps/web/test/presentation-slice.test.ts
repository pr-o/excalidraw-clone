import { beforeEach, describe, expect, it } from "vitest"
import { useAppStore } from "../src/store"

describe("presentationSlice", () => {
  beforeEach(() => {
    useAppStore.getState().exitPresentation()
  })

  it("defaults to not presenting on slide 0", () => {
    const s = useAppStore.getState()
    expect(s.presenting).toBe(false)
    expect(s.slideIndex).toBe(0)
  })

  it("enterPresentation starts presenting and resets slideIndex", () => {
    useAppStore.getState().goToSlide(3)
    expect(useAppStore.getState().slideIndex).toBe(3)

    useAppStore.getState().enterPresentation()
    expect(useAppStore.getState().presenting).toBe(true)
    expect(useAppStore.getState().slideIndex).toBe(0)
  })

  it("nextSlide advances without an upper clamp", () => {
    useAppStore.getState().nextSlide()
    useAppStore.getState().nextSlide()
    expect(useAppStore.getState().slideIndex).toBe(2)
  })

  it("prevSlide clamps at 0", () => {
    useAppStore.getState().prevSlide()
    expect(useAppStore.getState().slideIndex).toBe(0)

    useAppStore.getState().goToSlide(2)
    useAppStore.getState().prevSlide()
    expect(useAppStore.getState().slideIndex).toBe(1)
  })

  it("goToSlide stores the index as given", () => {
    useAppStore.getState().goToSlide(5)
    expect(useAppStore.getState().slideIndex).toBe(5)
  })

  it("exitPresentation stops presenting and resets slideIndex", () => {
    useAppStore.getState().enterPresentation()
    useAppStore.getState().nextSlide()
    expect(useAppStore.getState().slideIndex).toBe(1)

    useAppStore.getState().exitPresentation()
    expect(useAppStore.getState().presenting).toBe(false)
    expect(useAppStore.getState().slideIndex).toBe(0)
  })
})
