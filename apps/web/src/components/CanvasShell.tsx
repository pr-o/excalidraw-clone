"use client"
import type { CanvasRenderer } from "@excalidraw-clone/renderer"
import type { Scene } from "@excalidraw-clone/scene"
import { useEffect, useRef } from "react"
import { useDrawingDriver } from "../driver/useDrawingDriver"

export interface CanvasShellProps {
  scene: Scene
  onRendererReady?: (renderer: CanvasRenderer) => void
  onRendererTeardown?: () => void
}

export function CanvasShell({
  scene,
  onRendererReady,
  onRendererTeardown,
}: CanvasShellProps): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const laserRef = useRef<HTMLCanvasElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const wrapper = wrapperRef.current
    const canvas = canvasRef.current
    const overlay = overlayRef.current
    const laser = laserRef.current
    if (!wrapper || !canvas || !overlay || !laser) return

    const resize = (): void => {
      const dpr = window.devicePixelRatio || 1
      const w = wrapper.clientWidth
      const h = wrapper.clientHeight
      for (const c of [canvas, overlay, laser]) {
        c.width = Math.floor(w * dpr)
        c.height = Math.floor(h * dpr)
        c.style.width = `${w}px`
        c.style.height = `${h}px`
      }
      const ctx = canvas.getContext("2d")
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    resize()
    window.addEventListener("resize", resize)
    return () => window.removeEventListener("resize", resize)
  }, [])

  useDrawingDriver({
    scene,
    canvasRef,
    overlayRef,
    laserRef,
    ...(onRendererReady ? { onReady: onRendererReady } : {}),
    ...(onRendererTeardown ? { onTeardown: onRendererTeardown } : {}),
  })

  return (
    <div ref={wrapperRef} className="absolute inset-0">
      <canvas ref={canvasRef} className="absolute inset-0 touch-none" />
      <canvas ref={overlayRef} className="pointer-events-none absolute inset-0" />
      <canvas ref={laserRef} className="pointer-events-none absolute inset-0" />
    </div>
  )
}
