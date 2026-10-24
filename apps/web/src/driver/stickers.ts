import { newText, type ExcalidrawTextElement, type Scene } from "@excalidraw-clone/scene"
import { useAppStore } from "../store"
import {
  measureStandaloneText,
  type MeasuredSize,
  type TextMeasureInput,
} from "./measureStandaloneText"

export const STICKER_FONT_SIZE = 64

/** A sticker is plain free text with a large font, so every render/export
 *  path already handles it; it is centred on `at`. */
export function buildSticker(
  emoji: string,
  at: { x: number; y: number },
  measure: (input: TextMeasureInput) => MeasuredSize | undefined = measureStandaloneText,
): ExcalidrawTextElement {
  const base = newText({ x: 0, y: 0, text: emoji, fontSize: STICKER_FONT_SIZE })
  const size = measure(base) ?? {
    width: STICKER_FONT_SIZE * 1.2,
    height: STICKER_FONT_SIZE * base.lineHeight,
  }
  return { ...base, ...size, x: at.x - size.width / 2, y: at.y - size.height / 2 }
}

/** Inserts a sticker at the viewport centre as one undo step and selects it. */
export function insertSticker(
  scene: Scene,
  emoji: string,
  measure?: (input: TextMeasureInput) => MeasuredSize | undefined,
): void {
  const store = useAppStore.getState()
  if (store.viewMode || store.presenting) return
  const at = {
    x: window.innerWidth / 2 / store.zoom - store.scrollX,
    y: window.innerHeight / 2 / store.zoom - store.scrollY,
  }
  const sticker = buildSticker(emoji, at, measure)
  scene.mutate((draft) => {
    draft.push(sticker)
  })
  store.setSelection([sticker.id])
}
