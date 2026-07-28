"use client"
import type { ViewTransform } from "@excalidraw-clone/geometry"
import {
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
