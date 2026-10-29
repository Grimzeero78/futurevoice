'use client'

import { useCallback, useEffect, useState } from 'react'
import { Bell, Hourglass } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { api, formatDate } from '@/lib/fv-client'
import { useFV } from '@/lib/fv-store'

type Notification = {
  id: string
  kind: string
  title: string
  body: string
  postId: string | null
  entryId: string | null
  createdAt: string
  readAt: string | null
}

/**
 * The notification bell: shows "your capsule opened" / "your sealed diary
 * entry unlocked" moments in-app. Polls quietly every minute; a badge
 * carries the unread count; opening an item takes you to it.
 */
export function NotificationsBell() {
  const session = useFV((s) => s.session)
  const navigate = useFV((s) => s.navigate)
  const [items, setItems] = useState<Notification[] | null>(null)
  const [unread, setUnread] = useState(0)

  const load = useCallback(async () => {
    try {
      const d = await api<{ notifications: Notification[]; unread: number }>('/api/me/notifications')
      setItems(d.notifications)
      setUnread(d.unread)
    } catch {
      // the bell stays quiet if the network hiccups — the next poll retries
    }
  }, [])

  useEffect(() => {
    if (!session) {
      const t = setTimeout(() => {
        setItems(null)
        setUnread(0)
      }, 0)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => void load(), 800)
    const id = setInterval(() => void load(), 60_000)
    return () => {
      clearTimeout(t)
      clearInterval(id)
    }
  }, [session, load])

  async function markAll() {
    await api('/api/me/notifications/read', { method: 'POST', json: { all: true } }).catch(() => {})
    const now = new Date().toISOString()
    setUnread(0)
    setItems((prev) => prev?.map((n) => ({ ...n, readAt: n.readAt ?? now })) ?? null)
  }

  function openItem(n: Notification) {
    if (!n.readAt) {
      void api('/api/me/notifications/read', { method: 'POST', json: { id: n.id } }).catch(() => {})
      setUnread((u) => Math.max(0, u - 1))
      setItems((prev) =>
        prev?.map((x) => (x.id === n.id ? { ...x, readAt: x.readAt ?? new Date().toISOString() } : x)) ?? null,
      )
    }
    if (n.postId) navigate({ name: 'post', id: n.postId })
    else if (n.entryId) navigate({ name: 'diary' })
  }

  if (!session) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={unread > 0 ? `Notifications — ${unread} unread` : 'Notifications'}
        >
          <Bell className="h-4 w-4" aria-hidden />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[21rem]">
        <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
          <p className="font-display text-sm font-semibold">Notifications</p>
          {unread > 0 && (
            <button
              className="text-xs text-primary hover:underline"
              onClick={(e) => {
                e.stopPropagation()
                void markAll()
              }}
            >
              Mark all read
            </button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {items === null ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">…</p>
          ) : items.length === 0 ? (
            <div className="px-3 py-8 text-center">
              <Hourglass className="mx-auto mb-2 h-6 w-6 text-muted-foreground" aria-hidden />
              <p className="text-sm text-muted-foreground">
                Nothing yet. When a sealed capsule or diary day opens, you will hear about it here.
              </p>
            </div>
          ) : (
            items.map((n) => (
              <button
                key={n.id}
                onClick={() => openItem(n)}
                className={`flex w-full flex-col gap-0.5 border-t px-3 py-2.5 text-left transition-colors first:border-t-0 hover:bg-secondary/60 ${
                  n.readAt ? 'opacity-70' : 'bg-primary/[0.04]'
                }`}
              >
                <span className="flex items-start gap-2">
                  {!n.readAt && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden />}
                  <span className="flex-1">
                    <span className="block text-sm font-medium leading-snug">{n.title}</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{n.body}</span>
                    <span className="mt-1 block text-[11px] text-muted-foreground/80">
                      {formatDate(n.createdAt, { hour: 'numeric', minute: '2-digit' })}
                    </span>
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
