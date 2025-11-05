import { useEffect, useState } from 'react'
import Auth from './components/Auth'
import Home from './pages/Home'
import { getSupabase } from './lib/supabase'
import { installConnectivitySync } from './lib/sync'
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
    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      setAuthed(!!session)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  if (!ready) return null
  return authed ? <Home /> : <Auth />
}
