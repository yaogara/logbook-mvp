import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import UserBadge from './UserBadge'
import LogoutButton from './LogoutButton'
import ThemeToggle from './ThemeToggle'
import useOnlineStatus from '../hooks/useOnlineStatus'

export default function EggOnlyAppShell({ children }: { children: ReactNode }) {
  const loc = useLocation()
  const online = useOnlineStatus()
  const isProduction = loc.pathname === '/eggs' && loc.hash === '#production'
  const isOutflow = loc.pathname === '/eggs' && loc.hash === '#outflows'

  return (
    <div
      className="flex flex-col min-h-[100dvh] w-full bg-gradient-to-br from-[rgb(var(--bg-gradient-from))] to-[rgb(var(--bg-gradient-to))] text-[rgb(var(--fg))]"
    >
      {/* HEADER */}
      <header className="fixed top-0 w-full z-20 bg-[rgb(var(--card))]/80 backdrop-blur border-b border-[rgb(var(--border))] shadow-sm">
        <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/eggs#production" className="text-base font-semibold tracking-tight text-[rgb(var(--fg))]">
              Yaogará - Huevos
            </Link>

            {/* Egg-only Navigation */}
            <nav className="hidden sm:flex items-center gap-1">
              <Link
                to="/eggs#production"
                className={`px-3 py-1.5 rounded-full text-sm transition ${
                  isProduction
                    ? 'bg-[rgb(var(--card-hover))] text-[rgb(var(--fg))]'
                    : 'text-[rgb(var(--muted))] hover:text-[rgb(var(--fg))]'
                }`}
              >
                Producción
              </Link>

              <Link
                to="/eggs#outflows"
                className={`px-3 py-1.5 rounded-full text-sm transition ${
                  isOutflow
                    ? 'bg-[rgb(var(--card-hover))] text-[rgb(var(--fg))]'
                    : 'text-[rgb(var(--muted))] hover:text-[rgb(var(--fg))]'
                }`}
              >
                Salidas
              </Link>
            </nav>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-3">
            <span
              className={`sm:hidden inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition ${
                online ? 'bg-[rgb(var(--primary))]/15 text-[rgb(var(--primary))]' : 'bg-[rgb(var(--card-hover))] text-[rgb(var(--muted))]'
              }`}
              title={online ? 'Sincronizado' : 'Sin conexión'}
            >
              <span
                className={`block h-2 w-2 rounded-full ${
                  online ? 'bg-[rgb(var(--primary))]' : 'bg-[rgb(var(--muted))]'
                }`}
              />
              {online ? 'Sincronizado' : 'Sin conexión'}
            </span>
            <ThemeToggle />
            <UserBadge />
            <LogoutButton />
          </div>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="pt-20 flex-1 mx-auto w-full max-w-5xl px-4 py-6 pb-24 sm:pb-6">
        {children}
      </main>

      {/* MOBILE NAV */}
      <nav
        className="sm:hidden fixed inset-x-3 bottom-3 z-50 rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--card))]/95 backdrop-blur-md shadow-lg"
        style={{
          paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.25rem)',
        }}
      >
        <div className="flex items-center justify-around px-2 py-2">
          <Link
            to="/eggs#production"
            className={`px-4 py-2 rounded-full text-sm font-medium transition ${
              isProduction
                ? 'bg-[rgb(var(--card-hover))] text-[rgb(var(--fg))]'
                : 'text-[rgb(var(--muted))]'
            }`}
          >
            Producción
          </Link>

          <Link
            to="/eggs#outflows"
            className={`px-4 py-2 rounded-full text-sm font-medium transition ${
              isOutflow
                ? 'bg-[rgb(var(--card-hover))] text-[rgb(var(--fg))]'
                : 'text-[rgb(var(--muted))]'
            }`}
          >
            Salidas
          </Link>
        </div>
      </nav>
    </div>
  )
}
