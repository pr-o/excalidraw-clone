import { Scene, newRectangle } from "@excalidraw-clone/scene"
import { act, renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { useSceneElements, useSceneSnapshot } from "../src/hooks/useScene"

const rect = () => newRectangle({ x: 0, y: 0, width: 10, height: 10 })

describe("useSceneElements", () => {
  it("returns the live elements and a new array only when they change", () => {
    const scene = new Scene()
    const { result, rerender } = renderHook(() => useSceneElements(scene))
    const first = result.current
    expect(first).toEqual([])
    rerender()
    expect(result.current).toBe(first)
    act(() => {
      scene.mutate((d) => {
        d.push(rect())
      })
    })
    expect(result.current).toHaveLength(1)
    expect(result.current).not.toBe(first)
  })

  it("stops listening on unmount", () => {
    const scene = new Scene()
    const { result, unmount } = renderHook(() => useSceneElements(scene))
    unmount()
    act(() => {
      scene.mutate((d) => {
        d.push(rect())
      })
    })
    expect(result.current).toEqual([])
  })
})

describe("useSceneSnapshot", () => {
  it("tracks any immutable scene value, e.g. the undo history", () => {
    const scene = new Scene()
    const { result } = renderHook(() => useSceneSnapshot(scene, (s) => s.getHistory()))
    expect(result.current).toHaveLength(1)
    act(() => {
      scene.mutate((d) => {
        d.push(rect())
      })
    })
    expect(result.current).toHaveLength(2)
  })
})
