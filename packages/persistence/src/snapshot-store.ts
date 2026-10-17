import type { ExcalidrawData } from "@excalidraw-clone/scene"
import { getDB, type Snapshot, SNAPSHOTS_STORE } from "./db"
import { migrate } from "./migrations"

export type { Snapshot }
export type SnapshotMeta = Omit<Snapshot, "document">

export const MAX_SNAPSHOTS = 50

// Strictly increasing so same-millisecond saves still order (and evict) correctly.
let lastCreatedAt = 0

// shortcut: reads whole records (docs included) to list; fine at a 50-item cap,
// split meta/doc into two stores if snapshots get large.
async function allNewestFirst(): Promise<Snapshot[]> {
  const db = await getDB()
  return ((await db.getAll(SNAPSHOTS_STORE)) as Snapshot[]).sort(
    (a, b) => b.createdAt - a.createdAt,
  )
}

export async function saveSnapshot(name: string, document: ExcalidrawData): Promise<SnapshotMeta> {
  lastCreatedAt = Math.max(Date.now(), lastCreatedAt + 1)
  const snapshot: Snapshot = { id: crypto.randomUUID(), name, createdAt: lastCreatedAt, document }
  const db = await getDB()
  await db.put(SNAPSHOTS_STORE, snapshot)
  const evicted = (await allNewestFirst()).slice(MAX_SNAPSHOTS)
  for (const s of evicted) await db.delete(SNAPSHOTS_STORE, s.id)
  return { id: snapshot.id, name, createdAt: snapshot.createdAt }
}

export async function listSnapshots(): Promise<SnapshotMeta[]> {
  return (await allNewestFirst()).map(({ id, name, createdAt }) => ({ id, name, createdAt }))
}

export async function loadSnapshot(id: string): Promise<ExcalidrawData | null> {
  const db = await getDB()
  const snapshot = (await db.get(SNAPSHOTS_STORE, id)) as Snapshot | undefined
  return snapshot ? migrate(snapshot.document) : null
}

export async function deleteSnapshot(id: string): Promise<void> {
  const db = await getDB()
  await db.delete(SNAPSHOTS_STORE, id)
}
