/**
 * Password policy shared by the server (register / change password) and
 * the client (live strength meter). No server-only imports on purpose.
 *
 * Policy: at least 8 characters, with at least one letter and one number.
 * The UI advises 12+ characters mixing letters, numbers and symbols —
 * long pass-phrases stay the recommended way to survive the decades.
 */

export function passwordIssue(pw: string): string | null {
  if (pw.length < 8) return 'Use at least 8 characters for your password.'
  if (!/[a-zA-Z]/.test(pw)) return 'Include at least one letter — pure numbers are too easy to crack.'
  if (!/\d/.test(pw)) return 'Include at least one number to make your password stronger.'
  return null
}

/** 0 = weak … 3 = excellent. Used only for the client-side meter. */
export function passwordStrength(pw: string): 0 | 1 | 2 | 3 {
  if (!pw) return 0
  let score = 0
  if (pw.length >= 8) score++
  if (pw.length >= 12 && /[a-zA-Z]/.test(pw) && /\d/.test(pw)) score++
  if (pw.length >= 16 || (/[^a-zA-Z0-9]/.test(pw) && pw.length >= 10)) score++
  if (score === 0 && pw.length > 0) score = 1 // anything non-empty is at least "weak"
  return Math.min(3, score) as 0 | 1 | 2 | 3
}

export const STRENGTH_LABELS = ['Too weak', 'Weak', 'Strong', 'Excellent'] as const

export const PASSWORD_ADVICE =
  'Strong passwords survive the decades: 12+ characters mixing letters, numbers and symbols — or a passphrase of 4 random words. Never reuse a password from another site.'
