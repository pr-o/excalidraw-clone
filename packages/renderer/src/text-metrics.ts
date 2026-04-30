import type { FontFamily } from "@excalidraw-clone/scene"

const FAMILY_NAMES: Record<FontFamily, string> = {
  1: '"Caveat", cursive',
  2: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  3: '"Cascadia Code", "Courier New", monospace',
}

export const fontFamilyName = (family: FontFamily): string => FAMILY_NAMES[family]

export const fontSpec = (fontSize: number, family: FontFamily): string =>
  `${fontSize}px ${fontFamilyName(family)}`

export interface TextSize {
  width: number
  height: number
}

export const measureText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  fontSize: number,
  family: FontFamily,
  lineHeight: number,
): TextSize => {
  const prevFont = ctx.font
  ctx.font = fontSpec(fontSize, family)
  const lines = text.split("\n")
  let width = 0
  for (const line of lines) {
    const m = ctx.measureText(line)
    if (m.width > width) width = m.width
  }
  ctx.font = prevFont
  return { width, height: lines.length * fontSize * lineHeight }
}
