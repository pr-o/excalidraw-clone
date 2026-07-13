import type { ExcalidrawElement } from "@excalidraw-clone/scene"
import type { Theme } from "./types"

// Linear lightness inversion pinned at two design endpoints:
// default ink #1e1e1e (l = 30/255) → #ececec (l = 236/255), white → #1e1e1e.
// Hue and saturation are preserved; out-of-range results clamp to [0, 1],
// so pure black maps to pure white.
const INK_L = 30 / 255
const INK_INVERTED_L = 236 / 255
const SLOPE = (INK_L - INK_INVERTED_L) / (1 - INK_L)

const invertLightness = (l: number): number =>
  Math.min(1, Math.max(0, INK_INVERTED_L + SLOPE * (l - INK_L)))

interface ParsedHex {
  r: number
  g: number
  b: number
  alphaHex: string
}

const HEX_SHORT = /^#[0-9a-f]{3}$/i
const HEX_LONG = /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i

const parseHex = (color: string): ParsedHex | null => {
  if (HEX_SHORT.test(color)) {
    const [r, g, b] = [1, 2, 3].map((i) => parseInt(color[i]!.repeat(2), 16))
    return { r: r!, g: g!, b: b!, alphaHex: "" }
  }
  if (HEX_LONG.test(color)) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16))
    return { r: r!, g: g!, b: b!, alphaHex: color.slice(7).toLowerCase() }
  }
  return null
}

const rgbToHsl = (r: number, g: number, b: number): [number, number, number] => {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6
  else if (max === gn) h = ((bn - rn) / d + 2) / 6
  else h = ((rn - gn) / d + 4) / 6
  return [h, s, l]
}

const hueToRgb = (p: number, q: number, t: number): number => {
  let tn = t
  if (tn < 0) tn += 1
  if (tn > 1) tn -= 1
  if (tn < 1 / 6) return p + (q - p) * 6 * tn
  if (tn < 1 / 2) return q
  if (tn < 2 / 3) return p + (q - p) * (2 / 3 - tn) * 6
  return p
}

const hslToRgb = (h: number, s: number, l: number): [number, number, number] => {
  if (s === 0) {
    const v = Math.round(l * 255)
    return [v, v, v]
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  return [
    Math.round(hueToRgb(p, q, h + 1 / 3) * 255),
    Math.round(hueToRgb(p, q, h) * 255),
    Math.round(hueToRgb(p, q, h - 1 / 3) * 255),
  ]
}

const hex2 = (v: number): string => v.toString(16).padStart(2, "0")

const darkCache = new Map<string, string>()

/** Resolve a stored element/background color for the given theme.
 *  Light is identity; dark preserves hue/saturation and inverts lightness.
 *  Never throws: transparent and unparseable inputs pass through unchanged. */
export const resolveColor = (color: string, theme: Theme): string => {
  if (theme === "light" || color === "transparent") return color
  const cached = darkCache.get(color)
  if (cached !== undefined) return cached
  const parsed = parseHex(color)
  if (parsed === null) return color
  const [h, s, l] = rgbToHsl(parsed.r, parsed.g, parsed.b)
  const [r, g, b] = hslToRgb(h, s, invertLightness(l))
  const out = `#${hex2(r)}${hex2(g)}${hex2(b)}${parsed.alphaHex}`
  darkCache.set(color, out)
  return out
}

/** Copy of the element with stroke/background resolved for the theme.
 *  Light returns the original object so WeakMap-keyed caches stay valid. */
export const themedElement = <T extends ExcalidrawElement>(el: T, theme: Theme): T =>
  theme === "light"
    ? el
    : {
        ...el,
        strokeColor: resolveColor(el.strokeColor, theme),
        backgroundColor: resolveColor(el.backgroundColor, theme),
      }
