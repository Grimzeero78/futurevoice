import { db } from '@/lib/db'

// ─── Community standards engine ──────────────────────────────────
// Screens text that would appear in the public archive, records
// violations ("strikes"), auto-bans repeat offenders and auto-
// quarantines capsules that collect multiple community reports.
// Lists below are intentionally editable — extend them any time.

const HARD_BLOCKLIST = [
  // explicit adult / pornographic
  'porn', 'pornhub', 'xvideos', 'xnxx', 'onlyfans', 'nudes', 'naked pics',
  'sex video', 'sex tape', 'blowjob', 'handjob', 'cumshot', 'dildo',
  'hentai', 'escort service', 'camgirl', 'sugardaddy', 'sugar daddy',
  'hookup for sex', 'hookup for money', 'erotic massage', 'strip club',
  'fetish chat', 'xxx', 'nsfw pics', 'lewd pics', 'sexy time',
  'horny', 'horny chat', 'sext with me', 'sexting', 'send nudes',
  'trade nudes', 'nudes for', 'adult content', '18+ content', 'xxx video',
  'free sex', 'casual sex', 'one night stand near', 'ashawo', 'obo',
  // child safety (absolute zero-tolerance)
  'cp trade', 'child porn', 'minor nudes', 'teen nudes', 'jailbait',
  // hate / violent extremism
  'n1gger', 'nigga', 'f4ggot', 'faggot', 'kike', 'spic', 'wetback',
  'chink', 'tranny', 'retard', 'gypsi trash', 'gas the jews',
  'white power', 'black power kill', 'heil hitler', 'nazi scum',
  'kill all', 'ethnic cleansing', 'rape all', 'lynch the',
  'terrorist attack plan', 'how to build a bomb', 'how to make a bomb',
  'mass shooting plan', 'school shooting', 'jihad against',
  // scams / fraud
  'free crypto giveaway', 'double your bitcoin', 'binary options signals',
  'forex signals buy', 'work from home millionaire', 'click my telegram',
  'join my telegram', 'dm me on telegram', 'whatsapp me for money',
  'invest now and get rich', 'guaranteed profit', 'ponzi', 'pyramid scheme',
  'casino bonus', 'betting tips guaranteed', 'jackpot prediction',
  'loan without collateral', 'fake passport', 'counterfeit money',
  'carding', 'bank logs', 'cashout method', 'blaza cashout',
]

// Softer toxic patterns — escalate when combined with hostile context
const TOXIC_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\b(kill|hang|shoot|stab|poison)\s+(your|yo)? ?self\b/i, label: 'self-harm incitement' },
  { re: /\bi (will|wanna|want to|gonna) (find|hunt) (and )?(kill|hurt|beat) you\b/i, label: 'threat of violence' },
  { re: /\b(you|u) (are|is|re) (a )?(worthless|useless|subhuman)\b/i, label: 'degrading abuse' },
  { re: /\bgo (back to|die in) (your|the) country\b/i, label: 'xenophobic abuse' },
  { re: /\b(your|yo) (mother|mom|mama|sister|daughter) .{0,24}\b(fuck|screw|bitch|slut|whore)\b/i, label: 'sexualized abuse' },
  { re: /\bf[u*]ck (you|u|off|up)\b/i, label: 'direct profanity' },
  { re: /\b(mother ?f[u*]cker|bastard|son of a bitch)\b/i, label: 'direct profanity' },
]

// Leetspeak / spacing tricks get normalized before screening
function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/[0]/g, 'o')
    .replace(/[1|!]/g, 'i')
    .replace(/[3]/g, 'e')
    .replace(/[4@]/g, 'a')
    .replace(/[5$]/g, 's')
    .replace(/[7]/g, 't')
    .replace(/[*_\-\.]+/g, '')
    .replace(/\s+/g, ' ')
}

