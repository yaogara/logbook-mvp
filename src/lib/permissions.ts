export const eggWhitelistedEmails = ['carl.turpin@gmail.com']

export function isEggUser(email?: string | null) {
  if (!email) return false
  return eggWhitelistedEmails.includes(email.toLowerCase())
}
