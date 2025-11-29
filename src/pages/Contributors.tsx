import { useCallback, useEffect, useMemo, useState } from 'react'
import { OfflineBanner } from '../components/OfflineBanner'
import Loader from '../components/Loader'
import { useToast } from '../components/ToastProvider'
import { db, genId, type Contributor as ContributorRecord } from '../lib/db'
import {
  fetchContributorBalances,
  type ContributorBalanceRow,
} from '../lib/balances'
import { fullSync, fetchContributors } from '../lib/sync'
import useOnlineStatus from '../hooks/useOnlineStatus'
import { getSupabase, safeQuery } from '../lib/supabase'
import { formatCOP } from '../lib/money'
import { ensureFxRates, convertToCOP, type FxSnapshot, type FxRates } from '../lib/fx'

function formatCurrency(amount: number, currency: string | null | undefined) {
  const code = currency ?? 'COP'
  return `${code} ${formatCOP(Number.isFinite(amount) ? amount : 0)}`
}

function balanceStatus(balance: number) {
  if (balance > 0) return 'Yaogará le debe al contribuyente'
  if (balance < 0) return 'El contribuyente le debe a Yaogará'
  return 'Sin deuda pendiente'
}

function netBalance(entry: ContributorBalanceRow, rates?: FxRates | null) {
  return entry.breakdowns.reduce((sum, breakdown) => {
    const base = rates
      ? convertToCOP(breakdown.balance, breakdown.currency, rates)
      : breakdown.balance
    return sum + base
  }, 0)
}

function formatCopAmount(value: number) {
  const prefix = value < 0 ? '-' : value > 0 ? '' : ''
  return `${prefix}COP ${formatCOP(Math.abs(value))}`
}

function formatFxTimestamp(snapshot: FxSnapshot | null) {
  if (!snapshot) return null
  const date = new Date(snapshot.fetchedAt)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })
}