function containsHardBlocked(normalized: string): string | null {
  for (const term of HARD_BLOCKLIST) {
    const norm = normalizeText(term)
    // word-boundary match for short terms, substring for phrases
    if (/^[a-z0-9 ]{1,4}$/.test(norm)) {
      if (new RegExp(`(^| )${norm}( |$)`).test(normalized)) return term
    } else if (normalized.includes(norm)) {
      return term
    }
  }
  return null
}

function matchToxic(normalized: string): string | null {
  for (const p of TOXIC_PATTERNS) {
    if (p.re.test(normalized)) return p.label
  }
  return null
}

export type ScreenResult = {
  flagged: boolean
  reason?: string
  match?: string
}

/**
 * Screen user text that would appear in the public archive.
 * `context` is used only for friendlier messages.
 */
export function screenText(parts: Array<string | null | undefined>, context = 'capsule'): ScreenResult {
  const joined = parts.filter(Boolean).join(' \n ')
  if (!joined) return { flagged: false }
  const normalized = normalizeText(joined)

  const hard = containsHardBlocked(normalized)
  if (hard) {
    return {
      flagged: true,
      reason: `Our community standards keep this archive safe for every generation. Your ${context} can't be published publicly because it matches blocked content ("${hard}"). Private capsules are not affected.`,
      match: hard,
    }
  }

  const toxic = matchToxic(normalized)
  if (toxic) {
    return {
      flagged: true,
      reason: `Our community standards keep this archive safe for every generation. Your ${context} can't be published publicly because it reads as ${toxic}. Private capsules are not affected.`,
      match: toxic,
    }
  }

  return { flagged: false }
}

// ─── Strikes & bans ──────────────────────────────────────────────

import { env } from '@/lib/env'

// read lazily so Cloudflare bindings count too (module init has no request context)
export const BAN_THRESHOLD = () => Number(env('MODERATION_BAN_THRESHOLD') ?? 3)
export const AUTO_HIDE_REPORTS = () => Number(env('MODERATION_AUTO_HIDE_REPORTS') ?? 3)

export const BAN_MESSAGE =
  'Your account has been banned for repeatedly violating the Future Voices community standards.'

/**
 * Record a moderation strike against a user. When the threshold is
 * reached the account is banned, all sessions are destroyed and the
 * author's public capsules are hidden from the archive.
 */
export async function registerViolation(userId: string, reason: string): Promise<{ violations: number; banned: boolean }> {
  const user = await db.user.update({
    where: { id: userId },
    data: { violations: { increment: 1 } },
    select: { violations: true, banned: true, role: true },
  })

  if (user.banned) return { violations: user.violations, banned: true }

  // Admin accounts record strikes but are never auto-banned — a solo
  // admin could otherwise lock the whole platform out. Another admin
  // can still ban one manually from the Members desk.
  if (user.role === 'ADMIN') {
    return { violations: user.violations, banned: false }
  }

  if (user.violations >= BAN_THRESHOLD()) {
    await banUser(userId, `Automatic ban — ${BAN_THRESHOLD()} community-standards violations. Last one: ${reason}`)
    return { violations: user.violations, banned: true }
  }
  return { violations: user.violations, banned: false }
}

/** Ban an account: kill sessions, hide their public capsules. */
export async function banUser(userId: string, reason: string) {
  await db.$transaction([
    db.user.update({
      where: { id: userId },
      data: { banned: true, bannedAt: new Date(), banReason: reason },
    }),
    db.session.deleteMany({ where: { userId } }),
    db.post.updateMany({
      where: { authorId: userId, privacy: 'PUBLIC', hidden: false },
      data: { hidden: true, hiddenReason: `Author banned: ${reason}` },
    }),
  ])
}

/** Lift a ban: the account can sign in again; capsules stay hidden until an admin restores them. */
export async function unbanUser(userId: string) {
  await db.user.update({
    where: { id: userId },
    data: { banned: false, bannedAt: null, banReason: null, violations: 0 },
  })
}
