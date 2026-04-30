export interface RecordedCall {
  method: string
  args: readonly unknown[]
}

export interface MockCanvasContext {
  __calls: RecordedCall[]
  __props: Record<string, unknown>
  [k: string]: unknown
}

const RECORDABLE_METHODS = [
  "save",
  "restore",
  "translate",
  "rotate",
  "scale",
  "setTransform",
  "resetTransform",
  "clearRect",
  "fillRect",
  "strokeRect",
  "beginPath",
  "closePath",
  "moveTo",
  "lineTo",
  "bezierCurveTo",
  "quadraticCurveTo",
  "rect",
  "arc",
  "ellipse",
  "fill",
  "stroke",
  "fillText",
  "strokeText",
  "setLineDash",
  "drawImage",
] as const

const RECORDABLE_PROPS = [
  "fillStyle",
  "strokeStyle",
  "lineWidth",
  "globalAlpha",
  "font",
  "textAlign",
  "textBaseline",
  "lineCap",
  "lineJoin",
  "lineDashOffset",
] as const

export const createMockContext = (): MockCanvasContext => {
  const calls: RecordedCall[] = []
  const props: Record<string, unknown> = {}
  const ctx: MockCanvasContext = {
    __calls: calls,
    __props: props,
    measureText: (text: string) => ({ width: text.length * 10 }) as TextMetrics,
    createLinearGradient: () => ({
      addColorStop: () => undefined,
    }),
  }
  for (const method of RECORDABLE_METHODS) {
    ctx[method] = (...args: unknown[]) => {
      calls.push({ method, args })
    }
  }
  for (const key of RECORDABLE_PROPS) {
    Object.defineProperty(ctx, key, {
      get() {
        return props[key]
      },
      set(value: unknown) {
        props[key] = value
        calls.push({ method: `set:${key}`, args: [value] })
      },
      configurable: true,
      enumerable: true,
    })
  }
  return ctx
}

export const createMockCanvas = (
  width = 800,
  height = 600,
): { canvas: HTMLCanvasElement; ctx: MockCanvasContext } => {
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = createMockContext()
  ;(canvas as unknown as { getContext: (id: string) => MockCanvasContext }).getContext = () => ctx
  return { canvas, ctx }
}

export const callsOf = (ctx: MockCanvasContext, method: string): readonly RecordedCall[] =>
  ctx.__calls.filter((c) => c.method === method)

export const findCallIndex = (ctx: MockCanvasContext, method: string): number =>
  ctx.__calls.findIndex((c) => c.method === method)
