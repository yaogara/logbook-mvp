import { useEffect, useMemo, useState } from 'react'
import { supabase, safeQuery } from '../lib/supabase'
import Loader from '../components/Loader'
import { OfflineBanner } from '../components/OfflineBanner'
import EditRetreatDialog from '../components/EditRetreatDialog'
import { formatCOP } from '../lib/money'
import { ensureFxRates, convertToCOP, type FxSnapshot } from '../lib/fx'
import EggStats from './EggStats'

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
  const [fxSnapshot, setFxSnapshot] = useState<FxSnapshot | null>(null)
  const [displayCurrency, setDisplayCurrency] = useState<'COP' | 'USD'>('COP')
  const [timeFilter, setTimeFilter] = useState<'all' | 'week' | 'month' | 'year'>('all')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'summary' | 'retreats' | 'eggStats'>('summary')
  const [editingRetreat, setEditingRetreat] = useState<RetreatWithTransactions | null>(null)
  const [submittingEdit, setSubmittingEdit] = useState(false)
  const [expandedRetreats, setExpandedRetreats] = useState<Set<string>>(new Set())

  async function load() {
    setLoading(true)
    setError(null)
    try {
      // Load FX rates first
      const fxData = await ensureFxRates()
      setFxSnapshot(fxData)
      
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

  // Filter transactions by time period
  const filteredTxns = useMemo(() => {
    if (timeFilter === 'all') return nonSettlementTxns
    
    const now = new Date()
    const filterDate = new Date()
    
    switch (timeFilter) {
      case 'week':
        filterDate.setDate(now.getDate() - 7)
        break
      case 'month':
        filterDate.setMonth(now.getMonth() - 1)
        break
      case 'year':
        filterDate.setFullYear(now.getFullYear() - 1)
        break
    }
    
    return nonSettlementTxns.filter(txn => {
      const txnDate = txn.occurred_on ? new Date(txn.occurred_on) : new Date(txn.date || '')
      return txnDate >= filterDate
    })
  }, [nonSettlementTxns, timeFilter])

  // Calculate totals with FX conversions
  const totalsWithFx = useMemo(() => {
    if (!fxSnapshot) return null
    
    let totalIncomeCOP = 0
    let totalExpenseCOP = 0
    let totalIncomeUSD = 0
    let totalExpenseUSD = 0
    
    filteredTxns.forEach(txn => {
      const amount = Number(txn.amount) || 0
      const normalizedType = txn.type.toLowerCase()
      
      if (normalizedType === 'ingreso' || normalizedType === 'income') {
        totalIncomeCOP += convertToCOP(amount, txn.currency as any, fxSnapshot.rates)
        totalIncomeUSD += convertToCOP(amount, txn.currency as any, fxSnapshot.rates) / fxSnapshot.rates.USD
      } else if (normalizedType === 'gasto' || normalizedType === 'expense') {
        totalExpenseCOP += convertToCOP(amount, txn.currency as any, fxSnapshot.rates)
        totalExpenseUSD += convertToCOP(amount, txn.currency as any, fxSnapshot.rates) / fxSnapshot.rates.USD
      }
    })
    
    return {
      cop: {
        income: totalIncomeCOP,
        expense: totalExpenseCOP,
        balance: totalIncomeCOP - totalExpenseCOP,
      },
      usd: {
        income: totalIncomeUSD,
        expense: totalExpenseUSD,
        balance: totalIncomeUSD - totalExpenseUSD,
      },
      lastUpdated: fxSnapshot.fetchedAt
    }
  }, [filteredTxns, fxSnapshot])

  const currencyTotals = useMemo(() => {
    const grouped: Record<string, CurrencyTotals> = {}
    
    filteredTxns.forEach(txn => {
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
  }, [filteredTxns])

  const toggleRetreatExpanded = (retreatId: string) => {
    setExpandedRetreats(prev => {
      const newSet = new Set(prev)
      if (newSet.has(retreatId)) {
        newSet.delete(retreatId)
      } else {
        newSet.add(retreatId)
      }
      return newSet
    })
  }

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
                  className="rounded-full border border-transparent p-1.5 text-[rgb(var(--muted))] transition hover:border-blue-500/20 hover:text-blue-400"
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
              <div 
                className="flex items-center justify-between cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 rounded p-2 -m-2 transition-colors"
                onClick={() => toggleRetreatExpanded(retreat.id)}
              >
                <h4 className="text-sm font-medium">Transacciones ({retreat.transactions.length})</h4>
                <svg 
                  className={`h-4 w-4 text-[rgb(var(--muted))] transition-transform ${
                    expandedRetreats.has(retreat.id) ? 'rotate-180' : ''
                  }`} 
                  viewBox="0 0 20 20" 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth="2"
                >
                  <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              {expandedRetreats.has(retreat.id) && (
                <div className="space-y-2 max-h-40 overflow-y-auto pr-2 mt-2">
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
              )}
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
        <div className="flex items-center gap-3">
          <select
            value={timeFilter}
            onChange={(e) => setTimeFilter(e.target.value as any)}
            className="rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--input-bg))] px-3 py-2 text-sm text-[rgb(var(--fg))] shadow-sm"
          >
            <option value="all">Todo</option>
            <option value="week">Semana</option>
            <option value="month">Mes</option>
            <option value="year">Año</option>
          </select>
          <select
            value={activeTab}
            onChange={(e) => setActiveTab(e.target.value as any)}
            className="rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--input-bg))] px-3 py-2 text-sm text-[rgb(var(--fg))] shadow-sm"
          >
            <option value="summary">Resumen</option>
            <option value="retreats">Retiros</option>
            <option value="eggStats">Estadísticas de Huevos</option>
          </select>
        </div>
      </div>
      {activeTab === 'summary' ? (
        <div>
          {/* FX Totals Section */}
          {totalsWithFx && (
            <section className="card p-6 space-y-4 mb-8">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-[rgb(var(--fg))]">
                  Totales (conversión FX)
                  {timeFilter !== 'all' && (
                    <span className="text-sm font-normal text-[rgb(var(--muted))] ml-2">
                      - {timeFilter === 'week' ? 'Última semana' : timeFilter === 'month' ? 'Último mes' : 'Último año'}
                    </span>
                  )}
                </h3>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-[rgb(var(--muted))]">
                    Actualizado: {new Date(totalsWithFx.lastUpdated).toLocaleDateString()}
                  </span>
                  <div className="flex rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
                    <button
                      onClick={() => setDisplayCurrency('COP')}
                      className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                        displayCurrency === 'COP'
                          ? 'bg-yellow-400 text-yellow-900 shadow-sm dark:bg-yellow-600 dark:text-yellow-100'
                          : 'text-gray-500 hover:text-yellow-600 hover:bg-yellow-50 dark:text-gray-400 dark:hover:text-yellow-400'
                      }`}
                    >
                      COP
                    </button>
                    <button
                      onClick={() => setDisplayCurrency('USD')}
                      className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                        displayCurrency === 'USD'
                          ? 'bg-blue-500 text-white shadow-sm dark:bg-blue-600'
                          : 'text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:text-gray-400 dark:hover:text-blue-400'
                      }`}
                    >
                      USD
                    </button>
                  </div>
                </div>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 justify-center">
                <div className="text-center flex-1">
                  <div className="text-xs text-[rgb(var(--muted))] mb-1">Ingresos</div>
                  <div className="text-lg sm:text-xl font-semibold text-green-400 truncate">
                    {displayCurrency === 'COP' 
                      ? formatCOP(totalsWithFx.cop.income)
                      : `$${totalsWithFx.usd.income.toFixed(2)}`
                    }
                  </div>
                  <div className="text-xs text-[rgb(var(--muted))] mt-1">
                    {displayCurrency === 'COP' 
                      ? `≈ $${(totalsWithFx.cop.income / fxSnapshot!.rates.USD).toFixed(2)} USD`
                      : `≈ ${formatCOP(totalsWithFx.usd.income * fxSnapshot!.rates.USD)} COP`
                    }
                  </div>
                </div>
                <div className="text-center flex-1">
                  <div className="text-xs text-[rgb(var(--muted))] mb-1">Gastos</div>
                  <div className="text-lg sm:text-xl font-semibold text-red-400 truncate">
                    {displayCurrency === 'COP' 
                      ? formatCOP(totalsWithFx.cop.expense)
                      : `$${totalsWithFx.usd.expense.toFixed(2)}`
                    }
                  </div>
                  <div className="text-xs text-[rgb(var(--muted))] mt-1">
                    {displayCurrency === 'COP' 
                      ? `≈ $${(totalsWithFx.cop.expense / fxSnapshot!.rates.USD).toFixed(2)} USD`
                      : `≈ ${formatCOP(totalsWithFx.usd.expense * fxSnapshot!.rates.USD)} COP`
                    }
                  </div>
                </div>
                <div className="text-center flex-1">
                  <div className="text-xs text-[rgb(var(--muted))] mb-1">Balance</div>
                  <div className={`text-lg sm:text-xl font-semibold truncate ${(displayCurrency === 'COP' ? totalsWithFx.cop.balance : totalsWithFx.usd.balance) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {displayCurrency === 'COP' 
                      ? formatCOP(Math.abs(totalsWithFx.cop.balance))
                      : `$${Math.abs(totalsWithFx.usd.balance).toFixed(2)}`
                    }
                  </div>
                  <div className="text-xs text-[rgb(var(--muted))] mt-1">
                    {displayCurrency === 'COP' 
                      ? `≈ $${(Math.abs(totalsWithFx.cop.balance) / fxSnapshot!.rates.USD).toFixed(2)} USD`
                      : `≈ ${formatCOP(Math.abs(totalsWithFx.usd.balance) * fxSnapshot!.rates.USD)} COP`
                    }
                  </div>
                </div>
              </div>
              
              <div className="text-xs text-[rgb(var(--muted))] text-center">
                Tasa: 1 USD = {formatCOP(fxSnapshot!.rates.USD)} 
                {fxSnapshot!.rates.USD !== 4000 && ` (vs ${formatCOP(4000)} base)`}
              </div>
            </section>
          )}
          
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
          {error && (
            <div className="rounded-lg border border-red-400/20 bg-red-500/10 text-red-400 px-4 py-3 text-sm">
              {error}
            </div>
          )}
          {/* Reload button and status */}
          <section className="flex justify-between items-center">
            <div className="text-sm text-[rgb(var(--muted))]">
              {loading ? 'Cargando...' : (
                <span>
                  {filteredTxns.length} transacciones
                  {timeFilter !== 'all' && ` (${timeFilter === 'week' ? 'última semana' : timeFilter === 'month' ? 'último mes' : 'último año'})`}
                  {timeFilter !== 'all' && ` de ${txns.length} totales`}
                </span>
              )}
            </div>
            <button onClick={load} disabled={loading} className="btn-primary disabled:opacity-60">
              {loading ? 'Loading…' : 'Reload'}
            </button>
          </section>
          {loading && filteredTxns.length === 0 && (
            <div className="flex justify-center py-12"><Loader /></div>
          )}
          {!loading && filteredTxns.length === 0 && !error && (
            <div className="text-center text-sm text-[rgb(var(--muted))] py-12">
              {timeFilter !== 'all' ? `No hay transacciones en el período seleccionado.` : 'No hay transacciones todavía.'}
            </div>
          )}
        </div>
      ) : activeTab === 'retreats' ? (
        renderRetreatsTab()
      ) : activeTab === 'eggStats' ? (
        <EggStats />
      ) : null}
      
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
