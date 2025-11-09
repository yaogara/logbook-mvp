import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import UserBadge from './UserBadge'
import LogoutButton from './LogoutButton'
import ThemeToggle from './ThemeToggle'

export default function AppShell({ children }: { children: ReactNode }) {
  const loc = useLocation()
  const isHome = loc.pathname === '/'
  const isDash = loc.pathname.startsWith('/dashboard')
  const isHistory = loc.pathname.startsWith('/history')
  const isContributors = loc.pathname.startsWith('/contributors')
  return (
    <div className="min-h-screen bg-gradient-to-br from-[rgb(var(--bg-gradient-from))] to-[rgb(var(--bg-gradient-to))]">
      <header className="sticky top-0 z-20 bg-[rgb(var(--card))]/80 backdrop-blur border-b border-[rgb(var(--border))]">
        <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="text-base font-semibold tracking-tight text-[rgb(var(--fg))]">Yaogará</Link>
            <nav className="hidden sm:flex items-center gap-1">
              <Link to="/" className={`px-3 py-1.5 rounded-full text-sm transition ${isHome ? 'bg-[rgb(var(--card-hover))] text-[rgb(var(--fg))]' : 'text-[rgb(var(--muted))] hover:text-[rgb(var(--fg))]'}`}>Home</Link>
              <Link to="/history" className={`px-3 py-1.5 rounded-full text-sm transition ${isHistory ? 'bg-[rgb(var(--card-hover))] text-[rgb(var(--fg))]' : 'text-[rgb(var(--muted))] hover:text-[rgb(var(--fg))]'}`}>Historial</Link>
              <Link to="/dashboard" className={`px-3 py-1.5 rounded-full text-sm transition ${isDash ? 'bg-[rgb(var(--card-hover))] text-[rgb(var(--fg))]' : 'text-[rgb(var(--muted))] hover:text-[rgb(var(--fg))]'}`}>Dashboard</Link>
              <Link to="/contributors" className={`px-3 py-1.5 rounded-full text-sm transition ${isContributors ? 'bg-[rgb(var(--card-hover))] text-[rgb(var(--fg))]' : 'text-[rgb(var(--muted))] hover:text-[rgb(var(--fg))]'}`}>Balances</Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <UserBadge />
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        {children}
      </main>

      {/* Bottom nav for mobile */}
      <nav className="sm:hidden fixed bottom-3 inset-x-3 z-20 rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--card))]/90 backdrop-blur shadow-lg">
        <div className="flex items-center justify-around px-2 py-2">
          <Link to="/" className={`px-4 py-2 rounded-full text-sm font-medium transition ${isHome ? 'bg-[rgb(var(--card-hover))] text-[rgb(var(--fg))]' : 'text-[rgb(var(--muted))]'}`}>Home</Link>
          <Link to="/history" className={`px-4 py-2 rounded-full text-sm font-medium transition ${isHistory ? 'bg-[rgb(var(--card-hover))] text-[rgb(var(--fg))]' : 'text-[rgb(var(--muted))]'}`}>Historial</Link>
          <Link to="/dashboard" className={`px-4 py-2 rounded-full text-sm font-medium transition ${isDash ? 'bg-[rgb(var(--card-hover))] text-[rgb(var(--fg))]' : 'text-[rgb(var(--muted))]'}`}>Dashboard</Link>
          <Link to="/contributors" className={`px-4 py-2 rounded-full text-sm font-medium transition ${isContributors ? 'bg-[rgb(var(--card-hover))] text-[rgb(var(--fg))]' : 'text-[rgb(var(--muted))]'}`}>Balances</Link>
        </div>
      </nav>
    </div>
  )
}
