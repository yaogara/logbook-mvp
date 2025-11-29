// App.tsx
import { useEffect, useState, type ReactNode } from 'react'
import Auth from './components/Auth'
import Home from './pages/Home'
import Dashboard from './pages/Dashboard'
import History from './pages/History'
import Contributors from './pages/Contributors'
import EggCollections from './pages/EggCollections'
import { getSupabase } from './lib/supabase'
import { installConnectivitySync, fullSync } from './lib/sync'
import './index.css'
import { Routes, Route, Navigate } from 'react-router-dom'
import Loader from './components/Loader'
import AppShell from './components/AppShell'
import { ToastProvider } from './components/ToastProvider'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'

export default function App() {
  const [ready, setReady] = useState(false)
  const [authed, setAuthed] = useState(false)

  useEffect(() => {
    installConnectivitySync()
    const sb = getSupabase()

    const initAuth = async () => {
      try {
        const { data, error } = await sb.auth.getSession()
        if (error) {
          console.warn('⚠️ Session initialization error:', error.message)
          setAuthed(false)
        } else {
          setAuthed(!!data.session)
        }
      } catch (err) {
        console.warn('⚠️ Failed to initialize session:', err)
        setAuthed(false)
      } finally {
        setReady(true)
      }
    }

    initAuth()

    if (navigator.onLine) void fullSync()

    const { data: sub } = sb.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        setAuthed(!!session)
      }
    )

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
      {/* ⬇️ AppShell wraps the entire app — fixes PWA safe-area + layout */}
      <AppShell>

        <Routes>
          {/* Public Route */}
          <Route path="/login" element={<Auth />} />

          {/* Private Routes */}
          <Route
            path="/"
            element={
              <Protected authed={authed}>
                <Home />
              </Protected>
            }
          />

          <Route
            path="/dashboard"
            element={
              <Protected authed={authed}>
                <Dashboard />
              </Protected>
            }
          />

          <Route
            path="/history"
            element={
              <Protected authed={authed}>
                <History />
              </Protected>
            }
          />

          <Route
            path="/eggs"
            element={
              <Protected authed={authed}>
                <EggCollections />
              </Protected>
            }
          />

          <Route
            path="/contributors"
            element={
              <Protected authed={authed}>
                <Contributors />
              </Protected>
            }
          />

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>

      </AppShell>
    </ToastProvider>
  )
}

/* ------------------------
      Protected Wrapper
------------------------- */
function Protected({ authed, children }: { authed: boolean; children: ReactNode }) {
  if (!authed) return <Navigate to="/login" replace />
  return <>{children}</>
}