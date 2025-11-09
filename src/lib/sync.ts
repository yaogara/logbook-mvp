import { getSupabase, safeQuery } from './supabase'
import { db, setLastSync } from './db'

type TableName = 'txns' | 'verticals' | 'categories'

export async function pushOutbox() {
  if (!navigator.onLine) {
    console.warn('⚠️ Offline mode: skipping sync')
    return 0
  }
  const supabase = getSupabase()
  const { data: userRes } = await supabase.auth.getUser()
  const userId = userRes?.user?.id
  if (!userId) {
    console.warn('⚠️ No authenticated user; skipping pushOutbox')
    return 0
  }
  const items = await db.outbox.orderBy('ts').toArray()
  let processed = 0
  for (const item of items) {
    try {
      if (!['insert', 'update', 'delete'].includes(item.op)) continue
      if (!['txns', 'verticals', 'categories'].includes(item.table as string)) continue
      const table = item.table as TableName
      const row = item.row
      if (item.op === 'delete') {
        if (table === 'txns') {
          const { error } = await safeQuery(
            () => supabase.from('txns').update({ deleted_at: new Date().toISOString() }).eq('id', row.id).then((r: any) => r),
            `soft-delete ${table}`,
          )
          if (error) throw error
        } else {
          const { error } = await safeQuery(
            () => supabase.from(table).delete().eq('id', row.id).then((r: any) => r),
            `delete ${table}`,
          )
          if (error) throw error
        }
      } else {
        // Whitelist columns to avoid schema mismatches between client cache and server
        let payload: any
        if (table === 'txns') {
          // Map local fields to server schema
          const amount = row.amount
          const type = row.type === 'income' ? 'Ingreso' : 'Gasto'
          const currency = row.currency || 'COP'
          const vertical_id = row.vertical_id ?? null
          const category_id = row.category_id ?? null
          const description = row.description ?? null
          const id = row.id // we generate UUIDs locally; send as id
          const client_id = row.id // also set client_id for traceability
          
          payload = {
            id,
            client_id,
            user_id: userId,
            amount,
            type,
            currency,
            vertical_id,
            category_id,
            description,
          }
          
          // Only send occurred_on if we have date/time (for edits)
          // For new records, let Supabase set it via default NOW()
          if (row.date && row.time) {
            const dateStr = row.date
            const timeStr = row.time
            payload.occurred_on = `${dateStr}T${timeStr}:00.000Z`
          }
          
          // Defensive: never send a 'date' or 'time' column to the server
          delete (payload as any).date
          delete (payload as any).time
          if ((import.meta as any)?.env?.DEV) {
            // Debug: ensure we are not sending an unknown 'date' column
            // eslint-disable-next-line no-console
            console.debug('[sync] upserting txns payload', payload)
          }
        } else if (table === 'verticals') {
          const allowed = ['id','name'] as const
          payload = Object.fromEntries(
            Object.entries(row).filter(([k]) => (allowed as readonly string[]).includes(k))
          )
        } else if (table === 'categories') {
          const allowed = ['id','name','vertical_id'] as const
          payload = Object.fromEntries(
            Object.entries(row).filter(([k]) => (allowed as readonly string[]).includes(k))
          )
        } else {
          payload = row
        }
        const { error } = await safeQuery(
          () => supabase.from(table).upsert(payload, { onConflict: 'id' }).then((r: any) => r),
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

export async function pullSince() {
  if (!navigator.onLine) {
    console.warn('⚠️ Offline mode: skipping sync')
    return
  }
  const supabase = getSupabase();
  const now = new Date().toISOString();
  for (const table of ['verticals', 'categories', 'txns']) {
    try {
      let q = supabase.from(table).select('*');
      // Avoid filtering by updated_at since the column may not exist on the server schema
      const { data, error } = await safeQuery<any[]>(() => q.then((r: any) => r), `pull ${table}`);
      if (error) throw error;
      if (data && data.length) {
        const tx = db.transaction('rw', db.table(table), async () => {
          for (const row of data as any[]) {
            // Map server occurred_on back to local date/time for txns
            if (table === 'txns' && row.occurred_on) {
              const dt = new Date(row.occurred_on)
              row.date = dt.toISOString().slice(0, 10)
              row.time = dt.toTimeString().slice(0, 5)
            }
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
