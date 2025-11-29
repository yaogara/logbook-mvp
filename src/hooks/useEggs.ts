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

export function toUtcISOString(date?: string | null, time?: string | null): string | null {
  const datePart = (date || '').trim()
  const timePart = (time || '').trim()

  if (!datePart && !timePart) return null

  if (datePart.includes('T')) {
    const parsedDate = new Date(datePart)
    return Number.isNaN(parsedDate.getTime()) ? null : parsedDate.toISOString()
  }

  const hasZoneInfo = /[zZ]|[+-]\d\d:?\d\d$/.test(timePart)
  const base = timePart ? `${datePart}T${timePart}` : datePart

  const normalized = hasZoneInfo ? base : normalizeLocalDateTime(base)
  const parsed = new Date(normalized)

  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString()
}

function normalizeLocalDateTime(value: string): string {
  const [rawDate, rawTime] = value.split('T')
  const [year, month, day] = (rawDate || '').split('-').map((part) => Number(part))
  const [hour, minute] = (rawTime || '00:00').split(':').map((part) => Number(part))

  const utcDate = new Date(Date.UTC(year, (month || 1) - 1, day || 1, hour || 0, minute || 0, 0, 0))
  return utcDate.toISOString()
}

function toErrorMessage(error: unknown): string {
  if (!error) return 'Unknown error'
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  return JSON.stringify(error)
}

function assertNonNegative(value: number | null | undefined, field: string) {
  if (value == null) return
  if (Number(value) < 0) {
    throw new Error(`${field} cannot be negative`)
  }
}

export function computeOutflowTotal({
  total_eggs,
  cartons,
  loose_eggs,
  eggs_per_carton = 30,
}: Pick<EggOutflowInput, 'total_eggs' | 'cartons' | 'loose_eggs' | 'eggs_per_carton'>): number {
  if (typeof total_eggs === 'number' && Number.isFinite(total_eggs)) {
    return total_eggs
  }
  const cartonsAsEggs = Math.max(0, Number(cartons ?? 0)) * Math.max(0, Number(eggs_per_carton ?? 30))
  const loose = Math.max(0, Number(loose_eggs ?? 0))
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
    if (!Number.isFinite(payload.total_eggs) || Number(payload.total_eggs) <= 0) {
      throw new Error('La cantidad de huevos debe ser un número positivo')
    }

    assertNonNegative(payload.total_eggs, 'total_eggs')

    const normalized: EggCollectionInput = {
      ...payload,
      collected_at: toUtcISOString(payload.collected_at ?? undefined, null),
      total_eggs: Number(payload.total_eggs ?? 0),
    }

    const { data, error } = await supabase
      .from('egg_collections')
      .insert(normalized)
      .select()
      .single()

    if (error) throw error
    if (data) {
      setCollections((prev) => [data, ...prev.filter((row) => row.id !== data.id)])
    }
    return data as EggCollection
  }, [])

  const updateCollection = useCallback(async (id: string, payload: Partial<EggCollectionInput>) => {
    if (payload.total_eggs != null) {
      assertNonNegative(payload.total_eggs, 'total_eggs')
      if (!Number.isFinite(payload.total_eggs) || Number(payload.total_eggs) <= 0) {
        throw new Error('La cantidad de huevos debe ser un número positivo')
      }
    }

    const normalized: Partial<EggCollectionInput> = {
      ...payload,
      collected_at: toUtcISOString(payload.collected_at ?? undefined, null),
      total_eggs: payload.total_eggs == null ? undefined : Number(payload.total_eggs),
    }

    const { data, error } = await supabase
      .from('egg_collections')
      .update(normalized)
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
    assertNonNegative(payload.cartons, 'cartons')
    assertNonNegative(payload.loose_eggs, 'loose_eggs')
    assertNonNegative(payload.eggs_per_carton, 'eggs_per_carton')

    const normalizedPayload: EggOutflowInput = {
      ...payload,
      cartons: payload.cartons == null ? null : Math.max(0, Number(payload.cartons)),
      loose_eggs: payload.loose_eggs == null ? null : Math.max(0, Number(payload.loose_eggs)),
      eggs_per_carton: payload.eggs_per_carton == null ? null : Math.max(0, Number(payload.eggs_per_carton)),
      delivered_at: toUtcISOString(payload.delivered_at ?? undefined, null),
    }

    const total_eggs = computeOutflowTotal(normalizedPayload)
    if (!Number.isFinite(total_eggs) || total_eggs <= 0) {
      throw new Error('La salida debe tener al menos un huevo')
    }

    const { data, error } = await supabase
      .from('egg_outflows')
      .insert({ ...normalizedPayload, total_eggs })
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
      assertNonNegative(payload.cartons, 'cartons')
      assertNonNegative(payload.loose_eggs, 'loose_eggs')
      assertNonNegative(payload.eggs_per_carton, 'eggs_per_carton')

      const normalizedPayload: Partial<EggOutflowInput> = {
        ...payload,
        cartons: payload.cartons == null ? undefined : Math.max(0, Number(payload.cartons)),
        loose_eggs: payload.loose_eggs == null ? undefined : Math.max(0, Number(payload.loose_eggs)),
        eggs_per_carton:
          payload.eggs_per_carton == null ? undefined : Math.max(0, Number(payload.eggs_per_carton)),
        delivered_at: toUtcISOString(payload.delivered_at ?? undefined, null),
      }

      const total_eggs = computeOutflowTotal(normalizedPayload)
      if (!Number.isFinite(total_eggs) || total_eggs <= 0) {
        throw new Error('La salida debe tener al menos un huevo')
      }

      const { data, error } = await supabase
        .from('egg_outflows')
        .update({ ...normalizedPayload, total_eggs })
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
