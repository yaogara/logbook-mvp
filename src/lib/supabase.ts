import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

export function getSupabase() {
  if (client) return client
  const url = import.meta.env.VITE_SUPABASE_URL as string
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string
  if (!url || !key) {
    console.warn('Supabase env not set. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY')
  }
  client = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    global: { fetch: (...args) => fetch(...args) },
  })
  return client
}

export async function getCurrentSession() {
  const sb = getSupabase()
  const { data } = await sb.auth.getSession()
  return data.session
}

export function onAuthChange(callback: Parameters<typeof getSupabase>[0] extends never ? any : (event: any, session: any) => void) {
  const sb = getSupabase()
  return sb.auth.onAuthStateChange((event, session) => callback(event, session))
}

// Optional named export for consumers that prefer direct access
export const supabase = getSupabase()
