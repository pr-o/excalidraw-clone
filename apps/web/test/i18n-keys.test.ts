import { readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import en from "../src/locales/en/common.json"
import ko from "../src/locales/ko/common.json"

const here = dirname(fileURLToPath(import.meta.url))

const flatten = (obj: Record<string, unknown>, prefix = ""): string[] =>
  Object.entries(obj).flatMap(([k, v]) =>
    typeof v === "object" && v !== null
      ? flatten(v as Record<string, unknown>, `${prefix}${k}.`)
      : [`${prefix}${k}`],
  )

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return name === "locales" ? [] : sourceFiles(full)
    return /\.(ts|tsx)$/.test(name) ? [full] : []
  })

/** Strips i18next plural suffixes so `history.added_one` counts as `history.added`. */
const stem = (key: string): string => key.replace(/_(zero|one|two|few|many|other)$/, "")

const enKeys = new Set(flatten(en).map(stem))
const koKeys = new Set(flatten(ko).map(stem))

const usedKeys = (): Map<string, string> => {
  const found = new Map<string, string>()
  for (const root of [join(here, "../src"), join(here, "../../../packages/ui/src")]) {
    for (const file of sourceFiles(root)) {
      const text = readFileSync(file, "utf8")
      for (const m of text.matchAll(/\bt\(\s*["']([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+)["']/g)) {
        if (!found.has(m[1]!)) found.set(m[1]!, file)
      }
    }
  }
  return found
}

describe("translations", () => {
  it("every literal key passed to t() exists in the English file", () => {
    const missing = [...usedKeys()].filter(([key]) => !enKeys.has(stem(key)))
    expect(missing.map(([key, file]) => `${key} (${file})`)).toEqual([])
  })

  it("the Korean file defines every key the English file does", () => {
    expect([...enKeys].filter((key) => !koKeys.has(key))).toEqual([])
  })
})
