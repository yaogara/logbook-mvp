import { useState } from 'react'
import { getSupabase } from '../lib/supabase'

export default function Auth() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string>('')

  async function sendLink(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSent(false)
    setLoading(true)
    
    try {
      const supabase = getSupabase()
      const redirectTo =
        window.location.hostname.includes('vercel.app')
          ? 'https://app.yaogara.com'
          : window.location.origin;
      
      console.log('Attempting to send OTP to:', email)
      console.log('Redirect URL:', redirectTo)
      
      const { error, data } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: redirectTo,
        },
      })

      console.log('Sign in response:', { error, data })

      if (error) {
        console.error('Authentication error details:', {
          code: error.code,
          status: error.status,
          message: error.message,
          name: error.name,
        })
        throw error
      }
      
      setSent(true)
    } catch (err: any) {
      console.error('Full error object:', err)
      const errorMessage = err?.message || 'No se pudo enviar el enlace. Intenta de nuevo.'
      console.error('Error details:', {
        name: err?.name,
        status: err?.status,
        code: err?.code,
        stack: err?.stack,
      })
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[rgb(var(--bg))]">
      {sent ? (
        <div className="w-full max-w-md bg-[rgb(var(--card))] rounded-xl shadow p-6 space-y-4 border border-[rgb(var(--border))]">
          <h1 className="text-2xl font-semibold text-[rgb(var(--fg))]">Revisa tu correo</h1>
          <p className="text-sm text-[rgb(var(--muted))]">Revisa tu correo para encontrar el enlace de inicio de sesión.</p>
        </div>
      ) : (
        <form onSubmit={sendLink} className="w-full max-w-md bg-[rgb(var(--card))] rounded-xl shadow p-6 space-y-4 border border-[rgb(var(--border))]">
          <h1 className="text-2xl font-semibold text-[rgb(var(--fg))]">Iniciar sesión</h1>
          <p className="text-sm text-[rgb(var(--muted))]">Ingresa tu correo para recibir un enlace mágico.</p>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-[rgb(var(--muted))] mb-1">Correo electrónico</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="input text-[rgb(var(--fg))]"
              placeholder="tu@ejemplo.com"
            />
          </div>
          {error && (
            <div className="text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-md px-3 py-2 text-sm">
              {error}
              <div className="mt-1 text-xs opacity-80">
                Si este problema persiste, intenta de nuevo más tarde o contacta al soporte.
              </div>
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full inline-flex items-center justify-center rounded-lg bg-[rgb(var(--primary))] text-white px-4 py-2 font-medium hover:bg-[rgb(var(--primary-600))] disabled:opacity-50"
          >
            {loading ? 'Enviando…' : 'Enviar enlace'}
          </button>
        </form>
      )}
    </div>
  )
}
