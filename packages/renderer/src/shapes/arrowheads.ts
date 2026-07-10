import type { Arrowhead } from "@excalidraw-clone/scene"
import type { Drawable, Options } from "roughjs/bin/core"
import type { RoughGenerator } from "roughjs/bin/generator"
import type { Point as RoughPoint } from "roughjs/bin/geometry"

export const ARROWHEAD_LENGTH = 20
export const ARROWHEAD_ANGLE = Math.PI / 6

const filled = (opts: Options): Options => {
  const o: Options = { ...opts, fillStyle: "solid" }
  if (opts.stroke !== undefined) o.fill = opts.stroke
  return o
}

/** Drawables for one arrowhead. `tip` is the endpoint; `prev` is the adjacent shaft point. */
export const arrowheadDrawables = (
  kind: Arrowhead,
  tip: RoughPoint,
  prev: RoughPoint,
  gen: RoughGenerator,
  opts: Options,
): readonly Drawable[] => {
  const angle = Math.atan2(tip[1] - prev[1], tip[0] - prev[0])
  const dir: RoughPoint = [Math.cos(angle), Math.sin(angle)]
  const perp: RoughPoint = [-Math.sin(angle), Math.cos(angle)]
  const L = ARROWHEAD_LENGTH

  const chevronWings = (): { left: RoughPoint; right: RoughPoint } => ({
    left: [
      tip[0] - L * Math.cos(angle - ARROWHEAD_ANGLE),
      tip[1] - L * Math.sin(angle - ARROWHEAD_ANGLE),
    ],
    right: [
      tip[0] - L * Math.cos(angle + ARROWHEAD_ANGLE),
      tip[1] - L * Math.sin(angle + ARROWHEAD_ANGLE),
    ],
  })

  switch (kind) {
    case "arrow": {
      const { left, right } = chevronWings()
      return [gen.linearPath([left, tip, right], opts)]
    }
    case "triangle":
    case "triangle_outline": {
      const { left, right } = chevronWings()
      const o = kind === "triangle" ? filled(opts) : opts
      return [gen.polygon([tip, left, right], o)]
    }
    case "bar": {
      const h = L / 2
      return [
        gen.line(
          tip[0] - h * perp[0],
          tip[1] - h * perp[1],
          tip[0] + h * perp[0],
          tip[1] + h * perp[1],
          opts,
        ),
      ]
    }
    case "dot": {
      return [gen.circle(tip[0], tip[1], 0.6 * L, filled(opts))]
    }
    case "circle":
    case "circle_outline": {
      const o = kind === "circle" ? filled(opts) : opts
      return [gen.circle(tip[0], tip[1], 0.8 * L, o)]
    }
    case "cross": {
      const h = L / 2
      const dirs = [angle + Math.PI / 4, angle - Math.PI / 4]
      return dirs.map((a) =>
        gen.line(
          tip[0] - h * Math.cos(a),
          tip[1] - h * Math.sin(a),
          tip[0] + h * Math.cos(a),
          tip[1] + h * Math.sin(a),
          opts,
        ),
      )
    }
    case "diamond":
    case "diamond_outline": {
      const half = L / 2
      const width = L / 3
      const mid: RoughPoint = [tip[0] - half * dir[0], tip[1] - half * dir[1]]
      const back: RoughPoint = [tip[0] - L * dir[0], tip[1] - L * dir[1]]
      const o = kind === "diamond" ? filled(opts) : opts
      return [
        gen.polygon(
          [
            tip,
            [mid[0] + width * perp[0], mid[1] + width * perp[1]],
            back,
            [mid[0] - width * perp[0], mid[1] - width * perp[1]],
          ],
          o,
        ),
      ]
    }
  }
}
