import { useEffect, useState } from 'react'
import { supabase, safeQuery } from '../lib/supabase'
import Loader from '../components/Loader'
import { OfflineBanner } from '../components/OfflineBanner'
import { useToast } from '../components/ToastProvider'

type ContributorBalance = {
  contributor_id: string
  contributor_email: string
  contributor_name: string | null
  balance: number
  currency: string | null
}

type SupabaseContributorBalance = {
  contributor_id: string
  email: string | null
  name: string | null
  balance: number | string | null
  currency: string | null
}

function formatCurrency(amount: number, currency: string | null | undefined): string {
  const currencyCode = currency || 'COP'
  const locale = currencyCode === 'USD' ? 'en-US' : 'es-CO'
  return new Intl.NumberFormat(locale, { 
    style: 'currency', 
    currency: currencyCode,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount)
}

export default function Contributors() {
  const { show } = useToast()
  const [balances, setBalances] = useState<ContributorBalance[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showOnlyNonZero, setShowOnlyNonZero] = useState(true)
  const [settling, setSettling] = useState<string | null>(null)

  async function loadBalances() {
    setLoading(true)
    setError(null)
    try {
      const { data, error } = await safeQuery<SupabaseContributorBalance[]>(
        () =>
          supabase
            .from('contributor_balances')
            .select('contributor_id, email, name, balance, currency')
            .then((r) => r),
        'load contributor balances',
      )
      if (error) throw error
      const normalized = (data ?? []).map<ContributorBalance>((row) => ({
        contributor_id: row.contributor_id,
        contributor_email: row.email ?? 'Unknown contributor',
        contributor_name: row.name,
        balance: typeof row.balance === 'string' ? parseFloat(row.balance) : row.balance ?? 0,
        currency: row.currency ?? null,
      }))
      setBalances(normalized)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load contributor balances'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadBalances()
  }, [])

  const totalsByCurrency = balances.reduce<Record<string, number>>((sumByCurrency, b) => {
    const key = b.currency || 'COP'
    const current = sumByCurrency[key] ?? 0
    return {
      ...sumByCurrency,
      [key]: current + (b.balance || 0),
    }
  }, {})

  const visibleBalances = showOnlyNonZero
    ? balances.filter(b => b.balance !== 0)
    : balances

  const balancesByCurrency = visibleBalances.reduce<Record<string, ContributorBalance[]>>((grouped, balance) => {
    const key = balance.currency || 'COP'
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(balance)
    return grouped
  }, {})

  async function handleSettle(contributorId: string, displayName: string) {
    if (settling) return
    setSettling(contributorId)
    try {
      const { error } = await supabase.rpc('settle_contributor', { 
        target: contributorId 
      })
      
      if (error) throw error
      
      show({ 
        variant: 'success', 
        title: `✅ Settlement recorded for ${displayName}` 
      })
      
      // Reload balances after settlement
      await loadBalances()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      show({ 
        variant: 'error', 
        title: 'Settlement failed', 
        description: message 
      })
    } finally {
      setSettling(null)
    }
  }

  return (
    <div>
      <OfflineBanner />
      <div className="space-y-6">
        {/* Summary Card */}
        <section 
          className="card p-6 sm:p-8 border-2 transition border-[rgb(var(--border))]"
        >
          <h2 className="text-lg font-semibold text-[rgb(var(--fg))] mb-2">
            Yaogará Balance Overview
          </h2>
          <div className="space-y-2">
            {Object.keys(totalsByCurrency).length === 0 && (
              <p className="text-sm text-[rgb(var(--muted))]">No balances recorded yet.</p>
            )}
            {Object.entries(totalsByCurrency).map(([currency, amount]) => (
              <div key={currency}>
                <div className="flex items-baseline gap-2">
                  <span className="text-sm text-[rgb(var(--muted))]">
                    Outstanding ({currency}):
                  </span>
                  <span
                    className={`text-2xl font-bold ${
                      amount > 0
                        ? 'text-green-400'
                        : amount < 0
                        ? 'text-red-400'
                        : 'text-[rgb(var(--fg))]'
                    }`}
                  >
                    {formatCurrency(amount, currency)}
                  </span>
                </div>
                <p className="text-xs text-[rgb(var(--muted))] mt-1">
                  {amount > 0
                    ? '🟢 Yaogará is owed money'
                    : amount < 0
                    ? '🔴 Yaogará owes money'
                    : 'All balances settled'}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Filter Toggle */}
        <section className="flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer group">
            <input
              type="checkbox"
              checked={showOnlyNonZero}
              onChange={(e) => setShowOnlyNonZero(e.target.checked)}
              className="w-4 h-4 rounded border-[rgb(var(--border))] bg-[rgb(var(--input-bg))] text-[rgb(var(--primary))] focus:ring-2 focus:ring-[rgb(var(--ring))] cursor-pointer"
            />
            <span className="text-sm text-[rgb(var(--muted))] group-hover:text-[rgb(var(--fg))] transition">
              Show only non-zero balances
            </span>
          </label>
          
          <button 
            onClick={loadBalances} 
            disabled={loading} 
            className="btn-ghost disabled:opacity-50 disabled:cursor-not-allowed text-xs"
            title="Refresh balances"
          >
            {loading ? (
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" opacity="0.25" />
                <path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" opacity="0.75" />
              </svg>
            ) : (
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
              </svg>
            )}
            Refresh
          </button>
        </section>

        {error && (
          <div className="rounded-lg border border-red-400/20 bg-red-500/10 text-red-400 px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* Loading State */}
        {loading && balances.length === 0 && (
          <div className="flex justify-center py-12">
            <Loader label="Loading balances…" />
          </div>
        )}

        {/* Empty State */}
        {!loading && balances.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--input-bg))] py-10 text-center text-sm text-[rgb(var(--muted))]">
            <span className="text-base font-medium text-[rgb(var(--fg))]">
              No contributor balances yet
            </span>
          </div>
        )}

        {/* Contributor Cards */}
        {!loading && visibleBalances.length > 0 && (
          <div className="space-y-10">
            {Object.entries(balancesByCurrency).map(([currency, contributors]) => (
              <section key={currency}>
                <h3 className="text-sm font-semibold text-[rgb(var(--muted))] uppercase tracking-wide mb-3">
                  {currency} balances
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {contributors.map((contributor) => (
                    <div
                      key={`${currency}-${contributor.contributor_id}`}
                      className={`card p-5 transition hover:shadow-lg ${
                        contributor.balance !== 0 ? 'border-l-4' : ''
                      } ${
                        contributor.balance > 0 
                          ? 'border-l-green-400' 
                          : contributor.balance < 0 
                          ? 'border-l-red-400' 
                          : ''
                      }`}
                    >
                      <div className="flex items-start gap-3 mb-3">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[rgb(var(--card-hover))] flex items-center justify-center">
                          <span className="text-sm font-medium">
                            {(contributor.contributor_name?.charAt(0) || contributor.contributor_email.charAt(0)).toUpperCase()}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-[rgb(var(--fg))] truncate" title={contributor.contributor_name ?? contributor.contributor_email}>
                            👤 {contributor.contributor_name ?? contributor.contributor_email}
                          </div>
                        </div>
                      </div>

                      <div className="mb-4">
                        <div className="text-xs text-[rgb(var(--muted))] mb-1">Balance</div>
                        <div 
                          className={`text-xl font-bold ${
                            contributor.balance > 0 
                              ? 'text-green-400' 
                              : contributor.balance < 0 
                              ? 'text-red-400' 
                              : 'text-[rgb(var(--fg))]'
                          }`}
                        >
                          💰 {formatCurrency(contributor.balance, contributor.currency)}
                        </div>
                        {contributor.balance > 0 && (
                          <div className="text-xs text-green-400/80 mt-1">
                            Yaogará is owed
                          </div>
                        )}
                        {contributor.balance < 0 && (
                          <div className="text-xs text-red-400/80 mt-1">
                            Yaogará owes
                          </div>
                        )}
                      </div>

                      {contributor.balance !== 0 && (
                        <button
                          onClick={() => handleSettle(
                            contributor.contributor_id, 
                            contributor.contributor_name ?? contributor.contributor_email
                          )}
                          disabled={settling === contributor.contributor_id}
                          className="w-full btn-primary disabled:opacity-60 disabled:cursor-not-allowed text-sm py-2"
                        >
                          {settling === contributor.contributor_id ? (
                            <span className="flex items-center justify-center gap-2">
                              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10" opacity="0.25" />
                                <path d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z" opacity="0.75" />
                              </svg>
                              Settling…
                            </span>
                          ) : (
                            'Settle'
                          )}
                        </button>
                      )}

                      {contributor.balance === 0 && (
                        <div className="text-center text-xs text-[rgb(var(--muted))] py-2">
                          ✓ Settled
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        {/* No Results After Filtering */}
        {!loading && balances.length > 0 && visibleBalances.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--input-bg))] py-10 text-center text-sm text-[rgb(var(--muted))]">
            <span className="text-base font-medium text-[rgb(var(--fg))]">
              All balances are zero
            </span>
            <span className="text-xs">
              Uncheck the filter to see all contributors
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
