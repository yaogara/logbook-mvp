import { useState } from 'react'
import { OfflineBanner } from '../components/OfflineBanner'

const productionCollections = [
  { id: 'prod-1', title: 'Lote de la mañana', collected: 120, notes: 'Recolectado en corrales 1 y 2' },
  { id: 'prod-2', title: 'Lote de la tarde', collected: 98, notes: 'Huevos clasificados y listos para empaque' },
]

const outflowPackages = [
  { id: 'out-1', title: 'Entrega restaurante', packages: 60, notes: 'Pedidos especiales sin cascarilla' },
  { id: 'out-2', title: 'Donación semanal', packages: 30, notes: 'Entregado al comedor comunitario' },
]

export default function Eggs() {
  const [activeTab, setActiveTab] = useState<'production' | 'outflow'>('production')

  return (
    <div className="space-y-6">
      <OfflineBanner />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm uppercase tracking-wide text-[rgb(var(--muted))]">Operaciones</p>
          <h1 className="text-2xl font-bold text-[rgb(var(--fg))]">Huevos</h1>
          <p className="text-[rgb(var(--muted))]">Sigue la producción y lo que se entrega en la comunidad.</p>
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

      {activeTab === 'production' ? (
        <section className="space-y-4">
          {productionCollections.map((collection) => (
            <article key={collection.id} className="card p-5 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-[rgb(var(--fg))]">{collection.title}</h3>
                  <p className="text-sm text-[rgb(var(--muted))]">{collection.notes}</p>
                </div>
                <div className="rounded-lg bg-[rgb(var(--primary))]/10 px-3 py-2 text-right">
                  <div className="text-2xl font-bold text-[rgb(var(--primary))]">{collection.collected}</div>
                  <div className="text-xs text-[rgb(var(--muted))]">Huevos recolectados</div>
                </div>
              </div>
            </article>
          ))}

          <div className="card p-5 text-center text-sm text-[rgb(var(--muted))]">
            Estos números son solo de referencia rápida. La ficha detallada de cada lote llegará pronto.
          </div>
        </section>
      ) : (
        <section className="space-y-4">
          {outflowPackages.map((pkg) => (
            <article key={pkg.id} className="card p-5 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-[rgb(var(--fg))]">{pkg.title}</h3>
                  <p className="text-sm text-[rgb(var(--muted))]">{pkg.notes}</p>
                </div>
                <div className="rounded-lg bg-[rgb(var(--card-hover))] px-3 py-2 text-right">
                  <div className="text-2xl font-bold text-[rgb(var(--fg))]">{pkg.packages}</div>
                  <div className="text-xs text-[rgb(var(--muted))]">Paquetes entregados</div>
                </div>
              </div>
            </article>
          ))}

          <div className="card p-5 text-center text-sm text-[rgb(var(--muted))]">
            Usa esta vista para coordinar pedidos, donaciones y entregas especiales.
          </div>
        </section>
      )}
    </div>
  )
}
