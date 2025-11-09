import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { logSupaError } from './supaLog'

let client: SupabaseClient | null = null

// Custom fetch with timeout
function fetchWithTimeout(url: RequestInfo | URL, options?: RequestInit, timeout = 10000): Promise<Response> {
  return Promise.race([
    fetch(url, options),
    new Promise<Response>((_, reject) =>
      setTimeout(() => reject(new Error('Request timeout')), timeout)
    ),
  ])
}

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
      storageKey: 'supabase.auth.token',
      flowType: 'pkce',
    },
    global: {
      fetch: (url: RequestInfo | URL, options: RequestInit = {}) => {
        // Add timeout to all requests
        return fetchWithTimeout(url, options, 10000).catch((err) => {
          // Suppress repetitive network errors in console
          if (err.message === 'Request timeout' || err.message === 'Failed to fetch') {
            console.debug('⚠️ Network request failed:', url);
          }
          throw err;
        });
      },
    },
  })
  console.log('✅ Supabase client initialized:', url);
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
