import Dexie from 'dexie'

export type OutboxOp = 'insert' | 'update' | 'delete'

export interface OutboxItem {
  id?: number
  table: keyof LogbookTables
  op: OutboxOp
  row: any
  ts: number
}

export interface MetaRow { key: string; value: string }

export interface Vertical { id: string; name: string; updated_at: string }
export interface Category { id: string; vertical_id?: string | null; name: string; updated_at: string }
export interface Contributor {
  id: string
  auth_user_id?: string | null
  email: string
  name?: string | null
  created_at: string
  updated_at: string
}

export interface Retreat {
  id: string
  name: string
  start_date: string
  end_date?: string | null
  default_vertical_id?: string | null
  default_category_id?: string | null
  notes?: string | null
  created_at: string
  updated_at: string
}

export interface Txn {
  id: string
  amount: number
  type: 'income' | 'expense'
  currency: 'COP' | 'USD' | 'EUR'
  date: string
  time: string
  vertical_id?: string | null
  category_id?: string | null
  contributor_id?: string | null
  retreat_id?: string | null
  description?: string
  created_at: string
  updated_at: string
  deleted?: boolean
  is_settlement?: boolean
  settled?: boolean
  occurred_on?: string
}

export interface SettlementPayment {
  id: string
  txn_id: string
  amount: number
  occurred_on: string
  created_at: string
}

export interface LogbookTables {
  txns: Txn
  outbox: OutboxItem
  verticals: Vertical
  categories: Category
  contributors: Contributor
  retreats: Retreat
  settlement_payments: SettlementPayment
  meta: MetaRow
}

export class LogbookDB extends Dexie {
  txns!: Dexie.Table<Txn, string>
  outbox!: Dexie.Table<OutboxItem, number>
  verticals!: Dexie.Table<Vertical, string>
  categories!: Dexie.Table<Category, string>
  contributors!: Dexie.Table<Contributor, string>
  retreats!: Dexie.Table<Retreat, string>
  settlement_payments!: Dexie.Table<SettlementPayment, string>
  meta!: Dexie.Table<MetaRow, string>

  constructor() {
    super('logbook')
    this.version(1).stores({
      txns: 'id, updated_at, date, type',
      outbox: '++id, ts, table, op',
      verticals: 'id, updated_at',
      categories: 'id, updated_at, vertical_id',
      meta: '&key',
    })
    this.version(2).stores({
      txns: 'id, updated_at, date, type',
      outbox: '++id, ts, table, op',
      verticals: 'id, updated_at',
      categories: 'id, updated_at, vertical_id',
      contributors: 'id, email, auth_user_id, updated_at',
      meta: '&key',
    })
    this.version(3)
      .stores({
        txns: 'id, updated_at, date, type, contributor_id, settled',
        outbox: '++id, ts, table, op',
        verticals: 'id, updated_at',
        categories: 'id, updated_at, vertical_id',
        contributors: 'id, email, auth_user_id, updated_at',
        settlement_payments: 'id, txn_id, occurred_on',
        meta: '&key',
      })
      .upgrade(async (tx) => {
        await tx.table('txns').toCollection().modify((row: any) => {
          row.is_settlement = Boolean(row.is_settlement)
          row.settled = Boolean(row.settled)
        })
      })
    this.version(4)
      .stores({
        txns: 'id, updated_at, date, type, contributor_id, settled',
        outbox: '++id, ts, table, op',
        verticals: 'id, updated_at',
        categories: 'id, updated_at, vertical_id',
        contributors: 'id, email, auth_user_id, updated_at',
        settlement_payments: 'id, txn_id, occurred_on',
        meta: '&key',
      })
      .upgrade(async (tx) => {
        const contributorsTable = tx.table('contributors')
        await contributorsTable.toCollection().modify((row: any) => {
          if (typeof row.created_at !== 'string') {
            row.created_at = row.updated_at ?? new Date().toISOString()
          }
          if (!('auth_user_id' in row)) {
            row.auth_user_id = null
          }
        })
      })

    this.version(5)
      .stores({
        txns: 'id, updated_at, date, type, contributor_id, settled, retreat_id',
        outbox: '++id, ts, table, op',
        verticals: 'id, updated_at',
        categories: 'id, updated_at, vertical_id',
        contributors: 'id, email, auth_user_id, updated_at',
        settlement_payments: 'id, txn_id, occurred_on',
        retreats: 'id, updated_at, name',
        meta: '&key',
      })
      .upgrade(async (tx) => {
        await tx.table('txns').toCollection().modify((row: any) => {
          if (!('retreat_id' in row)) {
            row.retreat_id = null
          }
        })
      })
  }
}

export const db = new LogbookDB()

export function genId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `id_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

type InsertRow<T extends keyof LogbookTables> =
  Omit<
    LogbookTables[T],
    Extract<'id' | 'created_at' | 'updated_at', keyof LogbookTables[T]>
  > &
    Partial<Pick<LogbookTables[T], Extract<'id', keyof LogbookTables[T]>>>;

export async function queueInsert<T extends keyof LogbookTables>(
  table: T,
  row: InsertRow<T>,
) {
  const id = (row as any).id ?? genId()
  const now = new Date().toISOString()
  const record: any = { ...row, id, created_at: now, updated_at: now }
  if (table === 'txns') {
    record.is_settlement = Boolean((record as Txn).is_settlement)
    record.settled = Boolean((record as Txn).settled)
  }
  await (db.table(table) as any).put(record)
  await db.outbox.add({ table, op: 'insert', row: record, ts: Date.now() })
  return record as LogbookTables[T]
}

export async function queueUpdate<T extends keyof LogbookTables>(table: T, id: any, changes: Partial<LogbookTables[T]>) {
  const now = new Date().toISOString()
  const record = { ...(changes as any), id, updated_at: now }
  if (table === 'txns' && 'is_settlement' in record) {
    record.is_settlement = Boolean(record.is_settlement)
  }
  if (table === 'txns' && 'settled' in record) {
    record.settled = Boolean(record.settled)
  }
  await (db.table(table) as any).update(id, record)
  await db.outbox.add({ table, op: 'update', row: record, ts: Date.now() })
}

export async function queueDelete<T extends keyof LogbookTables>(table: T, id: any) {
  if (table === 'txns') {
    await db.txns.update(id as string, { deleted: true, updated_at: new Date().toISOString() })
  } else {
    await (db.table(table) as any).delete(id)
  }
  await db.outbox.add({ table, op: 'delete', row: { id }, ts: Date.now() })
}

export async function getLastSync(): Promise<string | null> {
  const row = await db.meta.get('last_sync')
  return row?.value ?? null
}

export async function setLastSync(iso: string) {
  await db.meta.put({ key: 'last_sync', value: iso })
}

const PREFERRED_CONTRIBUTOR_KEY = 'preferred_contributor_id'

export async function getPreferredContributorId(): Promise<string | null> {
  const row = await db.meta.get(PREFERRED_CONTRIBUTOR_KEY)
  return row?.value ?? null
}

export async function setPreferredContributorId(id: string | null) {
  if (!id) {
    await db.meta.delete(PREFERRED_CONTRIBUTOR_KEY)
    return
  }
  await db.meta.put({ key: PREFERRED_CONTRIBUTOR_KEY, value: id })
}
