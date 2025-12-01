export const adminEmails: string[] = ['carl.turpin@gmail.com', 'booking@caminoalsol.com']
export const eggWhitelistedEmails = ['carl.turpin@gmail.com', 'samuel@example.com', 'juanjimenez040813@gmail.com','booking@caminoalsol.com']

export function isAdmin(email?: string | null) {
  if (!email) return false
  return adminEmails.includes(email.toLowerCase())
}

export function isEggUser(email?: string | null) {
  if (!email) return false
  return eggWhitelistedEmails.includes(email.toLowerCase())
}

export function isEggOnlyUser(email?: string | null) {
  // Users who can access eggs but are not admins
  return isEggUser(email) && !isAdmin(email)
}
