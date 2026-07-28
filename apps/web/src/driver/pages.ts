"use client"
import type { ViewTransform } from "@excalidraw-clone/geometry"
import {
  cloneElementsWithNewIds,
  newPage,
  Scene,
  type ExcalidrawData,
  type ExcalidrawElement,
} from "@excalidraw-clone/scene"

export interface PageRecord {
  id: string
  name: string
  scene: Scene
  viewport: ViewTransform
}

export const DEFAULT_VIEWPORT: ViewTransform = { scrollX: 0, scrollY: 0, zoom: 1 }

export function createPageRecord(
  name: string,
  elements: readonly ExcalidrawElement[] = [],
): PageRecord {
  const page = newPage(name, elements)
  return {
    id: page.id,
    name: page.name,
    scene: new Scene(page.elements),
    viewport: DEFAULT_VIEWPORT,
  }
}

export function pagesFromDocument(data: ExcalidrawData): {
  pages: PageRecord[]
  activePageId: string
} {
  const pages = data.pages.map((p) => ({
    id: p.id,
    name: p.name,
    scene: new Scene(p.elements),
    viewport: DEFAULT_VIEWPORT,
  }))
  return { pages, activePageId: data.activePageId }
}

export function addPage(pages: readonly PageRecord[]): PageRecord[] {
  return [...pages, createPageRecord(`Page ${pages.length + 1}`)]
}

export function deletePage(pages: readonly PageRecord[], id: string): PageRecord[] {
  if (pages.length <= 1) return [...pages]
  return pages.filter((p) => p.id !== id)
}

export function renamePage(pages: readonly PageRecord[], id: string, name: string): PageRecord[] {
  return pages.map((p) => (p.id === id ? { ...p, name } : p))
}

export function duplicatePage(pages: readonly PageRecord[], id: string): PageRecord[] {
  const index = pages.findIndex((p) => p.id === id)
  if (index === -1) return [...pages]
  const source = pages[index]!
  const copy = createPageRecord(
    `${source.name} copy`,
    cloneElementsWithNewIds(source.scene.getElements()),
  )
  const next = [...pages]
  next.splice(index + 1, 0, copy)
  return next
}

export function reorderPage(
  pages: readonly PageRecord[],
  id: string,
  direction: "left" | "right",
): PageRecord[] {
  const index = pages.findIndex((p) => p.id === id)
  const swapWith = direction === "left" ? index - 1 : index + 1
  if (index === -1 || swapWith < 0 || swapWith >= pages.length) return [...pages]
  const next = [...pages]
  const tmp = next[index]!
  next[index] = next[swapWith]!
  next[swapWith] = tmp
  return next
}

export function withViewport(
  pages: readonly PageRecord[],
  id: string,
  viewport: ViewTransform,
): PageRecord[] {
  return pages.map((p) => (p.id === id ? { ...p, viewport } : p))
}

export function cyclePageId(
  pages: readonly PageRecord[],
  activePageId: string,
  direction: "next" | "prev",
): string {
  const index = pages.findIndex((p) => p.id === activePageId)
  if (index === -1) return activePageId
  const delta = direction === "next" ? 1 : -1
  const nextIndex = (index + delta + pages.length) % pages.length
  return pages[nextIndex]!.id
}
