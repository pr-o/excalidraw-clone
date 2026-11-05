/**
 * Device pixels per CSS pixel of `canvas`: its backing store is sized for the screen
 * (width × devicePixelRatio) while it is laid out in CSS pixels. Every drawing
 * transform is built on top of this scale, or a high-density screen draws at half
 * size, up and to the left. 1 for a canvas that is not laid out (exports, tests).
 */
export const pixelRatioOf = (canvas: HTMLCanvasElement): number =>
  canvas.clientWidth > 0 ? canvas.width / canvas.clientWidth : 1
