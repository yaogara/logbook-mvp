import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { logSupaError } from './supaLog'

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
  // Basic connectivity test (non-blocking)
  try {
    // Try a lightweight HEAD to REST endpoint; treat any resolved fetch as connectivity OK
    const restBase = `${url.replace(/\/$/, '')}/rest/v1/`
    fetch(restBase, { method: 'HEAD', mode: 'no-cors' })
      .then(() => console.log('✅ Supabase connected successfully'))
      .catch(() => console.warn('❌ Supabase connection failed'))
  } catch {
    // no-op
  }
  return client
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

// Optional named export for consumers that prefer direct access
export const supabase = getSupabase()

// Auto-retry wrapper with exponential backoff
export async function safeQuery<T>(
  fn: () => PromiseLike<{ data: T | null; error: any }>,
  context: string = 'unknown',
  retries: number = 2,
): Promise<{ data: T | null; error?: any }> {
  for (let i = 0; i <= retries; i++) {
    const { data, error } = await fn()
    if (!error) return { data }
    console.warn(`⚠️ Supabase error in ${context}, attempt ${i + 1}:`, error?.message || error)
    if (i < retries) {
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, i)))
      continue
    }
  }
  logSupaError(`${context} (after ${retries + 1} attempts)`, new Error('Retries exhausted'))
  return { data: null, error: 'Retries exhausted' }
}
