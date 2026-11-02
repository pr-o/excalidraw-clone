import type { CDPSession, Page } from "@playwright/test"
import { sceneDocument } from "./sceneGen"

/** In-page frame recorder: rAF deltas + long tasks + localStorage write time. */
const RECORDER = `
(() => {
  if (window.__perf) return
  const p = { frames: [], longTasks: 0, longMax: 0, storageMs: 0, on: false, last: 0 }
  window.__perf = p
  const tick = (t) => {
    if (p.on) { if (p.last) p.frames.push(t - p.last); p.last = t }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
  try {
    new PerformanceObserver((list) => {
      if (!p.on) return
      for (const e of list.getEntries()) { p.longTasks += e.duration; p.longMax = Math.max(p.longMax, e.duration) }
    }).observe({ type: "longtask", buffered: false })
  } catch {}
  const set = Storage.prototype.setItem
  Storage.prototype.setItem = function (k, v) {
    const t0 = performance.now(); set.call(this, k, v); if (p.on) p.storageMs += performance.now() - t0
  }
  const stringify = JSON.stringify
  JSON.stringify = function (...args) {
    const t0 = performance.now(); const r = stringify.apply(this, args); if (p.on) p.storageMs += performance.now() - t0; return r
  }
})()
`

export interface Sample {
  label: string
  wallMs: number
  frames: number
  p95FrameMs: number
  maxFrameMs: number
  longTaskMs: number
  stringifyAndStorageMs: number
}

const pct = (xs: number[], q: number): number => {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(q * s.length))]!
}

export async function seedAndLoad(page: Page, n: number): Promise<number> {
  await page.addInitScript(RECORDER)
  // Seed before any app script runs (once per tab): seeding after a first load
  // races that page's unload-time autosave, which would overwrite the seed.
  await page.addInitScript((d) => {
    if (sessionStorage.getItem("perf-seeded")) return
    sessionStorage.setItem("perf-seeded", "1")
    localStorage.clear()
    localStorage.setItem("excalidraw-scene", d)
  }, sceneDocument(n))
  await page.goto("/")
  await page.locator('[data-testid="toolbar-rectangle"]').waitFor({ state: "visible" })
  // Two frames after the toolbar shows: the first canvas paint has happened.
  return page.evaluate(
    () =>
      new Promise<number>((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => r(performance.now()))),
      ),
  )
}

export async function measure(
  page: Page,
  label: string,
  action: () => Promise<void>,
  cdp?: CDPSession,
): Promise<Sample & { profile?: string }> {
  await page.evaluate(() => {
    const p = (window as unknown as { __perf: Record<string, unknown> }).__perf
    Object.assign(p, { frames: [], longTasks: 0, longMax: 0, storageMs: 0, last: 0, on: true })
  })
  if (cdp) {
    await cdp.send("Profiler.enable")
    await cdp.send("Profiler.setSamplingInterval", { interval: 200 })
    await cdp.send("Profiler.start")
  }
  const t0 = Date.now()
  await action()
  // Let the resulting work settle: two animation frames.
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  )
  const wallMs = Date.now() - t0
  let profile: string | undefined
  if (cdp) {
    const { profile: prof } = await cdp.send("Profiler.stop")
    profile = summarizeProfile(prof)
  }
  const raw = await page.evaluate(() => {
    const p = (window as unknown as { __perf: Record<string, unknown> }).__perf
    p.on = false
    return p as { frames: number[]; longTasks: number; storageMs: number }
  })
  return {
    label,
    wallMs,
    frames: raw.frames.length,
    p95FrameMs: Math.round(pct(raw.frames, 0.95)),
    maxFrameMs: Math.round(Math.max(0, ...raw.frames)),
    longTaskMs: Math.round(raw.longTasks),
    stringifyAndStorageMs: Math.round(raw.storageMs),
    ...(profile ? { profile } : {}),
  }
}

interface ProfNode {
  id: number
  callFrame: { functionName: string; url: string; lineNumber: number }
  hitCount?: number
}

/** Top self-time functions of a CDP CPU profile, as text. */
function summarizeProfile(prof: {
  nodes: ProfNode[]
  samples?: number[]
  timeDeltas?: number[]
}): string {
  const self = new Map<number, number>()
  const samples = prof.samples ?? []
  const deltas = prof.timeDeltas ?? []
  for (let i = 0; i < samples.length; i += 1)
    self.set(samples[i]!, (self.get(samples[i]!) ?? 0) + (deltas[i] ?? 0))
  const byFn = new Map<string, number>()
  let total = 0
  for (const n of prof.nodes) {
    const t = self.get(n.id) ?? 0
    total += t
    const { functionName, url, lineNumber } = n.callFrame
    if (functionName === "(idle)" || functionName === "(program)") continue
    const key = `${functionName || "(anon)"} ${url.split("/").slice(-2).join("/")}:${lineNumber + 1}`
    byFn.set(key, (byFn.get(key) ?? 0) + t)
  }
  return [...byFn.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([k, v]) => `    ${(v / 1000).toFixed(1).padStart(7)}ms ${k}`)
    .join("\n")
    .concat(`\n    total sampled ${(total / 1000).toFixed(0)}ms`)
}
