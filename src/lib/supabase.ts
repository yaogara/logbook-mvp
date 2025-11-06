import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let supabase: SupabaseClient | null = null

export function getSupabase() {
  if (supabase) return supabase
  const url = import.meta.env.VITE_SUPABASE_URL as string
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string
  if (!url || !key) {
    console.warn('Supabase env not set. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY')
  }
  supabase = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    global: { fetch: (...args) => fetch(...args) },
  })
  return supabase
}

export async function getCurrentSession() {
  const sb = getSupabase()
  const { data } = await sb.auth.getSession()
  return data?.session ?? null
}

type AuthStateChangeHandler = Parameters<
  ReturnType<typeof getSupabase>['auth']['onAuthStateChange']
>[0]

export function onAuthChange(callback: AuthStateChangeHandler) {
  const sb = getSupabase()
  return sb.auth.onAuthStateChange((event, session) => callback(event, session))
}

