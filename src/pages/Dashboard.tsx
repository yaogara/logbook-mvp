import { useEffect, useMemo, useState } from 'react'
import { supabase, safeQuery } from '../lib/supabase'
import Loader from '../components/Loader'
import { OfflineBanner } from '../components/OfflineBanner'

type SummaryRow = {
  vertical: string
  total_ingresos: number
  total_gastos: number
  balance?: number | null
}

function formatCurrency(value: number) {
  return value.toLocaleString(undefined, { style: 'currency', currency: 'USD' })
}

export default function Dashboard() {
  const [rows, setRows] = useState<SummaryRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const { data, error } = await safeQuery<SummaryRow[]>(
        () =>
          supabase
            .from('txns_summary_view')
            .select('*')
            .order('vertical', { ascending: true })
            .then((r) => r),
        'load txns summary',
      )
      if (error) throw error
      setRows((data as SummaryRow[]) ?? [])
    } catch (err: any) {
      setError(err?.message || 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const totals = useMemo(() => {
    const ingresos = rows.reduce((sum, r) => sum + (Number(r.total_ingresos) || 0), 0)
    const gastos = rows.reduce((sum, r) => sum + (Number(r.total_gastos) || 0), 0)
    const balance = ingresos - gastos
    return { ingresos, gastos, balance }
  }, [rows])

  return (
    <div>
      <OfflineBanner />
      <div className="space-y-6">
        {/* Optional global summary */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="card p-4">
            <div className="text-xs text-[rgb(var(--muted))]">Total Ingresos</div>
            <div className="text-lg font-semibold text-[rgb(var(--fg))]">{formatCurrency(totals.ingresos)}</div>
          </div>
          <div className="card p-4">
            <div className="text-xs text-[rgb(var(--muted))]">Total Gastos</div>
            <div className="text-lg font-semibold text-[rgb(var(--fg))]">{formatCurrency(totals.gastos)}</div>
          </div>
          <div className="card p-4">
            <div className="text-xs text-[rgb(var(--muted))]">Balance</div>
            <div className={`text-lg font-semibold ${totals.balance >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatCurrency(totals.balance)}</div>
          </div>
        </section>

        {error && (
          <div className="rounded-lg border border-red-400/20 bg-red-500/10 text-red-400 px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* List of verticals */}
        <section className="space-y-3">
          <div className="flex justify-end">
            <button onClick={load} disabled={loading} className="btn-primary disabled:opacity-60">
              {loading ? 'Loading…' : 'Reload'}
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {loading && rows.length === 0 && (
              <div className="col-span-full"><Loader /></div>
            )}
            {!loading && rows.length === 0 && !error && (
              <div className="col-span-full text-sm text-[rgb(var(--muted))]">No data.</div>
            )}
            {rows.map((r) => {
              const balance = (r.balance ?? (Number(r.total_ingresos) || 0) - (Number(r.total_gastos) || 0))
              const positive = balance >= 0
              return (
                <div key={r.vertical} className="card p-4">
                  <div className="text-base font-medium mb-2 text-[rgb(var(--fg))]">{r.vertical}</div>
                  <div className="space-y-1 text-sm text-[rgb(var(--muted))]">
                    <div>Ingreso: {formatCurrency(Number(r.total_ingresos) || 0)}</div>
                    <div>Gasto: {formatCurrency(Number(r.total_gastos) || 0)}</div>
                    <div className={`font-semibold ${positive ? 'text-green-400' : 'text-red-400'}`}>Balance: {formatCurrency(balance)}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      </div>
    </div>
  )
}
