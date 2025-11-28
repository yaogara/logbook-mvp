import { useEffect, useMemo, useState } from 'react'
import MoneyInput from './MoneyInput'
import type { Contributor, Currency, TxnType } from '../types'
import { formatCOP } from '../lib/money'

type RetreatVertical = {
  id: string
  name: string
}

type RetreatCategory = {
  id: string
  name: string
  vertical_id?: string | null
}

export type RetreatEntryInput = {
  amount: number
  description: string
  contributorId: string | null
  verticalId: string | null
  categoryId: string | null
  type: TxnType
  isSettlement?: boolean
  currency?: Currency
}

export type RetreatSubmission = {
  retreatName: string
  retreatDate: string
  entries: RetreatEntryInput[]
}

type RetreatRowState = {
  id: string
  amount: number
  description: string
  contributorId: string | null
  verticalId: string | null
  categoryId: string | null
  isSettlement: boolean
}

type SectionType = 'income' | 'expense'

type Props = {
  open: boolean
  onClose: () => void
  onSubmit: (payload: RetreatSubmission) => Promise<void>
  submitting?: boolean
  contributors: Contributor[]
  defaultContributorId?: string | null
  verticals: RetreatVertical[]
  categories: RetreatCategory[]
  defaultVerticalId?: string | null
}

