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
          ? 'https://logbook-mvp.vercel.app'
          : window.location.origin;
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: redirectTo,
        },
      })
      if (error) throw error
      setSent(true)
    } catch (err: any) {
      setError(err?.message || 'Failed to send link')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      {sent ? (
        <div className="w-full max-w-md bg-white rounded-xl shadow p-6 space-y-4 border border-gray-100">
          <h1 className="text-2xl font-semibold text-gray-900">Check your email</h1>
          <p className="text-sm text-gray-700">Check your email for the login link.</p>
        </div>
      ) : (
        <form onSubmit={sendLink} className="w-full max-w-md bg-white rounded-xl shadow p-6 space-y-4 border border-gray-100">
          <h1 className="text-2xl font-semibold text-gray-900">Log in</h1>
          <p className="text-sm text-gray-600">Enter your email to receive a magic link.</p>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-lg border-gray-300 focus:border-green-500 focus:ring-green-500"
              placeholder="you@example.com"
            />
          </div>
          {error && <div className="text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2 text-sm">{error}</div>}
          <button
            type="submit"
            disabled={loading}
            className="w-full inline-flex items-center justify-center rounded-lg bg-green-600 text-white px-4 py-2 font-medium hover:bg-green-700 disabled:opacity-50"
          >
            {loading ? 'Sending…' : 'Send Link'}
          </button>
        </form>
      )}
    </div>
  )
}
