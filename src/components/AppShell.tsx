import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import UserBadge from './UserBadge'
import LogoutButton from './LogoutButton'

export default function AppShell({ children }: { children: ReactNode }) {
  const loc = useLocation()
  const isHome = loc.pathname === '/'
  const isDash = loc.pathname.startsWith('/dashboard')
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      <header className="sticky top-0 z-20 bg-white/80 backdrop-blur border-b border-slate-200">
        <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="text-base font-semibold tracking-tight text-slate-800">Yaogará</Link>
            <nav className="hidden sm:flex items-center gap-1">
              <Link to="/" className={`px-3 py-1.5 rounded-full text-sm ${isHome ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:text-slate-900'}`}>Home</Link>
              <Link to="/dashboard" className={`px-3 py-1.5 rounded-full text-sm ${isDash ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:text-slate-900'}`}>Dashboard</Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <UserBadge />
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        {children}
      </main>

      {/* Bottom nav for mobile */}
      <nav className="sm:hidden fixed bottom-3 inset-x-3 z-20 rounded-full border border-slate-200 bg-white/90 backdrop-blur shadow-lg shadow-slate-900/5">
        <div className="flex items-center justify-around px-2 py-2">
          <Link to="/" className={`px-4 py-2 rounded-full text-sm font-medium ${isHome ? 'bg-slate-100 text-slate-900' : 'text-slate-600'}`}>Home</Link>
          <Link to="/dashboard" className={`px-4 py-2 rounded-full text-sm font-medium ${isDash ? 'bg-slate-100 text-slate-900' : 'text-slate-600'}`}>Dashboard</Link>
        </div>
      </nav>
    </div>
  )
}
