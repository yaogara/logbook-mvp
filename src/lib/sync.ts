import { getSupabase } from './supabase'
import { db, getLastSync, setLastSync } from './db'

type TableName = 'txns' | 'verticals' | 'categories'

const SYNC_TABLES: TableName[] = ['verticals', 'categories', 'txns']

export async function pushOutbox() {
  const supabase = getSupabase()
  const items = await db.outbox.orderBy('ts').toArray()
  let processed = 0
  for (const item of items) {
    try {
      if (!['insert', 'update', 'delete'].includes(item.op)) continue
      if (!['txns', 'verticals', 'categories'].includes(item.table as string)) continue
      const table = item.table as TableName
      const row = item.row
      if (item.op === 'delete') {
        const { error } = await supabase.from(table).delete().eq('id', row.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from(table).upsert(row, { onConflict: 'id' })
        if (error) throw error
      }
      await db.outbox.delete(item.id!)
      processed++
    } catch (err) {
      // Stop on first failure to avoid spinning
      break
    }
  }
  return processed
}

export async function pullSince(since?: string | null) {
  const supabase = getSupabase()
  const sinceIso = since ?? (await getLastSync())
  const now = new Date().toISOString()
  for (const table of SYNC_TABLES) {
    try {
      let q = supabase.from(table).select('*')
      if (sinceIso) q = q.gt('updated_at', sinceIso)
      const { data, error } = await q
      if (error) throw error
      if (data && data.length) {
        const tx = db.transaction('rw', db.table(table), async () => {
          for (const row of data as any[]) {
            await (db.table(table) as any).put(row)
          }
        })
        await tx
      }
    } catch (err) {
      // Continue to next table; pull is best-effort
    }
  }
  await setLastSync(now)
}

export async function fullSync() {
  await pushOutbox()
  await pullSince()
}

export function installConnectivitySync() {
  async function trySync() {
    if (navigator.onLine) {
      await fullSync()
    }
  }
  window.addEventListener('online', trySync)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void trySync()
    }
  })
}

