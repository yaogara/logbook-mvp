import type { Currency } from '../types'
import { db } from './db'

export type FxRates = Record<Currency, number>

export type FxSnapshot = {
  rates: FxRates
  fetchedAt: string
}

const SUPPORTED_CURRENCIES: Currency[] = ['COP', 'USD', 'EUR']
const FX_META_KEY = 'fx_rates_v1'
const MAX_AGE_MS = 1000 * 60 * 60 * 12 // 12h

const FALLBACK_RATES: FxRates = {
  COP: 1,
  USD: 4000,
  EUR: 4300,
}

function getAppId(): string {
  const envValue = import.meta.env.VITE_OPENEXCHANGE_APP_ID
  if (envValue && typeof envValue === 'string' && envValue.trim().length > 0) {
    return envValue.trim()
  }
  throw new Error('VITE_OPENEXCHANGE_APP_ID no está configurado')
}

function normalizeRatesFromOpenExchange(rates: Record<string, number>): FxRates {
  const copPerUsd = rates.COP
  if (!copPerUsd || copPerUsd <= 0) {
    throw new Error('Respuesta FX inválida (falta COP)')
  }

  const next: FxRates = { COP: 1, USD: copPerUsd, EUR: FALLBACK_RATES.EUR }

  SUPPORTED_CURRENCIES.forEach((currency) => {
    if (currency === 'COP') {
      next.COP = 1
      return
    }
    if (currency === 'USD') {
      next.USD = copPerUsd
      return
    }
    const raw = rates[currency]
    if (raw && raw > 0) {
      next[currency] = copPerUsd / raw
    }
  })

  return next
}

async function fetchRemoteRates(): Promise<FxRates> {
  const appId = getAppId()
  const symbolsParam = SUPPORTED_CURRENCIES.join(',')
  const url = `https://openexchangerates.org/api/latest.json?app_id=${appId}&symbols=${symbolsParam}`

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`No se pudieron obtener tasas FX (${response.status})`)
  }
  const payload: { rates: Record<string, number> } = await response.json()
  return normalizeRatesFromOpenExchange(payload.rates)
}

async function saveSnapshot(snapshot: FxSnapshot) {
  await db.meta.put({ key: FX_META_KEY, value: JSON.stringify(snapshot) })
}

export async function getCachedFxSnapshot(): Promise<FxSnapshot | null> {
  const row = await db.meta.get(FX_META_KEY)
  if (!row?.value) return null
  try {
    const parsed = JSON.parse(row.value) as FxSnapshot
    if (parsed?.rates) return parsed
  } catch (err) {
    console.warn('⚠️ FX cache corrupt, ignoring', err)
  }
  return null
}

export async function ensureFxRates(options: { forceRefresh?: boolean } = {}): Promise<FxSnapshot> {
  const { forceRefresh = false } = options
  const cached = await getCachedFxSnapshot()
  const isFresh = cached ? Date.now() - new Date(cached.fetchedAt).getTime() < MAX_AGE_MS : false

  if (cached && !forceRefresh && isFresh) {
    return cached
  }

  try {
    const rates = await fetchRemoteRates()
    const snapshot: FxSnapshot = { rates, fetchedAt: new Date().toISOString() }
    await saveSnapshot(snapshot)
    return snapshot
  } catch (err) {
    console.warn('⚠️ No se pudieron actualizar las tasas FX', err)
    if (cached) return cached
    return { rates: getFallbackRates(), fetchedAt: new Date().toISOString() }
  }
}

export function convertToCOP(amount: number, currency: Currency, rates: FxRates | null | undefined): number {
  if (!rates) return amount
  const factor = rates[currency]
  if (!factor || !Number.isFinite(factor)) return amount
  return amount * factor
}

export function getFallbackRates(): FxRates {
  return { ...FALLBACK_RATES }
}
