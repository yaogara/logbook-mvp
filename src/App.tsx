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
  const [path, setPath] = useState(window.location.pathname)

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

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname)
    window.addEventListener('popstate', onPop)

    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      const anchor = target?.closest && target.closest('a') as HTMLAnchorElement | null
      if (!anchor) return

      const href = anchor.getAttribute('href') || ''
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return

      const isModified = e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || (e as any).button !== 0 || !!anchor.target
      if (isModified) return

      const url = new URL(anchor.href, window.location.href)
      if (url.origin !== window.location.origin) return

      e.preventDefault()
      if (url.pathname !== window.location.pathname || url.search !== window.location.search || url.hash !== window.location.hash) {
        window.history.pushState({}, '', url.pathname + url.search + url.hash)
        setPath(url.pathname)
      }
    }

    document.addEventListener('click', onClick)

    return () => {
      window.removeEventListener('popstate', onPop)
      document.removeEventListener('click', onClick)
    }
  }, [])

  if (!ready) return null

  // Manual routing based on pathname

  if (!authed) return <Auth />

  if (path === '/' || path === '') return <Home />
  if (path === '/dashboard') return <Dashboard />

  // Fallback
  return <Home />
}