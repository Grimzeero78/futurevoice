'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Eye, Flag, Pencil, Trash2, Globe, EyeOff, Lock, Unlock, Hourglass, CalendarDays, Loader2,
  AlertTriangle, MailOpen, KeyRound, MessageCircle, Share2, Send, Smile, Check, Heart,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { toast } from '@/hooks/use-toast'
import { Countdown } from '@/components/fv/countdown'
import { api, recipientLabel, formatDate, timeAgo, REACTION_META, REPORT_REASONS, initials } from '@/lib/fv-client'
import { useFV } from '@/lib/fv-store'
import type { SerializedPost } from '@/lib/fv-core'

type DetailData = {
  post: SerializedPost
  isAuthor: boolean
  isAdmin: boolean
  myReaction: string | null
}

type Teaser = {
  sealedOnly: true
  teaser?: { id: string; releaseAt: string | null; recipientTag: string; customRecipient: string | null; mediaCount: number }
}

type CommentT = {
  id: string
  body: string
  createdAt: string
  userId: string
  author: string
}

/** Quick emoji row — the future is spoken to in the language people use. */
const COMMENT_EMOJI = ['❤️', '😂', '🥹', '😮', '😢', '🔥', '✨', '👏', '🙌', '🫶', '💯', '⏳', '🕰️', '💌', '🌍', '🌟']

