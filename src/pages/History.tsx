import { useEffect, useMemo, useState } from 'react'
import { OfflineBanner } from '../components/OfflineBanner'
import { db, queueDelete, queueUpdate } from '../lib/db'
import type { Txn, Currency } from '../types'
import { fullSync } from '../lib/sync'
import { useToast } from '../components/ToastProvider'
import { normalizeTxn } from '../lib/transactions'

export default function History() {
  const { show } = useToast()
  const [transactions, setTransactions] = useState<Txn[]>([])
  const [verticals, setVerticals] = useState<{ id: string; name: string }[]>([])
  const [categories, setCategories] = useState<{ id: string; name: string; vertical_id?: string | null }[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Txn | null>(null)
  const [deleting, setDeleting] = useState<Txn | null>(null)
  
  // Filters and search
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all')
  const [filterCurrency, setFilterCurrency] = useState<'all' | Currency>('all')
  const [sortBy, setSortBy] = useState<'date' | 'amount'>('date')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 20

  useEffect(() => {
    loadData()
  }, [])

  function detectSettlement(desc: string | undefined | null, categoryIdValue: string | null | undefined): boolean {
    const descriptionMatch = /settlement/i.test(desc ?? '')
    if (descriptionMatch) return true
    if (!categoryIdValue) return false
    const category = categories.find((c) => c.id === categoryIdValue)
    return category ? /settlement/i.test(category.name ?? '') : false
  }

  async function loadData() {
    setLoading(true)
    try {
      const [txns, v, c] = await Promise.all([
        db.txns
          .orderBy('updated_at')
          .reverse()
          .filter((t) => !t.deleted && !(t as any).deleted_at)
          .toArray(),
        db.verticals.toArray(),
        db.categories.toArray(),
      ])
      setTransactions(txns.map((txn) => normalizeTxn(txn)))
      setVerticals(v)
      setCategories(c)
    } finally {
      setLoading(false)
    }
  }

  // Filtered and sorted transactions
  const filteredTransactions = useMemo(() => {
    let result = [...transactions]

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      result = result.filter(
        (t) =>
          t.description?.toLowerCase().includes(query) ||
          t.amount.toString().includes(query) ||
          t.date?.includes(query)
      )
    }

    // Type filter
    if (filterType !== 'all') {
      result = result.filter((t) => t.type === filterType)
    }

    // Currency filter
    if (filterCurrency !== 'all') {
      result = result.filter((t) => t.currency === filterCurrency)
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0
      if (sortBy === 'date') {
        comparison = (a.date + a.time).localeCompare(b.date + b.time)
      } else {
        comparison = a.amount - b.amount
      }
      return sortOrder === 'asc' ? comparison : -comparison
    })

    return result
  }, [transactions, searchQuery, filterType, filterCurrency, sortBy, sortOrder])

  // Paginated transactions
  const paginatedTransactions = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage
    return filteredTransactions.slice(startIndex, startIndex + itemsPerPage)
  }, [filteredTransactions, currentPage])

  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage)

  async function handleEdit() {
    if (!editing) return
    try {
      const isSettlement = detectSettlement(editing.description, editing.category_id ?? null)
      await queueUpdate('txns', editing.id, {
        amount: editing.amount,
        type: editing.type,
        currency: editing.currency,
        vertical_id: editing.vertical_id ?? null,
        category_id: editing.category_id ?? null,
        description: editing.description ?? undefined,
        date: editing.date,
        time: editing.time,
        is_settlement: isSettlement,
      } as any)
      setEditing(null)
      await loadData()
      if (navigator.onLine) await fullSync()
      show({ variant: 'success', title: 'Movimiento actualizado' })
    } catch (err: any) {
      show({ variant: 'error', title: 'Error al actualizar', description: String(err?.message || err) })
    }
  }

  async function handleDelete() {
    if (!deleting) return
    try {
      await queueDelete('txns', deleting.id)
      setDeleting(null)
      await loadData()
      if (navigator.onLine) await fullSync()
      show({ variant: 'success', title: 'Movimiento eliminado' })
    } catch (err: any) {
      show({ variant: 'error', title: 'No se pudo eliminar', description: String(err?.message || err) })
    }
  }

  function getCategoryName(id?: string | null) {
    if (!id) return 'Sin categoría'
    return categories.find((c) => c.id === id)?.name || id
  }

  function getVerticalName(id?: string | null) {
    if (!id) return 'Sin vertical'
    return verticals.find((v) => v.id === id)?.name || id
  }

  const filteredCategories = useMemo(
    () => categories.filter((c) => !editing?.vertical_id || c.vertical_id === editing.vertical_id || c.vertical_id == null),
    [categories, editing?.vertical_id]
  )

  return (
    <div>
      <OfflineBanner />
      <div className="space-y-6">
        {/* Header */}
        <section className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-[rgb(var(--fg))]">Historial completo</h1>
            <p className="text-sm text-[rgb(var(--muted))]">
              {filteredTransactions.length} transacciones encontradas
            </p>
          </div>
          <button
            onClick={loadData}
            className="btn-ghost text-sm"
            disabled={loading}
          >
            {loading ? 'Cargando...' : 'Recargar'}
          </button>
        </section>

        {/* Filters and Search */}
        <section className="card p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Search */}
            <input
              type="text"
              placeholder="Buscar..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setCurrentPage(1)
              }}
              className="input"
            />

            {/* Type filter */}
            <select
              value={filterType}
              onChange={(e) => {
                setFilterType(e.target.value as any)
                setCurrentPage(1)
              }}
              className="input"
            >
              <option value="all">Todos los tipos</option>
              <option value="income">Ingresos</option>
              <option value="expense">Gastos</option>
            </select>

            {/* Currency filter */}
            <select
              value={filterCurrency}
              onChange={(e) => {
                setFilterCurrency(e.target.value as any)
                setCurrentPage(1)
              }}
              className="input"
            >
              <option value="all">Todas las monedas</option>
              <option value="COP">COP</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>

            {/* Sort */}
            <select
              value={`${sortBy}-${sortOrder}`}
              onChange={(e) => {
                const [by, order] = e.target.value.split('-')
                setSortBy(by as any)
                setSortOrder(order as any)
              }}
              className="input"
            >
              <option value="date-desc">Más reciente primero</option>
              <option value="date-asc">Más antiguo primero</option>
              <option value="amount-desc">Mayor monto</option>
              <option value="amount-asc">Menor monto</option>
            </select>
          </div>
        </section>

        {/* Transaction List */}
        <section className="card overflow-hidden">
          {loading && transactions.length === 0 ? (
            <div className="p-12 text-center text-sm text-[rgb(var(--muted))]">Cargando...</div>
          ) : paginatedTransactions.length === 0 ? (
            <div className="p-12 text-center text-sm text-[rgb(var(--muted))]">
              No se encontraron transacciones
            </div>
          ) : (
            <div className="divide-y divide-[rgb(var(--border))]">
              {paginatedTransactions.map((txn) => (
                <div
                  key={txn.id}
                  className="p-4 hover:bg-[rgb(var(--card-hover))] transition flex items-center justify-between gap-4"
                >
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-base font-semibold ${
                          txn.type === 'expense' ? 'text-red-400' : 'text-green-400'
                        }`}
                      >
                        {txn.type === 'expense' ? '-' : '+'}
                        {txn.currency} {txn.amount.toFixed(2)}
                      </span>
                      <span className="text-xs text-[rgb(var(--muted))]">
                        {txn.date} {txn.time}
                      </span>
                    </div>
                    <div className="text-sm text-[rgb(var(--fg))]">
                      {txn.description || (txn.type === 'expense' ? 'Gasto' : 'Ingreso')}
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      {txn.vertical_id && (
                        <span className="badge bg-[rgb(var(--card-hover))] text-[rgb(var(--muted))]">
                          {getVerticalName(txn.vertical_id)}
                        </span>
                      )}
                      {txn.category_id && (
                        <span className="badge bg-[rgb(var(--card-hover))] text-[rgb(var(--muted))]">
                          {getCategoryName(txn.category_id)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => setEditing(normalizeTxn(txn))}
                      className="p-2 text-[rgb(var(--muted))] transition hover:text-[rgb(var(--fg))] hover:bg-[rgb(var(--card-hover))] rounded"
                      aria-label="Editar"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                        />
                      </svg>
                    </button>
                    <button
                      onClick={() => setDeleting(txn)}
                      className="p-2 text-red-400 transition hover:text-red-300 hover:bg-red-400/10 rounded"
                      aria-label="Eliminar"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Pagination */}
        {totalPages > 1 && (
          <section className="flex items-center justify-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="btn-muted disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Anterior
            </button>
            <span className="text-sm text-[rgb(var(--muted))]">
              Página {currentPage} de {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="btn-muted disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Siguiente
            </button>
          </section>
        )}
      </div>

      {/* Edit Modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-xl rounded-3xl bg-[rgb(var(--card))] p-6 shadow-xl border border-[rgb(var(--border))] max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-[rgb(var(--fg))] mb-4">Editar movimiento</h3>
            <div className="space-y-4">
              {/* Amount */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-[rgb(var(--muted))]">Monto</label>
                <input
                  type="number"
                  step="0.01"
                  value={editing.amount}
                  onChange={(e) => setEditing({ ...editing, amount: Number(e.target.value) })}
                  className="input"
                />
              </div>

              {/* Type */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-[rgb(var(--muted))]">Tipo</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditing({ ...editing, type: 'income' })}
                    className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition ${
                      editing.type === 'income'
                        ? 'bg-green-600 text-white shadow-lg shadow-green-600/20'
                        : 'bg-[rgb(var(--input-bg))] text-[rgb(var(--muted))] hover:text-green-600 border border-[rgb(var(--border))]'
                    }`}
                  >
                    Ingreso
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing({ ...editing, type: 'expense' })}
                    className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition ${
                      editing.type === 'expense'
                        ? 'bg-red-600 text-white shadow-lg shadow-red-600/20'
                        : 'bg-[rgb(var(--input-bg))] text-[rgb(var(--muted))] hover:text-red-600 border border-[rgb(var(--border))]'
                    }`}
                  >
                    Gasto
                  </button>
                </div>
              </div>

              {/* Currency */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-[rgb(var(--muted))]">Moneda</label>
                <select
                  value={editing.currency || 'COP'}
                  onChange={(e) => setEditing({ ...editing, currency: e.target.value as Currency })}
                  className="input"
                >
                  <option value="COP">COP - Peso colombiano</option>
                  <option value="USD">USD - Dólar</option>
                  <option value="EUR">EUR - Euro</option>
                </select>
              </div>

              {/* Date */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-[rgb(var(--muted))]">Fecha</label>
                <input
                  type="date"
                  value={editing.date || ''}
                  onChange={(e) => setEditing({ ...editing, date: e.target.value })}
                  className="input"
                />
              </div>

              {/* Time */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-[rgb(var(--muted))]">Hora</label>
                <input
                  type="time"
                  value={editing.time || ''}
                  onChange={(e) => setEditing({ ...editing, time: e.target.value })}
                  className="input"
                />
              </div>

              {/* Vertical */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-[rgb(var(--muted))]">Vertical</label>
                <select
                  value={editing.vertical_id || ''}
                  onChange={(e) => setEditing({ ...editing, vertical_id: e.target.value || null, category_id: null })}
                  className="input"
                >
                  <option value="">Seleccioná una opción</option>
                  {verticals
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                </select>
              </div>

              {/* Category */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-[rgb(var(--muted))]">Categoría</label>
                <select
                  value={editing.category_id || ''}
                  onChange={(e) => setEditing({ ...editing, category_id: e.target.value || null })}
                  className="input"
                >
                  <option value="">Seleccioná una opción</option>
                  {filteredCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Description */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-[rgb(var(--muted))]">Descripción</label>
                <input
                  type="text"
                  value={editing.description || ''}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  className="input"
                  placeholder="Opcional"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setEditing(null)} className="btn-muted">
                Cancelar
              </button>
              <button onClick={handleEdit} className="btn-primary">
                Guardar cambios
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {deleting && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md rounded-3xl bg-[rgb(var(--card))] p-6 shadow-xl border border-[rgb(var(--border))]">
            <h3 className="text-base font-semibold text-[rgb(var(--fg))]">Eliminar movimiento</h3>
            <p className="mt-2 text-sm text-[rgb(var(--muted))]">
              ¿Seguro que querés eliminar este movimiento? Esta acción no se puede deshacer.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setDeleting(null)} className="btn-muted">
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-lg hover:bg-red-700"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
