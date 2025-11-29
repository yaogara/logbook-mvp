import { useEffect, useMemo, useState } from 'react'
import { supabase, safeQuery } from '../lib/supabase'
import Loader from '../components/Loader'
import { OfflineBanner } from '../components/OfflineBanner'
import EditRetreatDialog from '../components/EditRetreatDialog'
import { LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { formatCOP } from '../lib/money'

type Txn = {
  id: string
  amount: number
  type: string
  currency: string
  vertical_id?: string | null
  category_id?: string | null
  contributor_id?: string | null
  description?: string
  occurred_on?: string
  is_settlement?: boolean
  retreat_id?: string | null
  date?: string
  time?: string
}

type Retreat = {
  id: string
  name: string
  start_date: string
  end_date?: string | null
  default_vertical_id?: string | null
  default_category_id?: string | null
  notes?: string | null
  created_at: string
  updated_at: string
}

type RetreatWithTransactions = Retreat & {
  transactions: Txn[]
  total: number
  income: number
  expense: number
}

type CurrencyTotals = {
  currency: string
  ingresos: number
  gastos: number
  balance: number
}

type Contributor = {
  id: string
  auth_user_id?: string | null
  email: string
  name?: string | null
  created_at: string
  updated_at: string
}

type Vertical = {
  id: string
  name: string
  updated_at: string
}

type Category = {
  id: string
  vertical_id?: string | null
  name: string
  updated_at: string
}

function formatAmount(value: number, currency: string) {
  return `${currency} ${formatCOP(value)}`
}

export default function Dashboard() {
  const [txns, setTxns] = useState<Txn[]>([])
  const [retreats, setRetreats] = useState<RetreatWithTransactions[]>([])
  const [contributors, setContributors] = useState<Contributor[]>([])
  const [verticals, setVerticals] = useState<Vertical[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'summary' | 'retreats'>('summary')
  const [editingRetreat, setEditingRetreat] = useState<RetreatWithTransactions | null>(null)
  const [submittingEdit, setSubmittingEdit] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      // Load transactions
      const { data: txnData, error: txnError } = await safeQuery<Txn[]>(
        () =>
          supabase
            .from('txns')
            .select('*')
            .is('deleted_at', null)
            .order('occurred_on', { ascending: false })
            .then((r) => r),
        'load txns',
      )
      if (txnError) throw txnError
      
      // Load retreats
      const { data: retreatsData, error: retreatsError } = await safeQuery<Retreat[]>(
        () =>
          supabase
            .from('retreats')
            .select('*')
            .order('start_date', { ascending: false })
            .then((r) => r),
        'load retreats',
      )
      if (retreatsError) throw retreatsError

      // Load contributors
      const { data: contributorsData, error: contributorsError } = await safeQuery<Contributor[]>(
        () =>
          supabase
            .from('contributors')
            .select('*')
            .order('created_at', { ascending: false })
            .then((r) => r),
        'load contributors',
      )
      if (contributorsError) throw contributorsError

      // Load verticals
      const { data: verticalsData, error: verticalsError } = await safeQuery<Vertical[]>(
        () =>
          supabase
            .from('verticals')
            .select('*')
            .order('name', { ascending: true })
            .then((r) => r),
        'load verticals',
      )
      if (verticalsError) throw verticalsError

      // Load categories
      const { data: categoriesData, error: categoriesError } = await safeQuery<Category[]>(
        () =>
          supabase
            .from('categories')
            .select('*')
            .order('name', { ascending: true })
            .then((r) => r),
        'load categories',
      )
      if (categoriesError) throw categoriesError

      // Process transactions
      const normalizedTxns = (txnData ?? []).map((txn) => ({
        ...txn,
        is_settlement: Boolean((txn as any).is_settlement),
      })) as Txn[]
      setTxns(normalizedTxns)

      // Process retreats with their transactions
      const retreatsWithTxns = (retreatsData ?? []).map((retreat) => {
        const retreatTxns = normalizedTxns.filter(txn => txn.retreat_id === retreat.id)
        const income = retreatTxns
          .filter(txn => txn.type === 'income' || txn.type === 'Ingreso')
          .reduce((sum, txn) => sum + (Number(txn.amount) || 0), 0)
        const expense = retreatTxns
          .filter(txn => txn.type === 'expense' || txn.type === 'Gasto')
          .reduce((sum, txn) => sum + (Number(txn.amount) || 0), 0)
        
        return {
          ...retreat,
          transactions: retreatTxns,
          total: income - expense,
          income,
          expense,
        }
      }).filter(retreat => retreat.transactions.length > 0 || retreat.income > 0 || retreat.expense > 0) // Filter out empty retreats
      
      setRetreats(retreatsWithTxns)
      setContributors(contributorsData ?? [])
      setVerticals(verticalsData ?? [])
      setCategories(categoriesData ?? [])
    } catch (err: any) {
      console.error('Error loading data:', err)
      setError(err?.message || 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function handleEditRetreat(update: any) {
    if (!editingRetreat) return
    
    setSubmittingEdit(true)
    try {
      // This would need to be implemented to update the retreat and its transactions
      // For now, just close the dialog and reload data
      console.log('Updating retreat:', update)
      await load()
      setEditingRetreat(null)
    } catch (err: any) {
      console.error('Error updating retreat:', err)
      setError(err?.message || 'Failed to update retreat')
    } finally {
      setSubmittingEdit(false)
    }
  }

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

  const renderRetreatsTab = () => (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Retiros</h2>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {retreats.map((retreat) => (
          <div key={retreat.id} className="rounded-lg border border-gray-200 p-4 shadow-sm dark:border-gray-700">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium">{retreat.name}</h3>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-300">
                  {new Date(retreat.start_date).toLocaleDateString()}
                </span>
                <button
                  onClick={() => setEditingRetreat(retreat)}
                  className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                  title="Editar retiro"
                >
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400">Ingresos:</span>
                <span className="font-medium text-green-600">{formatCOP(retreat.income)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400">Gastos:</span>
                <span className="font-medium text-red-600">-{formatCOP(retreat.expense)}</span>
              </div>
              <div className="flex justify-between border-t border-gray-200 pt-2 dark:border-gray-700">
                <span className="font-medium">Total:</span>
                <span className={`font-bold ${retreat.total >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {retreat.total >= 0 ? '+' : ''}{formatCOP(Math.abs(retreat.total))}
                </span>
              </div>
            </div>
            <div className="mt-4">
              <h4 className="mb-2 text-sm font-medium">Transacciones ({retreat.transactions.length})</h4>
              <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
                {retreat.transactions.length > 0 ? (
                  retreat.transactions.map((txn) => (
                    <div key={txn.id} className="flex items-center justify-between text-sm">
                      <span className="truncate">{txn.description || 'Sin descripción'}</span>
                      <span className={`ml-2 whitespace-nowrap ${(txn.type === 'income' || txn.type === 'Ingreso') ? 'text-green-600' : 'text-red-600'}`}>
                        {(txn.type === 'income' || txn.type === 'Ingreso') ? '+' : '-'}{formatCOP(txn.amount)}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400">No hay transacciones</p>
                )}
              </div>
            </div>
          </div>
        ))}
        {retreats.length === 0 && (
          <div className="col-span-full py-12 text-center">
            <p className="text-gray-500 dark:text-gray-400">No hay retiros registrados</p>
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div className="space-y-8 p-4 md:p-6">
      <OfflineBanner />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="flex space-x-2 rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
          <button
            onClick={() => setActiveTab('summary')}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'summary'
                ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            Resumen
          </button>
          <button
            onClick={() => setActiveTab('retreats')}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'retreats'
                ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            Retiros
          </button>
        </div>
      </div>
      {activeTab === 'summary' ? (
        <div>
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
      ) : (
        renderRetreatsTab()
      )}
      
      {editingRetreat && (
        <EditRetreatDialog
          open={!!editingRetreat}
          onClose={() => setEditingRetreat(null)}
          onSubmit={handleEditRetreat}
          submitting={submittingEdit}
          contributors={contributors}
          verticals={verticals}
          categories={categories}
          retreat={{
            id: editingRetreat.id,
            name: editingRetreat.name,
            start_date: editingRetreat.start_date,
            end_date: editingRetreat.end_date,
            default_vertical_id: editingRetreat.default_vertical_id,
            default_category_id: editingRetreat.default_category_id,
            description: editingRetreat.notes,
          }}
          transactions={editingRetreat.transactions.map(txn => ({
            id: txn.id,
            amount: txn.amount,
            description: txn.description || '',
            contributorId: txn.contributor_id || null,
            verticalId: txn.vertical_id || null,
            categoryId: txn.category_id || null,
            type: txn.type === 'income' || txn.type === 'Ingreso' ? 'income' : 'expense',
            isSettlement: txn.is_settlement || false,
            currency: txn.currency as 'COP' | 'USD' | 'EUR',
          }))}
        />
      )}
    </div>
  )
}
