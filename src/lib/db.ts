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

export interface Txn {
  id: string
  amount: number
  type: 'income' | 'expense'
  date: string
  vertical_id?: string | null
  category_id?: string | null
  description?: string
  created_at: string
  updated_at: string
  deleted?: boolean
}

export interface LogbookTables {
  txns: Txn
  outbox: OutboxItem
  verticals: Vertical
  categories: Category
  meta: MetaRow
}

export class LogbookDB extends Dexie {
  txns!: Dexie.Table<Txn, string>
  outbox!: Dexie.Table<OutboxItem, number>
  verticals!: Dexie.Table<Vertical, string>
  categories!: Dexie.Table<Category, string>
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
  await (db.table(table) as any).put(record)
  await db.outbox.add({ table, op: 'insert', row: record, ts: Date.now() })
  return record as LogbookTables[T]
}

export async function queueUpdate<T extends keyof LogbookTables>(table: T, id: any, changes: Partial<LogbookTables[T]>) {
  const now = new Date().toISOString()
  const record = { ...(changes as any), id, updated_at: now }
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
