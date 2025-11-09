import { getSupabase, safeQuery } from './supabase'
import { db, getLastSync, setLastSync } from './db'

type TableName = 'txns' | 'verticals' | 'categories'

export async function pushOutbox() {
  if (!navigator.onLine) {
    console.warn('⚠️ Offline mode: skipping sync')
    return 0
  }
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
        const { error } = await safeQuery(
          () => supabase.from(table).delete().eq('id', row.id).then((r) => r),
          `delete ${table}`,
        )
        if (error) throw error
      } else {
        // Avoid sending fields not present on the server schema (e.g., created_at)
        const payload: any = { ...row }
        if (table === 'txns') {
          delete payload.created_at
        }
        const { error } = await safeQuery(
          () => supabase.from(table).upsert(payload, { onConflict: 'id' }).then((r) => r),
          `upsert ${table}`,
        )
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
  if (!navigator.onLine) {
    console.warn('⚠️ Offline mode: skipping sync')
    return
  }
  const supabase = getSupabase();
  const sinceIso = since ?? (await getLastSync());
  const now = new Date().toISOString();
  for (const table of ['verticals', 'categories', 'txns']) {
    try {
      let q = supabase.from(table).select('*');
      // Use gte to avoid missing boundary updates created exactly at last sync time
      if (sinceIso && table === 'txns') q = q.gte('updated_at', sinceIso);
      const { data, error } = await safeQuery<any[]>(() => q.then((r) => r), `pull ${table}`);
      if (error) throw error;
      if (data && data.length) {
        const tx = db.transaction('rw', db.table(table), async () => {
          for (const row of data as any[]) {
            await (db.table(table) as any).put(row);
          }
        });
        await tx;
      }
    } catch (err) {
      // Continue to next table; pull is best-effort
    }
  }
  await setLastSync(now);
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