function generateRowId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `row_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

function createRow(defaultContributorId?: string | null, defaultVerticalId?: string | null): RetreatRowState {
  return {
    id: generateRowId(),
    amount: 0,
    description: '',
    contributorId: defaultContributorId ?? null,
    verticalId: defaultVerticalId ?? null,
    categoryId: null,
    isSettlement: false,
  }
}

export default function RegisterRetreatDialog({
  open,
  onClose,
  onSubmit,
  submitting = false,
  contributors,
  defaultContributorId,
  verticals,
  categories,
  defaultVerticalId,
}: Props) {
  const today = () => new Date().toISOString().split('T')[0]
  const [retreatName, setRetreatName] = useState('')
  const [retreatDate, setRetreatDate] = useState(today())
  const [incomeRows, setIncomeRows] = useState<RetreatRowState[]>(() => [createRow(defaultContributorId, defaultVerticalId)])
  const [expenseRows, setExpenseRows] = useState<RetreatRowState[]>(() => [createRow(defaultContributorId, defaultVerticalId)])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setRetreatName('')
    setRetreatDate(today())
    setIncomeRows([createRow(defaultContributorId, defaultVerticalId)])
    setExpenseRows([createRow(defaultContributorId, defaultVerticalId)])
    setError(null)
  }, [open, defaultContributorId, defaultVerticalId])

  const contributorOptions = useMemo(
    () =>
      [...contributors].sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email)),
    [contributors],
  )

  const incomeTotal = useMemo(() => incomeRows.reduce((sum, row) => sum + (row.amount || 0), 0), [incomeRows])
  const expenseTotal = useMemo(() => expenseRows.reduce((sum, row) => sum + (row.amount || 0), 0), [expenseRows])
  const netTotal = incomeTotal - expenseTotal

  const validEntries = useMemo(() => {
    const buildEntries = (rows: RetreatRowState[], type: SectionType): RetreatEntryInput[] =>
      rows
        .filter((row) => row.amount > 0)
        .map((row) => ({
          amount: row.amount,
          description: row.description.trim(),
          contributorId: row.contributorId || null,
          verticalId: row.verticalId || null,
          categoryId: row.categoryId || null,
          type,
          isSettlement: row.isSettlement,
          currency: 'COP' as Currency,
        }))
    return [...buildEntries(incomeRows, 'income'), ...buildEntries(expenseRows, 'expense')]
  }, [incomeRows, expenseRows])

  const canSubmit = retreatName.trim().length > 0 && validEntries.length > 0 && !submitting

  function handleRowChange(section: SectionType, rowId: string, changes: Partial<RetreatRowState>) {
    const updater = section === 'income' ? setIncomeRows : setExpenseRows
    updater((rows) => rows.map((row) => (row.id === rowId ? { ...row, ...changes } : row)))
  }

  function removeRow(section: SectionType, rowId: string) {
    const updater = section === 'income' ? setIncomeRows : setExpenseRows
    updater((rows) => rows.filter((row) => row.id !== rowId))
  }

  function addRow(section: SectionType) {
    const updater = section === 'income' ? setIncomeRows : setExpenseRows
    updater((rows) => [...rows, createRow(defaultContributorId, defaultVerticalId)])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setError(null)
    try {
      await onSubmit({
        retreatName: retreatName.trim(),
        retreatDate,
        entries: validEntries,
      })
    } catch (err: any) {
      setError(err?.message || 'No se pudo registrar el retiro. Intentalo de nuevo.')
    }
  }

  function getFilteredCategories(verticalId: string | null) {
    return categories.filter(
      (category) => !verticalId || category.vertical_id == null || category.vertical_id === verticalId,
    )
  }

  function renderRow(row: RetreatRowState, section: SectionType) {
    return (
      <div
        key={row.id}
        className="grid grid-cols-1 gap-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--input-bg))] p-4"
      >
        <div className="grid gap-3 md:grid-cols-2">
          <input
            type="text"
            value={row.description}
            onChange={(event) => handleRowChange(section, row.id, { description: event.target.value })}
            className="input w-full"
            placeholder={section === 'income' ? 'Descripción del ingreso' : 'Descripción del gasto'}
            disabled={submitting}
          />
          <MoneyInput
            value={row.amount}
            onChange={(value) => handleRowChange(section, row.id, { amount: value })}
            className="w-full"
            placeholder="0"
          />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <select
            value={row.verticalId ?? ''}
            onChange={(event) =>
              handleRowChange(section, row.id, {
                verticalId: event.target.value || null,
                categoryId: null,
              })
            }
            className="input w-full"
            disabled={submitting}
          >
            <option value="">Sin vertical</option>
            {verticals
              .slice()
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((vertical) => (
                <option key={vertical.id} value={vertical.id}>
                  {vertical.name}
                </option>
              ))}
          </select>
          <select
            value={row.categoryId ?? ''}
            onChange={(event) => handleRowChange(section, row.id, { categoryId: event.target.value || null })}
            className="input w-full"
            disabled={submitting}
          >
            <option value="">Sin categoría</option>
            {getFilteredCategories(row.verticalId).map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-3 md:grid-cols-[2fr_1fr] md:items-center">
          <select
            value={row.contributorId ?? ''}
            onChange={(event) => handleRowChange(section, row.id, { contributorId: event.target.value || null })}
            className="input w-full"
            disabled={submitting}
          >
            <option value="">Sin colaborador</option>
            {contributorOptions.map((contributor) => (
              <option key={contributor.id} value={contributor.id}>
                {contributor.name || contributor.email}
              </option>
            ))}
          </select>
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-xs text-[rgb(var(--muted))]">
              <input
                type="checkbox"
                checked={row.isSettlement}
                onChange={(event) => handleRowChange(section, row.id, { isSettlement: event.target.checked })}
                disabled={submitting}
              />
              Saldo
            </label>
            <button
              type="button"
              onClick={() => removeRow(section, row.id)}
              className="rounded-full border border-transparent p-2 text-[rgb(var(--muted))] transition hover:border-red-500/20 hover:text-red-400"
              disabled={submitting}
            >
              <span className="sr-only">Quitar fila</span>
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 6l8 8M14 6l-8 8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-8">
      <div className="w-full max-w-4xl rounded-3xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-6 shadow-2xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-[rgb(var(--fg))]">Registrar retiro</h2>
            <p className="text-sm text-[rgb(var(--muted))]">Cargá todos los ingresos y gastos del retiro en un solo paso.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-[rgb(var(--muted))] transition hover:bg-[rgb(var(--card-hover))]"
            aria-label="Cerrar"
            disabled={submitting}
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l8 8M14 6l-8 8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-8">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-[rgb(var(--muted))]">Nombre del retiro</label>
              <input
                type="text"
                value={retreatName}
                onChange={(event) => setRetreatName(event.target.value)}
                className="input mt-1"
                placeholder="Ej. Retiro Medellín"
                disabled={submitting}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-[rgb(var(--muted))]">Fecha</label>
              <input
                type="date"
                value={retreatDate}
                onChange={(event) => setRetreatDate(event.target.value)}
                className="input mt-1"
                max={today()}
                disabled={submitting}
              />
            </div>
          </div>

          <section className="space-y-4 rounded-3xl border border-[rgb(var(--border))] bg-[rgb(var(--card-hover))] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold text-[rgb(var(--fg))]">Ingresos</h3>
                <p className="text-sm text-[rgb(var(--muted))]">Registra cada ingreso individual.</p>
              </div>
              <span className="text-sm font-semibold text-emerald-500">+ COP {formatCOP(incomeTotal)}</span>
            </div>
            <div className="space-y-3">
              {incomeRows.length === 0 && (
                <div className="rounded-2xl border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--card))] p-4 text-sm text-[rgb(var(--muted))]">
                  Aún no agregaste ingresos.
                </div>
              )}
              {incomeRows.map((row) => renderRow(row, 'income'))}
            </div>
            <button
              type="button"
              onClick={() => addRow('income')}
              className="btn-ghost w-full sm:w-auto"
              disabled={submitting}
            >
              + Agregar ingreso
            </button>
          </section>

          <section className="space-y-4 rounded-3xl border border-[rgb(var(--border))] bg-[rgb(var(--card-hover))] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold text-[rgb(var(--fg))]">Gastos</h3>
                <p className="text-sm text-[rgb(var(--muted))]">Ingresa todos los pagos o egresos del retiro.</p>
              </div>
              <span className="text-sm font-semibold text-rose-500">- COP {formatCOP(expenseTotal)}</span>
            </div>
            <div className="space-y-3">
              {expenseRows.length === 0 && (
                <div className="rounded-2xl border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--card))] p-4 text-sm text-[rgb(var(--muted))]">
                  Aún no agregaste gastos.
                </div>
              )}
              {expenseRows.map((row) => renderRow(row, 'expense'))}
            </div>
            <button
              type="button"
              onClick={() => addRow('expense')}
              className="btn-ghost w-full sm:w-auto"
              disabled={submitting}
            >
              + Agregar gasto
            </button>
          </section>

          <div className="rounded-3xl border border-[rgb(var(--border))] bg-[rgb(var(--card-hover))] p-4">
            <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
              <div>
                <p className="text-[rgb(var(--muted))]">Total ingresos</p>
                <p className="text-lg font-semibold text-emerald-500">COP {formatCOP(incomeTotal)}</p>
              </div>
              <div>
                <p className="text-[rgb(var(--muted))]">Total gastos</p>
                <p className="text-lg font-semibold text-rose-500">COP {formatCOP(expenseTotal)}</p>
              </div>
              <div>
                <p className="text-[rgb(var(--muted))]">Ganancia neta</p>
                <p className={`text-lg font-semibold ${netTotal >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                  COP {formatCOP(Math.abs(netTotal))}
                </p>
              </div>
            </div>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} className="btn-muted" disabled={submitting}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary" disabled={!canSubmit}>
              {submitting ? 'Guardando…' : 'Registrar retiro'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
