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

function formatCurrency(amount: number, currency: string | null | undefined) {
  const code = currency ?? 'COP'
  return `${code} ${formatCOP(Number.isFinite(amount) ? amount : 0)}`
}

function balanceStatus(balance: number) {
  if (balance > 0) return 'Yaogará le debe al contribuyente'
  if (balance < 0) return 'El contribuyente le debe a Yaogará'
  return 'Sin deuda pendiente'
}

function netBalance(entry: ContributorBalanceRow) {
  return entry.breakdowns.reduce((sum, breakdown) => sum + breakdown.balance, 0)
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

  const sortedContributors = useMemo(
    () =>
      [...contributorsList].sort((a, b) => {
        const aLabel = a.name?.toLowerCase() || a.email.toLowerCase()
        const bLabel = b.name?.toLowerCase() || b.email.toLowerCase()
        return aLabel.localeCompare(bLabel)
      }),
    [contributorsList],
  )

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

    const totalBalance = netBalance(entry)
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

      const primaryCurrency = entry.breakdowns[0]?.currency
      show({
        variant: 'success',
        title: 'Saldo liquidado',
        description: `Se registró una liquidación por ${formatCurrency(
          Math.abs(totalBalance),
          primaryCurrency,
        )}.`,
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
          </div>
          <button
            onClick={() => refresh({ withSync: true })}
            disabled={loading}
            className="btn-ghost text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Actualizando…' : 'Actualizar'}
          </button>
        </section>

        <section className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-base font-semibold text-[rgb(var(--fg))]">Nuevo contribuyente</h3>
              <p className="text-sm text-[rgb(var(--muted))]">
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
        </section>

        <section className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-6 shadow-sm">
          <header className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-base font-semibold text-[rgb(var(--fg))]">
                Contribuyentes registrados
              </h3>
              <p className="text-xs text-[rgb(var(--muted))]">
                {sortedContributors.length} colaboradores sincronizados
              </p>
            </div>
          </header>
          {sortedContributors.length === 0 ? (
            <p className="mt-4 rounded-xl border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--card-hover))] px-4 py-3 text-sm text-[rgb(var(--muted))]">
              Aún no se registran contribuyentes.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-[rgb(var(--border))]/60 rounded-xl border border-[rgb(var(--border))]/60 bg-[rgb(var(--card-hover))]">
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
        </section>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {loading && balances.length === 0 && (
          <div className="flex justify-center py-12">
            <Loader label="Cargando balances…" />
          </div>
        )}

        {!loading && balances.length === 0 && !error && (
          <div className="rounded-2xl border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--input-bg))] py-10 text-center text-sm text-[rgb(var(--muted))]">
            No hay movimientos registrados para los contribuyentes.
          </div>
        )}

        <div className="space-y-6">
          {balances.map((entry) => {
            const net = netBalance(entry)
            const primaryCurrency = entry.breakdowns[0]?.currency
            const tone =
              net > 0
                ? 'text-emerald-300'
                : net < 0
                  ? 'text-red-300'
                  : 'text-[rgb(var(--muted))]'
            const disableSettle =
              Math.abs(net) < 0.01 || settlingContributorId === entry.contributor.id

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
                    <p className={`text-sm font-semibold ${tone}`}>
                      {formatCurrency(net, primaryCurrency)}
                    </p>
                    <p className="text-xs text-[rgb(var(--muted))]">{balanceStatus(net)}</p>
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

                <div className="mt-4 space-y-4">
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
      </div>
    </div>
  )
}
