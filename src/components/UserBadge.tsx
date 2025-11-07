import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function UserBadge() {
  const [email, setEmail] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null)
    })
  }, [])

  if (!email) return null

  return (
    <div className="text-xs text-gray-600">
      Signed in as <span className="font-medium">{email}</span>
    </div>
  )
}
