import { useEffect, useMemo, useState } from 'react'
import { supabase, safeQuery } from '../lib/supabase'
import Loader from '../components/Loader'
import { OfflineBanner } from '../components/OfflineBanner'
import { LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { formatCOP } from '../lib/money'

type Txn = {
  id: string
  amount: number
  type: string
  currency: string
  vertical_id?: string | null
  category_id?: string | null
  description?: string
  occurred_on?: string
  is_settlement?: boolean
}

type CurrencyTotals = {
  currency: string
  ingresos: number
  gastos: number
  balance: number
}

function formatAmount(value: number, currency: string) {
  return `${currency} ${formatCOP(value)}`
}

export default function Dashboard() {
  const [txns, setTxns] = useState<Txn[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const { data, error } = await safeQuery<Txn[]>(
        () =>
          supabase
            .from('txns')
            .select('*')
            .is('deleted_at', null)
            .order('occurred_on', { ascending: false })
            .then((r) => r),
        'load txns',
      )
      if (error) throw error
      const normalized = (data ?? []).map((txn) => ({
        ...txn,
        is_settlement: Boolean((txn as any).is_settlement),
      })) as Txn[]
      setTxns(normalized)
    } catch (err: any) {
      setError(err?.message || 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const nonSettlementTxns = useMemo(() => txns.filter((txn) => !txn.is_settlement), [txns])

  const currencyTotals = useMemo(() => {
    const grouped: Record<string, CurrencyTotals> = {}
    
    nonSettlementTxns.forEach(txn => {
      const currency = txn.currency || 'COP'
      if (!grouped[currency]) {
        grouped[currency] = { currency, ingresos: 0, gastos: 0, balance: 0 }
      }
      
      const amount = Number(txn.amount) || 0
      // Normalize type to handle both formats: 'income'/'expense' and 'Ingreso'/'Gasto'
      const normalizedType = txn.type.toLowerCase()
      if (normalizedType === 'ingreso' || normalizedType === 'income') {
        grouped[currency].ingresos += amount
      } else if (normalizedType === 'gasto' || normalizedType === 'expense') {
        grouped[currency].gastos += amount
      }
    })
    
    // Calculate balances
    Object.values(grouped).forEach(totals => {
      totals.balance = totals.ingresos - totals.gastos
    })
    
    // Sort currencies: COP first, then alphabetically
    return Object.values(grouped).sort((a, b) => {
      if (a.currency === 'COP') return -1
      if (b.currency === 'COP') return 1
      return a.currency.localeCompare(b.currency)
    })
  }, [nonSettlementTxns])

  // Prepare data for spending over time chart
  const spendingOverTime = useMemo(() => {
    const grouped: Record<string, { date: string; ingresos: number; gastos: number }> = {}
    
    nonSettlementTxns.forEach(txn => {
      // Extract date from occurred_on or use date field
      const date = txn.occurred_on ? new Date(txn.occurred_on).toISOString().slice(0, 10) : (txn as any).date
      if (!date) return
      
      if (!grouped[date]) {
        grouped[date] = { date, ingresos: 0, gastos: 0 }
      }
      
      const amount = Number(txn.amount) || 0
      const normalizedType = txn.type.toLowerCase()
      if (normalizedType === 'ingreso' || normalizedType === 'income') {
        grouped[date].ingresos += amount
      } else if (normalizedType === 'gasto' || normalizedType === 'expense') {
        grouped[date].gastos += amount
      }
    })
    
    return Object.values(grouped).sort((a, b) => a.date.localeCompare(b.date)).slice(-30) // Last 30 days
  }, [nonSettlementTxns])

  // Prepare data for category breakdown (COP only for simplicity)
  const categoryBreakdown = useMemo(() => {
    const grouped: Record<string, number> = {}
    
    nonSettlementTxns.forEach(txn => {
      if (txn.currency !== 'COP') return // Focus on main currency
      const normalizedType = txn.type.toLowerCase()
      if (normalizedType !== 'gasto' && normalizedType !== 'expense') return // Only expenses
      
      const category = txn.category_id || 'Sin categoría'
      const amount = Number(txn.amount) || 0
      grouped[category] = (grouped[category] || 0) + amount
    })
    
    return Object.entries(grouped)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5) // Top 5 categories
  }, [nonSettlementTxns])

  const COLORS = ['#CB6C3E', '#DF8A5C', '#948E78', '#5A645F', '#C8D7D0']

  return (
    <div>
      <OfflineBanner />
      <div className="space-y-6">
        {/* Currency-separated totals */}
        {currencyTotals.map(({ currency, ingresos, gastos, balance }) => (
          <section key={currency} className="space-y-3">
            <h3 className="text-sm font-semibold text-[rgb(var(--muted))] uppercase tracking-wider">{currency}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="card p-4">
                <div className="text-xs text-[rgb(var(--muted))]">Ingresos</div>
                <div className="text-lg font-semibold text-green-400">{formatAmount(ingresos, currency)}</div>
              </div>
              <div className="card p-4">
                <div className="text-xs text-[rgb(var(--muted))]">Gastos</div>
                <div className="text-lg font-semibold text-red-400">{formatAmount(gastos, currency)}</div>
              </div>
              <div className="card p-4">
                <div className="text-xs text-[rgb(var(--muted))]">Balance</div>
                <div className={`text-lg font-semibold ${balance >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {formatAmount(balance, currency)}
                </div>
              </div>
            </div>
          </section>
        ))}

        {/* Spending Over Time Chart */}
        {spendingOverTime.length > 0 && (
          <section className="card p-6 space-y-4">
            <h3 className="text-base font-semibold text-[rgb(var(--fg))]">Tendencia de gastos (últimos 30 días)</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={spendingOverTime}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" />
                <XAxis dataKey="date" stroke="rgb(var(--muted))" />
                <YAxis stroke="rgb(var(--muted))" />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'rgb(var(--card))', 
                    border: '1px solid rgb(var(--border))',
                    borderRadius: '8px'
                  }} 
                />
                <Legend />
                <Line type="monotone" dataKey="ingresos" stroke="#10b981" strokeWidth={2} name="Ingresos" />
                <Line type="monotone" dataKey="gastos" stroke="#ef4444" strokeWidth={2} name="Gastos" />
              </LineChart>
            </ResponsiveContainer>
          </section>
        )}

        {/* Category Breakdown Pie Chart */}
        {categoryBreakdown.length > 0 && (
          <section className="card p-6 space-y-4">
            <h3 className="text-base font-semibold text-[rgb(var(--fg))]">Top 5 categorías de gastos (COP)</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={categoryBreakdown}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {categoryBreakdown.map((_entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'rgb(var(--card))', 
                    border: '1px solid rgb(var(--border))',
                    borderRadius: '8px'
                  }}
                  formatter={(value: number) => formatAmount(value, 'COP')}
                />
              </PieChart>
            </ResponsiveContainer>
          </section>
        )}

        {error && (
          <div className="rounded-lg border border-red-400/20 bg-red-500/10 text-red-400 px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* Reload button and status */}
        <section className="flex justify-between items-center">
          <div className="text-sm text-[rgb(var(--muted))]">
            {loading ? 'Cargando...' : `${txns.length} transacciones`}
          </div>
          <button onClick={load} disabled={loading} className="btn-primary disabled:opacity-60">
            {loading ? 'Loading…' : 'Reload'}
          </button>
        </section>
        
        {loading && txns.length === 0 && (
          <div className="flex justify-center py-12"><Loader /></div>
        )}
        
        {!loading && txns.length === 0 && !error && (
          <div className="text-center text-sm text-[rgb(var(--muted))] py-12">No hay transacciones todavía.</div>
        )}
      </div>
    </div>
  )
}