export function PostDetail({ id }: { id: string }) {
  const session = useFV((s) => s.session)
  const navigate = useFV((s) => s.navigate)
  const openAuth = useFV((s) => s.openAuth)

  const [data, setData] = useState<DetailData | null>(null)
  const [teaser, setTeaser] = useState<Teaser | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [reacting, setReacting] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)

  // ── social state ──
  const [comments, setComments] = useState<CommentT[] | null>(null)
  const [commentTotal, setCommentTotal] = useState(0)
  const [commentDraft, setCommentDraft] = useState('')
  const [posting, setPosting] = useState(false)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [shared, setShared] = useState(false)
  const commentInput = useRef<HTMLTextAreaElement | null>(null)
  const commentsSection = useRef<HTMLElement | null>(null)

  // ── TikTok-style double-tap to like ──
  const lastTap = useRef(0)
  const [bursts, setBursts] = useState<{ id: number; x: number; y: number }[]>([])

  function doubleTapLike(e: React.MouseEvent) {
    const t = Date.now()
    if (t - lastTap.current > 350) {
      lastTap.current = t
      return
    }
    lastTap.current = 0
    const id = t
    setBursts((b) => [...b, { id, x: e.clientX, y: e.clientY }])
    setTimeout(() => setBursts((b) => b.filter((p) => p.id !== id)), 900)
    if (!data) return
    const { post: p, isAuthor: author } = data
    if (p.status === 'SEALED' && !!p.releaseAt && new Date(p.releaseAt) > new Date()) return
    if (p.privacy !== 'PUBLIC' || p.hidden) return
    if (!session) {
      openAuth('login')
      return
    }
    if (author || data.myReaction === 'HEART') return // burst is enough
    void react('HEART')
  }

  async function toggleLike() {
    if (!data) return
    if (!session) {
      openAuth('login')
      return
    }
    if (data.isAuthor) {
      toast({ title: 'The future does the liking', description: 'You cannot react to your own capsule — but every signal lands where you can see it.' })
      return
    }
    if (reacting) return
    await react(data.myReaction === 'HEART' ? null : 'HEART')
  }

  function scrollToComments() {
    commentsSection.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    if (session) setTimeout(() => commentInput.current?.focus(), 500)
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const d = await api<DetailData | Teaser>(`/api/posts/${id}`)
      if ('sealedOnly' in d && d.sealedOnly) {
        setTeaser(d)
        setData(null)
      } else {
        setData(d as DetailData)
        setTeaser(null)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Capsule not found.')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    const t = setTimeout(() => void load(), 0)
    return () => clearTimeout(t)
  }, [load, session])

  // comments exist only once the capsule is open
  const loadComments = useCallback(async () => {
    try {
      const d = await api<{ comments: CommentT[]; total: number }>(`/api/posts/${id}/comments`)
      setComments(d.comments)
      setCommentTotal(d.total)
    } catch {
      setComments([])
      setCommentTotal(0)
    }
  }, [id])

  useEffect(() => {
    if (!data || teaser) return
    // Date-based, never status: on Cloudflare Workers the SEALED bookkeeping
    // flag can lag behind the release date — comments must open the instant
    // the date passes, exactly like the capsule content itself.
    const dateUnlocked = !data.post.releaseAt || new Date(data.post.releaseAt) <= new Date()
    if (dateUnlocked) void loadComments()
  }, [data, teaser, loadComments])

  async function addComment() {
    if (!session) {
      openAuth('login')
      return
    }
    const body = commentDraft.trim()
    if (!body) return
    setPosting(true)
    try {
      const d = await api<{ comment: CommentT; total: number }>(`/api/posts/${id}/comments`, { method: 'POST', json: { body } })
      setComments((c) => [...(c ?? []), d.comment])
      setCommentTotal(d.total)
      setCommentDraft('')
      setEmojiOpen(false)
    } catch (e) {
      toast({ title: 'Comment failed', description: e instanceof Error ? e.message : 'Try again.', variant: 'destructive' })
    } finally {
      setPosting(false)
    }
  }

  async function removeComment(commentId: string) {
    try {
      await api(`/api/posts/${id}/comments/${commentId}`, { method: 'DELETE' })
      setComments((c) => (c ?? []).filter((x) => x.id !== commentId))
      setCommentTotal((t) => Math.max(0, t - 1))
    } catch (e) {
      toast({ title: 'Could not delete', description: e instanceof Error ? e.message : 'Try again.', variant: 'destructive' })
    }
  }

  async function shareCapsule() {
    if (!data) return
    const url = `${window.location.origin}/#/post/${data.post.id}`
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: data.post.title, text: `A capsule from the past: ${data.post.title}`, url })
        return
      }
      await navigator.clipboard.writeText(url)
      setShared(true)
      setTimeout(() => setShared(false), 2000)
      toast({ title: 'Link copied', description: 'Share it anywhere — WhatsApp, a group chat, the family thread.' })
    } catch {
      // user dismissed the native share sheet — not an error
    }
  }

  async function react(type: string | null) {
    if (!session) {
      openAuth('login')
      return
    }
    if (!data) return
    setReacting(true)
    const prev = data.myReaction
    const next = prev === type ? null : type
    // optimistic
    setData({ ...data, myReaction: next })
    try {
      await api(`/api/posts/${id}/react`, { method: 'POST', json: { type: next } })
      await load()
    } catch (e) {
      setData({ ...data, myReaction: prev })
      toast({ title: 'Reaction failed', description: e instanceof Error ? e.message : 'Try again.', variant: 'destructive' })
    } finally {
      setReacting(false)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16" aria-busy="true">
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
        <div className="mt-6 h-8 w-2/3 animate-pulse rounded bg-muted" />
        <div className="mt-4 h-40 animate-pulse rounded bg-muted" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <AlertTriangle className="mx-auto mb-4 h-10 w-10 text-muted-foreground" aria-hidden />
        <h1 className="font-display text-2xl font-bold">{error}</h1>
        <Button variant="outline" className="mt-6" onClick={() => navigate({ name: 'archive' })}>
          Back to the archive
        </Button>
      </div>
    )
  }

  /* ─── Sealed teaser view ─── */
  if (teaser?.teaser) {
    const t = teaser.teaser
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <div className="sealed-stripes rounded-2xl border-2 border-dashed border-primary/40 bg-card p-10 text-center shadow-lg">
          <span className="relative mx-auto mb-6 flex h-20 w-20 items-center justify-center">
            <span className="absolute h-20 w-20 rounded-full bg-primary/25 ring-pulse" aria-hidden />
            <span className="wax-seal flex h-16 w-16 items-center justify-center rounded-full">
              <Lock className="h-8 w-8 text-primary-foreground" aria-hidden />
            </span>
          </span>
          <p className="text-sm font-medium uppercase tracking-widest text-primary">This capsule is sealed</p>
          <h1 className="mt-2 font-display text-2xl font-bold">Its words are waiting for {t.releaseAt ? formatDate(t.releaseAt, { year: 'numeric' }) : 'the right moment'}</h1>
          <p className="mx-auto mt-3 max-w-md text-muted-foreground">
            {t.mediaCount > 0
              ? `${t.mediaCount} file${t.mediaCount === 1 ? '' : 's'} sleep inside. `
              : ''}
            Come back when the seal breaks — the countdown is already running.
          </p>
          {t.releaseAt && (
            <div className="mt-8">
              <Countdown target={t.releaseAt} />
            </div>
          )}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-2 text-sm text-muted-foreground">
            <Badge variant="secondary">{recipientLabel(t.recipientTag, t.customRecipient)}</Badge>
          </div>
        </div>
      </div>
    )
  }

  if (!data) return null
  const { post, isAuthor } = data
  const sealed = post.status === 'SEALED' && !!post.releaseAt && new Date(post.releaseAt) > new Date()
  const canReact = session && !sealed && post.privacy === 'PUBLIC' && !isAuthor
  const likeCount = post.reactionCounts['HEART'] ?? 0
  const socialOpen = !sealed && post.privacy === 'PUBLIC' && !post.hidden

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      {/* header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="gap-1">
              <Hourglass className="h-3 w-3" aria-hidden /> {recipientLabel(post.recipientTag, post.customRecipient)}
            </Badge>
            <Badge variant={post.privacy === 'PUBLIC' ? 'outline' : 'secondary'} className="gap-1">
              {post.privacy === 'PUBLIC' ? <Globe className="h-3 w-3" aria-hidden /> : <EyeOff className="h-3 w-3" aria-hidden />}
              {post.privacy === 'PUBLIC' ? (post.appearInArchive ? 'Public · listed' : 'Public · unlisted') : 'Private'}
            </Badge>
            {sealed && (
              <Badge className="gap-1 bg-primary text-primary-foreground">
                <Lock className="h-3 w-3" aria-hidden /> Sealed
              </Badge>
            )}
            {post.hidden && (
              <Badge variant="destructive" className="gap-1">Hidden by moderators</Badge>
            )}
          </div>
          <h1 className="font-display text-3xl font-bold leading-tight sm:text-4xl">{post.title}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                {initials(post.author?.displayName ?? '?')}
              </span>
              {post.author?.displayName ?? 'Unknown'}
            </span>
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5" aria-hidden /> {formatDate(post.createdAt)}
            </span>
            {!sealed && (
              <span className="inline-flex items-center gap-1">
                <Eye className="h-3.5 w-3.5" aria-hidden /> {post.views} view{post.views === 1 ? '' : 's'}
              </span>
            )}
          </div>
        </div>

        {isAuthor && !sealed && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate({ name: 'edit', id: post.id })}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Edit
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="font-display">Delete this capsule forever?</AlertDialogTitle>
                  <AlertDialogDescription>This cannot be undone — the future will never read it.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep it</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-white hover:bg-destructive/90"
                    onClick={async () => {
                      try {
                        await api(`/api/posts/${id}`, { method: 'DELETE' })
                        toast({ title: 'Capsule deleted' })
                        navigate({ name: 'dashboard' })
                      } catch (e) {
                        toast({ title: 'Delete failed', description: e instanceof Error ? e.message : 'Try again.', variant: 'destructive' })
                      }
                    }}
                  >
                    Delete forever
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}

        {isAuthor && sealed && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Delete unread
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="font-display">Destroy “{post.title}” unread?</AlertDialogTitle>
                <AlertDialogDescription>
                  The seal holds until{post.releaseAt ? ` ${formatDate(post.releaseAt)}` : ' its day'} — you cannot read the letter or see the files first, not even now. Deleting destroys everything inside, unread, forever.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep it sealed</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-white hover:bg-destructive/90"
                  onClick={async () => {
                    try {
                      await api(`/api/posts/${id}`, { method: 'DELETE' })
                      toast({ title: 'Sealed capsule destroyed, never read' })
                      navigate({ name: 'dashboard' })
                    } catch (e) {
                      toast({ title: 'Delete failed', description: e instanceof Error ? e.message : 'Try again.', variant: 'destructive' })
                    }
                  }}
                >
                  Destroy it unread
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        {/* share — TikTok/IG style, once the capsule is open and public */}
        {!sealed && post.privacy === 'PUBLIC' && !post.hidden && (
          <Button variant="outline" size="sm" onClick={() => void shareCapsule()}>
            {shared ? <Check className="mr-1.5 h-3.5 w-3.5 text-primary" aria-hidden /> : <Share2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />}
            {shared ? 'Copied' : 'Share'}
          </Button>
        )}
      </div>

      {/* countdown strip */}
      {sealed && post.releaseAt && (
        <div className="mb-6 rounded-xl border border-primary/30 bg-primary/5 p-5">
          <Countdown target={post.releaseAt} />
          {isAuthor ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Sealed means sealed — even <span className="font-medium">you</span> cannot see what is inside until the day it opens. You may delete it unread, but there is no peeking. That is the promise of a time capsule.
            </p>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">Come back when the seal breaks — the countdown is already running.</p>
          )}
        </div>
      )}

      {/* author: share the magic key so the right people learn the capsule exists */}
      {isAuthor && post.hasMagicKey && (
        <div className="mb-6 rounded-xl border bg-card p-5">
          <p className="flex items-center gap-2 font-display text-base font-semibold">
            <KeyRound className="h-4 w-4 text-primary" aria-hidden /> Tell your people it exists
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            The capsule only opens for whoever holds your magic key. Send them this message —
            WhatsApp, SMS or a phone call all work.
          </p>
        </div>
      )}

      {/* media */}
      {post.media.length > 0 && (
        <section className="mb-6 space-y-3" aria-label="Attached media">
          {post.media.map((m) =>
            m.kind === 'IMAGE' ? (
              <figure key={m.id} onClick={doubleTapLike} className="cursor-pointer select-none overflow-hidden rounded-xl border shadow-sm">
                <img src={m.url} alt={m.filename} className="max-h-[560px] w-full object-contain bg-secondary/50" loading="lazy" />
              </figure>
            ) : (
              <figure key={m.id} onClick={doubleTapLike} className="cursor-pointer select-none overflow-hidden rounded-xl border bg-black shadow-sm">
                <video src={m.url} controls preload="metadata" className="max-h-[560px] w-full" />
              </figure>
            ),
          )}
        </section>
      )}

      {/* letter */}
      {post.content && (
        <section
          onClick={doubleTapLike}
          className="paper-grain cursor-pointer rounded-xl border bg-card p-6 shadow-sm sm:p-8"
          aria-label="The letter"
        >
          <p className="whitespace-pre-wrap font-display text-[17px] leading-relaxed">{post.content}</p>
        </section>
      )}

      {/* ── TikTok-style action bar: like · comment · share ── */}
      {socialOpen && (
        <div className="mt-4 flex flex-wrap items-center gap-2" aria-label="Like, comment and share">
          <button
            type="button"
            onClick={() => void toggleLike()}
            aria-pressed={data.myReaction === 'HEART'}
            className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition-all ${
              data.myReaction === 'HEART'
                ? 'border-red-500/60 bg-red-500/10 text-red-600 dark:text-red-400'
                : 'bg-card hover:border-red-500/40 hover:bg-red-500/5'
            }`}
          >
            <Heart className={`h-4 w-4 ${data.myReaction === 'HEART' ? 'fill-red-500 text-red-500' : ''}`} aria-hidden />
            {likeCount} {likeCount === 1 ? 'like' : 'likes'}
          </button>
          <button
            type="button"
            onClick={scrollToComments}
            className="flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm transition-all hover:border-primary/50 hover:bg-primary/5"
          >
            <MessageCircle className="h-4 w-4" aria-hidden />
            {commentTotal} {commentTotal === 1 ? 'comment' : 'comments'}
          </button>
          <button
            type="button"
            onClick={() => void shareCapsule()}
            className="flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm transition-all hover:border-primary/50 hover:bg-primary/5"
          >
            {shared ? <Check className="h-4 w-4 text-primary" aria-hidden /> : <Share2 className="h-4 w-4" aria-hidden />}
            {shared ? 'Copied' : 'Share'}
          </button>
          <span className="ml-1 hidden text-xs text-muted-foreground sm:inline">double-tap the letter to ❤️</span>
        </div>
      )}

      <Separator className="my-8" />

      {/* reactions */}
      <section aria-label="Reactions">
        <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold">
          <MailOpen className="h-4 w-4 text-primary" aria-hidden />
          Leave a signal for the future
        </h2>
        {canReact ? (
          <div className="flex flex-wrap gap-2">
            {REACTION_META.map((r) => {
              const active = data.myReaction === r.type
              const count = post.reactionCounts[r.type] ?? 0
              return (
                <button
                  key={r.type}
                  disabled={reacting}
                  onClick={() => void react(r.type)}
                  aria-pressed={active}
                  className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition-all disabled:opacity-60 ${
                    active
                      ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                      : 'bg-card hover:border-primary/50 hover:bg-primary/5'
                  }`}
                >
                  <span aria-hidden>{r.type === 'HEART' ? '❤️' : r.type === 'STAR' ? '🌟' : r.type === 'CLOCK' ? '🕰️' : '✨'}</span>
                  {r.label}
                  {count > 0 && <span className={`tabular-nums ${active ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>{count}</span>}
                </button>
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {isAuthor
              ? `${post.reactionTotal} signal${post.reactionTotal === 1 ? '' : 's'} received so far.`
              : sealed
                ? 'Reactions open when the capsule does.'
                : 'Sign in to leave a signal for the future.'}
          </p>
        )}
      </section>

      {/* ── the conversation — TikTok/IG style, opens with the capsule ── */}
      <section ref={commentsSection} aria-label="Comments" className="mt-2 scroll-mt-20">
        <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold">
          <MessageCircle className="h-4 w-4 text-primary" aria-hidden />
          {sealed ? 'Comments' : `Comments${commentTotal > 0 ? ` · ${commentTotal}` : ''}`}
        </h2>

        {sealed ? (
          <p className="flex items-center gap-2 rounded-lg border border-dashed bg-secondary/30 p-4 text-sm text-muted-foreground">
            <Lock className="h-4 w-4 shrink-0" aria-hidden />
            Comments open when the capsule does — on {post.releaseAt ? formatDate(post.releaseAt, { year: 'numeric', month: 'long', day: 'numeric' }) : 'its day'} the letter lands and everyone can talk about it, react, and share it.
          </p>
        ) : (
          <>
            {comments === null ? (
              <div className="h-16 animate-pulse rounded bg-muted" aria-hidden />
            ) : comments.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No comments yet — the seal just broke. Be the first voice of the future.
              </p>
            ) : (
              <ul className="space-y-4">
                {comments.map((c) => {
                  const mine = session?.id === c.userId
                  const canDelete = mine || isAuthor || data.isAdmin
                  return (
                    <li key={c.id} className="flex items-start gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                        {initials(c.author)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm">
                          <span className="font-semibold">{c.author}</span>{' '}
                          <span className="text-xs text-muted-foreground">{timeAgo(c.createdAt)}</span>
                        </p>
                        <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">{c.body}</p>
                      </div>
                      {canDelete && (
                        <button
                          type="button"
                          aria-label={mine ? 'Delete your comment' : 'Delete this comment'}
                          onClick={() => void removeComment(c.id)}
                          className="rounded p-1 text-muted-foreground transition-colors hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}

            {/* composer */}
            {session ? (
              <div className="mt-5 rounded-xl border bg-card p-3">
                {emojiOpen && (
                  <div className="mb-2 flex flex-wrap gap-1 rounded-lg border border-dashed bg-secondary/40 p-2" role="toolbar" aria-label="Emoji picker">
                    {COMMENT_EMOJI.map((em) => (
                      <button
                        key={em}
                        type="button"
                        className="rounded p-1 text-lg leading-none transition-transform hover:scale-125"
                        aria-label={`Insert ${em}`}
                        onClick={() => {
                          setCommentDraft((d) => (d + em).slice(0, 1000))
                          commentInput.current?.focus()
                        }}
                      >
                        {em}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <Textarea
                    ref={commentInput}
                    value={commentDraft}
                    onChange={(e) => setCommentDraft(e.target.value.slice(0, 1000))}
                    rows={2}
                    maxLength={1000}
                    placeholder="Say something to the future… emoji welcome ❤️🔥✨"
                    aria-label="Write a comment"
                    className="min-h-0 flex-1 resize-none"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void addComment()
                    }}
                  />
                  <div className="flex flex-col gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label="Emoji picker"
                      aria-expanded={emojiOpen}
                      onClick={() => setEmojiOpen((o) => !o)}
                    >
                      <Smile className="h-4 w-4" aria-hidden />
                    </Button>
                    <Button type="button" size="sm" disabled={posting || !commentDraft.trim()} onClick={() => void addComment()}>
                      {posting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden /> : <Send className="mr-1.5 h-3.5 w-3.5" aria-hidden />}
                      Send
                    </Button>
                  </div>
                </div>
                <p className="mt-1 text-right text-[11px] text-muted-foreground">{commentDraft.length}/1,000 · ⌘/Ctrl+Enter to send</p>
              </div>
            ) : (
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed p-4">
                <p className="text-sm text-muted-foreground">Join the conversation — the capsule is open and the future is listening.</p>
                <Button size="sm" onClick={() => openAuth('login')}>Sign in to comment</Button>
              </div>
            )}
          </>
        )}
      </section>

      {/* report */}
      {!isAuthor && post.privacy === 'PUBLIC' && !sealed && (
        <div className="mt-10 flex justify-end">
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => (session ? setReportOpen(true) : openAuth('login'))}>
            <Flag className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Report this capsule
          </Button>
        </div>
      )}

      <ReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        postId={post.id}
        onDone={() => toast({ title: 'Report received', description: 'A moderator will review it shortly.' })}
      />

      {/* double-tap heart bursts */}
      {bursts.map((b) => (
        <span
          key={b.id}
          aria-hidden
          className="heart-burst pointer-events-none fixed z-50 select-none text-6xl"
          style={{ left: b.x, top: b.y }}
        >
          ❤️
        </span>
      ))}
    </div>
  )
}

function ReportDialog({
  open, onOpenChange, postId, onDone,
}: { open: boolean; onOpenChange: (o: boolean) => void; postId: string; onDone: () => void }) {
  const [reason, setReason] = useState('INAPPROPRIATE')
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    try {
      await api(`/api/posts/${postId}/report`, { method: 'POST', json: { reason, details } })
      onDone()
      onOpenChange(false)
      setDetails('')
    } catch (e) {
      toast({ title: 'Report failed', description: e instanceof Error ? e.message : 'Try again.', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Report this capsule</DialogTitle>
          <DialogDescription>
            Tell a moderator what feels wrong. Reports are confidential.
          </DialogDescription>
        </DialogHeader>
        <RadioGroup value={reason} onValueChange={setReason} className="gap-2">
          {REPORT_REASONS.map((r) => (
            <label key={r.value} className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm hover:bg-secondary/50">
              <RadioGroupItem value={r.value} id={`report-${r.value}`} />
              {r.label}
            </label>
          ))}
        </RadioGroup>
        <div className="space-y-2">
          <Label htmlFor="report-details">Details (optional)</Label>
          <Textarea id="report-details" value={details} onChange={(e) => setDetails(e.target.value)} rows={3} maxLength={1000} placeholder="Anything that helps the moderator understand." />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />} Send report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
