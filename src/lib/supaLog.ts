export async function logSupaError(context: string, error: any) {
  try {
    // Always log to console
    console.error(`Supabase error [${context}]`, error)
    // Best-effort post to Vercel API route (non-blocking)
    if (typeof fetch !== 'undefined') {
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

