import { useEffect, useMemo, useState } from 'react'
import { supabase, safeQuery } from '../lib/supabase'
import Loader from '../components/Loader'
import { OfflineBanner } from '../components/OfflineBanner'

type EggCollection = {
  id: string
  created_by: string
  collected_at?: string
  total_eggs: number
  notes?: string
  created_at: string
  updated_at: string
}

type EggOutflow = {
  id: string
  created_by: string
  occurred_at?: string
  total_eggs: number
  notes?: string
  created_at: string
  updated_at: string
}

export default function EggStats() {
  const [collections, setCollections] = useState<EggCollection[]>([])
  const [outflows, setOutflows] = useState<EggOutflow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
    const weeklySales = weekOutflows.reduce((sum, o) => sum + o.total_eggs, 0)
    
    return { weeklyProduction, weeklySales }
  }, [collections, outflows])

  // Recent activity (last 10 items)
  const recentActivity = useMemo(() => {
    const allActivity = [
      ...collections.map(c => ({ ...c, type: 'collection' as const, date: new Date(c.collected_at || c.created_at) })),
      ...outflows.map(o => ({ ...o, type: 'outflow' as const, date: new Date(o.occurred_at || o.created_at) }))
    ]
    
    return allActivity
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, 10)
  }, [collections, outflows])

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      setError(null)
      
      try {
        const [collectionsResult, outflowsResult] = await Promise.all([
          safeQuery<EggCollection[]>(
            () => supabase
              .from('egg_collections')
              .select('*')
              .is('deleted_at', null)
              .order('created_at', { ascending: false })
          ),
          safeQuery<EggOutflow[]>(
            () => supabase
              .from('egg_outflows')
              .select('*')
              .is('deleted_at', null)
              .order('created_at', { ascending: false })
          )
        ])

        if (collectionsResult.data) setCollections(collectionsResult.data)
        if (outflowsResult.data) setOutflows(outflowsResult.data)
        
        if (collectionsResult.error || outflowsResult.error) {
          setError(collectionsResult.error || outflowsResult.error || 'Error loading data')
        }
      } catch (err) {
        setError('Failed to load egg statistics')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  if (loading) return <Loader label="Cargando estadísticas..." />
  if (error) return <div className="text-red-500">Error: {error}</div>

  return (
    <div className="space-y-6">
      <OfflineBanner />

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[rgb(var(--fg))]">Estadísticas de Huevos</h1>
        <p className="text-[rgb(var(--muted))]">
          Resumen completo de producción, ventas y stock actual.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        {/* Current Stock */}
        <div className="card p-6 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-blue-200 dark:border-blue-800">
          <h3 className="text-lg font-semibold text-[rgb(var(--fg))] mb-2">Stock Actual</h3>
          <div className={`text-3xl font-bold ${currentStock < 0 ? 'text-red-500' : 'text-blue-600'}`}>
            {currentStock}
          </div>
          <div className="text-sm text-[rgb(var(--muted))]">Huevos disponibles</div>
          {currentStock < 0 && (
            <div className="mt-2 p-2 bg-red-100 dark:bg-red-900/20 rounded-lg">
              <p className="text-xs text-red-700 dark:text-red-300">
                ⚠️ Stock negativo
              </p>
            </div>
          )}
        </div>

        {/* Weekly Production */}
        <div className="card p-6 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border-green-200 dark:border-green-800">
          <h3 className="text-lg font-semibold text-[rgb(var(--fg))] mb-2">Producción Semanal</h3>
          <div className="text-3xl font-bold text-green-600">
            {weeklyStats.weeklyProduction}
          </div>
          <div className="text-sm text-[rgb(var(--muted))]">Huevos producidos esta semana</div>
        </div>

        {/* Weekly Sales */}
        <div className="card p-6 bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 border-orange-200 dark:border-orange-800">
          <h3 className="text-lg font-semibold text-[rgb(var(--fg))] mb-2">Ventas Semanales</h3>
          <div className="text-3xl font-bold text-orange-600">
            {weeklyStats.weeklySales}
          </div>
          <div className="text-sm text-[rgb(var(--muted))]">Huevos vendidos esta semana</div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold text-[rgb(var(--fg))] mb-4">Actividad Reciente</h2>
        
        {recentActivity.length === 0 ? (
          <p className="text-sm text-[rgb(var(--muted))]">No hay actividad registrada.</p>
        ) : (
          <div className="space-y-3">
            {recentActivity.map((activity) => (
              <div key={activity.id} className="flex items-center justify-between p-3 rounded-lg bg-[rgb(var(--card-hover))]">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${
                    activity.type === 'collection' ? 'bg-green-500' : 'bg-orange-500'
                  }`} />
                  <div>
                    <p className="font-medium text-[rgb(var(--fg))]">
                      {activity.type === 'collection' ? 'Recolección' : 'Venta'}: {activity.total_eggs} huevos
                    </p>
                    <p className="text-xs text-[rgb(var(--muted))]">
                      {activity.date.toLocaleDateString('es-CO', { 
                        weekday: 'short', 
                        month: 'short', 
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                    {activity.notes && (
                      <p className="text-xs text-[rgb(var(--muted))] mt-1">{activity.notes}</p>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <span className={`text-sm font-medium ${
                    activity.type === 'collection' ? 'text-green-600' : 'text-orange-600'
                  }`}>
                    {activity.type === 'collection' ? '+' : '-'}{activity.total_eggs}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
