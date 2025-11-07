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
    sb.auth.getSession().then(({ data }) => {
      setAuthed(!!data.session)
      setReady(true)
    })
    if (navigator.onLine) {
      void fullSync()
    }
    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      setAuthed(!!session)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  if (!ready) return null
  const path = typeof window !== 'undefined' ? window.location.pathname : '/'
  if (!authed) return <Auth />
  return path === '/dashboard' ? <Dashboard /> : <Home />
}
