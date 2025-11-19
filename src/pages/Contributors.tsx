import { useCallback, useEffect, useMemo, useState } from 'react'
import { OfflineBanner } from '../components/OfflineBanner'
import Loader from '../components/Loader'
import { useToast } from '../components/ToastProvider'
import {
  queueInsert,
  db,
  type SettlementPayment as LocalSettlementPayment,
  type Txn as LocalTxn,
} from '../lib/db'
import { fullSync, fetchContributors } from '../lib/sync'
import { supabase } from '../lib/supabase'
import useOnlineStatus from '../hooks/useOnlineStatus'
import type { Currency } from '../types'

type DebtItem = {
  txnId: string
  description?: string
  occurredOn?: string
  originalAmount: number
  totalPaid: number
  remaining: number
  currency: string
  type: LocalTxn['type']
  payments: LocalSettlementPayment[]
}

type ContributorCurrencyGroup = {
  currency: string
  debts: DebtItem[]
  totals: {
    owedToUs: number
    weOwe: number
  }
}

type ContributorCardData = {
  contributorId: string
  name: string | null
  email: string | null
  displayName: string
  groups: ContributorCurrencyGroup[]
  totalOwedToUs: number
  totalWeOwe: number
}

type SummaryEntry = {
  currency: string
  owedToUs: number
  weOwe: number
}

type SettlementModalState = {
  mode: 'full' | 'partial'
  contributor: { id: string; name: string | null; email: string | null }
  debt: DebtItem
  amount: string
  maxAmount: number
  currency: string
  verticalId: string
  error: string | null
}

const KNOWN_CURRENCIES: Currency[] = ['COP', 'USD', 'EUR']

function normalizeCurrency(value: string | null | undefined): Currency {
  const upper = (value ?? 'COP').toUpperCase()
  return (KNOWN_CURRENCIES as ReadonlyArray<string>).includes(upper) ? (upper as Currency) : 'COP'
}

function formatCurrency(amount: number, currency: string | null | undefined) {
  const code = currency ?? 'COP'
  const locale =
    code === 'USD' ? 'en-US' : code === 'EUR' ? 'es-ES' : 'es-CO'
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: code,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0)
}

