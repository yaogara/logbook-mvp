import { useEffect, useMemo, useState } from 'react'
// import { getSupabase } from '../lib/supabase'
import LogoutButton from '../components/LogoutButton'
import UserBadge from '../components/UserBadge'
import { db, queueDelete, queueInsert, queueUpdate } from '../lib/db'
import type { Txn, TxnType } from '../types'

// const supabase = getSupabase()

export default function Home() {
  const [online, setOnline] = useState<boolean>(navigator.onLine)
  const [recent, setRecent] = useState<Txn[]>([])
  const [verticals, setVerticals] = useState<{ id: string; name: string }[]>([])
  const [categories, setCategories] = useState<{ id: string; name: string; vertical_id?: string | null }[]>([])
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<Txn | null>(null)
  const [deleting, setDeleting] = useState<Txn | null>(null)

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
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-semibold">Logbook</h1>
          <div className="flex items-center gap-3">
            <StatusBadge online={online} />
            <a
              href="/dashboard"
              className="rounded-lg bg-gray-100 hover:bg-gray-200 px-3 py-1.5 text-sm"
            >📊 Dashboard</a>
            <UserBadge />
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-8">
        <section className="bg-white border border-gray-100 rounded-xl shadow-sm p-4">
          <h2 className="text-base font-medium mb-3">New Transaction</h2>
          <form onSubmit={saveTxn} className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-700 mb-1">Amount</label>
              <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required className="w-full rounded-lg border-gray-300 focus:border-green-500 focus:ring-green-500" />
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">Type</label>
              <div className="flex rounded-lg overflow-hidden border border-gray-300">
                <button type="button" onClick={() => setType('expense')} className={`flex-1 px-3 py-2 ${type==='expense'?'bg-green-600 text-white':'bg-white'}`}>Expense</button>
                <button type="button" onClick={() => setType('income')} className={`flex-1 px-3 py-2 ${type==='income'?'bg-green-600 text-white':'bg-white'}`}>Income</button>
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required className="w-full rounded-lg border-gray-300 focus:border-green-500 focus:ring-green-500" />
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">Vertical</label>
              <select value={verticalId} onChange={(e) => setVerticalId(e.target.value)} className="w-full rounded-lg border-gray-300 focus:border-green-500 focus:ring-green-500">
                <option value="">—</option>
                {verticals.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">Category</label>
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-full rounded-lg border-gray-300 focus:border-green-500 focus:ring-green-500">
                <option value="">—</option>
                {filteredCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm text-gray-700 mb-1">Description</label>
              <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded-lg border-gray-300 focus:border-green-500 focus:ring-green-500" placeholder="Optional" />
            </div>
            <div className="md:col-span-2 flex justify-end">
              <button disabled={saving} type="submit" className="inline-flex items-center rounded-lg bg-green-600 text-white px-4 py-2 font-medium hover:bg-green-700 disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        </section>

        <section className="bg-white border border-gray-100 rounded-xl shadow-sm p-4">
          <h2 className="text-base font-medium mb-3">Recent Activity</h2>
          {recent.length === 0 ? (
            <div className="text-sm text-gray-500">No transactions yet.</div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {recent.map((t) => (
                <li key={t.id} className="py-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">{t.description || (t.type === 'expense' ? 'Expense' : 'Income')}</div>
                    <div className="text-xs text-gray-500">{t.date}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className={`text-sm font-semibold ${t.type==='expense' ? 'text-red-600' : 'text-green-700'}`}>{t.type==='expense' ? '-' : '+'}${t.amount.toFixed(2)}</div>
                    <button onClick={() => setEditing(t)} className="text-sm text-gray-600 hover:text-gray-900">Edit</button>
                    <button onClick={() => setDeleting(t)} className="text-sm text-red-600 hover:text-red-700">Delete</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Account info moved to header */}
      </main>

      {editing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-xl p-4 space-y-3">
            <h3 className="text-base font-medium">Edit Transaction</h3>
            <div className="grid grid-cols-1 gap-3">
              <input type="number" step="0.01" value={editing.amount} onChange={(e) => setEditing({ ...editing, amount: Number(e.target.value) })} className="w-full rounded-lg border-gray-300 focus:border-green-500 focus:ring-green-500" />
              <div className="flex rounded-lg overflow-hidden border border-gray-300">
                <button type="button" onClick={() => setEditing({ ...editing, type: 'expense' })} className={`flex-1 px-3 py-2 ${editing.type==='expense'?'bg-green-600 text-white':'bg-white'}`}>Expense</button>
                <button type="button" onClick={() => setEditing({ ...editing, type: 'income' })} className={`flex-1 px-3 py-2 ${editing.type==='income'?'bg-green-600 text-white':'bg-white'}`}>Income</button>
              </div>
              <input type="date" value={editing.date} onChange={(e) => setEditing({ ...editing, date: e.target.value })} className="w-full rounded-lg border-gray-300 focus:border-green-500 focus:ring-green-500" />
              <input type="text" value={editing.description || ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} className="w-full rounded-lg border-gray-300 focus:border-green-500 focus:ring-green-500" placeholder="Description" />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className="rounded-lg px-3 py-1.5 bg-gray-100 hover:bg-gray-200">Cancel</button>
              <button onClick={applyEdit} className="rounded-lg px-3 py-1.5 bg-green-600 text-white hover:bg-green-700">Save</button>
            </div>
          </div>
        </div>
      )}

      {deleting && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-xl p-4 space-y-3">
            <h3 className="text-base font-medium">Delete Transaction</h3>
            <p className="text-sm text-gray-600">Are you sure you want to delete this transaction?</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleting(null)} className="rounded-lg px-3 py-1.5 bg-gray-100 hover:bg-gray-200">Cancel</button>
              <button onClick={applyDelete} className="rounded-lg px-3 py-1.5 bg-red-600 text-white hover:bg-red-700">Delete</button>
            </div>
          </div>
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
