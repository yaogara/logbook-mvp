// App.tsx
import { useEffect, useState, type ReactNode } from 'react'
import Auth from './components/Auth'
import Home from './pages/Home'
import Dashboard from './pages/Dashboard'
import History from './pages/History'
import Contributors from './pages/Contributors'
import Eggs from './pages/Eggs'
import { getSupabase } from './lib/supabase'
import { installConnectivitySync, fullSync } from './lib/sync'
import './index.css'
import { Routes, Route, Navigate } from 'react-router-dom'
import Loader from './components/Loader'
import AppShell from './components/AppShell'
import EggOnlyAppShell from './components/EggOnlyAppShell'
import { ToastProvider } from './components/ToastProvider'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { isAdmin, isEggOnlyUser, isEggUser } from './lib/permissions'

export default function App() {
  const [ready, setReady] = useState(false)
  const [authed, setAuthed] = useState(false)
  const [userEmail, setUserEmail] = useState<string | null>(null)

  useEffect(() => {
    installConnectivitySync()
    const sb = getSupabase()

    const initAuth = async () => {
      try {
        const { data, error } = await sb.auth.getSession()
        if (error) {
          console.warn('⚠️ Session initialization error:', error.message)
          setAuthed(false)
          setUserEmail(null)
        } else {
          setAuthed(!!data.session)
          setUserEmail(data.session?.user?.email ?? null)
        }
      } catch (err) {
        console.warn('⚠️ Failed to initialize session:', err)
        setAuthed(false)
        setUserEmail(null)
      } finally {
        setReady(true)
      }
    }

    initAuth()

    if (navigator.onLine) void fullSync()

    const { data: sub } = sb.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        setAuthed(!!session)
        setUserEmail(session?.user?.email ?? null)
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

  // Determine which shell to use
  const isUserAdmin = isAdmin(userEmail)
  const isUserEggOnly = isEggOnlyUser(userEmail)
  const Shell = isUserEggOnly ? EggOnlyAppShell : AppShell

  return (
    <ToastProvider>
      <Shell>
        <Routes>
          {/* Public Route */}
          <Route path="/login" element={<Auth />} />

          {/* Egg-only users - only access eggs page */}
          {isUserEggOnly && (
            <Route
              path="/eggs"
              element={
                <Protected authed={authed}>
                  <Eggs />
                </Protected>
              }
            />
          )}

          {/* Admin users - full app access */}
          {isUserAdmin && (
            <>
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
                path="/contributors"
                element={
                  <Protected authed={authed}>
                    <Contributors />
                  </Protected>
                }
              />

              <Route
                path="/eggs"
                element={
                  <Protected authed={authed}>
                    <EggsGate userEmail={userEmail}>
                      <Eggs />
                    </EggsGate>
                  </Protected>
                }
              />
            </>
          )}

          {/* Redirect egg-only users to eggs page */}
          {isUserEggOnly && authed && (
            <Route path="*" element={<Navigate to="/eggs#production" replace />} />
          )}

          {/* Default redirect for admin users */}
          {isUserAdmin && authed && (
            <Route path="*" element={<Navigate to="/" replace />} />
          )}

          {/* Fallback for unauthenticated users */}
          {!authed && (
            <Route path="*" element={<Navigate to="/login" replace />} />
          )}
        </Routes>
      </Shell>
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

function EggsGate({ userEmail, children }: { userEmail: string | null; children: ReactNode }) {
  if (!isEggUser(userEmail)) {
    return (
      <div className="card p-6 space-y-2 text-center max-w-2xl mx-auto">
        <h2 className="text-xl font-semibold text-[rgb(var(--fg))]">No tienes acceso</h2>
        <p className="text-[rgb(var(--muted))]">
          Esta sección está limitada a un pequeño grupo. Si crees que es un error, habla con el equipo para que te den acceso.
        </p>
      </div>
    )
  }

  return <>{children}</>
}
