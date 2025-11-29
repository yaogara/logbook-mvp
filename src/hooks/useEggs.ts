import { useCallback, useEffect, useState } from 'react'
import { safeQuery, supabase } from '../lib/supabase'

export type EggCollection = {
  id: string
  collected_at?: string | null
  location_id?: string | null
  total_eggs: number
  notes?: string | null
  created_at: string
  updated_at: string
  deleted_at?: string | null
}

export type EggCollectionInput = Omit<EggCollection, 'id' | 'created_at' | 'updated_at' | 'deleted_at'>

export type EggOutflow = {
  id: string
  delivered_at?: string | null
  recipient?: string | null
  total_eggs: number
  cartons?: number | null
  loose_eggs?: number | null
  eggs_per_carton?: number | null
  notes?: string | null
  created_at: string
  updated_at: string
  deleted_at?: string | null
}

export type EggOutflowInput = Omit<EggOutflow, 'id' | 'created_at' | 'updated_at' | 'deleted_at' | 'total_eggs'> & {
  total_eggs?: number
}

export type EggBalanceRow = {
  location_id?: string | null
  location_name?: string | null
  total_eggs: number
  collected_eggs?: number | null
  outflow_eggs?: number | null
  updated_at?: string | null
}

export type EggMonthlyStat = {
  month: string
  collected_eggs?: number | null
  outflow_eggs?: number | null
  net_eggs?: number | null
  location_id?: string | null
}

function toErrorMessage(error: any): string {
  if (!error) return 'Unknown error'
  if (typeof error === 'string') return error
  return error.message ?? JSON.stringify(error)
}

function computeOutflowTotal({
  total_eggs,
  cartons,
  loose_eggs,
  eggs_per_carton = 30,
}: Pick<EggOutflowInput, 'total_eggs' | 'cartons' | 'loose_eggs' | 'eggs_per_carton'>): number {
  if (typeof total_eggs === 'number' && Number.isFinite(total_eggs)) {
    return total_eggs
  }
  const cartonsAsEggs = Number(cartons ?? 0) * Number(eggs_per_carton ?? 30)
  const loose = Number(loose_eggs ?? 0)
  return cartonsAsEggs + loose
}

export function useEggCollections() {
  const [collections, setCollections] = useState<EggCollection[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error } = await safeQuery<EggCollection[]>(
      () =>
        supabase
          .from('egg_collections')
          .select('*')
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .then((r) => r),
      'fetch egg_collections',
    )

    if (error) {
      setError(toErrorMessage(error))
    } else if (data) {
      setCollections(data)
    }
    setLoading(false)
  }, [])

  const createCollection = useCallback(async (payload: EggCollectionInput) => {
    const { data, error } = await supabase
      .from('egg_collections')
      .insert(payload)
      .select()
      .single()

    if (error) throw error
    if (data) {
      setCollections((prev) => [data, ...prev.filter((row) => row.id !== data.id)])
    }
    return data as EggCollection
  }, [])

  const updateCollection = useCallback(async (id: string, payload: Partial<EggCollectionInput>) => {
    const { data, error } = await supabase
      .from('egg_collections')
      .update(payload)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    if (data) {
      setCollections((prev) => prev.map((row) => (row.id === id ? (data as EggCollection) : row)))
    }
    return data as EggCollection
  }, [])

  const deleteCollection = useCallback(async (id: string) => {
    const deleted_at = new Date().toISOString()
    const { error } = await supabase
      .from('egg_collections')
      .update({ deleted_at })
      .eq('id', id)

    if (error) throw error
    setCollections((prev) => prev.filter((row) => row.id !== id))
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return {
    collections,
    loading,
    error,
    refresh,
    createCollection,
    updateCollection,
    deleteCollection,
  }
}

export function useEggOutflows() {
  const [outflows, setOutflows] = useState<EggOutflow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error } = await safeQuery<EggOutflow[]>(
      () =>
        supabase
          .from('egg_outflows')
          .select('*')
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .then((r) => r),
      'fetch egg_outflows',
    )

    if (error) {
      setError(toErrorMessage(error))
    } else if (data) {
      setOutflows(data)
    }
    setLoading(false)
  }, [])

  const createOutflow = useCallback(async (payload: EggOutflowInput) => {
    const total_eggs = computeOutflowTotal(payload)
    const { data, error } = await supabase
      .from('egg_outflows')
      .insert({ ...payload, total_eggs })
      .select()
      .single()

    if (error) throw error
    if (data) {
      setOutflows((prev) => [data, ...prev.filter((row) => row.id !== data.id)])
    }
    return data as EggOutflow
  }, [])

  const updateOutflow = useCallback(
    async (id: string, payload: Partial<EggOutflowInput>) => {
      const total_eggs = computeOutflowTotal(payload)
      const { data, error } = await supabase
        .from('egg_outflows')
        .update({ ...payload, total_eggs })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      if (data) {
        setOutflows((prev) => prev.map((row) => (row.id === id ? (data as EggOutflow) : row)))
      }
      return data as EggOutflow
    },
    [],
  )

  const deleteOutflow = useCallback(async (id: string) => {
    const deleted_at = new Date().toISOString()
    const { error } = await supabase
      .from('egg_outflows')
      .update({ deleted_at })
      .eq('id', id)

    if (error) throw error
    setOutflows((prev) => prev.filter((row) => row.id !== id))
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return {
    outflows,
    loading,
    error,
    refresh,
    createOutflow,
    updateOutflow,
    deleteOutflow,
  }
}

export async function fetchEggBalances() {
  const { data, error } = await safeQuery<EggBalanceRow[]>(
    () => supabase.from('egg_balances').select('*').then((r) => r),
    'fetch egg_balances',
  )
  if (error) throw error
  return data ?? []
}

export async function fetchEggMonthlyStats() {
  const { data, error } = await safeQuery<EggMonthlyStat[]>(
    () => supabase.from('egg_monthly_stats').select('*').then((r) => r),
    'fetch egg_monthly_stats',
  )
  if (error) throw error
  return data ?? []
}
