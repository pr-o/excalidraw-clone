import { nanoid } from "nanoid"
import type { ExcalidrawElement, ExcalidrawPage } from "./types"

export const newPage = (
  name: string,
  elements: readonly ExcalidrawElement[] = [],
): ExcalidrawPage => ({
  id: nanoid(),
  name,
  elements,
})
