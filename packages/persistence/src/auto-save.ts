export interface AutoSaver {
  schedule(): void
  flushNow(): void
  dispose(): void
}

export interface AutoSaverOptions {
  delayMs: number
  flush: () => void
}

export function createAutoSaver({ delayMs, flush }: AutoSaverOptions): AutoSaver {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending = false
  let disposed = false

  const cancel = (): void => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  return {
    schedule() {
      if (disposed) return
      pending = true
      cancel()
      timer = setTimeout(() => {
        timer = null
        pending = false
        flush()
      }, delayMs)
    },
    flushNow() {
      if (disposed) return
      cancel()
      if (!pending) return
      pending = false
      flush()
    },
    dispose() {
      cancel()
      pending = false
      disposed = true
    },
  }
}
