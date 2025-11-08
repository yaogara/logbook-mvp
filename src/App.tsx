// App.tsx
import { useEffect, useState, type ReactNode } from 'react'
import Auth from './components/Auth'
import Home from './pages/Home'
import Dashboard from './pages/Dashboard'
import { getSupabase } from './lib/supabase'
import { installConnectivitySync, fullSync } from './lib/sync'
import './index.css'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Loader from './components/Loader'
import AppShell from './components/AppShell'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { ToastProvider } from './components/ToastProvider'

export default function App() {
  const [ready, setReady] = useState(false)
  const [authed, setAuthed] = useState(false)

  useEffect(() => {
    installConnectivitySync()
    const sb = getSupabase()

    // Wait for session AND auth state
    const initAuth = async () => {
      const { data } = await sb.auth.getSession()
      setAuthed(!!data.session)
      setReady(true)
    }

    initAuth()

    if (navigator.onLine) void fullSync()

    const { data: sub } = sb.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      setAuthed(!!session)
    })

    return () => sub.subscription.unsubscribe()
  }, [])

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader label="Loading app…" />
      </div>
    )
  }

  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Auth />} />

          <Route
            path="/"
            element={
              <ProtectedRoute authed={authed}>
                <AppShell>
                  <Home />
                </AppShell>
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute authed={authed}>
                <AppShell>
                  <Dashboard />
                </AppShell>
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  )
}

function ProtectedRoute({ authed, children }: { authed: boolean; children: ReactNode }) {
  if (!authed) return <Navigate to="/login" replace />
  return <>{children}</>
}