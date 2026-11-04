export interface AutoSaver {
  schedule(): void
  flushNow(): void
  dispose(): void
  /** True while a change is scheduled but not yet written. */
  isPending(): boolean
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
    isPending() {
      return pending
    },
    dispose() {
      cancel()
      pending = false
      disposed = true
    },
  }
}
