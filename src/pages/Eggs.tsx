import { useMemo, useState } from 'react'
import { OfflineBanner } from '../components/OfflineBanner'
import {
  computeOutflowTotal,
  toUtcISOString,
  useEggCollections,
  useEggOutflows,
} from '../hooks/useEggs'

function todayDate() {
  return new Date().toISOString().slice(0, 10)
}

function nowTime() {
  return new Date().toISOString().slice(11, 16)
}

function formatUtc(value?: string | null) {
  if (!value) return 'Sin fecha'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString('es-CO', {
    timeZone: 'UTC',
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export default function Eggs() {
  const [activeTab, setActiveTab] = useState<'production' | 'outflow'>('production')

  const {
    collections,
    loading: loadingCollections,
    error: collectionError,
    createCollection,
    deleteCollection,
    refresh: refreshCollections,
  } = useEggCollections()
  const {
    outflows,
    loading: loadingOutflows,
    error: outflowError,
    createOutflow,
    deleteOutflow,
    refresh: refreshOutflows,
  } = useEggOutflows()

  const [collectionForm, setCollectionForm] = useState({
    date: todayDate(),
    time: nowTime(),
    totalEggs: '',
    notes: '',
    locationId: '',
  })
  const [outflowForm, setOutflowForm] = useState({
    date: todayDate(),
    time: nowTime(),
    recipient: '',
    cartons: '',
    looseEggs: '',
    eggsPerCarton: '30',
    notes: '',
  })

  const [collectionSubmitting, setCollectionSubmitting] = useState(false)
  const [outflowSubmitting, setOutflowSubmitting] = useState(false)
  const [collectionToDelete, setCollectionToDelete] = useState<string | null>(null)
  const [outflowToDelete, setOutflowToDelete] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  const computedOutflowTotal = useMemo(
    () =>
      computeOutflowTotal({
        cartons: Number(outflowForm.cartons || 0),
        loose_eggs: Number(outflowForm.looseEggs || 0),
        eggs_per_carton: Number(outflowForm.eggsPerCarton || 30),
        total_eggs: undefined,
      }),
    [outflowForm.cartons, outflowForm.looseEggs, outflowForm.eggsPerCarton],
  )

  const hasNegativeOutflowValues = useMemo(
    () =>
      [outflowForm.cartons, outflowForm.looseEggs, outflowForm.eggsPerCarton].some(
        (value) => value !== '' && Number(value) < 0,
      ),
    [outflowForm.cartons, outflowForm.looseEggs, outflowForm.eggsPerCarton],
  )

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
        collected_at: toUtcISOString(collectionForm.date, collectionForm.time),
        location_id: collectionForm.locationId || null,
        total_eggs: collectionTotalNumber,
        notes: collectionForm.notes || null,
      })
      setCollectionForm({
        date: todayDate(),
        time: nowTime(),
        totalEggs: '',
        notes: '',
        locationId: '',
      })
      await refreshCollections()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'No se pudo registrar la recolección'
      setFeedback(message)
    } finally {
      setCollectionSubmitting(false)
    }
  }

  async function handleCreateOutflow(e: React.FormEvent) {
    e.preventDefault()
    if (outflowSubmitting) return
    setFeedback(null)

    if (hasNegativeOutflowValues) {
      setFeedback('Los valores de salida no pueden ser negativos')
      return
    }

    if (!Number.isFinite(computedOutflowTotal) || computedOutflowTotal <= 0) {
      setFeedback('La salida debe tener al menos un huevo')
      return
    }

    setOutflowSubmitting(true)
    try {
      await createOutflow({
        delivered_at: toUtcISOString(outflowForm.date, outflowForm.time),
        recipient: outflowForm.recipient || null,
        cartons: outflowForm.cartons === '' ? null : Number(outflowForm.cartons),
        loose_eggs: outflowForm.looseEggs === '' ? null : Number(outflowForm.looseEggs),
        eggs_per_carton: outflowForm.eggsPerCarton === '' ? null : Number(outflowForm.eggsPerCarton),
        notes: outflowForm.notes || null,
      })
      setOutflowForm({
        date: todayDate(),
        time: nowTime(),
        recipient: '',
        cartons: '',
        looseEggs: '',
        eggsPerCarton: '30',
        notes: '',
      })
      await refreshOutflows()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'No se pudo registrar la salida de huevos'
      setFeedback(message)
    } finally {
      setOutflowSubmitting(false)
    }
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

  const collectionEmpty = !loadingCollections && collections.length === 0
  const outflowEmpty = !loadingOutflows && outflows.length === 0

  return (
    <div className="space-y-6">
      <OfflineBanner />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm uppercase tracking-wide text-[rgb(var(--muted))]">Operaciones</p>
          <h1 className="text-2xl font-bold text-[rgb(var(--fg))]">Huevos</h1>
          <p className="text-[rgb(var(--muted))]">
            Registra la producción y las salidas sin perder el control de fechas ni cantidades.
          </p>
        </div>

        <div className="flex rounded-lg bg-[rgb(var(--card-hover))] p-1 shadow-sm">
          <button
            onClick={() => setActiveTab('production')}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'production'
                ? 'bg-[rgb(var(--card))] text-[rgb(var(--fg))] shadow'
                : 'text-[rgb(var(--muted))] hover:text-[rgb(var(--fg))]'
            }`}
          >
            Producción
          </button>
          <button
            onClick={() => setActiveTab('outflow')}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'outflow'
                ? 'bg-[rgb(var(--card))] text-[rgb(var(--fg))] shadow'
                : 'text-[rgb(var(--muted))] hover:text-[rgb(var(--fg))]'
            }`}
          >
            Salidas
          </button>
        </div>
      </div>

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
                <p className="text-sm text-[rgb(var(--muted))]">
                  Valida que la cantidad no sea negativa y mantén la fecha en UTC.
                </p>
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

            <form onSubmit={handleCreateCollection} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="font-medium text-[rgb(var(--muted))]">Fecha</span>
                <input
                  type="date"
                  className="input"
                  value={collectionForm.date}
                  onChange={(e) => setCollectionForm((prev) => ({ ...prev, date: e.target.value }))}
                  required
                />
              </label>

              <label className="space-y-1 text-sm">
                <span className="font-medium text-[rgb(var(--muted))]">Hora</span>
                <input
                  type="time"
                  className="input"
                  value={collectionForm.time}
                  onChange={(e) => setCollectionForm((prev) => ({ ...prev, time: e.target.value }))}
                />
              </label>

              <label className="space-y-1 text-sm">
                <span className="font-medium text-[rgb(var(--muted))]">Total de huevos</span>
                <input
                  type="number"
                  min={0}
                  className="input"
                  value={collectionForm.totalEggs}
                  onChange={(e) => setCollectionForm((prev) => ({ ...prev, totalEggs: e.target.value }))}
                  required
                />
              </label>

              <label className="space-y-1 text-sm">
                <span className="font-medium text-[rgb(var(--muted))]">Ubicación (opcional)</span>
                <input
                  type="text"
                  className="input"
                  value={collectionForm.locationId}
                  onChange={(e) => setCollectionForm((prev) => ({ ...prev, locationId: e.target.value }))}
                  placeholder="Corral, bodega, etc."
                />
              </label>

              <label className="space-y-1 text-sm sm:col-span-2">
                <span className="font-medium text-[rgb(var(--muted))]">Notas</span>
                <textarea
                  className="input min-h-[80px]"
                  value={collectionForm.notes}
                  onChange={(e) => setCollectionForm((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="Observaciones adicionales"
                />
              </label>

              <div className="sm:col-span-2 flex justify-end">
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={collectionSubmitting || collectionTotalNumber <= 0}
                >
                  {collectionSubmitting ? 'Guardando…' : 'Guardar recolección'}
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
        <section className="space-y-4">
          <div className="card space-y-4 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-[rgb(var(--fg))]">Registrar salida</h2>
                <p className="text-sm text-[rgb(var(--muted))]">
                  Calcula el total automáticamente y evita guardar cantidades negativas.
                </p>
              </div>
              <button onClick={refreshOutflows} className="btn-ghost text-sm" disabled={loadingOutflows}>
                {loadingOutflows ? 'Cargando…' : 'Actualizar'}
              </button>
            </div>

            {outflowError && (
              <div className="rounded-xl border border-yellow-500/50 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-100">
                {outflowError}
              </div>
            )}

            <form onSubmit={handleCreateOutflow} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="font-medium text-[rgb(var(--muted))]">Fecha</span>
                <input
                  type="date"
                  className="input"
                  value={outflowForm.date}
                  onChange={(e) => setOutflowForm((prev) => ({ ...prev, date: e.target.value }))}
                  required
                />
              </label>

              <label className="space-y-1 text-sm">
                <span className="font-medium text-[rgb(var(--muted))]">Hora</span>
                <input
                  type="time"
                  className="input"
                  value={outflowForm.time}
                  onChange={(e) => setOutflowForm((prev) => ({ ...prev, time: e.target.value }))}
                />
              </label>

              <label className="space-y-1 text-sm">
                <span className="font-medium text-[rgb(var(--muted))]">Cajas</span>
                <input
                  type="number"
                  min={0}
                  className="input"
                  value={outflowForm.cartons}
                  onChange={(e) => setOutflowForm((prev) => ({ ...prev, cartons: e.target.value }))}
                />
              </label>

              <label className="space-y-1 text-sm">
                <span className="font-medium text-[rgb(var(--muted))]">Huevos sueltos</span>
                <input
                  type="number"
                  min={0}
                  className="input"
                  value={outflowForm.looseEggs}
                  onChange={(e) => setOutflowForm((prev) => ({ ...prev, looseEggs: e.target.value }))}
                />
              </label>

              <label className="space-y-1 text-sm">
                <span className="font-medium text-[rgb(var(--muted))]">Huevos por caja</span>
                <input
                  type="number"
                  min={0}
                  className="input"
                  value={outflowForm.eggsPerCarton}
                  onChange={(e) => setOutflowForm((prev) => ({ ...prev, eggsPerCarton: e.target.value }))}
                />
              </label>

              <label className="space-y-1 text-sm">
                <span className="font-medium text-[rgb(var(--muted))]">Destinatario (opcional)</span>
                <input
                  type="text"
                  className="input"
                  value={outflowForm.recipient}
                  onChange={(e) => setOutflowForm((prev) => ({ ...prev, recipient: e.target.value }))}
                />
              </label>

              <label className="space-y-1 text-sm sm:col-span-2">
                <span className="font-medium text-[rgb(var(--muted))]">Notas</span>
                <textarea
                  className="input min-h-[80px]"
                  value={outflowForm.notes}
                  onChange={(e) => setOutflowForm((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="Comentarios sobre la entrega"
                />
              </label>

              <div className="sm:col-span-2 flex items-center justify-between">
                <div className="text-sm text-[rgb(var(--muted))]">
                  Total calculado: <span className="font-semibold text-[rgb(var(--fg))]">{computedOutflowTotal}</span> huevos
                </div>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={
                    outflowSubmitting || hasNegativeOutflowValues || !Number.isFinite(computedOutflowTotal) || computedOutflowTotal <= 0
                  }
                >
                  {outflowSubmitting ? 'Guardando…' : 'Guardar salida'}
                </button>
              </div>
            </form>
          </div>

          <div className="card divide-y divide-[rgb(var(--border))] p-0">
            <div className="flex items-center justify-between px-5 py-4">
              <h3 className="text-base font-semibold text-[rgb(var(--fg))]">Historial de salidas</h3>
              <span className="text-xs text-[rgb(var(--muted))]">{outflows.length} registros</span>
            </div>

            {outflowEmpty ? (
              <div className="px-5 py-10 text-center text-sm text-[rgb(var(--muted))]">
                No hay salidas registradas todavía.
              </div>
            ) : (
              <div className="divide-y divide-[rgb(var(--border))]">
                {outflows.map((outflow) => (
                  <article
                    key={outflow.id}
                    className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-[rgb(var(--card-hover))]"
                  >
                    <div className="space-y-1">
                      <div className="text-sm text-[rgb(var(--muted))]">{formatUtc(outflow.delivered_at)}</div>
                      <div className="text-lg font-semibold text-[rgb(var(--fg))]">
                        {outflow.total_eggs} huevos
                      </div>
                      {outflow.recipient && <div className="text-sm text-[rgb(var(--muted))]">{outflow.recipient}</div>}
                      {outflow.notes && <div className="text-sm text-[rgb(var(--muted))]">{outflow.notes}</div>}
                    </div>
                    <button
                      onClick={() => setOutflowToDelete(outflow.id)}
                      className="rounded-full p-2 text-red-400 transition hover:bg-red-500/10 hover:text-red-300"
                      aria-label="Eliminar salida"
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
      )}

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
    </div>
  )
}

