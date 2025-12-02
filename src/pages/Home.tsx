import { useEffect, useMemo, useRef, useState } from 'react'
import { OfflineBanner } from '../components/OfflineBanner'
import { db, queueDelete, queueInsert, queueUpdate, getPreferredContributorId } from '../lib/db'
import type { LocalTxn, TxnType, Currency, Contributor } from '../types'
import { fullSync, fetchContributors } from '../lib/sync'
import { useToast } from '../components/ToastProvider'
import { normalizeTxn } from '../lib/transactions'
import useOnlineStatus from '../hooks/useOnlineStatus'
import MoneyInput from '../components/MoneyInput'
import { formatCOP } from '../lib/money'
import RegisterRetreatDialog from '../components/RegisterRetreatDialog'
import type { RetreatSubmission } from '../components/RegisterRetreatDialog'

function parseTimestamp(value?: string | null) {
  if (!value) return null
  const normalized = value.includes('T') ? value : value.replace(' ', 'T')
  const dt = new Date(normalized)
  return Number.isNaN(dt.getTime()) ? null : dt
}

function getTxnTimestamp(txn: LocalTxn) {
  return (
    txn.updated_at ||
    txn.occurred_on ||
    (txn.date ? `${txn.date}T${txn.time || '00:00'}` : null) ||
    txn.created_at ||
    null
  )
}

