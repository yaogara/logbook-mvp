import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// Map emails to display names
const emailToName: Record<string, string> = {
  'carl.turpin@gmail.com': 'admin',
  'samuel@example.com': 'Samuel',
  // Add more email-to-name mappings here
}

export default function UserBadge() {
  const [email, setEmail] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null)
    })
  }, [])

  if (!email) return null

  // Get display name from mapping, or extract first part of email as fallback
  const displayName = emailToName[email] || email.split('@')[0]

  return (
    <div className="text-xs text-gray-600">
      Signed in as <span className="font-medium">{displayName}</span>
    </div>
  )
}
