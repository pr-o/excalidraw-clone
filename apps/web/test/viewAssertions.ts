import type { ViewTransform } from "@excalidraw-clone/geometry"
import { expect } from "vitest"
import { useAppStore } from "../src/store"

export const currentView = (): ViewTransform => {
  const { scrollX, scrollY, zoom } = useAppStore.getState()
  return { scrollX, scrollY, zoom }
}

export const expectViewToBe = (actual: ViewTransform, expected: ViewTransform): void => {
  expect(actual.scrollX).toBeCloseTo(expected.scrollX, 5)
  expect(actual.scrollY).toBeCloseTo(expected.scrollY, 5)
  expect(actual.zoom).toBeCloseTo(expected.zoom, 5)
}
