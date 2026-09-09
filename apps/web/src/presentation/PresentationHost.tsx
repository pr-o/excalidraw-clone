"use client"
import { fitToContent, type Bounds, type ViewTransform } from "@excalidraw-clone/geometry"
import type { ExcalidrawElement, ExcalidrawFrameElement, Scene } from "@excalidraw-clone/scene"
import React, { useEffect, useMemo, useRef } from "react"
import { useTranslation } from "react-i18next"
import { useSceneRevision } from "../hooks/useSceneRevision"
import { useAppStore } from "../store"
import { animateView } from "./animateView"
import { PresentationOverlay } from "./PresentationOverlay"

/** Duration of the camera glide between two slides. */
const SLIDE_ANIMATION_MS = 400

const isSlide = (e: ExcalidrawElement): e is ExcalidrawFrameElement =>
  e.type === "frame" && !e.isDeleted

const frameBounds = (f: ExcalidrawFrameElement): Bounds => ({
  x: f.x,
  y: f.y,
  width: f.width,
  height: f.height,
})

export interface PresentationHostProps {
  scene: Scene
  /** Ref to the fullscreen target — the app's `<main>`. Falls back to the document element. */
  rootEl?: React.RefObject<HTMLElement | null>
}

/**
 * Drives presentation mode: fullscreen entry, one animated camera move per
 * slide (each frame element is a slide, in scene order), keyboard navigation,
 * and index clamping / auto-exit when the slide set shrinks.
 *
 * Mounted by the app only while `presenting` is true, so its unmount doubles as
 * the exit path: it cancels any in-flight camera animation, leaves fullscreen,
 * restores the camera captured on entry and drops the laser tool.
 */
export function PresentationHost({ scene, rootEl }: PresentationHostProps): React.ReactElement {
  const { t } = useTranslation()

  // The `scene` reference is stable across mutations, so the revision is what
  // makes this recompute on live edits (mirrors App.tsx's derived views).
  const sceneRevision = useSceneRevision(scene)
  const slides = useMemo(() => scene.getElements().filter(isSlide), [scene, sceneRevision])

  const slideIndex = useAppStore((s) => s.slideIndex)
  const activeTool = useAppStore((s) => s.activeTool)
  const setActiveTool = useAppStore((s) => s.setActiveTool)

  const count = slides.length
  const clamped = count === 0 ? 0 : Math.min(Math.max(slideIndex, 0), count - 1)

  const cancelRef = useRef<(() => void) | null>(null)

  // Captured during the first render rather than in an effect so a remount of
  // the same instance (React StrictMode) cannot overwrite it with an
  // already-presenting camera. The ref only ever takes one value, so the local
  // below is stable for the component's life and safe to close over.
  const snapshotRef = useRef<ViewTransform | null>(null)
  if (snapshotRef.current === null) {
    const { scrollX, scrollY, zoom } = useAppStore.getState()
    snapshotRef.current = { scrollX, scrollY, zoom }
  }
  const entrySnapshot: ViewTransform = snapshotRef.current

  // Entry / exit. Runs once per mount; its cleanup is the exit path — it must
  // fire only on unmount, so `rootEl` (a stable ref object) stays out of deps
  // and is dereferenced at effect time.
  useEffect(() => {
    const target = rootEl?.current ?? document.documentElement
    void target.requestFullscreen?.().catch(() => {})

    return () => {
      cancelRef.current?.()
      cancelRef.current = null
      if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {})
      const store = useAppStore.getState()
      store.setView(entrySnapshot)
      if (store.activeTool === "laser") store.setActiveTool("selection")
    }
  }, [])

  // Keep the index inside the slide set; an empty set ends the presentation.
  useEffect(() => {
    if (count === 0) {
      useAppStore.getState().exitPresentation()
    } else if (slideIndex > count - 1) {
      useAppStore.getState().goToSlide(count - 1)
    }
  }, [count, slideIndex])

  // Camera: glide to the current slide's fit transform.
  useEffect(() => {
    const slide = slides[clamped]
    if (!slide) return

    cancelRef.current?.()
    const target = fitToContent(frameBounds(slide), window.innerWidth, window.innerHeight)
    const { scrollX, scrollY, zoom } = useAppStore.getState()
    cancelRef.current = animateView({ scrollX, scrollY, zoom }, target, SLIDE_ANIMATION_MS, (v) =>
      useAppStore.getState().setView(v),
    )

    return () => {
      cancelRef.current?.()
      cancelRef.current = null
    }
  }, [slides, clamped])

  // Keyboard navigation. Capture phase + stopPropagation so the editor's own
  // shortcuts (space-pan, tool letters, …) stay inert while presenting.
  useEffect(() => {
    const last = count - 1
    const onKeyDown = (e: KeyboardEvent): void => {
      const store = useAppStore.getState()
      const handled = (): void => {
        e.stopPropagation()
        e.preventDefault()
      }
      switch (e.key) {
        case "ArrowRight":
        case "ArrowDown":
        case "PageDown":
        case " ":
        case "Space":
          handled()
          if (store.slideIndex < last) store.nextSlide()
          break
        case "ArrowLeft":
        case "ArrowUp":
        case "PageUp":
          handled()
          store.prevSlide()
          break
        case "Home":
          handled()
          store.goToSlide(0)
          break
        case "End":
          handled()
          if (last >= 0) store.goToSlide(last)
          break
        case "Escape":
          handled()
          store.exitPresentation()
          break
        default:
          break
      }
    }

    window.addEventListener("keydown", onKeyDown, { capture: true })
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true })
  }, [count])

  // Leaving fullscreen by any other means (Esc handled by the browser, F11, …)
  // ends the presentation.
  useEffect(() => {
    const onFullscreenChange = (): void => {
      if (useAppStore.getState().presenting && document.fullscreenElement == null) {
        useAppStore.getState().exitPresentation()
      }
    }
    document.addEventListener("fullscreenchange", onFullscreenChange)
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange)
  }, [])

  // A viewport change re-fits instantly — animating a resize would lag behind
  // the resize itself.
  useEffect(() => {
    const onResize = (): void => {
      const slide = slides[clamped]
      if (!slide) return
      cancelRef.current?.()
      cancelRef.current = null
      useAppStore
        .getState()
        .setView(fitToContent(frameBounds(slide), window.innerWidth, window.innerHeight))
    }
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [slides, clamped])

  return (
    <PresentationOverlay
      index={clamped}
      count={count}
      onPrev={() => useAppStore.getState().prevSlide()}
      onNext={() => {
        const store = useAppStore.getState()
        if (store.slideIndex < count - 1) store.nextSlide()
      }}
      laserActive={activeTool === "laser"}
      onToggleLaser={() => setActiveTool(activeTool === "laser" ? "selection" : "laser")}
      t={t}
    />
  )
}
