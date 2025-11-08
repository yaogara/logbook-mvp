// App.tsx
import { useEffect, useState } from 'react'
import Auth from './components/Auth'
import Home from './pages/Home'
import Dashboard from './pages/Dashboard'
import { getSupabase } from './lib/supabase'
import { installConnectivitySync, fullSync } from './lib/sync'
import './index.css'

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

    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      setAuthed(!!session)
    })

    return () => sub.subscription.unsubscribe()
  }, [])

  if (!ready) return null

  // Manual routing based on pathname
  const path = window.location.pathname

  if (!authed) return <Auth />

  if (path === '/' || path === '') return <Home />
  if (path === '/dashboard') return <Dashboard />

  // Fallback
  return <Home />
}