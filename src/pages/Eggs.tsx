import { useMemo, useState } from 'react'
import Loader from '../components/Loader'
import { OfflineBanner } from '../components/OfflineBanner'
import { useToast } from '../components/ToastProvider'
import { useEggOutflows } from '../hooks/useEggs'

const EGGS_PER_CARTON = 30

function getToday() {
  return new Date().toISOString().split('T')[0]
}

function getCurrentTime() {
  return new Date().toISOString().slice(11, 16)
}

function toDateTime(date: string, time: string) {
  if (!date) return null
  const iso = `${date}T${time || '00:00'}`
  const dt = new Date(iso)
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString()
}

function splitDateTime(value?: string | null) {
  if (!value) return { date: getToday(), time: getCurrentTime() }
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return { date: getToday(), time: getCurrentTime() }
  const date = dt.toISOString().split('T')[0]
  const time = dt.toISOString().slice(11, 16)
  return { date, time }
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
  const { show } = useToast()
  const { outflows, loading, error, createOutflow, updateOutflow, deleteOutflow } = useEggOutflows()

  const [cartons, setCartons] = useState('')
  const [singles, setSingles] = useState('')
  const [recipient, setRecipient] = useState('')
  const [notes, setNotes] = useState('')
  const [date, setDate] = useState(getToday())
  const [time, setTime] = useState(getCurrentTime())
  const [submitting, setSubmitting] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const totalEggs = useMemo(() => {
    const cartonValue = Number(cartons) || 0
    const singleValue = Number(singles) || 0
    return cartonValue * EGGS_PER_CARTON + singleValue
  }, [cartons, singles])

  const recentOutflows = useMemo(() => outflows.slice(0, 8), [outflows])

  function resetForm() {
    setCartons('')
    setSingles('')
    setRecipient('')
    setNotes('')
    setDate(getToday())
    setTime(getCurrentTime())
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

    const delivered_at = toDateTime(date, time)
    if (!delivered_at) {
      show({
        title: 'Fecha y hora inválidas',
        description: 'Revisa los campos de fecha y hora para continuar.',
        variant: 'error',
      })
      return
    }

    setSubmitting(true)
    try {
      if (editingId) {
        await updateOutflow(editingId, {
          total_eggs: totalEggs,
          delivered_at,
          recipient: recipient || null,
          notes: notes || null,
        })
        show({ title: 'Salida actualizada', variant: 'success' })
      } else {
        await createOutflow({
          total_eggs: totalEggs,
          delivered_at,
          recipient: recipient || null,
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
    const { date: d, time: t } = splitDateTime(row.delivered_at || row.created_at)
    setCartons(String(cartonsFromTotal))
    setSingles(String(singlesFromTotal))
    setRecipient(row.recipient ?? '')
    setNotes(row.notes ?? '')
    setDate(d)
    setTime(t)
    setEditingId(row.id)
  }

  async function confirmDelete(outflowId: string) {
    const row = outflows.find((item) => item.id === outflowId)
    const label = row?.recipient || 'esta salida'
    const confirmed = window.confirm(`¿Eliminar ${label}? Esta acción solo ocultará la fila.`)
    if (!confirmed) return
    try {
      await deleteOutflow(outflowId)
      show({ title: 'Salida eliminada', variant: 'success' })
      if (editingId === outflowId) resetForm()
    } catch (err: unknown) {
      const description = err instanceof Error ? err.message : undefined
      show({ title: 'No se pudo eliminar', description, variant: 'error' })
    }
  }

  return (
    <div className="space-y-6">
      <OfflineBanner />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm uppercase tracking-wide text-[rgb(var(--muted))]">Operaciones</p>
          <h1 className="text-2xl font-bold text-[rgb(var(--fg))]">Salidas de huevos</h1>
          <p className="text-[rgb(var(--muted))]">Convierte cartones a huevos, registra la salida y edita lo reciente.</p>
        </div>
      </div>

      {error && (
        <div className="card border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p className="font-semibold">No se pudo cargar las salidas</p>
          <p>{error}</p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
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
                  step={1}
                  inputMode="numeric"
                  value={cartons}
                  onChange={(e) => setCartons(e.target.value)}
                  className="input w-full"
                  placeholder="0"
                />
              </label>
              <label className="space-y-1 text-sm font-medium text-[rgb(var(--fg))]">
                Huevos sueltos
                <input
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  value={singles}
                  onChange={(e) => setSingles(e.target.value)}
                  className="input w-full"
                  placeholder="0"
                />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1 text-sm font-medium text-[rgb(var(--fg))]">
                Fecha de entrega
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="input w-full"
                  required
                />
              </label>
              <label className="space-y-1 text-sm font-medium text-[rgb(var(--fg))]">
                Hora
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="input w-full"
                  required
                />
              </label>
            </div>

            <label className="space-y-1 text-sm font-medium text-[rgb(var(--fg))]">
              Destinatario o descripción
              <input
                type="text"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                className="input w-full"
                placeholder="Restaurante, donación, pedido..."
              />
            </label>

            <label className="space-y-1 text-sm font-medium text-[rgb(var(--fg))]">
              Nota (opcional)
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="input w-full"
                rows={2}
                placeholder="Detalles adicionales"
              />
            </label>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="btn btn-primary min-w-[160px]"
              >
                {submitting ? 'Guardando...' : editingId ? 'Actualizar salida' : 'Guardar salida'}
              </button>
              {editingId && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={resetForm}
                  disabled={submitting}
                >
                  Cancelar edición
                </button>
              )}
              <p className="text-xs text-[rgb(var(--muted))]">
                Se almacena únicamente el campo <code>total_eggs</code> en Supabase.
              </p>
            </div>
          </form>
        </section>

        <section className="card p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[rgb(var(--fg))]">Salidas recientes</h2>
              <p className="text-sm text-[rgb(var(--muted))]">Edita o elimina (soft delete) las últimas entregas.</p>
            </div>
            {loading && <Loader size="sm" label="Cargando" />}
          </div>

          {recentOutflows.length === 0 && !loading ? (
            <p className="text-sm text-[rgb(var(--muted))]">Aún no hay salidas registradas.</p>
          ) : (
            <div className="space-y-3">
              {recentOutflows.map((row) => (
                <article
                  key={row.id}
                  className="rounded-xl border border-[rgb(var(--border))] p-4 shadow-sm bg-[rgb(var(--card))]"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-[rgb(var(--fg))]">{row.recipient || 'Sin descripción'}</p>
                      <p className="text-xs text-[rgb(var(--muted))]">{formatDisplayDate(row.delivered_at || row.created_at)}</p>
                      {row.notes && <p className="text-xs text-[rgb(var(--muted))]">{row.notes}</p>}
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="text-xl font-bold text-[rgb(var(--primary))]">{row.total_eggs}</div>
                        <div className="text-xs text-[rgb(var(--muted))]">Huevos</div>
                      </div>
                      <div className="flex gap-2">
                        <button className="btn btn-secondary" onClick={() => startEdit(row.id)}>
                          Editar
                        </button>
                        <button className="btn btn-ghost text-red-600" onClick={() => void confirmDelete(row.id)}>
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
      </div>
    </div>
  )
}
