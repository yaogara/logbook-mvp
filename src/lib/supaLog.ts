export async function logSupaError(context: string, error: any) {
  try {
    // Always log to console
    console.error(`Supabase error [${context}]`, error)
    // In production, best-effort post to Vercel API route (non-blocking)
    if (typeof fetch !== 'undefined' && (import.meta as any)?.env?.PROD) {
      void fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context, message: String(error?.message || error), ts: Date.now() }),
      }).catch(() => {})
    }
  } catch {
    // ignore
  }
}

