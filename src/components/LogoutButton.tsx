import { supabase } from '../lib/supabase'

export default function LogoutButton() {
  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.reload()
  }

  return (
    <button
      onClick={handleLogout}
      aria-label="Log out"
      title="Log out"
      className="rounded-lg bg-gray-100 hover:bg-gray-200 p-2 text-base"
    >
      <span aria-hidden>🚪</span>
      <span className="sr-only">Log out</span>
    </button>
  )
}
