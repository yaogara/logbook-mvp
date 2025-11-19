export type TxnType = 'income' | 'expense'
export type Currency = 'COP' | 'USD' | 'EUR'

export type Dropdown = {
  label: string
  value: string
}

export interface SettlementPayment {
  id: string
  txn_id: string
  amount: number
  occurred_on: string
  created_at: string
}

export type Txn = {
  id: string
  amount: number
  type: TxnType
  currency: Currency
  date: string
  time: string
  vertical_id?: string | null
  category_id?: string | null
  contributor_id?: string | null
  description?: string
  created_at: string
  updated_at: string
  deleted?: boolean
  is_settlement?: boolean
  settled?: boolean
  occurred_on?: string
}

export interface ServerTxn {
  id: string
  user_id: string
  client_id: string
  amount: number
  type: 'Ingreso' | 'Gasto'
  occurred_on: string
  vertical_id?: string | null
  category_id?: string | null
  description?: string | null
  contributor_id?: string | null
  settled?: boolean
  updated_at: string
  deleted_at?: string | null
  currency: string
}
