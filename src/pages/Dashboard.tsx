import { useEffect, useMemo, useState } from 'react'
import { supabase, safeQuery } from '../lib/supabase'
import Loader from '../components/Loader'
import { OfflineBanner } from '../components/OfflineBanner'

type Txn = {
  id: string
  amount: number
  type: string
  currency: string
  vertical_id?: string | null
  category_id?: string | null
  description?: string
}

type CurrencyTotals = {
  currency: string
  ingresos: number
  gastos: number
  balance: number
}

function formatAmount(value: number, currency: string) {
  return `${currency} ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
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
      setTxns((data as Txn[]) ?? [])
    } catch (err: any) {
      setError(err?.message || 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const currencyTotals = useMemo(() => {
    const grouped: Record<string, CurrencyTotals> = {}
    
    txns.forEach(txn => {
      const currency = txn.currency || 'COP'
      if (!grouped[currency]) {
        grouped[currency] = { currency, ingresos: 0, gastos: 0, balance: 0 }
      }
      
      const amount = Number(txn.amount) || 0
      if (txn.type === 'Ingreso') {
        grouped[currency].ingresos += amount
      } else if (txn.type === 'Gasto') {
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
  }, [txns])

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