function formatDate(iso?: string) {
  if (!iso) return 'Sin fecha'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'Sin fecha'
  return date.toLocaleDateString('es-CO', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function TotalsByCurrency({ contributor }: { contributor: ContributorCardData }) {
  const owedLines = contributor.groups
    .filter((group) => group.totals.owedToUs > 0)
    .map((group) => formatCurrency(group.totals.owedToUs, group.currency))

  const oweLines = contributor.groups
    .filter((group) => group.totals.weOwe > 0)
    .map((group) => formatCurrency(group.totals.weOwe, group.currency))

  const fallbackCurrency = contributor.groups[0]?.currency ?? 'COP'

  return (
    <div className="flex flex-col items-end text-xs text-[rgb(var(--muted))]">
      <span>
        Nos deben:{' '}
        <span className="font-semibold text-green-400">
          {owedLines.length
            ? owedLines.join(' · ')
            : formatCurrency(0, fallbackCurrency)}
        </span>
      </span>
      <span>
        Les debemos:{' '}
        <span className="font-semibold text-amber-300">
          {oweLines.length
            ? oweLines.join(' · ')
            : formatCurrency(0, fallbackCurrency)}
        </span>
      </span>
    </div>
  )
}

export default function Contributors() {
  const online = useOnlineStatus()
  const { show } = useToast()
  const [cards, setCards] = useState<ContributorCardData[]>([])
  const [summary, setSummary] = useState<SummaryEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [verticals, setVerticals] = useState<{ id: string; name: string }[]>([])
  const [modalState, setModalState] = useState<SettlementModalState | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const defaultVerticalId = useMemo(
    () => verticals[0]?.id ?? '',
    [verticals],
  )

  const refresh = useCallback(
    async (options: { withSync?: boolean } = {}) => {
      setLoading(true)
      setError(null)
      if (options.withSync && online) {
        try {
          await fullSync()
        } catch (err) {
          console.warn('⚠️ Full sync failed, falling back to local cache', err)
        }
      }

      try {
        const [txns, payments, verticalRows] = await Promise.all([
          db.txns.toArray(),
          db.settlement_payments.toArray(),
          db.verticals.toArray(),
        ])

        setVerticals(verticalRows)

        let contributorRows = await db.contributors.toArray()
        if (online) {
          try {
            const fresh = await fetchContributors()
            if (fresh?.length) contributorRows = fresh
          } catch (err) {
            console.warn('⚠️ Failed to refresh contributors:', err)
          }
        }

        const contributorLookup = new Map(
          contributorRows.map((contrib) => [contrib.id, contrib]),
        )

        const paymentsByTxn = new Map<string, LocalSettlementPayment[]>()
        for (const payment of payments) {
          const normalizedAmount = Number(payment.amount ?? 0)
          const normalizedPayment = {
            ...payment,
            amount: Number.isFinite(normalizedAmount) ? normalizedAmount : 0,
          }
          const list = paymentsByTxn.get(payment.txn_id) ?? []
          list.push(normalizedPayment)
          paymentsByTxn.set(payment.txn_id, list)
        }
        for (const list of paymentsByTxn.values()) {
          list.sort((a, b) =>
            (a.occurred_on ?? '').localeCompare(b.occurred_on ?? ''),
          )
        }

        const cardsMap = new Map<
          string,
          { info: ContributorCardData; groups: Map<string, ContributorCurrencyGroup> }
        >()

        for (const txn of txns) {
          if (txn.deleted || (txn as any).deleted_at) continue
          if (!txn.contributor_id) continue
          if (txn.is_settlement) continue
          if (txn.settled) continue

          const originalAmount = Number(txn.amount ?? 0)
          if (!Number.isFinite(originalAmount) || originalAmount <= 0) continue

          const paymentsForTxn = paymentsByTxn.get(txn.id) ?? []
          const totalPaid = paymentsForTxn.reduce(
            (sum, payment) => sum + Number(payment.amount ?? 0),
            0,
          )
          const remainingRaw = Math.max(0, originalAmount - totalPaid)
          const remaining = Number(remainingRaw.toFixed(2))
          if (remaining <= 0) continue

          const currency = txn.currency || 'COP'
          const contributorId = txn.contributor_id
          const contributor = contributorLookup.get(contributorId)

          let entry = cardsMap.get(contributorId)
          if (!entry) {
            const displayName =
              contributor?.name || contributor?.email || 'Sin nombre'
            entry = {
              info: {
                contributorId,
                name: contributor?.name ?? null,
                email: contributor?.email ?? null,
                displayName,
                groups: [],
                totalOwedToUs: 0,
                totalWeOwe: 0,
              },
              groups: new Map<string, ContributorCurrencyGroup>(),
            }
            cardsMap.set(contributorId, entry)
          }

          let group = entry.groups.get(currency)
          if (!group) {
            group = {
              currency,
              debts: [],
              totals: { owedToUs: 0, weOwe: 0 },
            }
            entry.groups.set(currency, group)
          }

          const debt: DebtItem = {
            txnId: txn.id,
            description: txn.description,
            occurredOn: txn.occurred_on ?? txn.date,
            originalAmount: Number(originalAmount.toFixed(2)),
            totalPaid: Number(totalPaid.toFixed(2)),
            remaining,
            currency,
            type: txn.type,
            payments: paymentsForTxn.slice(),
          }

          group.debts.push(debt)
          if (txn.type === 'income') {
            group.totals.owedToUs += remaining
            entry.info.totalOwedToUs += remaining
          } else {
            group.totals.weOwe += remaining
            entry.info.totalWeOwe += remaining
          }
        }

        const cardsList = Array.from(cardsMap.values())
          .map(({ info, groups }) => {
            const sortedGroups = Array.from(groups.values())
              .map((group) => ({
                currency: group.currency,
                debts: group.debts.sort(
                  (a, b) => b.remaining - a.remaining,
                ),
                totals: {
                  owedToUs: Number(group.totals.owedToUs.toFixed(2)),
                  weOwe: Number(group.totals.weOwe.toFixed(2)),
                },
              }))
              .sort((a, b) => a.currency.localeCompare(b.currency))

            return {
              ...info,
              groups: sortedGroups,
              totalOwedToUs: Number(info.totalOwedToUs.toFixed(2)),
              totalWeOwe: Number(info.totalWeOwe.toFixed(2)),
            }
          })
          .sort(
            (a, b) =>
              b.totalOwedToUs +
              b.totalWeOwe -
              (a.totalOwedToUs + a.totalWeOwe),
          )

        setCards(cardsList)

        const summaryMap = new Map<string, SummaryEntry>()
        for (const card of cardsList) {
          for (const group of card.groups) {
            const entry = summaryMap.get(group.currency) ?? {
              currency: group.currency,
              owedToUs: 0,
              weOwe: 0,
            }
            entry.owedToUs += group.totals.owedToUs
            entry.weOwe += group.totals.weOwe
            summaryMap.set(group.currency, entry)
          }
        }

        const summaryList = Array.from(summaryMap.values())
          .map((entry) => ({
            currency: entry.currency,
            owedToUs: Number(entry.owedToUs.toFixed(2)),
            weOwe: Number(entry.weOwe.toFixed(2)),
          }))
          .sort((a, b) => a.currency.localeCompare(b.currency))

        setSummary(summaryList)
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : 'No se pudieron cargar los movimientos de contribuyentes'
        setCards([])
        setSummary([])
        setError(message)
      } finally {
        setLoading(false)
      }
    },
    [online],
  )

  useEffect(() => {
    void refresh({ withSync: true })
  }, [refresh])

  function openSettlementModal(
    mode: 'full' | 'partial',
    contributor: ContributorCardData,
    debt: DebtItem,
  ) {
    const preferredVertical = modalState?.verticalId || defaultVerticalId
    setModalState({
      mode,
      contributor: {
        id: contributor.contributorId,
        name: contributor.name,
        email: contributor.email,
      },
      debt,
      amount: mode === 'full' ? debt.remaining.toFixed(2) : '',
      maxAmount: debt.remaining,
      currency: debt.currency,
      verticalId: preferredVertical,
      error: null,
    })
  }

  async function handleConfirmSettlement() {
    if (!modalState) return

    if (!online) {
      setModalState((prev) =>
        prev ? { ...prev, error: 'Necesitas conexión para registrar el pago.' } : prev,
      )
      return
    }

    const parsedAmount = Number(modalState.amount)
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setModalState((prev) =>
        prev
          ? { ...prev, error: 'Ingresa un monto válido mayor a cero.' }
          : prev,
      )
      return
    }

    if (parsedAmount - modalState.maxAmount > 0.01) {
      setModalState((prev) =>
        prev
          ? {
              ...prev,
              error: `El monto excede el saldo restante (${formatCurrency(
                modalState.maxAmount,
                modalState.currency,
              )}).`,
            }
          : prev,
      )
      return
    }

    if (!modalState.verticalId) {
      setModalState((prev) =>
        prev
          ? {
              ...prev,
              error: 'Selecciona un vertical para registrar el gasto.',
            }
          : prev,
      )
      return
    }

    setSubmitting(true)
    setModalState((prev) => (prev ? { ...prev, error: null } : prev))

    try {
      const { error: fnError } = await supabase.functions.invoke('settlements', {
        body: {
          txn_id: modalState.debt.txnId,
          amount: parsedAmount,
        },
      })

      if (fnError) {
        throw new Error(fnError.message ?? 'No se pudo registrar el pago')
      }

      const now = new Date()
      const iso = now.toISOString()
      const date = iso.slice(0, 10)
      const time = iso.slice(11, 16)
      const currency = normalizeCurrency(modalState.currency)

      await queueInsert(
        'txns',
        {
          amount: parsedAmount,
          currency,
          type: 'expense',
          date,
          time,
          vertical_id: modalState.verticalId || null,
          category_id: null,
          contributor_id: null,
          description: `Settlement payment for txn ${modalState.debt.txnId}`,
          deleted: false,
          is_settlement: true,
          settled: false,
        } as any,
      )

      await refresh({ withSync: online })

      setModalState(null)
      show({
        variant: 'success',
        title: 'Pago registrado',
        description: `Se registró un ${
          modalState.mode === 'full' ? 'pago total' : 'abono'
        } de ${formatCurrency(parsedAmount, currency)}.`,
      })
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'No se pudo registrar el pago'
      setModalState((prev) =>
        prev ? { ...prev, error: message } : prev,
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <OfflineBanner />
      <div className="space-y-6">
        <section className="card border-2 border-[rgb(var(--border))] p-6 sm:p-8">
          <h2 className="text-lg font-semibold text-[rgb(var(--fg))]">
            Estado de deudas con contribuyentes
          </h2>
          {summary.length === 0 ? (
            <p className="mt-3 text-sm text-[rgb(var(--muted))]">
              No hay deudas pendientes. Todo está al día.
            </p>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {summary.map(({ currency, owedToUs, weOwe }) => (
                <div
                  key={currency}
                  className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card-hover))] p-4"
                >
                  <div className="text-xs uppercase tracking-wide text-[rgb(var(--muted))]">
                    {currency}
                  </div>
                  <div className="mt-2 space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-[rgb(var(--muted))]">Nos deben</span>
                      <span className="font-semibold text-green-400">
                        {formatCurrency(owedToUs, currency)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[rgb(var(--muted))]">Les debemos</span>
                      <span className="font-semibold text-amber-300">
                        {formatCurrency(weOwe, currency)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-[rgb(var(--muted))]">
              Sincroniza para traer los últimos pagos y deudas.
            </p>
          </div>
          <button
            onClick={() => refresh({ withSync: true })}
            disabled={loading || submitting}
            className="btn-ghost text-xs disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Actualizando…' : 'Actualizar'}
          </button>
        </section>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {loading && cards.length === 0 && (
          <div className="flex justify-center py-12">
            <Loader label="Cargando deudas…" />
          </div>
        )}

        {!loading && cards.length === 0 && !error && (
          <div className="rounded-2xl border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--input-bg))] py-10 text-center text-sm text-[rgb(var(--muted))]">
            No hay deudas pendientes con contribuyentes.
          </div>
        )}

        {!loading && cards.length > 0 && (
          <div className="space-y-8">
            {cards.map((contributor) => (
              <section
                key={contributor.contributorId}
                className="space-y-4 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-6 shadow-sm"
              >
                <header className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-[rgb(var(--fg))]">
                      👤 {contributor.displayName}
                    </h3>
                    {contributor.email && (
                      <p className="text-xs text-[rgb(var(--muted))]">
                        {contributor.email}
                      </p>
                    )}
                  </div>
                  <TotalsByCurrency contributor={contributor} />
                </header>

                {contributor.groups.map((group) => (
                  <div
                    key={`${contributor.contributorId}-${group.currency}`}
                    className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card-hover))] p-4"
                  >
                    <div className="mb-3 flex items-center justify-between text-xs text-[rgb(var(--muted))]">
                      <span className="uppercase tracking-wide">
                        {group.currency}
                      </span>
                      <span>
                        {group.debts.length} deuda{group.debts.length === 1 ? '' : 's'}
                      </span>
                    </div>

                    <div className="space-y-4">
                      {group.debts.map((debt) => {
                        const progress =
                          debt.originalAmount > 0
                            ? Math.min(
                                100,
                                Math.round(
                                  (debt.totalPaid / debt.originalAmount) * 100,
                                ),
                              )
                            : 0
                        const direction =
                          debt.type === 'income'
                            ? 'El contribuyente debe a Yaogará'
                            : 'Yaogará debe al contribuyente'
                        const isActionDisabled = !online || submitting

                        return (
                          <article
                            key={debt.txnId}
                            className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-4 shadow-sm"
                          >
                            <div className="mb-3 flex items-start justify-between gap-3">
                              <div>
                                <h4 className="text-sm font-semibold text-[rgb(var(--fg))]">
                                  {debt.description || `Movimiento ${debt.txnId.slice(0, 8)}`}
                                </h4>
                                <p className="text-xs text-[rgb(var(--muted))]">
                                  {direction} • Registrado el {formatDate(debt.occurredOn)}
                                </p>
                              </div>
                              <div className="text-right text-sm font-semibold text-[rgb(var(--fg))]">
                                {formatCurrency(debt.originalAmount, debt.currency)}
                              </div>
                            </div>

                            <div className="mb-3 space-y-1 text-xs text-[rgb(var(--muted))]">
                              <div className="flex justify-between">
                                <span>Pagado</span>
                                <span className="text-green-400">
                                  {formatCurrency(debt.totalPaid, debt.currency)}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span>Pendiente</span>
                                <span className="text-amber-300">
                                  {formatCurrency(debt.remaining, debt.currency)}
                                </span>
                              </div>
                            </div>

                            <div className="mb-4 h-2 w-full overflow-hidden rounded-full bg-[rgb(var(--border))]">
                              <div
                                className="h-full rounded-full bg-[rgb(var(--primary))]"
                                style={{ width: `${progress}%` }}
                              />
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[rgb(var(--muted))]">
                              <span>{debt.payments.length} pago(s) registrados</span>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => openSettlementModal('full', contributor, debt)}
                                  disabled={isActionDisabled}
                                  className="btn-primary px-4 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                                  title={
                                    online
                                      ? undefined
                                      : 'Requiere conexión para registrar el pago'
                                  }
                                >
                                  {submitting ? 'Procesando…' : 'Liquidar'}
                                </button>
                                <button
                                  onClick={() =>
                                    openSettlementModal('partial', contributor, debt)
                                  }
                                  disabled={isActionDisabled}
                                  className="btn-ghost px-4 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                                  title={
                                    online
                                      ? undefined
                                      : 'Requiere conexión para registrar el pago'
                                  }
                                >
                                  {submitting ? 'Procesando…' : 'Registrar abono'}
                                </button>
                              </div>
                            </div>
                          </article>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </section>
            ))}
          </div>
        )}
      </div>

      {modalState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md space-y-5 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-6 shadow-2xl">
            <div>
              <h3 className="text-lg font-semibold text-[rgb(var(--fg))]">
                {modalState.mode === 'full'
                  ? 'Liquidar deuda'
                  : 'Registrar abono parcial'}
              </h3>
              <p className="text-sm text-[rgb(var(--muted))]">
                {modalState.contributor.name || modalState.contributor.email || 'Contribuyente'} •{' '}
                {modalState.debt.description || `Movimiento ${modalState.debt.txnId.slice(0, 8)}`}
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wide text-[rgb(var(--muted))]">
                Monto ({modalState.currency})
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={modalState.amount}
                onChange={(e) =>
                  setModalState((prev) =>
                    prev ? { ...prev, amount: e.target.value, error: null } : prev,
                  )
                }
                disabled={modalState.mode === 'full'}
                className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--input-bg))] px-3 py-2 text-sm text-[rgb(var(--fg))] focus:border-[rgb(var(--primary))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--ring))]"
              />
              <p className="text-xs text-[rgb(var(--muted))]">
                Saldo restante: {formatCurrency(modalState.maxAmount, modalState.currency)}
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wide text-[rgb(var(--muted))]">
                Vertical
              </label>
              <select
                value={modalState.verticalId}
                onChange={(e) =>
                  setModalState((prev) =>
                    prev ? { ...prev, verticalId: e.target.value, error: null } : prev,
                  )
                }
                className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--input-bg))] px-3 py-2 text-sm text-[rgb(var(--fg))] focus:border-[rgb(var(--primary))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--ring))]"
              >
                <option value="">Selecciona un vertical</option>
                {verticals.map((vertical) => (
                  <option key={vertical.id} value={vertical.id}>
                    {vertical.name}
                  </option>
                ))}
              </select>
              {verticals.length === 0 && (
                <p className="text-xs text-amber-300">
                  Crea un vertical para clasificar el gasto generado por el pago.
                </p>
              )}
            </div>

            {modalState.error && (
              <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                {modalState.error}
              </div>
            )}

            {!online && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                Conéctate a internet para registrar el pago con Supabase.
              </div>
            )}

            <div className="flex justify-end gap-3 text-sm">
              <button
                onClick={() => setModalState(null)}
                className="btn-ghost px-4 py-2"
                disabled={submitting}
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmSettlement}
                className="btn-primary px-4 py-2 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={
                  submitting ||
                  !online ||
                  !modalState.verticalId ||
                  !modalState.amount ||
                  Number(modalState.amount) <= 0
                }
              >
                {submitting ? 'Guardando…' : 'Confirmar pago'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