export default function Contributors() {
  const online = useOnlineStatus()
  const { show } = useToast()
  const [balances, setBalances] = useState<ContributorBalanceRow[]>([])
  const [contributorsList, setContributorsList] = useState<ContributorRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [newContributorEmail, setNewContributorEmail] = useState('')
  const [newContributorName, setNewContributorName] = useState('')
  const [creatingContributor, setCreatingContributor] = useState(false)
  const [settlingContributorId, setSettlingContributorId] = useState<string | null>(null)
  const [fxSnapshot, setFxSnapshot] = useState<FxSnapshot | null>(null)
  const [fxError, setFxError] = useState<string | null>(null)
  const [showContributorsForm, setShowContributorsForm] = useState(false)

  const sortedContributors = useMemo(
    () =>
      [...contributorsList].sort((a, b) => {
        const aLabel = a.name?.toLowerCase() || a.email.toLowerCase()
        const bLabel = b.name?.toLowerCase() || b.email.toLowerCase()
        return aLabel.localeCompare(bLabel)
      }),
    [contributorsList],
  )

  // Filter balances to only show contributors with non-zero balance
  const balancesWithNonZero = useMemo(() => {
    return balances.filter(entry => {
      const net = netBalance(entry, fxSnapshot?.rates)
      return Math.abs(net) >= 0.01 // Only show if balance is not zero
    })
  }, [balances, fxSnapshot])

  const refresh = useCallback(
    async (options: { withSync?: boolean } = {}) => {
      setLoading(true)
      setError(null)

      if (options.withSync && online) {
        try {
          await fullSync()
        } catch (err) {
          console.warn('⚠️ Full sync failed, falling back to cache', err)
        }
      }

      try {
        let contributorRows = await db.contributors.toArray()
        if (online) {
          try {
            const fresh = await fetchContributors()
            if (fresh?.length) contributorRows = fresh
          } catch (err) {
            console.warn('⚠️ Failed to refresh contributors:', err)
          }
        }

        setContributorsList(contributorRows)
        const balanceRows = await fetchContributorBalances(contributorRows)
        setBalances(balanceRows)

        try {
          const snapshot = await ensureFxRates({ forceRefresh: options.withSync })
          setFxSnapshot(snapshot)
          setFxError(null)
        } catch (err: any) {
          console.warn('⚠️ FX fetch failed', err)
          setFxError(err?.message || 'No se pudieron obtener tasas de cambio.')
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'No se pudieron cargar los balances'
        setError(message)
        setBalances([])
      } finally {
        setLoading(false)
      }
    },
    [online],
  )

  useEffect(() => {
    void refresh({ withSync: true })
  }, [refresh])

  function toggleBreakdown(contributorId: string, currency: string) {
    const key = `${contributorId}-${currency}`
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  async function handleCreateContributor(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!newContributorEmail.trim()) return
    if (!online) {
      show({
        variant: 'error',
        title: 'Sin conexión',
        description: 'Necesitas estar en línea para crear contribuyentes.',
      })
      return
    }

    setCreatingContributor(true)
    try {
      const supabase = getSupabase()
      const payload = {
        email: newContributorEmail.trim(),
        name: newContributorName.trim() || null,
      }

      const { data, error: insertError } = await safeQuery<ContributorRecord>(
        () =>
          supabase
            .from('contributors')
            .insert(payload)
            .select('id, email, name, auth_user_id, created_at, updated_at')
            .single()
            .then((r: any) => r),
        'create contributor',
      )
      if (insertError || !data) {
        throw new Error(
          typeof insertError === 'string'
            ? insertError
            : insertError?.message ?? 'No se pudo crear el contribuyente',
        )
      }

      const fallbackTimestamp = new Date().toISOString()
      const contributor: ContributorRecord = {
        id: data.id,
        email: data.email,
        name: data.name ?? null,
        auth_user_id: data.auth_user_id ?? null,
        created_at: data.created_at ?? data.updated_at ?? fallbackTimestamp,
        updated_at: data.updated_at ?? data.created_at ?? fallbackTimestamp,
      }

      await db.contributors.put(contributor)
      setNewContributorEmail('')
      setNewContributorName('')
      await refresh()
      show({ variant: 'success', title: 'Contribuyente agregado' })
    } catch (err) {
      show({
        variant: 'error',
        title: 'No se pudo crear',
        description: err instanceof Error ? err.message : 'Error desconocido',
      })
    } finally {
      setCreatingContributor(false)
    }
  }

  async function handleSettleBalance(entry: ContributorBalanceRow) {
    if (!online) {
      show({
        variant: 'error',
        title: 'Sin conexión',
        description: 'Conéctate para liquidar saldos.',
      })
      return
    }

    const totalBalance = netBalance(entry, fxSnapshot?.rates)
    if (Math.abs(totalBalance) < 0.01) {
      show({ variant: 'default', title: 'Nada por liquidar' })
      return
    }

    setSettlingContributorId(entry.contributor.id)
    try {
      const supabase = getSupabase()
      const { data: userRes, error: userErr } = await supabase.auth.getUser()
      if (userErr || !userRes?.user?.id) {
        throw new Error('Debes iniciar sesión para registrar liquidaciones.')
      }

      const direction = totalBalance > 0 ? 'out' : 'in'
      const description =
        direction === 'out'
          ? 'Liquidación automática (Yaogará paga) · direction=out'
          : 'Liquidación automática (Contribuyente paga) · direction=in'
      const payload = {
        amount: Math.abs(totalBalance),
        type: 'Settled' as const,
        contributor_id: entry.contributor.id,
        user_id: userRes.user.id,
        client_id: genId(),
        occurred_on: new Date().toISOString(),
        description,
        is_settlement: true,
      }

      const { error: settleError } = await safeQuery(
        () =>
          supabase
            .from('txns')
            .insert(payload)
            .select('id')
            .single()
            .then((r: any) => r),
        'settle contributor balance',
      )
      if (settleError) {
        throw new Error(
          typeof settleError === 'string'
            ? settleError
            : settleError?.message ?? 'No se pudo registrar la liquidación',
        )
      }

      await fullSync()
      await refresh()

      const primaryCurrency = entry.breakdowns[0]?.currency || 'COP'
      const formattedAmount = fxSnapshot
        ? `COP ${formatCOP(Math.abs(totalBalance))}`
        : formatCurrency(Math.abs(totalBalance), primaryCurrency)
      show({
        variant: 'success',
        title: 'Saldo liquidado',
        description: `Se registró una liquidación por ${formattedAmount}.`,
      })
    } catch (err) {
      show({
        variant: 'error',
        title: 'No se pudo liquidar',
        description: err instanceof Error ? err.message : 'Error desconocido',
      })
    } finally {
      setSettlingContributorId(null)
    }
  }

  return (
    <div>
      <OfflineBanner />
      <div className="space-y-6">
        <section className="flex flex-col gap-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[rgb(var(--fg))]">
              Balances por contribuyente
            </h2>
            <p className="text-sm text-[rgb(var(--muted))]">
              Sincroniza para traer los últimos movimientos y liquidaciones.
            </p>
            {fxSnapshot && (
              <p className="text-xs text-[rgb(var(--muted))]">
                Tasas FX al {formatFxTimestamp(fxSnapshot) ?? 'momento reciente'}.
              </p>
            )}
            {!fxSnapshot && fxError && (
              <p className="text-xs text-amber-400">{fxError}</p>
            )}
          </div>
          <button
            onClick={() => refresh({ withSync: true })}
            disabled={loading}
            className="btn-ghost text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Actualizando…' : 'Actualizar'}
          </button>
        </section>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {loading && balancesWithNonZero.length === 0 && (
          <div className="flex justify-center py-12">
            <Loader label="Cargando balances…" />
          </div>
        )}

        {!loading && balancesWithNonZero.length === 0 && !error && (
          <div className="rounded-2xl border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--input-bg))] py-10 text-center text-sm text-[rgb(var(--muted))]">
            No hay balances pendientes para mostrar.
            {balances.length > 0 && (
              <span className="block mt-1 text-xs">
                ({balances.length} contribuyentes con saldo cero están ocultos)
              </span>
            )}
          </div>
        )}

        <div className="space-y-6">
          {balancesWithNonZero.map((entry) => {
            const net = netBalance(entry, fxSnapshot?.rates)
            const primaryCurrency = entry.breakdowns[0]?.currency || 'COP'
            const tone =
              net > 0
                ? 'text-emerald-300'
                : net < 0
                  ? 'text-red-300'
                  : 'text-[rgb(var(--muted))]'
            const disableSettle =
              Math.abs(net) < 0.01 || settlingContributorId === entry.contributor.id
            const netLabel = fxSnapshot
              ? formatCopAmount(net)
              : formatCurrency(net, primaryCurrency)
            const fxNote = fxSnapshot
              ? `Basado en tasas del ${formatFxTimestamp(fxSnapshot) ?? 'último sync'}`
              : 'Sin conversión automática — usa los montos por moneda.'

            return (
              <section
                key={entry.contributor.id}
                className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-6 shadow-sm"
              >
                <header className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-[rgb(var(--fg))]">
                      👤 {entry.contributor.displayName}
                    </h3>
                    {entry.contributor.email && (
                      <p className="text-xs text-[rgb(var(--muted))]">
                        {entry.contributor.email}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 text-right">
                    <p className={`text-sm font-semibold ${tone}`}>{netLabel}</p>
                    <p className="text-xs text-[rgb(var(--muted))]">{balanceStatus(net)}</p>
                    <p className="text-[0.7rem] text-[rgb(var(--muted))]">{fxNote}</p>
                    <button
                      onClick={() => handleSettleBalance(entry)}
                      className="btn-primary px-4 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={disableSettle}
                    >
                      {settlingContributorId === entry.contributor.id
                        ? 'Liquidando…'
                        : 'Liquidar saldo'}
                    </button>
                  </div>
                </header>

                {entry.breakdowns.length === 0 && (
                  <p className="mt-4 rounded-xl border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--card-hover))] px-4 py-3 text-sm text-[rgb(var(--muted))]">
                    Aún no se han registrado movimientos con este contribuyente.
                  </p>
                )}

                <div className={`mt-4 ${entry.breakdowns.length > 1 ? 'grid grid-cols-1 sm:grid-cols-2 gap-4' : 'space-y-4'}`}>
                  {entry.breakdowns.map((breakdown) => {
                    const key = `${entry.contributor.id}-${breakdown.currency}`
                    const isExpanded = Boolean(expanded[key])
                    const balance = breakdown.balance
                    const toneCurrency =
                      balance > 0
                        ? 'text-emerald-300'
                        : balance < 0
                          ? 'text-red-300'
                          : 'text-[rgb(var(--muted))]'

                    return (
                      <article
                        key={key}
                        className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card-hover))] p-4"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-xs uppercase tracking-wide text-[rgb(var(--muted))]">
                              {breakdown.currency}
                            </p>
                            <p className={`text-3xl font-semibold ${toneCurrency}`}>
                              {formatCurrency(balance, breakdown.currency)}
                            </p>
                            <p className="text-xs text-[rgb(var(--muted))]">
                              {balanceStatus(balance)}
                            </p>
                          </div>
                          <button
                            onClick={() =>
                              toggleBreakdown(entry.contributor.id, breakdown.currency)
                            }
                            className="text-xs font-medium text-[rgb(var(--primary))]"
                            type="button"
                          >
                            {isExpanded ? 'Ocultar desglose' : 'Ver desglose'}
                          </button>
                        </div>

                        {isExpanded && (
                          <dl className="mt-4 space-y-3 text-sm text-[rgb(var(--muted))]">
                            <div className="flex items-center justify-between">
                              <dt>Gastos pagados</dt>
                              <dd className="font-semibold text-[rgb(var(--fg))]">
                                {formatCurrency(breakdown.gastos, breakdown.currency)}
                              </dd>
                            </div>
                            <div className="flex items-center justify-between">
                              <dt>Distribuciones recibidas</dt>
                              <dd className="font-semibold text-[rgb(var(--fg))]">
                                {formatCurrency(
                                  breakdown.distribuciones,
                                  breakdown.currency,
                                )}
                              </dd>
                            </div>
                            <div className="flex items-center justify-between">
                              <dt>Liquidaciones pagadas</dt>
                              <dd className="font-semibold text-[rgb(var(--fg))]">
                                {formatCurrency(
                                  breakdown.settlementsPagados,
                                  breakdown.currency,
                                )}
                              </dd>
                            </div>
                            <div className="flex items-center justify-between">
                              <dt>Liquidaciones recibidas</dt>
                              <dd className="font-semibold text-[rgb(var(--fg))]">
                                {formatCurrency(
                                  breakdown.settlementsRecibidos,
                                  breakdown.currency,
                                )}
                              </dd>
                            </div>
                          </dl>
                        )}
                      </article>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>

        <section className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-6 shadow-sm">
          <div 
            className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 rounded p-2 -m-2 transition-colors"
            onClick={() => setShowContributorsForm(!showContributorsForm)}
          >
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-[rgb(var(--fg))]">Gestión de Contribuyentes</h3>
                  <p className="text-sm text-[rgb(var(--muted))]">
                    Agrega nuevos colaboradores y gestiona los existentes
                  </p>
                </div>
                <svg 
                  className={`h-5 w-5 text-[rgb(var(--muted))] transition-transform ${
                    showContributorsForm ? 'rotate-180' : ''
                  }`} 
                  viewBox="0 0 20 20" 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth="2"
                >
                  <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>
          </div>
          
          {showContributorsForm && (
            <div className="mt-6 space-y-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h4 className="text-sm font-medium text-[rgb(var(--fg))] mb-2">Nuevo contribuyente</h4>
                  <p className="text-xs text-[rgb(var(--muted))] mb-4">
                    Registra colaboradores externos para asignarles gastos e ingresos.
                  </p>
                </div>
                <form
                  onSubmit={handleCreateContributor}
                  className="flex w-full flex-col gap-3 sm:max-w-sm"
                >
                  <input
                    type="email"
                    required
                    placeholder="correo@ejemplo.com"
                    value={newContributorEmail}
                    onChange={(e) => setNewContributorEmail(e.target.value)}
                    className="input"
                  />
                  <input
                    type="text"
                    placeholder="Nombre (opcional)"
                    value={newContributorName}
                    onChange={(e) => setNewContributorName(e.target.value)}
                    className="input"
                  />
                  <button
                    type="submit"
                    className="btn-primary disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={creatingContributor}
                  >
                    {creatingContributor ? 'Guardando…' : 'Agregar contribuyente'}
                  </button>
                </form>
              </div>

              <div className="border-t border-[rgb(var(--border))] pt-6">
                <h4 className="text-sm font-medium text-[rgb(var(--fg))] mb-4">
                  Contribuyentes registrados ({sortedContributors.length})
                </h4>
                {sortedContributors.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--card-hover))] px-4 py-3 text-sm text-[rgb(var(--muted))]">
                    Aún no se registran contribuyentes.
                  </p>
                ) : (
                  <ul className="divide-y divide-[rgb(var(--border))]/60 rounded-xl border border-[rgb(var(--border))]/60 bg-[rgb(var(--card-hover))]">
                    {sortedContributors.map((contributor) => (
                      <li key={contributor.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-[rgb(var(--fg))]">
                            {contributor.name?.trim() || contributor.email}
                          </p>
                          <p className="text-xs text-[rgb(var(--muted))]">{contributor.email}</p>
                        </div>
                        <span className="text-xs text-[rgb(var(--muted))]">
                          {contributor.auth_user_id ? 'Vinculado a usuario' : 'Externo'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
