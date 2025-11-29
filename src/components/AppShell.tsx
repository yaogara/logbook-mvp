import type { ReactNode } from 'react'
import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import UserBadge from './UserBadge'
import LogoutButton from './LogoutButton'
import ThemeToggle from './ThemeToggle'
import useOnlineStatus from '../hooks/useOnlineStatus'

export default function AppShell({ children }: { children: ReactNode }) {
  const loc = useLocation()
  const online = useOnlineStatus()
  const [huevosDropdownOpen, setHuevosDropdownOpen] = useState(false)
  const isHome = loc.pathname === '/'
  const isDash = loc.pathname.startsWith('/dashboard')
  const isHistory = loc.pathname.startsWith('/history')
  const isContributors = loc.pathname.startsWith('/contributors')
  const isEggs = loc.pathname.startsWith('/eggs')

  return (
    <div
      className="flex flex-col min-h-[100dvh] w-full bg-gradient-to-br from-[rgb(var(--bg-gradient-from))] to-[rgb(var(--bg-gradient-to))] text-[rgb(var(--fg))]"
    >
      {/* HEADER */}
      <header className="fixed top-0 w-full z-20 bg-[rgb(var(--card))]/80 backdrop-blur border-b border-[rgb(var(--border))] shadow-sm">
        <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="text-base font-semibold tracking-tight text-[rgb(var(--fg))]">
              Yaogará
            </Link>

            {/* Desktop Nav */}
            <nav className="hidden sm:flex items-center gap-1">
              <Link
                to="/"
                className={`px-3 py-1.5 rounded-full text-sm transition ${
                  isHome
                    ? 'bg-[rgb(var(--card-hover))] text-[rgb(var(--fg))]'
                    : 'text-[rgb(var(--muted))] hover:text-[rgb(var(--fg))]'
                }`}
              >
                Home
              </Link>

              <Link
                to="/history"
                className={`px-3 py-1.5 rounded-full text-sm transition ${
                  isHistory
                    ? 'bg-[rgb(var(--card-hover))] text-[rgb(var(--fg))]'
                    : 'text-[rgb(var(--muted))] hover:text-[rgb(var(--fg))]'
                }`}
              >
                Historial
              </Link>

              <Link
                to="/dashboard"
                className={`px-3 py-1.5 rounded-full text-sm transition ${
                  isDash
                    ? 'bg-[rgb(var(--card-hover))] text-[rgb(var(--fg))]'
                    : 'text-[rgb(var(--muted))] hover:text-[rgb(var(--fg))]'
                }`}
              >
                Dashboard
              </Link>

              <Link
                to="/contributors"
                className={`px-3 py-1.5 rounded-full text-sm transition ${
                  isContributors
                    ? 'bg-[rgb(var(--card-hover))] text-[rgb(var(--fg))]'
                    : 'text-[rgb(var(--muted))] hover:text-[rgb(var(--fg))]'
                }`}
              >
                Balances
              </Link>

              {/* Huevos Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setHuevosDropdownOpen(!huevosDropdownOpen)}
                  className={`px-3 py-1.5 rounded-full text-sm transition flex items-center gap-1 ${
                    isEggs
                      ? 'bg-[rgb(var(--card-hover))] text-[rgb(var(--fg))]'
                      : 'text-[rgb(var(--muted))] hover:text-[rgb(var(--fg))]'
                  }`}
                >
                  Huevos
                  <svg className={`w-3 h-3 transition-transform ${huevosDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                
                {huevosDropdownOpen && (
                  <div className="absolute top-full left-0 mt-1 bg-[rgb(var(--card))] border border-[rgb(var(--border))] rounded-lg shadow-lg py-1 min-w-[140px] z-50">
                    <Link
                      to="/eggs#production"
                      onClick={() => setHuevosDropdownOpen(false)}
                      className={`block px-3 py-2 text-sm transition ${
                        loc.hash === '#production'
                          ? 'bg-[rgb(var(--card-hover))] text-[rgb(var(--fg))]'
                          : 'text-[rgb(var(--muted))] hover:text-[rgb(var(--fg))] hover:bg-[rgb(var(--card-hover))]'
                      }`}
                    >
                      Producción
                    </Link>
                    <Link
                      to="/eggs#outflows"
                      onClick={() => setHuevosDropdownOpen(false)}
                      className={`block px-3 py-2 text-sm transition ${
                        loc.hash === '#outflows'
                          ? 'bg-[rgb(var(--card-hover))] text-[rgb(var(--fg))]'
                          : 'text-[rgb(var(--muted))] hover:text-[rgb(var(--fg))] hover:bg-[rgb(var(--card-hover))]'
                      }`}
                    >
                      Salidas
                    </Link>
                  </div>
                )}
              </div>
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
            to="/"
            className={`px-4 py-2 rounded-full text-sm font-medium transition ${
              isHome
                ? 'bg-[rgb(var(--card-hover))] text-[rgb(var(--fg))]'
                : 'text-[rgb(var(--muted))]'
            }`}
          >
            Home
          </Link>

          <Link
            to="/history"
            className={`px-4 py-2 rounded-full text-sm font-medium transition ${
              isHistory
                ? 'bg-[rgb(var(--card-hover))] text-[rgb(var(--fg))]'
                : 'text-[rgb(var(--muted))]'
            }`}
          >
            Historial
          </Link>

          <Link
            to="/dashboard"
            className={`px-4 py-2 rounded-full text-sm font-medium transition ${
              isDash
                ? 'bg-[rgb(var(--card-hover))] text-[rgb(var(--fg))]'
                : 'text-[rgb(var(--muted))]'
            }`}
          >
            Dashboard
          </Link>

          <Link
            to="/contributors"
            className={`px-4 py-2 rounded-full text-sm font-medium transition ${
              isContributors
                ? 'bg-[rgb(var(--card-hover))] text-[rgb(var(--fg))]'
                : 'text-[rgb(var(--muted))]'
            }`}
          >
            Balances
          </Link>
        </div>
      </nav>
    </div>
  )
}
