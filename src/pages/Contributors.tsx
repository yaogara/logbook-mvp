import { useEffect, useState } from 'react'
import { supabase, safeQuery } from '../lib/supabase'
import Loader from '../components/Loader'
import { OfflineBanner } from '../components/OfflineBanner'
import { useToast } from '../components/ToastProvider'

type ContributorBalance = {
  contributor_id: string
  contributor_email: string
  balance: number
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-CO', { 
    style: 'currency', 
    currency: 'COP',
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
      const { data, error } = await safeQuery<ContributorBalance[]>(
        () =>
          supabase
            .from('contributor_balances')
            .select('*')
            .then((r) => r),
        'load contributor balances',
      )
      if (error) throw error
      setBalances((data as ContributorBalance[]) ?? [])
    } catch (err: any) {
      setError(err?.message || 'Failed to load contributor balances')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadBalances()
  }, [])

  const totalBalance = balances.reduce((sum, b) => sum + (b.balance || 0), 0)

  const visibleBalances = showOnlyNonZero
    ? balances.filter(b => b.balance !== 0)
    : balances

  async function handleSettle(contributorId: string, email: string) {
    if (settling) return
    setSettling(contributorId)
    try {
      const { error } = await supabase.rpc('settle_contributor', { 
        target: contributorId 
      })
      
      if (error) throw error
      
      show({ 
        variant: 'success', 
        title: `✅ Settlement recorded for ${email}` 
      })
      
      // Reload balances after settlement
      await loadBalances()
    } catch (err: any) {
      show({ 
        variant: 'error', 
        title: 'Settlement failed', 
        description: err?.message || 'Unknown error' 
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
          className={`card p-6 sm:p-8 border-2 transition ${
            totalBalance > 0 
              ? 'border-green-400/30 bg-green-500/5' 
              : totalBalance < 0 
              ? 'border-red-400/30 bg-red-500/5' 
              : 'border-[rgb(var(--border))]'
          }`}
        >
          <h2 className="text-lg font-semibold text-[rgb(var(--fg))] mb-2">
            Yaogará Balance Overview
          </h2>
          <div className="flex items-baseline gap-2">
            <span className="text-sm text-[rgb(var(--muted))]">Total Outstanding:</span>
            <span 
              className={`text-2xl font-bold ${
                totalBalance > 0 
                  ? 'text-green-400' 
                  : totalBalance < 0 
                  ? 'text-red-400' 
                  : 'text-[rgb(var(--fg))]'
              }`}
            >
              {formatCurrency(totalBalance)}
            </span>
          </div>
          <p className="text-xs text-[rgb(var(--muted))] mt-2">
            {totalBalance > 0 
              ? '🟢 Yaogará is owed money' 
              : totalBalance < 0 
              ? '🔴 Yaogará owes money' 
              : 'All balances settled'}
          </p>
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
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {visibleBalances.map((contributor) => (
              <div
                key={contributor.contributor_id}
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
                      {contributor.contributor_email.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-[rgb(var(--fg))] truncate" title={contributor.contributor_email}>
                      📧 {contributor.contributor_email}
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
                    💰 {formatCurrency(contributor.balance)}
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
                    onClick={() => handleSettle(contributor.contributor_id, contributor.contributor_email)}
                    disabled={settling === contributor.contributor_id}
                    className="w-full btn-primary disabled:opacity-60 disabled:cursor-not-allowed text-sm py-2"
                  >
                    {settling === contributor.contributor_id ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" opacity="0.25" />
                          <path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" opacity="0.75" />
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
          </section>
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
