import { useMemo, useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import Loader from '../components/Loader'
import { OfflineBanner } from '../components/OfflineBanner'
import { useToast } from '../components/ToastProvider'
import {
  useEggCollections,
  useEggOutflows,
} from '../hooks/useEggs'

function todayDate() {
  return new Date().toISOString().slice(0, 10)
}

function formatUtc(value?: string | null) {
  if (!value) return 'Sin fecha'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

const EGGS_PER_CARTON = 30

function getToday() {
  return new Date().toISOString().split('T')[0]
}

function splitDateTime(value?: string | null) {
  if (!value) return { date: getToday() }
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return { date: getToday() }
  const date = dt.toISOString().split('T')[0]
  return { date }
}

function formatDisplayDate(value?: string | null) {
  if (!value) return 'Sin fecha'
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return 'Sin fecha'
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(dt)
}

export default function Eggs() {
  const location = useLocation()
  const { show } = useToast()
  const { outflows, loading: loadingOutflows, error: outflowError, createOutflow, updateOutflow, deleteOutflow } = useEggOutflows()
  
  // Set active tab based on URL hash
  const hash = location.hash.replace('#', '')
  const [activeTab, setActiveTab] = useState<'production' | 'outflows'>(hash === 'production' ? 'production' : 'outflows')
  
  useEffect(() => {
    const newHash = location.hash.replace('#', '')
    if (newHash === 'production' || newHash === 'outflow') {
      setActiveTab(newHash === 'production' ? 'production' : 'outflows')
    }
  }, [location.hash])
  const {
    collections,
    loading: loadingCollections,
    error: collectionError,
    createCollection,
    deleteCollection,
    refresh: refreshCollections,
  } = useEggCollections()

  const [cartons, setCartons] = useState('')
  const [singles, setSingles] = useState('')
  const [notes, setNotes] = useState('')
  const [date, setDate] = useState(getToday())
  const [submitting, setSubmitting] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const totalEggs = useMemo(() => {
    const cartonValue = Number(cartons) || 0
    const singleValue = Number(singles) || 0
    return cartonValue * EGGS_PER_CARTON + singleValue
  }, [cartons, singles])

  // Calculate current stock
  const currentStock = useMemo(() => {
    const totalCollected = collections.reduce((sum, collection) => sum + collection.total_eggs, 0)
    const totalOutflows = outflows.reduce((sum, outflow) => sum + outflow.total_eggs, 0)
    return totalCollected - totalOutflows
  }, [collections, outflows])

  // Calculate weekly stats
  const weeklyStats = useMemo(() => {
    const now = new Date()
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay())
    weekStart.setHours(0, 0, 0, 0)
    
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekStart.getDate() + 6)
    weekEnd.setHours(23, 59, 59, 999)
    
    const weekCollections = collections.filter(c => {
      const date = new Date(c.collected_at || c.created_at)
      return date >= weekStart && date <= weekEnd
    })
    
    const weekOutflows = outflows.filter(o => {
      const date = new Date(o.occurred_at || o.created_at)
      return date >= weekStart && date <= weekEnd
    })
    
    const weeklyProduction = weekCollections.reduce((sum, c) => sum + c.total_eggs, 0)
    const weeklyOutflow = weekOutflows.reduce((sum, o) => sum + o.total_eggs, 0)
    
    return { weeklyProduction, weeklyOutflow }
  }, [collections, outflows])

  function resetForm() {
    setCartons('')
    setSingles('')
    setNotes('')
    setDate(getToday())
    setEditingId(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (totalEggs <= 0) {
      show({
        title: 'Huevos requeridos',
        description: 'Agrega al menos un huevo para registrar la salida.',
        variant: 'error',
      })
      return
    }

    setSubmitting(true)
    try {
      if (editingId) {
        await updateOutflow(editingId, {
          total_eggs: totalEggs,
          notes: notes || null,
        })
        show({ title: 'Salida actualizada', variant: 'success' })
      } else {
        await createOutflow({
          total_eggs: totalEggs,
          notes: notes || null,
        })
        show({ title: 'Salida registrada', variant: 'success' })
      }
      resetForm()
    } catch (err: unknown) {
      const description = err instanceof Error ? err.message : undefined
      show({ title: 'Error al guardar', description, variant: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

  function startEdit(outflowId: string) {
    const row = outflows.find((item) => item.id === outflowId)
    if (!row) return
    const cartonsFromTotal = Math.floor(row.total_eggs / EGGS_PER_CARTON)
    const singlesFromTotal = row.total_eggs - cartonsFromTotal * EGGS_PER_CARTON
    const { date: d } = splitDateTime(row.occurred_at || row.created_at)
    setCartons(String(cartonsFromTotal))
    setSingles(String(singlesFromTotal))
    setNotes(row.notes ?? '')
    setDate(d)
    setEditingId(row.id)
  }

  async function confirmDeleteCollection() {
    if (!collectionToDelete) return
    setFeedback(null)
    try {
      await deleteCollection(collectionToDelete)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'No se pudo eliminar la recolección'
      setFeedback(message)
    } finally {
      setCollectionToDelete(null)
    }
  }

  async function confirmDeleteOutflow() {
    if (!outflowToDelete) return
    setFeedback(null)
    try {
      await deleteOutflow(outflowToDelete)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'No se pudo eliminar la salida'
      setFeedback(message)
    } finally {
      setOutflowToDelete(null)
    }
  }

  const [collectionForm, setCollectionForm] = useState({
    date: todayDate(),
    totalEggs: '',
    notes: '',
  })

  const [collectionSubmitting, setCollectionSubmitting] = useState(false)
  const [collectionToDelete, setCollectionToDelete] = useState<string | null>(null)
  const [outflowToDelete, setOutflowToDelete] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  const collectionTotalNumber = Number(collectionForm.totalEggs || 0)

  async function handleCreateCollection(e: React.FormEvent) {
    e.preventDefault()
    if (collectionSubmitting) return
    setFeedback(null)

    if (collectionTotalNumber <= 0) {
      setFeedback('La recolección debe registrar al menos un huevo')
      return
    }

    setCollectionSubmitting(true)
    try {
      await createCollection({
        total_eggs: collectionTotalNumber,
        notes: collectionForm.notes || null,
      })
      setCollectionForm({
        date: todayDate(),
        totalEggs: '',
        notes: '',
      })
      await refreshCollections()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'No se pudo registrar la recolección'
      setFeedback(message)
    } finally {
      setCollectionSubmitting(false)
    }
  }

  const collectionEmpty = !loadingCollections && collections.length === 0

  return (
    <div className="space-y-6">
      <OfflineBanner />

      {/* Stats Card */}
      <div className="card p-4 sm:p-6 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-blue-200 dark:border-blue-800">
        <div className="flex items-center justify-between gap-4">
          {/* Title Section */}
          <div className="flex-shrink-0">
            <p className="text-sm uppercase tracking-wide text-[rgb(var(--muted))]">Operaciones</p>
            <h1 className="text-xl sm:text-2xl font-bold text-[rgb(var(--fg))]">Huevos</h1>
          </div>
          
          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-2 sm:gap-6 flex-1 min-w-0">
            {/* Current Stock */}
            <div className="text-center">
              <h3 className="text-xs sm:text-sm font-medium text-[rgb(var(--muted))] mb-1">Stock</h3>
              <div className={`text-lg sm:text-2xl font-bold ${currentStock < 0 ? 'text-red-500' : 'text-blue-600'} transition-all duration-300 ease-in-out`}>
                <span className="hidden sm:inline-block animate-pulse">{currentStock}</span>
                <span className="sm:hidden">{currentStock}</span>
              </div>
              {currentStock < 0 && (
                <div className="mt-1 p-1 bg-red-100 dark:bg-red-900/20 rounded inline-block">
                  <span className="hidden sm:inline-block animate-pulse">
                    <p className="text-xs text-red-700 dark:text-red-300">⚠️ Negativo</p>
                  </span>
                  <span className="sm:hidden">
                    <p className="text-xs text-red-700 dark:text-red-300">⚠️</p>
                  </span>
                </div>
              )}
            </div>
            
            {/* Weekly Production */}
            <div className="text-center">
              <h3 className="text-xs sm:text-sm font-medium text-[rgb(var(--muted))] mb-1">Producción</h3>
              <div className="text-lg sm:text-2xl font-bold text-green-600 transition-all duration-300 ease-in-out">
                <span className="hidden sm:inline-block animate-pulse">{weeklyStats.weeklyProduction}</span>
                <span className="sm:hidden">{weeklyStats.weeklyProduction}</span>
              </div>
            </div>
            
            {/* Weekly Outflow */}
            <div className="text-center">
              <h3 className="text-xs sm:text-sm font-medium text-[rgb(var(--muted))] mb-1">Salidas</h3>
              <div className="text-lg sm:text-2xl font-bold text-orange-600 transition-all duration-300 ease-in-out">
                <span className="hidden sm:inline-block animate-pulse">{weeklyStats.weeklyOutflow}</span>
                <span className="sm:hidden">{weeklyStats.weeklyOutflow}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {outflowError && (
        <div className="card border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p className="font-semibold">No se pudo cargar las salidas</p>
          <p>{outflowError}</p>
        </div>
      )}

      {feedback && (
        <div className="rounded-xl border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {feedback}
        </div>
      )}

      {activeTab === 'production' ? (
        <section className="space-y-4">
          <div className="card space-y-4 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-[rgb(var(--fg))]">Registrar recolección</h2>
              </div>
              <button onClick={refreshCollections} className="btn-ghost text-sm" disabled={loadingCollections}>
                {loadingCollections ? 'Cargando…' : 'Actualizar'}
              </button>
            </div>

            {collectionError && (
              <div className="rounded-xl border border-yellow-500/50 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-100">
                {collectionError}
              </div>
            )}

            <form onSubmit={handleCreateCollection} className="space-y-8">
              <div className="flex flex-col items-center gap-3 text-center">
                <label className="text-sm font-medium uppercase tracking-[0.2em] text-[rgb(var(--muted))]">Registrar producción</label>
                <input
                  type="number"
                  min={0}
                  value={collectionForm.totalEggs}
                  onChange={(e) => setCollectionForm((prev) => ({ ...prev, totalEggs: e.target.value }))}
                  placeholder="0"
                  className="w-full md:w-2/3 lg:w-1/2 rounded-[2rem] border-2 border-[rgb(var(--border))] bg-[rgb(var(--input-bg))] px-8 py-6 text-center text-4xl font-semibold tracking-tight text-[rgb(var(--fg))] shadow-sm transition focus:border-[rgb(var(--primary))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--ring))]"
                  required
                />
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div>
                  <input
                    type="date"
                    value={collectionForm.date}
                    onChange={(e) => setCollectionForm((prev) => ({ ...prev, date: e.target.value }))}
                    onFocus={(e) => (e.target as HTMLInputElement).showPicker?.()}
                    onClick={(e) => (e.target as HTMLInputElement).showPicker?.()}
                    className="input w-full"
                    required
                  />
                </div>

                <div>
                  <input
                    type="text"
                    value={collectionForm.notes}
                    onChange={(e) => setCollectionForm((prev) => ({ ...prev, notes: e.target.value }))}
                    className="input w-full"
                    placeholder="Notas (opcional)"
                  />
                </div>
              </div>

              <div className="flex justify-center">
                <button
                  type="submit"
                  className="btn-primary min-w-[200px]"
                  disabled={collectionSubmitting || collectionTotalNumber <= 0}
                >
                  {collectionSubmitting ? 'Guardando…' : 'Guardar producción'}
                </button>
              </div>
            </form>
          </div>

          <div className="card divide-y divide-[rgb(var(--border))] p-0">
            <div className="flex items-center justify-between px-5 py-4">
              <h3 className="text-base font-semibold text-[rgb(var(--fg))]">Historial de recolecciones</h3>
              <span className="text-xs text-[rgb(var(--muted))]">{collections.length} registros</span>
            </div>

            {collectionEmpty ? (
              <div className="px-5 py-10 text-center text-sm text-[rgb(var(--muted))]">
                Aún no hay recolecciones registradas.
              </div>
            ) : (
              <div className="divide-y divide-[rgb(var(--border))]">
                {collections.map((collection) => (
                  <article
                    key={collection.id}
                    className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-[rgb(var(--card-hover))]"
                  >
                    <div className="space-y-1">
                      <div className="text-sm text-[rgb(var(--muted))]">{formatUtc(collection.collected_at)}</div>
                      <div className="text-lg font-semibold text-[rgb(var(--fg))]">
                        {collection.total_eggs} huevos
                      </div>
                      {collection.notes && (
                        <div className="text-sm text-[rgb(var(--muted))]">{collection.notes}</div>
                      )}
                    </div>
                    <button
                      onClick={() => setCollectionToDelete(collection.id)}
                      className="rounded-full p-2 text-red-400 transition hover:bg-red-500/10 hover:text-red-300"
                      aria-label="Eliminar recolección"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">

          {/* Left column: Create/Edit Outflow */}
          <section className="card p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-[rgb(var(--fg))]">
                  {editingId ? 'Editar salida' : 'Registrar salida'}
                </h2>
                <p className="text-sm text-[rgb(var(--muted))]">
                  Ingresa cartones (x{EGGS_PER_CARTON}) y sueltos. Solo enviaremos el total a la base de datos.
                </p>
              </div>
              <div className="rounded-lg bg-[rgb(var(--card-hover))] px-3 py-2 text-right">
                <div className="text-xl font-bold text-[rgb(var(--fg))]">{totalEggs}</div>
                <div className="text-xs text-[rgb(var(--muted))]">Huevos totales</div>
              </div>
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1 text-sm font-medium text-[rgb(var(--fg))]">
                  Cartones (x{EGGS_PER_CARTON})
                  <input
                    type="number"
                    min={0}
                    value={cartons}
                    onChange={(e) => setCartons(e.target.value)}
                    className="input w-full"
                  />
                </label>

                <label className="space-y-1 text-sm font-medium text-[rgb(var(--fg))]">
                  Huevos sueltos
                  <input
                    type="number"
                    min={0}
                    value={singles}
                    onChange={(e) => setSingles(e.target.value)}
                    className="input w-full"
                  />
                </label>
              </div>

              <div className="grid gap-4">
                <label className="space-y-1 text-sm font-medium text-[rgb(var(--fg))]">
                  Fecha de entrega
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    onFocus={(e) => (e.target as HTMLInputElement).showPicker?.()}
                    onClick={(e) => (e.target as HTMLInputElement).showPicker?.()}
                    className="input w-full"
                    required
                  />
                </label>

                <label className="space-y-1 text-sm font-medium text-[rgb(var(--fg))]">
                  Notas
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="input w-full"
                    rows={2}
                    placeholder="Destinatario o descripción (opcional)"
                  />
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button type="submit" disabled={submitting} className="btn btn-primary min-w-[160px]">
                  {submitting ? 'Guardando...' : editingId ? 'Actualizar salida' : 'Guardar salida'}
                </button>

                {editingId && (
                  <button type="button" onClick={resetForm} className="btn btn-secondary" disabled={submitting}>
                    Cancelar edición
                  </button>
                )}

                <p className="text-xs text-[rgb(var(--muted))]">
                  Se almacena únicamente el campo <code>total_eggs</code>.
                </p>
              </div>
            </form>
          </section>

          {/* Right column */}
          <section className="space-y-6">

            {/* Outflows list */}
            <section className="card p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-[rgb(var(--fg))]">Salidas</h2>
                  <p className="text-sm text-[rgb(var(--muted))]">
                    Edita o elimina las entregas registradas.
                  </p>
                </div>
                {loadingOutflows && <Loader label="Cargando" />}
              </div>

              {outflows.length === 0 && !loadingOutflows ? (
                <p className="text-sm text-[rgb(var(--muted))]">Aún no hay salidas registradas.</p>
              ) : (
                <div className="space-y-3">
                  {outflows.map((row) => (
                    <article
                      key={row.id}
                      className="rounded-xl border border-[rgb(var(--border))] p-4 shadow-sm bg-[rgb(var(--card))]"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-[rgb(var(--fg))]">
                            {row.notes || 'Sin descripción'}
                          </p>
                          <p className="text-xs text-[rgb(var(--muted))]">
                            {formatDisplayDate(row.occurred_at || row.created_at)}
                          </p>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <div className="text-xl font-bold text-[rgb(var(--primary))]">
                              {row.total_eggs}
                            </div>
                            <div className="text-xs text-[rgb(var(--muted))]">Huevos</div>
                          </div>

                          <div className="flex gap-2">
                            <button className="btn btn-secondary" onClick={() => startEdit(row.id)}>
                              Editar
                            </button>
                            <button
                              className="btn btn-ghost text-red-600"
                              onClick={() => setOutflowToDelete(row.id)}
                            >
                              Eliminar
                            </button>
                          </div>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </section>
        </div>
      )}

      {/* Delete dialogs */}
      {collectionToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-3xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-6 shadow-xl">
            <h3 className="text-base font-semibold text-[rgb(var(--fg))]">Eliminar recolección</h3>
            <p className="mt-2 text-sm text-[rgb(var(--muted))]">
              ¿Seguro que querés eliminar esta recolección? Esta acción no se puede deshacer.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setCollectionToDelete(null)} className="btn-muted">
                Cancelar
              </button>
              <button
                onClick={confirmDeleteCollection}
                className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-lg hover:bg-red-700"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {outflowToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-3xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-6 shadow-xl">
            <h3 className="text-base font-semibold text-[rgb(var(--fg))]">Eliminar salida</h3>
            <p className="mt-2 text-sm text-[rgb(var(--muted))]">
              ¿Seguro que querés eliminar esta salida? Esta acción no se puede deshacer.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setOutflowToDelete(null)} className="btn-muted">
                Cancelar
              </button>
              <button
                onClick={confirmDeleteOutflow}
                className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-lg hover:bg-red-700"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {outflowToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-3xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-6 shadow-xl">
            <h3 className="text-base font-semibold text-[rgb(var(--fg))]">Eliminar salida</h3>
            <p className="mt-2 text-sm text-[rgb(var(--muted))]">
              ¿Seguro que querés eliminar esta salida? Esta acción no se puede deshacer.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setOutflowToDelete(null)} className="btn-muted">
                Cancelar
              </button>
              <button
                onClick={confirmDeleteOutflow}
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
