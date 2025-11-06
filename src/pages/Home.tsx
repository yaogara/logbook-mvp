import { useEffect, useMemo, useState } from 'react'
import { getSupabase } from '../lib/supabase'
import { db, queueDelete, queueInsert, queueUpdate } from '../lib/db'
import type { Txn, TxnType } from '../types'

const supabase = getSupabase()

export default function Home() {
  const [online, setOnline] = useState<boolean>(navigator.onLine)
  const [recent, setRecent] = useState<Txn[]>([])
  const [verticals, setVerticals] = useState<{ id: string; name: string }[]>([])
  const [categories, setCategories] = useState<{ id: string; name: string; vertical_id?: string | null }[]>([])
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<Txn | null>(null)
  const [deleting, setDeleting] = useState<Txn | null>(null)
  const [showSuccess, setShowSuccess] = useState(false)

  const [amount, setAmount] = useState<string>('')
  const [type, setType] = useState<TxnType>('expense')
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10))
  const [verticalId, setVerticalId] = useState<string>('')
  const [categoryId, setCategoryId] = useState<string>('')
  const [description, setDescription] = useState<string>('')

  const filteredCategories = useMemo(
    () => categories.filter((c) => !verticalId || c.vertical_id === verticalId || c.vertical_id == null),
    [categories, verticalId]
  )

  useEffect(() => {
    function updateStatus() { setOnline(navigator.onLine) }
    window.addEventListener('online', updateStatus)
    window.addEventListener('offline', updateStatus)
    return () => {
      window.removeEventListener('online', updateStatus)
      window.removeEventListener('offline', updateStatus)
    }
  }, [])

  useEffect(() => {
    loadRecent()
    loadDropdowns()
  }, [])

  useEffect(() => {
    if (!showSuccess) return
    const timer = window.setTimeout(() => setShowSuccess(false), 2500)
    return () => window.clearTimeout(timer)
  }, [showSuccess])

  async function loadDropdowns() {
    const [v, c] = await Promise.all([db.verticals.toArray(), db.categories.toArray()])
    setVerticals(v)
    setCategories(c)
  }

  async function loadRecent() {
    const items = await db.txns
      .orderBy('updated_at')
      .reverse()
      .filter((t) => !t.deleted)
      .limit(10)
      .toArray()
    setRecent(items)
  }

  function resetForm() {
    setAmount('')
    setType('expense')
    setDate(new Date().toISOString().slice(0, 10))
    setVerticalId('')
    setCategoryId('')
    setDescription('')
  }

  async function saveTxn(e: React.FormEvent) {
    e.preventDefault()
    if (!amount) return
    setSaving(true)
    try {
      const txn: Omit<Txn, 'id' | 'created_at' | 'updated_at'> = {
        amount: Number(amount),
        type,
        date,
        vertical_id: verticalId || null,
        category_id: categoryId || null,
        description: description || undefined,
        deleted: false,
      } as any
      await queueInsert('txns', txn as any)
      resetForm()
      await loadRecent()
      setShowSuccess(true)
    } finally {
      setSaving(false)
    }
  }

  async function applyEdit() {
    if (!editing) return
    await queueUpdate('txns', editing.id, {
      amount: editing.amount,
      type: editing.type,
      date: editing.date,
      vertical_id: editing.vertical_id ?? null,
      category_id: editing.category_id ?? null,
      description: editing.description ?? undefined,
    } as any)
    setEditing(null)
    await loadRecent()
  }

  async function applyDelete() {
    if (!deleting) return
    await queueDelete('txns', deleting.id)
    setDeleting(null)
    await loadRecent()
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold tracking-tight text-slate-800">Yaogará</h1>
          <div className="flex items-center gap-3">
            <StatusBadge online={online} />
            <button
              onClick={() => supabase.auth.signOut()}
              className="rounded-full bg-slate-100 hover:bg-slate-200 px-4 py-1.5 text-sm font-medium text-slate-700 transition"
            >Sign out</button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-10">
        <section className="bg-white/90 border border-white shadow-xl shadow-green-100/40 rounded-3xl p-6 sm:p-8">
          <div className="flex items-baseline justify-between gap-4 mb-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Registrar movimiento</h2>
              <p className="text-sm text-slate-500">Capturá ingresos y gastos en segundos.</p>
            </div>
            <span
              className={`hidden md:inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium transition ${
                online ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
              }`}
            >
              <span className={`block h-2 w-2 rounded-full ${online ? 'bg-emerald-500' : 'bg-slate-400'}`} />
              {online ? 'Sincronizado' : 'Sin conexión'}
            </span>
          </div>
          <form onSubmit={saveTxn} className="space-y-8">
            <div className="flex flex-col items-center gap-3 text-center">
              <label className="text-sm font-medium uppercase tracking-[0.2em] text-slate-400">Monto</label>
              <input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                placeholder="0.00"
                className="w-full md:w-2/3 lg:w-1/2 rounded-[2rem] border-2 border-emerald-100 bg-white px-8 py-6 text-center text-4xl font-semibold tracking-tight text-slate-900 shadow-sm transition focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              />
            </div>

            <div className="flex justify-center">
              <div className="inline-flex rounded-full bg-slate-100 p-1 shadow-inner">
                <button
                  type="button"
                  onClick={() => setType('income')}
                  className={`rounded-full px-5 py-2 text-sm font-medium transition ${
                    type === 'income'
                      ? 'bg-white text-emerald-600 shadow'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >Ingreso</button>
                <button
                  type="button"
                  onClick={() => setType('expense')}
                  className={`rounded-full px-5 py-2 text-sm font-medium transition ${
                    type === 'expense'
                      ? 'bg-white text-emerald-600 shadow'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >Gasto</button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-600">Fecha</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                  className="w-full rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm text-slate-700 shadow-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-600">Vertical</label>
                <select
                  value={verticalId}
                  onChange={(e) => setVerticalId(e.target.value)}
                  className="w-full rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm text-slate-700 shadow-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                >
                  <option value="">Seleccioná una opción</option>
                  {verticals.map((v) => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-600">Categoría</label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm text-slate-700 shadow-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                >
                  <option value="">Seleccioná una opción</option>
                  {filteredCategories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-600">Descripción</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm text-slate-700 shadow-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                  placeholder="Opcional"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                disabled={saving}
                type="submit"
                className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-600/30 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? 'Guardando…' : 'Guardar movimiento'}
              </button>
            </div>
          </form>
        </section>

        <section className="bg-white/95 border border-white rounded-3xl shadow-xl shadow-slate-200/60 p-6 sm:p-8">
          <div className="flex items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Actividad reciente</h2>
              <p className="text-sm text-slate-500">Tus últimos movimientos sincronizados.</p>
            </div>
          </div>
          {recent.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center text-sm text-slate-500">
              <span className="text-base font-medium text-slate-600">Aún no hay movimientos</span>
              <span>Registrá un ingreso o gasto para verlo acá.</span>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {recent.map((t) => (
                <li key={t.id} className="py-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-slate-800">{t.description || (t.type === 'expense' ? 'Gasto' : 'Ingreso')}</div>
                    <div className="text-xs text-gray-500">{t.date}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className={`text-sm font-semibold ${t.type==='expense' ? 'text-red-600' : 'text-green-700'}`}>{t.type==='expense' ? '-' : '+'}${t.amount.toFixed(2)}</div>
                    <button onClick={() => setEditing(t)} className="text-sm font-medium text-slate-600 transition hover:text-slate-900">Editar</button>
                    <button onClick={() => setDeleting(t)} className="text-sm font-medium text-red-600 transition hover:text-red-700">Eliminar</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      {editing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl shadow-slate-900/10">
            <h3 className="text-base font-semibold text-slate-900">Editar movimiento</h3>
            <div className="mt-4 grid grid-cols-1 gap-3">
              <input
                type="number"
                step="0.01"
                value={editing.amount}
                onChange={(e) => setEditing({ ...editing, amount: Number(e.target.value) })}
                className="w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-sm text-slate-700 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
              />
              <div className="flex justify-center">
                <div className="inline-flex w-full justify-between rounded-full bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => setEditing({ ...editing, type: 'income' })}
                    className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition ${
                      editing.type === 'income'
                        ? 'bg-white text-emerald-600 shadow'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >Ingreso</button>
                  <button
                    type="button"
                    onClick={() => setEditing({ ...editing, type: 'expense' })}
                    className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition ${
                      editing.type === 'expense'
                        ? 'bg-white text-emerald-600 shadow'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >Gasto</button>
                </div>
              </div>
              <input
                type="date"
                value={editing.date}
                onChange={(e) => setEditing({ ...editing, date: e.target.value })}
                className="w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-sm text-slate-700 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
              />
              <input
                type="text"
                value={editing.description || ''}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                className="w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-sm text-slate-700 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                placeholder="Descripción"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className="rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-200">Cancelar</button>
              <button onClick={applyEdit} className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-700">Guardar</button>
            </div>
          </div>
        </div>
      )}

      {deleting && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl shadow-slate-900/10">
            <h3 className="text-base font-semibold text-slate-900">Eliminar movimiento</h3>
            <p className="mt-2 text-sm text-slate-600">¿Seguro que querés eliminar este movimiento? Esta acción no se puede deshacer.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setDeleting(null)} className="rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-200">Cancelar</button>
              <button onClick={applyDelete} className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-red-700">Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {showSuccess && (
        <div className="fixed bottom-6 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-medium text-white shadow-xl shadow-emerald-800/40 sm:left-auto sm:right-6 sm:translate-x-0">
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
          Movimiento guardado
        </div>
      )}
    </div>
  )
}

function StatusBadge({ online }: { online: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full ${online ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
      <span className={`inline-block w-2 h-2 rounded-full ${online ? 'bg-green-600' : 'bg-gray-400'}`} />
      {online ? 'Online' : 'Offline'}
    </span>
  )
}

