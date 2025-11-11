export type TxnType = 'income' | 'expense'
export type Currency = 'COP' | 'USD' | 'EUR'

export type Dropdown = {
  label: string
  value: string
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
}
