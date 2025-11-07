import { useEffect, useMemo, useState } from 'react'
import { supabase, safeQuery } from '../lib/supabase'
import UserBadge from '../components/UserBadge'
import LogoutButton from '../components/LogoutButton'
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
        () => supabase
          .from('txns_summary_view')
          .select('*')
          .order('vertical', { ascending: true }),
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
    <div className="min-h-screen">
      <OfflineBanner />
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-semibold">Dashboard</h1>
          <div className="flex items-center gap-3">
            <a href="/" className="rounded-lg px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200">Home</a>
            <button
              onClick={load}
              className="rounded-lg px-3 py-1.5 text-sm bg-green-600 text-white hover:bg-green-700 disabled:opacity-60"
              disabled={loading}
            >{loading ? 'Loading…' : 'Reload'}</button>
            <UserBadge />
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Optional global summary */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="text-xs text-gray-500">Total Ingresos</div>
            <div className="text-lg font-semibold">{formatCurrency(totals.ingresos)}</div>
          </div>
          <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="text-xs text-gray-500">Total Gastos</div>
            <div className="text-lg font-semibold">{formatCurrency(totals.gastos)}</div>
          </div>
          <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="text-xs text-gray-500">Balance</div>
            <div className={`text-lg font-semibold ${totals.balance >= 0 ? 'text-green-700' : 'text-red-600'}`}>{formatCurrency(totals.balance)}</div>
          </div>
        </section>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* List of verticals */}
        <section>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {loading && rows.length === 0 && (
              <div className="col-span-full"><Loader /></div>
            )}
            {!loading && rows.length === 0 && !error && (
              <div className="col-span-full text-sm text-gray-500">No data.</div>
            )}
            {rows.map((r) => {
              const balance = (r.balance ?? (Number(r.total_ingresos) || 0) - (Number(r.total_gastos) || 0))
              const positive = balance >= 0
              return (
                <div key={r.vertical} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                  <div className="text-base font-medium mb-2">{r.vertical}</div>
                  <div className="space-y-1 text-sm">
                    <div>Ingreso: {formatCurrency(Number(r.total_ingresos) || 0)}</div>
                    <div>Gasto: {formatCurrency(Number(r.total_gastos) || 0)}</div>
                    <div className={`font-semibold ${positive ? 'text-green-700' : 'text-red-600'}`}>Balance: {formatCurrency(balance)}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      </main>
    </div>
  )
}
