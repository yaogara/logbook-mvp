import { getSupabase, safeQuery } from './supabase'
import { db, setLastSync, setPreferredContributorId } from './db'
import type { Contributor } from './db'
import { normalizeTxnType } from './transactions'
import { parseCOP } from './money'

const TABLES = ['txns', 'contributors', 'categories', 'verticals', 'retreats'] as const
const OUTBOX_TABLES = [...TABLES, 'settlement_payments'] as const
const SYNC_TABLES = [...TABLES, 'settlement_payments'] as const

type TableName = typeof OUTBOX_TABLES[number]

async function syncPreferredContributor(contributors: Contributor[], sessionUserId?: string | null) {
  if (!contributors.length) return
  let authUserId = sessionUserId ?? null
  if (!authUserId) {
    try {
      const supabase = getSupabase()
      const { data: userRes } = await supabase.auth.getUser()
      authUserId = userRes?.user?.id ?? null
    } catch {
      authUserId = null
    }
  }
  if (!authUserId) return
  const match = contributors.find(
    (contrib) => contrib.auth_user_id && contrib.auth_user_id === authUserId,
  )
  if (match) {
    await setPreferredContributorId(match.id)
  }
}

export async function pushOutbox() {
  if (!navigator.onLine) {
    console.warn('⚠️ Offline mode: skipping sync')
    return 0
  }
  const supabase = getSupabase()
  try {
    const { data: userRes, error } = await supabase.auth.getUser()
    if (error || !userRes?.user?.id) {
      console.warn('⚠️ No authenticated user; skipping pushOutbox')
      return 0
    }
    const userId = userRes.user.id
    const items = await db.outbox.orderBy('ts').toArray()
    let processed = 0
    for (const item of items) {
      try {
        if (!['insert', 'update', 'delete'].includes(item.op)) continue
        if (!(OUTBOX_TABLES as readonly string[]).includes(item.table as string)) continue
        const table = item.table as TableName
        const row = item.row
        
        // Sanitize contributor_id in txns outbox items to prevent FK violations
        if (table === 'txns' && row.contributor_id !== undefined) {
          // Convert empty strings or invalid values to null
          if (!row.contributor_id || typeof row.contributor_id !== 'string' || row.contributor_id.trim() === '') {
            row.contributor_id = null
          }
        }
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
        } else if (table === 'settlement_payments') {
          const amount =
            typeof row.amount === 'string' ? parseCOP(row.amount) : Number(row.amount ?? 0)
          const payload = {
            id: row.id,
            txn_id: row.txn_id,
            amount,
            occurred_on: row.occurred_on ?? new Date().toISOString(),
            created_at: row.created_at ?? new Date().toISOString(),
          }
          const { error } = await safeQuery(
            () => supabase.from('settlement_payments').insert(payload).then((r: any) => r),
            'insert settlement_payments',
          )
          if (error) throw error
        } else {
          // Whitelist columns to avoid schema mismatches between client cache and server
          let payload: any
          if (table === 'txns') {
            // Map local fields to server schema
            const amount = typeof row.amount === 'string' ? parseCOP(row.amount) : row.amount
            const type = row.type === 'income' ? 'Ingreso' : 'Gasto'
            const currency = row.currency || 'COP'
            const vertical_id = row.vertical_id ?? null
            const category_id = row.category_id ?? null
            // Convert empty strings to null for contributor_id
            const contributor_id =
              row.contributor_id && row.contributor_id.trim() !== ''
                ? row.contributor_id
                : null
            const description = row.description ?? null
            const id = row.id // we generate UUIDs locally; send as id
            const client_id = row.id // also set client_id for traceability
            const settled = Boolean(row.settled)
            const retreat_id =
              row.retreat_id && typeof row.retreat_id === 'string' && row.retreat_id.trim() !== ''
                ? row.retreat_id
                : null

            // Generate occurred_on timestamp
            let occurred_on: string
            if (row.date && row.time) {
              // Use existing date/time from edits or synced data
              occurred_on = `${row.date}T${row.time}:00.000Z`
            } else {
              // New record: use current timestamp
              occurred_on = new Date().toISOString()
            }
            
            payload = {
              id,
              client_id,
              user_id: userId,
              amount,
              type,
              currency,
              occurred_on,
              vertical_id,
              category_id,
              description,
              settled,
              contributor_id: contributor_id ?? null,
              retreat_id,
            }

            payload.is_settlement = Boolean(row.is_settlement)
            
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
          } else if (table === 'contributors') {
            const allowed = ['id', 'email', 'name', 'auth_user_id'] as const
            payload = Object.fromEntries(
              Object.entries(row).filter(([k]) => (allowed as readonly string[]).includes(k))
            )
            const fallbackTimestamp = new Date().toISOString()
            payload.created_at = payload.created_at ?? fallbackTimestamp
            payload.updated_at = payload.updated_at ?? fallbackTimestamp
          } else if (table === 'retreats') {
            const allowed = [
              'id',
              'name',
              'start_date',
              'end_date',
              'default_vertical_id',
              'default_category_id',
              'notes',
              'created_at',
              'updated_at',
            ] as const
            payload = Object.fromEntries(
              Object.entries(row).filter(([k]) => (allowed as readonly string[]).includes(k))
            )
            payload.user_id = userId
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
  } catch (err) {
    console.warn('⚠️ pushOutbox failed:', err)
    return 0
  }
}

export async function pullSince() {
  if (!navigator.onLine) {
    console.warn('⚠️ Offline mode: skipping sync')
    return
  }
  const supabase = getSupabase()
  const now = new Date().toISOString()
  for (const table of SYNC_TABLES) {
    try {
      let q = supabase.from(table).select('*')
      // Avoid filtering by updated_at since the column may not exist on the server schema
      const { data, error } = await safeQuery<any[]>(() => q.then((r: any) => r), `pull ${table}`)
      if (error) throw error
      if (data && data.length) {
        const contributorsForPreference: Contributor[] = []
        const tx = db.transaction('rw', (db as any)[table], async () => {
          for (const row of data as any[]) {
            let normalizedRow = { ...row }
            if (table === 'txns') {
              const rawType =
                typeof normalizedRow.type === 'string'
                  ? normalizedRow.type.trim().toLowerCase()
                  : ''
              const isSettledType = rawType === 'settled'
              if (normalizedRow.occurred_on) {
                const dt = new Date(normalizedRow.occurred_on)
                if (!Number.isNaN(dt.getTime())) {
                  const year = dt.getFullYear()
                  const month = String(dt.getMonth() + 1).padStart(2, '0')
                  const day = String(dt.getDate()).padStart(2, '0')
                  const hours = String(dt.getHours()).padStart(2, '0')
                  const minutes = String(dt.getMinutes()).padStart(2, '0')
                  normalizedRow.date = `${year}-${month}-${day}`
                  normalizedRow.time = `${hours}:${minutes}`
                }
              }
              if (isSettledType) {
                normalizedRow.is_settlement = true
                const directionTag =
                  typeof normalizedRow.description === 'string' &&
                  normalizedRow.description.includes('direction=in')
                normalizedRow.type = directionTag ? 'income' : 'expense'
              } else {
                normalizedRow.type = normalizeTxnType(normalizedRow.type)
              }
              const rawAmount =
                typeof normalizedRow.amount === 'string'
                  ? parseCOP(normalizedRow.amount)
                  : normalizedRow.amount
              normalizedRow.amount =
                typeof rawAmount === 'number' && Number.isFinite(rawAmount)
                  ? Math.abs(rawAmount)
                  : 0
              normalizedRow.is_settlement = Boolean(normalizedRow.is_settlement)
              normalizedRow.settled = Boolean(normalizedRow.settled)
            }
            if (table === 'retreats') {
              normalizedRow.default_vertical_id = normalizedRow.default_vertical_id ?? null
              normalizedRow.default_category_id = normalizedRow.default_category_id ?? null
              normalizedRow.end_date = normalizedRow.end_date ?? null
              normalizedRow.notes = normalizedRow.notes ?? null
            }
            if (table === 'settlement_payments') {
              const numericAmount =
                typeof normalizedRow.amount === 'string'
                  ? parseCOP(normalizedRow.amount)
                  : normalizedRow.amount
              normalizedRow.amount =
                typeof numericAmount === 'number' && Number.isFinite(numericAmount)
                  ? numericAmount
                  : 0
            }
            if (table === 'contributors') {
              normalizedRow.auth_user_id = normalizedRow.auth_user_id ?? null
              normalizedRow.name = normalizedRow.name ?? null
              const fallbackTimestamp = new Date().toISOString()
              normalizedRow.created_at =
                normalizedRow.created_at ?? normalizedRow.updated_at ?? fallbackTimestamp
              normalizedRow.updated_at =
                normalizedRow.updated_at ?? normalizedRow.created_at ?? fallbackTimestamp
              contributorsForPreference.push(normalizedRow as Contributor)
            }
            await (db.table(table) as any).put(normalizedRow)
          }
        })
        await tx
        if (table === 'contributors' && contributorsForPreference.length) {
          await syncPreferredContributor(contributorsForPreference)
        }

        // 🧹 Remove local records not on server
        const localRows = await (db as any)[table].toArray()
        const serverIds = new Set((data as any[]).map(r => r.id))
        for (const localRow of localRows) {
          if (!serverIds.has(localRow.id)) {
            await (db as any)[table].delete(localRow.id)
            console.log(`🗑 Removed ${table} row not found on server:`, localRow.id)
          }
        }
      } else {
        console.log(`⚠️ Server returned no data for ${table}. Clearing local cache.`)
        await db.table(table).clear()
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

export async function fetchContributors(): Promise<Contributor[]> {
  const supabase = getSupabase()
  let sessionUserId: string | null = null

  try {
    const { data: userRes } = await supabase.auth.getUser()
    sessionUserId = userRes?.user?.id ?? null
  } catch (err) {
    console.warn('⚠️ Failed to resolve session for contributors:', err)
  }

  const fromCache = async (): Promise<Contributor[]> => {
    const cached = await db.contributors.toArray()
    await syncPreferredContributor(cached, sessionUserId ?? undefined)
    return cached
  }

  if (!navigator.onLine) {
    console.warn('⚠️ Offline mode: loading contributors from cache')
    return fromCache()
  }

  try {
    const { data, error } = await safeQuery<any[]>(
      () =>
        supabase
          .from('contributors')
          .select('id, email, name, auth_user_id, created_at, updated_at')
          .then((r: any) => r),
      'fetch contributors',
    )

    if (!error && data && data.length > 0) {
      const contributors: Contributor[] = data.map((row) => {
        const fallbackTimestamp = new Date().toISOString()
        const created_at = row.created_at ?? row.updated_at ?? fallbackTimestamp
        const updated_at = row.updated_at ?? row.created_at ?? fallbackTimestamp
        return {
          id: row.id,
          email: row.email,
          name: row.name ?? null,
          auth_user_id: row.auth_user_id ?? null,
          created_at,
          updated_at,
        }
      })

      await db.transaction('rw', db.contributors, async () => {
        for (const contrib of contributors) {
          await db.contributors.put(contrib)
        }
      })

      await syncPreferredContributor(contributors, sessionUserId ?? undefined)
      return contributors
    }
  } catch (err) {
    console.warn('⚠️ Failed to fetch contributors:', err)
  }

  return fromCache()
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
