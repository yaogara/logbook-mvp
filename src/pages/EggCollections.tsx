import { useCallback, useEffect, useMemo, useState } from 'react'
import { OfflineBanner } from '../components/OfflineBanner'
import Loader from '../components/Loader'
import { useToast } from '../components/ToastProvider'
import { getSupabase, safeQuery } from '../lib/supabase'
import useOnlineStatus from '../hooks/useOnlineStatus'

const supabase = getSupabase()

type EggCollection = {
  id: string
  collected_at: string
  total_eggs: number
  note?: string | null
  deleted_at?: string | null
  created_at?: string | null
}

function toDateInput(value: string) {
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return new Date().toISOString().slice(0, 10)
  return dt.toISOString().slice(0, 10)
}

function toTimeInput(value: string) {
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return new Date().toISOString().slice(11, 16)
  return dt.toISOString().slice(11, 16)
}

export default function EggCollections() {
  const online = useOnlineStatus()
  const { show } = useToast()
  const now = useMemo(() => new Date(), [])

  const [date, setDate] = useState(() => now.toISOString().slice(0, 10))
  const [time, setTime] = useState(() => now.toISOString().slice(11, 16))
  const [quantity, setQuantity] = useState<number>(0)
  const [note, setNote] = useState('')

  const [collections, setCollections] = useState<EggCollection[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [editing, setEditing] = useState<EggCollection | null>(null)
  const [editDate, setEditDate] = useState('')
  const [editTime, setEditTime] = useState('')
  const [editQuantity, setEditQuantity] = useState<number>(0)
  const [editNote, setEditNote] = useState('')

  const loadCollections = useCallback(async () => {
    setLoading(true)
    const { data, error } = await safeQuery<EggCollection[]>(
      () =>
        supabase
          .from('egg_collections')
          .select('id, collected_at, total_eggs, note, deleted_at, created_at')
          .is('deleted_at', null)
          .order('collected_at', { ascending: false })
          .limit(20),
      'load egg collections',
    )

    if (error) {
      show({
        variant: 'error',
        title: 'No se pudieron cargar las colecciones',
        description: typeof error === 'string' ? error : error?.message ?? 'Intenta de nuevo más tarde.',
      })
      setCollections([])
    } else {
      setCollections((data ?? []).filter((row) => !row.deleted_at))
    }
    setLoading(false)
  }, [show])

  useEffect(() => {
    void loadCollections()
  }, [loadCollections])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!quantity || quantity < 0) {
      show({ variant: 'error', title: 'Cantidad requerida', description: 'Ingresa la cantidad de huevos recolectados.' })
      return
    }
    if (!online) {
      show({ variant: 'error', title: 'Sin conexión', description: 'Conéctate para registrar la colección.' })
      return
    }

    setSubmitting(true)
    const collectedAt = new Date(`${date}T${time || '00:00'}`).toISOString()
    const tempId = `temp-${Date.now()}`
    const optimistic: EggCollection = {
      id: tempId,
      collected_at: collectedAt,
      total_eggs: quantity,
      note: note?.trim() || null,
      created_at: new Date().toISOString(),
    }
    setCollections((prev) => [optimistic, ...prev])

    const { data, error } = await safeQuery<EggCollection>(
      () =>
        supabase
          .from('egg_collections')
          .insert({ collected_at: collectedAt, total_eggs: quantity, note: note?.trim() || null })
          .select('id, collected_at, total_eggs, note, deleted_at, created_at')
          .single(),
      'create egg collection',
    )

    if (error || !data) {
      setCollections((prev) => prev.filter((row) => row.id !== tempId))
      show({
        variant: 'error',
        title: 'No se pudo guardar',
        description: typeof error === 'string' ? error : error?.message ?? 'Intenta nuevamente.',
      })
    } else {
      setCollections((prev) => [data, ...prev.filter((row) => row.id !== tempId)])
      show({ variant: 'success', title: 'Colección registrada' })
      const reset = new Date()
      setDate(reset.toISOString().slice(0, 10))
      setTime(reset.toISOString().slice(11, 16))
      setQuantity(0)
      setNote('')
    }

    setSubmitting(false)
  }

  function startEdit(entry: EggCollection) {
    setEditing(entry)
    setEditDate(toDateInput(entry.collected_at))
    setEditTime(toTimeInput(entry.collected_at))
    setEditQuantity(entry.total_eggs)
    setEditNote(entry.note ?? '')
  }

  async function handleUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!editing) return
    if (editQuantity < 0) {
      show({ variant: 'error', title: 'Cantidad inválida', description: 'La cantidad debe ser mayor o igual a cero.' })
      return
    }
    if (!online) {
      show({ variant: 'error', title: 'Sin conexión', description: 'Conéctate para actualizar la colección.' })
      return
    }

    const updatedAt = new Date(`${editDate}T${editTime || '00:00'}`).toISOString()
    const previous = editing
    const optimistic = { ...editing, collected_at: updatedAt, total_eggs: editQuantity, note: editNote?.trim() || null }
    setCollections((prev) => prev.map((row) => (row.id === editing.id ? optimistic : row)))

    const { data, error } = await safeQuery<EggCollection>(
      () =>
        supabase
          .from('egg_collections')
          .update({ collected_at: updatedAt, total_eggs: editQuantity, note: editNote?.trim() || null })
          .eq('id', editing.id)
          .select('id, collected_at, total_eggs, note, deleted_at, created_at')
          .single(),
      'update egg collection',
    )

    if (error || !data) {
      setCollections((prev) => prev.map((row) => (row.id === previous.id ? previous : row)))
      show({
        variant: 'error',
        title: 'No se pudo actualizar',
        description: typeof error === 'string' ? error : error?.message ?? 'Revisa la conexión y vuelve a intentar.',
      })
    } else {
      setCollections((prev) => prev.map((row) => (row.id === data.id ? data : row)))
      show({ variant: 'success', title: 'Colección actualizada' })
      setEditing(null)
    }
  }

  async function handleDelete(entry: EggCollection) {
    if (!online) {
      show({ variant: 'error', title: 'Sin conexión', description: 'Conéctate para eliminar colecciones.' })
      return
    }
    const confirmed = window.confirm('¿Eliminar este registro de huevos?')
    if (!confirmed) return

    const previous = collections
    setCollections((prev) => prev.filter((row) => row.id !== entry.id))

    const { error } = await safeQuery(
      () =>
        supabase
          .from('egg_collections')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', entry.id),
      'delete egg collection',
    )

    if (error) {
      setCollections(previous)
      show({
        variant: 'error',
        title: 'No se pudo eliminar',
        description: typeof error === 'string' ? error : error?.message ?? 'Intenta nuevamente.',
      })
    } else {
      show({ variant: 'success', title: 'Registro eliminado' })
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <Loader label="Cargando colecciones…" />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <OfflineBanner />

      <section className="bg-[rgb(var(--card))] border border-[rgb(var(--border))] rounded-2xl shadow-sm p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-[rgb(var(--fg))]">Colección de huevos</h1>
            <p className="text-sm text-[rgb(var(--muted))]">Registra rápidamente la recolección diaria.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-2 text-sm text-[rgb(var(--muted))]">
            Fecha
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-[rgb(var(--border))] bg-transparent px-3 py-2 text-[rgb(var(--fg))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--primary))]/60"
            />
          </label>

          <label className="flex flex-col gap-2 text-sm text-[rgb(var(--muted))]">
            Hora
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full rounded-lg border border-[rgb(var(--border))] bg-transparent px-3 py-2 text-[rgb(var(--fg))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--primary))]/60"
            />
          </label>

          <label className="flex flex-col gap-2 text-sm text-[rgb(var(--muted))]">
            Cantidad (huevos)
            <input
              type="number"
              min={0}
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              className="w-full rounded-lg border border-[rgb(var(--border))] bg-transparent px-3 py-2 text-[rgb(var(--fg))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--primary))]/60"
              required
            />
          </label>

          <label className="flex flex-col gap-2 text-sm text-[rgb(var(--muted))] sm:col-span-2 lg:col-span-1">
            Nota (opcional)
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Observaciones"
              className="w-full rounded-lg border border-[rgb(var(--border))] bg-transparent px-3 py-2 text-[rgb(var(--fg))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--primary))]/60"
            />
          </label>

          <div className="sm:col-span-2 lg:col-span-4 flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center justify-center rounded-lg bg-[rgb(var(--primary))] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:brightness-110 disabled:opacity-50"
            >
              {submitting ? 'Guardando…' : 'Registrar'}
            </button>
          </div>
        </form>
      </section>

      <section className="bg-[rgb(var(--card))] border border-[rgb(var(--border))] rounded-2xl shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-[rgb(var(--fg))]">Entradas recientes</h2>
            <p className="text-sm text-[rgb(var(--muted))]">Edita o elimina registros. Los eliminados se ocultan.</p>
          </div>
          <button
            type="button"
            onClick={() => void loadCollections()}
            className="text-sm text-[rgb(var(--primary))] hover:underline"
          >
            Actualizar
          </button>
        </div>

        {collections.length === 0 ? (
          <p className="text-sm text-[rgb(var(--muted))]">Aún no hay colecciones registradas.</p>
        ) : (
          <div className="space-y-3">
            {collections.map((entry) => {
              const dateLabel = new Date(entry.collected_at).toLocaleString('es-CO', {
                dateStyle: 'medium',
                timeStyle: 'short',
              })

              const isEditing = editing?.id === entry.id
              return (
                <div
                  key={entry.id}
                  className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card-hover))]/40 p-4"
                >
                  {isEditing ? (
                    <form onSubmit={handleUpdate} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 items-end">
                      <label className="flex flex-col gap-2 text-sm text-[rgb(var(--muted))]">
                        Fecha
                        <input
                          type="date"
                          value={editDate}
                          onChange={(e) => setEditDate(e.target.value)}
                          className="rounded-lg border border-[rgb(var(--border))] bg-transparent px-3 py-2 text-[rgb(var(--fg))]"
                        />
                      </label>

                      <label className="flex flex-col gap-2 text-sm text-[rgb(var(--muted))]">
                        Hora
                        <input
                          type="time"
                          value={editTime}
                          onChange={(e) => setEditTime(e.target.value)}
                          className="rounded-lg border border-[rgb(var(--border))] bg-transparent px-3 py-2 text-[rgb(var(--fg))]"
                        />
                      </label>

                      <label className="flex flex-col gap-2 text-sm text-[rgb(var(--muted))]">
                        Cantidad
                        <input
                          type="number"
                          min={0}
                          value={editQuantity}
                          onChange={(e) => setEditQuantity(Number(e.target.value))}
                          className="rounded-lg border border-[rgb(var(--border))] bg-transparent px-3 py-2 text-[rgb(var(--fg))]"
                        />
                      </label>

                      <label className="flex flex-col gap-2 text-sm text-[rgb(var(--muted))] sm:col-span-2 lg:col-span-1">
                        Nota
                        <input
                          type="text"
                          value={editNote}
                          onChange={(e) => setEditNote(e.target.value)}
                          className="rounded-lg border border-[rgb(var(--border))] bg-transparent px-3 py-2 text-[rgb(var(--fg))]"
                        />
                      </label>

                      <div className="sm:col-span-2 lg:col-span-4 flex gap-2 justify-end">
                        <button
                          type="button"
                          onClick={() => setEditing(null)}
                          className="rounded-lg px-3 py-2 text-sm text-[rgb(var(--muted))] hover:text-[rgb(var(--fg))]"
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          className="rounded-lg bg-[rgb(var(--primary))] px-3 py-2 text-sm font-semibold text-white shadow-sm hover:brightness-110"
                        >
                          Guardar
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="space-y-1">
                        <p className="text-lg font-semibold text-[rgb(var(--fg))]">{entry.total_eggs} huevos</p>
                        <p className="text-sm text-[rgb(var(--muted))]">{dateLabel}</p>
                        {entry.note ? (
                          <p className="text-sm text-[rgb(var(--fg))]">{entry.note}</p>
                        ) : null}
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(entry)}
                          className="rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-sm text-[rgb(var(--fg))] hover:bg-[rgb(var(--card))]"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(entry)}
                          className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:brightness-110"
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
