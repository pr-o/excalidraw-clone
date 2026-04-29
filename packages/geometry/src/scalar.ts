export const clamp = (v: number, min: number, max: number): number =>
  v < min ? min : v > max ? max : v

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

export const degToRad = (d: number): number => (d * Math.PI) / 180

export const radToDeg = (r: number): number => (r * 180) / Math.PI
