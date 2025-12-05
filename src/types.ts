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

export type LocalTxn = {
  id: string
  amount: number
  type: TxnType
  currency: Currency
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
  user_id: string
  client_id: string
  amount: number
  type: 'Ingreso' | 'Gasto' | 'Settled'
  occurred_on: string
  updated_at?: string
  vertical_id: string | null
  category_id: string | null
  description?: string | null
  contributor_id?: string | null
  deleted_at?: string | null
}

export interface Contributor {
  id: string
  auth_user_id?: string | null
  email: string
  name?: string | null
  created_at: string
  updated_at: string
}
