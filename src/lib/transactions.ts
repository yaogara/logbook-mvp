import type { Txn, TxnType } from '../types'

export function normalizeTxnType(value: unknown): TxnType {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()

  if (normalized === 'income' || normalized === 'ingreso') return 'income'
  if (normalized === 'expense' || normalized === 'gasto') return 'expense'

  return 'expense'
}

export function normalizeTxn<T extends Partial<Txn>>(txn: T): T & { type: TxnType; amount: number; is_settlement: boolean } {
  const type = normalizeTxnType(txn.type)
  const rawAmount = typeof txn.amount === 'number' ? txn.amount : Number(txn.amount ?? 0)
  const amount = Number.isFinite(rawAmount) ? Math.abs(rawAmount) : 0
  const isSettlement = Boolean((txn as any).is_settlement)

  return {
    ...txn,
    type,
    amount,
    is_settlement: isSettlement,
  } as T & { type: TxnType; amount: number; is_settlement: boolean }
}
