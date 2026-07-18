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

export interface LabelLayout {
  lines: string[]
  scale: number
}

/** Display layout for a shape label: greedy space-only wrap of each logical
 *  line at box.width (a word wider than the box stays whole), then the
 *  combined shrink scale — min(1, width bound, height bound) — for the
 *  wrapped block. measureWidth must measure at the natural font size. */
export const layoutLabel = (
  text: string,
  box: { width: number; height: number },
  fontSize: number,
  lineHeight: number,
  measureWidth: (s: string) => number,
): LabelLayout => {
  const lines: string[] = []
  for (const logical of text.split("\n")) {
    const words = logical.split(" ").filter((w) => w.length > 0)
    if (words.length === 0) {
      lines.push("")
      continue
    }
    let current = words[0]!
    for (let i = 1; i < words.length; i += 1) {
      const candidate = `${current} ${words[i]!}`
      if (measureWidth(candidate) <= box.width) {
        current = candidate
      } else {
        lines.push(current)
        current = words[i]!
      }
    }
    lines.push(current)
  }
  let widest = 0
  for (const line of lines) widest = Math.max(widest, measureWidth(line))
  const totalHeight = lines.length * fontSize * lineHeight
  const scale = Math.min(
    1,
    widest > 0 ? box.width / widest : 1,
    totalHeight > 0 ? box.height / totalHeight : 1,
  )
  return { lines, scale }
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