function formatTxnTime(txn: LocalTxn) {
  const ts = getTxnTimestamp(txn)
  const dt = parseTimestamp(ts)
  if (!dt) return txn.time || ''
  const hours = String(dt.getHours()).padStart(2, '0')
  const minutes = String(dt.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

// const supabase = getSupabase()

export default function Home() {
  const { show } = useToast()
  const online = useOnlineStatus()
  const [recent, setRecent] = useState<LocalTxn[]>([])
  const [verticals, setVerticals] = useState<{ id: string; name: string; description?: string }[]>([])
  const [categories, setCategories] = useState<{ id: string; name: string; description?: string; vertical_id?: string | null }[]>([])
  const [contributors, setContributors] = useState<Contributor[]>([])
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [editing, setEditing] = useState<LocalTxn | null>(null)
  const [deleting, setDeleting] = useState<LocalTxn | null>(null)
  const [showSuccess, setShowSuccess] = useState(false)
  const [retreatDialogOpen, setRetreatDialogOpen] = useState(false)
  const [retreatSubmitting, setRetreatSubmitting] = useState(false)
  const [splitMenuOpen, setSplitMenuOpen] = useState(false)
  const splitButtonRef = useRef<HTMLDivElement | null>(null)

  const [amount, setAmount] = useState<number>(0)
  const [type, setType] = useState<TxnType>('expense')
  const [currency, setCurrency] = useState<Currency>('COP')
  const [verticalId, setVerticalId] = useState<string>('')
  const [categoryId, setCategoryId] = useState<string>('')
  const [contributorId, setContributorId] = useState<string | null>(null)
  const [defaultContributorId, setDefaultContributorId] = useState<string | null>(null)
  const [description, setDescription] = useState<string>('')
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0])

  const filteredCategories = useMemo(
    () => categories.filter((c) => !verticalId || c.vertical_id === verticalId || c.vertical_id == null),
    [categories, verticalId]
  )

  function detectSettlement(desc: string | undefined | null, categoryIdValue: string | null | undefined): boolean {
    const descriptionMatch = /settlement/i.test(desc ?? '')
    if (descriptionMatch) return true
    if (!categoryIdValue) return false
    const category = categories.find((c) => c.id === categoryIdValue)
    return category ? /settlement/i.test(category.name ?? '') : false
  }

  useEffect(() => {
    loadRecent()
    loadDropdowns()
  }, [])

  useEffect(() => {
    if (!showSuccess) return
    const timer = window.setTimeout(() => setShowSuccess(false), 2500)
    return () => window.clearTimeout(timer)
  }, [showSuccess])

  useEffect(() => {
    if (!splitMenuOpen) return
    function handleClick(event: MouseEvent) {
      if (!splitButtonRef.current) return
      if (!splitButtonRef.current.contains(event.target as Node)) {
        setSplitMenuOpen(false)
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setSplitMenuOpen(false)
      }
    }
    document.addEventListener('click', handleClick)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('click', handleClick)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [splitMenuOpen])

  async function loadDropdowns() {
    const [v, c, contrib] = await Promise.all([
      db.verticals.toArray(), 
      db.categories.toArray(),
      fetchContributors()
    ])
    setVerticals(v)
    setCategories(c)
    setContributors(contrib)
    const preferredId = await getPreferredContributorId()
    const resolvedPreferred =
      (preferredId && contrib.some((item) => item.id === preferredId)) ? preferredId : null
    setDefaultContributorId(resolvedPreferred)
    setContributorId((prev) => {
      const stillExists = prev ? contrib.some((item) => item.id === prev) : false
      if (prev && !stillExists) {
        return resolvedPreferred ?? null
      }
      return prev ?? resolvedPreferred ?? null
    })
  }

  async function loadRecent() {
    const items = await db.txns
      .orderBy('updated_at')
      .reverse()
      .filter((t) => !t.deleted && !(t as any).deleted_at)
      .limit(10)
      .toArray()
    setRecent(items.map((item) => normalizeTxn(item)))
  }

  async function forceSync() {
    if (!online) {
      show({ title: 'Sin conexión', variant: 'error' })
      return
    }
    setSyncing(true)
    try {
      await fullSync()
      await loadRecent()
      show({ title: 'Sincronizado', variant: 'success' })
    } catch (err) {
      show({ title: 'Error al sincronizar', variant: 'error' })
    } finally {
      setSyncing(false)
    }
  }

  function resetForm() {
    setAmount(0)
    setType('expense')
    setCurrency('COP')
    setVerticalId('')
    setCategoryId('')
    setContributorId(defaultContributorId ?? null)
    setDescription('')
    setDate(new Date().toISOString().split('T')[0])
  }

  async function saveTxn(e: React.FormEvent) {
    e.preventDefault()
    if (!amount) {
      show({ 
        title: 'Monto requerido', 
        description: 'Por favor ingresa un monto mayor a cero para registrar el movimiento.', 
        variant: 'error' 
      })
      return
    }
    setSaving(true)
    try {
      const isSettlement = detectSettlement(description, categoryId || null)
      const txn: Omit<LocalTxn, 'id' | 'created_at' | 'updated_at'> = {
        amount,
        type,
        currency,
        date,
        time: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }),
        vertical_id: verticalId || null,
        category_id: categoryId || null,
        contributor_id: contributorId ?? null,
        description: description || undefined,
        deleted: false,
        is_settlement: isSettlement,
      } as any
      await queueInsert('txns', txn as any)
      resetForm()
      await loadRecent()
      if (online) await fullSync()
      setShowSuccess(true)
    } finally {
      setSaving(false)
    }
  }

  async function applyEdit() {
    if (!editing) return
    const isSettlement = detectSettlement(editing.description, editing.category_id ?? null)
    await queueUpdate('txns', editing.id, {
      amount: editing.amount,
      type: editing.type,
      currency: editing.currency,
      vertical_id: editing.vertical_id ?? null,
      category_id: editing.category_id ?? null,
      contributor_id: editing.contributor_id ?? null,
      description: editing.description ?? undefined,
      is_settlement: isSettlement,
    } as any)
    setEditing(null)
    await loadRecent()
    if (online) await fullSync()
  }

  async function applyDelete() {
    if (!deleting) return
    try {
      await queueDelete('txns', deleting.id)
      setDeleting(null)
      await loadRecent()
      if (online) await fullSync()
      show({ variant: 'success', title: 'Movimiento eliminado' })
    } catch (err: any) {
      show({ variant: 'error', title: 'No se pudo eliminar', description: String(err?.message || err) })
      // eslint-disable-next-line no-console
      console.error('[delete] failed', err)
    }
  }

  function generateId() {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID()
    }
    // Fallback UUID v4-ish generator for environments without crypto.randomUUID
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0
      const v = c === 'x' ? r : (r & 0x3) | 0x8
      return v.toString(16)
    })
  }

  async function handleRetreatSubmit(payload: RetreatSubmission) {
    setRetreatSubmitting(true)
    const now = new Date().toISOString()
    const txnTime = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })
    const baseDate = payload.retreatDate || new Date().toISOString().split('T')[0]
    
    try {
      // Create the retreat record first
      const retreatId = generateId()
      const retreatData = {
        id: retreatId,
        name: payload.retreatName.trim(),
        start_date: baseDate,
        end_date: baseDate, // Same as start date by default
        default_vertical_id: null,
        default_category_id: null,
        description: null,
        created_at: now,
        updated_at: now,
      }
      
      await queueInsert('retreats', retreatData)
      
      // Create transactions linked to the retreat
      for (const entry of payload.entries) {
        const entryDescription = [payload.retreatName, entry.description].filter(Boolean).join(' · ')
        const isSettlement = Boolean(entry.isSettlement)
        
        await queueInsert('txns', {
          id: generateId(),
          amount: entry.amount,
          type: entry.type,
          currency: entry.currency ?? 'COP',
          date: baseDate,
          time: txnTime,
          vertical_id: entry.verticalId ?? null,
          category_id: entry.categoryId ?? null,
          contributor_id: entry.contributorId ?? null,
          retreat_id: retreatId,
          description: entryDescription || payload.retreatName,
          created_at: now,
          updated_at: now,
          deleted: false,
          is_settlement: isSettlement,
          settled: false,
        } as any)
      }
      
      await loadRecent()
      if (online) await fullSync()
      setRetreatDialogOpen(false)
      show({ title: 'Retiro registrado exitosamente', variant: 'success' })
    } catch (err: any) {
      console.error('Error registering retreat:', err)
      show({ 
        title: 'No se pudo registrar el retiro', 
        description: String(err?.message || 'Ocurrió un error inesperado'), 
        variant: 'error' 
      })
      throw err
    } finally {
      setRetreatSubmitting(false)
    }
  }

  const registrarCardClasses =
    type === 'income'
      ? 'bg-emerald-500/15 border-emerald-500/40 hover:bg-emerald-500/15 hover:border-emerald-500/40'
      : 'bg-rose-500/15 border-rose-500/40 hover:bg-rose-500/15 hover:border-rose-500/40'

  return (
    <div>
      <OfflineBanner />
      <div className="space-y-10">
        <section className={`card-lg transition-colors duration-300 ${registrarCardClasses}`}>
          <div className="space-y-6">
            <div className="hidden md:flex items-baseline justify-between gap-4">
            <span
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium transition ${
                online ? 'bg-[rgb(var(--primary))]/10 text-[rgb(var(--primary))]' : 'bg-[rgb(var(--card-hover))] text-[rgb(var(--muted))]'
              }`}
            >
              <span className={`block h-2 w-2 rounded-full ${online ? 'bg-[rgb(var(--primary))]' : 'bg-[rgb(var(--muted))]'}`} />
              {online ? 'Sincronizado' : 'Sin conexión'}
            </span>
          </div>
          <form onSubmit={saveTxn} className="space-y-8">
            <div className="flex flex-col items-center gap-3 text-center">
              <label className="text-sm font-medium uppercase tracking-[0.2em] text-[rgb(var(--muted))]">Registrar movimiento</label>
              <MoneyInput
                value={amount}
                onChange={setAmount}
                placeholder="0"
                className="w-full md:w-2/3 lg:w-1/2 rounded-[2rem] border-2 border-[rgb(var(--border))] bg-[rgb(var(--input-bg))] px-8 py-6 text-center text-4xl font-semibold tracking-tight text-[rgb(var(--fg))] shadow-sm transition focus:border-[rgb(var(--primary))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--ring))]"
              />
            </div>

            <div className="flex flex-col items-center gap-4">
              <div className="w-full md:w-2/3 lg:w-1/2 grid grid-cols-2 gap-4">
                <div className="flex rounded-full bg-[rgb(var(--input-bg))] p-1 shadow-inner border border-[rgb(var(--border))]">
                  <button
                    type="button"
                    onClick={() => setType('income')}
                    className={`flex-1 rounded-full px-5 py-3 text-sm font-medium transition ${
                      type === 'income'
                        ? 'bg-emerald-500/90 text-white shadow-lg shadow-emerald-500/30'
                        : 'text-[rgb(var(--muted))] hover:text-emerald-500'
                    }`}
                  >Ingreso</button>
                  <button
                    type="button"
                    onClick={() => setType('expense')}
                    className={`flex-1 rounded-full px-5 py-3 text-sm font-medium transition ${
                      type === 'expense'
                        ? 'bg-rose-500/90 text-white shadow-lg shadow-rose-500/30'
                        : 'text-[rgb(var(--muted))] hover:text-rose-500'
                    }`}
                  >Gasto</button>
                </div>
                <div className="flex rounded-full bg-[rgb(var(--input-bg))] p-1 shadow-inner border border-[rgb(var(--border))]">
                  <button
                    type="button"
                    onClick={() => setCurrency('COP')}
                    className={`flex-1 rounded-full px-4 py-3 text-sm font-medium transition ${
                      currency === 'COP'
                        ? 'bg-yellow-400 text-yellow-900 shadow-lg shadow-yellow-400/20 dark:bg-yellow-600 dark:text-yellow-100'
                        : 'text-[rgb(var(--muted))] hover:text-yellow-600 hover:bg-yellow-50 dark:hover:text-yellow-400'
                    }`}
                  >COP</button>
                  <button
                    type="button"
                    onClick={() => setCurrency('USD')}
                    className={`flex-1 rounded-full px-4 py-3 text-sm font-medium transition ${
                      currency === 'USD'
                        ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20 dark:bg-blue-600'
                        : 'text-[rgb(var(--muted))] hover:text-blue-600 hover:bg-blue-50 dark:hover:text-blue-400'
                    }`}
                  >USD</button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <select
                    value={verticalId}
                    onChange={(e) => setVerticalId(e.target.value)}
                    className="input w-full"
                  >
                    <option value="">Area</option>
                    {verticals
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name} {v.description ? `- ${v.description}` : ''}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="input w-full"
                  >
                    <option value="">Tipo</option>
                    {filteredCategories
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} {c.description ? `- ${c.description}` : ''}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <select
                    value={contributorId ?? ''}
                    onChange={(e) => setContributorId(e.target.value || null)}
                    className="input w-full"
                  >
                    <option value="">Sin colaborador</option>
                    {contributors.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name || c.email}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="input w-full"
                    max={new Date().toISOString().split('T')[0]}
                  />
                </div>
              </div>

              <div>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="input w-full"
                  placeholder="Descripción (opcional)"
                />
              </div>
            </div>

            <div className="flex justify-center">
              <div
                ref={splitButtonRef}
                className="relative inline-flex w-full md:w-2/3 lg:w-1/2"
              >
                <button
                  disabled={saving}
                  type="submit"
                  className="btn-primary flex-1 rounded-r-none py-3 text-base font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? 'Guardando…' : 'Guardar movimiento'}
                </button>
                <button
                  type="button"
                  aria-label="Abrir opciones de registro"
                  disabled={saving}
                  onClick={() => setSplitMenuOpen((prev) => !prev)}
                  className="btn-primary ml-[1px] flex items-center justify-center rounded-l-none rounded-r-full px-4 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <svg className={`h-4 w-4 transition-transform ${splitMenuOpen ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 8l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                {splitMenuOpen && (
                  <div className="absolute right-0 top-full z-20 mt-2 w-56 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-2 text-sm shadow-xl">
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left font-medium text-[rgb(var(--fg))] transition hover:bg-[rgb(var(--card-hover))]"
                      onClick={() => {
                        setSplitMenuOpen(false)
                        setRetreatDialogOpen(true)
                      }}
                    >
                      Registrar retiro
                    </button>
                  </div>
                )}
              </div>
            </div>
          </form>
        </section>

        <section className="card p-6 sm:p-8">
          <div className="flex items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-lg font-semibold text-[rgb(var(--fg))]">Actividad reciente</h2>
              <p className="text-sm text-[rgb(var(--muted))]">Tus últimos movimientos sincronizados.</p>
            </div>
            <button
              onClick={forceSync}
              disabled={syncing || !online}
              className="btn-ghost disabled:opacity-50 disabled:cursor-not-allowed text-xs"
              title="Forzar sincronización"
            >
              {syncing ? (
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" opacity="0.25" />
                  <path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" opacity="0.75" />
                </svg>
              ) : (
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
                </svg>
              )}
              Sync
            </button>
          </div>
          {recent.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--input-bg))] py-10 text-center text-sm text-[rgb(var(--muted))]">
              <span className="text-base font-medium text-[rgb(var(--fg))]">No transactions yet — add your first one above!</span>
            </div>
          ) : (
            <ul className="divide-y divide-[rgb(var(--border))]">
              {recent.map((t) => (
                <li key={t.id} className="py-3 flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-[rgb(var(--fg))] truncate">{t.description || (t.type === 'expense' ? 'Gasto' : 'Ingreso')}</div>
                    <div className="text-xs text-[rgb(var(--muted))]">{t.date} {formatTxnTime(t)}</div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className={`text-sm font-semibold whitespace-nowrap ${t.type==='expense' ? 'text-red-400' : 'text-green-400'}`}>
                      {t.type==='expense' ? '-' : '+'}{t.currency || 'COP'} {formatCOP(t.amount)}
                    </div>
                    <button
                      onClick={() => setEditing(normalizeTxn(t))}
                      className="p-1.5 text-[rgb(var(--muted))] transition hover:text-[rgb(var(--fg))] hover:bg-[rgb(var(--card-hover))] rounded"
                      aria-label="Editar"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button 
                      onClick={() => setDeleting(t)} 
                      className="p-1.5 text-red-400 transition hover:text-red-300 hover:bg-red-400/10 rounded"
                      aria-label="Eliminar"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md rounded-3xl bg-[rgb(var(--card))] p-6 shadow-xl border border-[rgb(var(--border))]">
            <h3 className="text-base font-semibold text-[rgb(var(--fg))]">Editar movimiento</h3>
            <div className="mt-4 grid grid-cols-1 gap-3">
              <MoneyInput
                value={editing.amount}
                onChange={(value) => setEditing({ ...editing, amount: value })}
                className="w-full"
              />
              <div className="flex justify-center">
                <div className="inline-flex w-full justify-between rounded-full bg-[rgb(var(--input-bg))] p-1 border border-[rgb(var(--border))]">
                  <button
                    type="button"
                    onClick={() => setEditing({ ...editing, type: 'income' })}
                    className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition ${
                      editing.type === 'income'
                        ? 'bg-green-600 text-white shadow-lg shadow-green-600/20'
                        : 'text-[rgb(var(--muted))] hover:text-green-600'
                    }`}
                  >Ingreso</button>
                  <button
                    type="button"
                    onClick={() => setEditing({ ...editing, type: 'expense' })}
                    className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition ${
                      editing.type === 'expense'
                        ? 'bg-red-600 text-white shadow-lg shadow-red-600/20'
                        : 'text-[rgb(var(--muted))] hover:text-red-600'
                    }`}
                  >Gasto</button>
                </div>
              </div>
              <select
                value={editing.currency || 'COP'}
                onChange={(e) => setEditing({ ...editing, currency: e.target.value as Currency })}
                className="input"
              >
                <option value="COP">COP - Peso colombiano</option>
                <option value="USD">USD - Dólar</option>
                <option value="EUR">EUR - Euro</option>
              </select>
              <select
                value={editing.contributor_id || ''}
                onChange={(e) => setEditing({ ...editing, contributor_id: e.target.value || null })}
                className="input"
              >
                <option value="">Sin colaborador</option>
                {contributors.map((contrib) => (
                  <option key={contrib.id} value={contrib.id}>{contrib.name || contrib.email}</option>
                ))}
              </select>
              <input
                type="text"
                value={editing.description || ''}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                className="input"
                placeholder="Descripción"
              />
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setEditing(null)} className="btn-muted">Cancelar</button>
              <button onClick={applyEdit} className="btn-primary">Guardar</button>
            </div>
          </div>
        </div>
      )}

      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-3xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-[rgb(var(--fg))]">Eliminar movimiento</h3>
            <p className="mt-2 text-sm text-[rgb(var(--muted))]">
              ¿Seguro que querés eliminar este movimiento? Esta acción no se puede deshacer.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setDeleting(null)} className="btn-muted">
                Cancelar
              </button>
              <button
                onClick={applyDelete}
                className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:bg-red-700"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {showSuccess && (
        <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-2xl bg-[rgb(var(--primary))] px-5 py-3 text-sm font-medium text-white shadow-xl shadow-[rgb(var(--primary))]/40 sm:left-auto sm:right-6 sm:translate-x-0">
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
          Movimiento guardado
        </div>
      )}

      <RegisterRetreatDialog
        open={retreatDialogOpen}
        onClose={() => {
          setRetreatDialogOpen(false)
          setSplitMenuOpen(false)
        }}
        onSubmit={handleRetreatSubmit}
        submitting={retreatSubmitting}
        contributors={contributors}
        defaultContributorId={defaultContributorId ?? undefined}
        verticals={verticals}
        categories={categories}
        defaultVerticalId={verticalId || null}
      />
    </div>
  )
}
