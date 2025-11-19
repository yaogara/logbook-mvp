import { db, type Contributor, type Txn } from './db'
import type { Currency } from '../types'

export type BalanceBreakdown = {
  currency: Currency
  gastos: number
  distribuciones: number
  settlementsPagados: number
  settlementsRecibidos: number
  balance: number
}

export type ContributorBalanceRow = {
  contributor: {
    id: string
    name?: string | null
    email: string
    displayName: string
  }
  breakdowns: BalanceBreakdown[]
}

const KNOWN_CURRENCIES: Currency[] = ['COP', 'USD', 'EUR']

function normalizeCurrency(value: string | null | undefined): Currency {
  const upper = (value ?? 'COP').toUpperCase()
  return (KNOWN_CURRENCIES as ReadonlyArray<string>).includes(upper)
    ? (upper as Currency)
    : 'COP'
}

function toAmount(value: Txn['amount']): number {
  const num = Number(value ?? 0)
  if (!Number.isFinite(num) || num <= 0) return 0
  return Number(num.toFixed(2))
}

type BreakdownMap = Map<string, Map<Currency, BalanceBreakdown>>

function ensureBreakdown(
  map: BreakdownMap,
  contributorId: string,
  currency: Currency,
): BalanceBreakdown {
  let contributorMap = map.get(contributorId)
  if (!contributorMap) {
    contributorMap = new Map()
    map.set(contributorId, contributorMap)
  }

  let breakdown = contributorMap.get(currency)
  if (!breakdown) {
    breakdown = {
      currency,
      gastos: 0,
      distribuciones: 0,
      settlementsPagados: 0,
      settlementsRecibidos: 0,
      balance: 0,
    }
    contributorMap.set(currency, breakdown)
  }

  return breakdown
}

function finalizeBreakdown(entry: BalanceBreakdown): BalanceBreakdown {
  return {
    ...entry,
    gastos: Number(entry.gastos.toFixed(2)),
    distribuciones: Number(entry.distribuciones.toFixed(2)),
    settlementsPagados: Number(entry.settlementsPagados.toFixed(2)),
    settlementsRecibidos: Number(entry.settlementsRecibidos.toFixed(2)),
    balance: Number(
      (
        entry.gastos -
        entry.distribuciones +
        entry.settlementsRecibidos -
        entry.settlementsPagados
      ).toFixed(2),
    ),
  }
}

function contributorDisplayName(contributor: Contributor): string {
  return contributor.name?.trim() || contributor.email || 'Sin nombre'
}

function maxAbsBalance(breakdowns: BalanceBreakdown[]): number {
  return breakdowns.reduce(
    (max, entry) => Math.max(max, Math.abs(entry.balance)),
    0,
  )
}

export async function fetchContributorBalances(
  contributorsOverride?: Contributor[],
): Promise<ContributorBalanceRow[]> {
  const contributors = contributorsOverride ?? (await db.contributors.toArray())
  const contributorIds = new Set(contributors.map((c) => c.id))

  const txns = await db.txns.toArray()
  const breakdownMap: BreakdownMap = new Map()

  for (const txn of txns) {
    if (!txn.contributor_id) continue
    if (!contributorIds.has(txn.contributor_id)) continue
    if (txn.deleted || (txn as any)?.deleted_at) continue

    const amount = toAmount(txn.amount)
    if (amount === 0) continue

    const currency = normalizeCurrency(txn.currency)
    const breakdown = ensureBreakdown(breakdownMap, txn.contributor_id, currency)

    if (txn.is_settlement) {
      if (txn.type === 'income') {
        breakdown.settlementsRecibidos += amount
      } else {
        breakdown.settlementsPagados += amount
      }
    } else if (txn.type === 'expense') {
      breakdown.gastos += amount
    } else {
      breakdown.distribuciones += amount
    }
  }

  const results: ContributorBalanceRow[] = contributors.map((contributor) => {
    const map = breakdownMap.get(contributor.id)
    const breakdowns = map
      ? Array.from(map.values())
          .map(finalizeBreakdown)
          .sort((a, b) => a.currency.localeCompare(b.currency))
      : []

    return {
      contributor: {
        id: contributor.id,
        name: contributor.name,
        email: contributor.email,
        displayName: contributorDisplayName(contributor),
      },
      breakdowns,
    }
  })

  results.sort((a, b) => {
    const diff = maxAbsBalance(b.breakdowns) - maxAbsBalance(a.breakdowns)
    if (diff !== 0) return diff
    return a.contributor.displayName.localeCompare(b.contributor.displayName)
  })

  return results
}
