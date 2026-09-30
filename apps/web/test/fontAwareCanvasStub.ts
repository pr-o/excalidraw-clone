/** jsdom has no 2D canvas. This stub's measureText depends on the context's
 *  current `font` string (as written by renderer's fontSpec:
 *  "<style> <weight> <size>px <family>"), so tests can observe that font
 *  changes alter the measured width:
 *    width = chars × sizePx × (code family ? 0.6 : 0.5) × (bold ? 1.2 : 1)
 *  Italic does not change width. Not a *.test.ts file, so vitest does not run it. */
export function createFontAwareStubContext(): CanvasRenderingContext2D {
  let font = "normal normal 10px sans-serif"
  const ctx = {
    get font(): string {
      return font
    },
    set font(value: string) {
      font = value
    },
    measureText(text: string): { width: number } {
      const px = Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? "10")
      const bold = / bold /.test(` ${font} `)
      const code = font.includes("Cascadia")
      return { width: String(text).length * px * (code ? 0.6 : 0.5) * (bold ? 1.2 : 1) }
    },
  }
  return ctx as unknown as CanvasRenderingContext2D
}
