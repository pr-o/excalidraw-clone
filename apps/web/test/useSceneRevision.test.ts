import { Scene, newRectangle } from "@excalidraw-clone/scene"
import { act, renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { useSceneRevision } from "../src/hooks/useSceneRevision"

describe("useSceneRevision", () => {
  it("starts at 0", () => {
    const scene = new Scene()
    const { result } = renderHook(() => useSceneRevision(scene))
    expect(result.current).toBe(0)
  })

  it("increments when the scene mutates", () => {
    const scene = new Scene()
    const { result } = renderHook(() => useSceneRevision(scene))
    act(() => {
      scene.mutate((draft) => draft.push(newRectangle({ x: 0, y: 0, width: 10, height: 10 })))
    })
    expect(result.current).toBe(1)
    act(() => {
      scene.mutate((draft) => draft.push(newRectangle({ x: 0, y: 0, width: 5, height: 5 })))
    })
    expect(result.current).toBe(2)
  })

  it("unsubscribes on unmount (no increment after)", () => {
    const scene = new Scene()
    const { result, unmount } = renderHook(() => useSceneRevision(scene))
    unmount()
    act(() => {
      scene.mutate((draft) => draft.push(newRectangle({ x: 0, y: 0, width: 10, height: 10 })))
    })
    expect(result.current).toBe(0)
  })
})
