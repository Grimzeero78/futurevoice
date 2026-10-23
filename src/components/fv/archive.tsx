'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Search, SlidersHorizontal, ChevronLeft, ChevronRight, ArchiveX } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { PostCard } from '@/components/fv/post-card'
import { api, RECIPIENT_LABELS } from '@/lib/fv-client'
import type { SerializedPost } from '@/lib/fv-core'

type Filters = {
  q: string
  recipient: string
  mediaType: string
  year: string
  sort: string
}

const INITIAL: Filters = { q: '', recipient: 'ALL', mediaType: 'ALL', year: '', sort: 'newest' }

export function Archive() {
  const [filters, setFilters] = useState<Filters>(INITIAL)
  const [posts, setPosts] = useState<SerializedPost[] | null>(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async (f: Filters, p: number) => {
    await Promise.resolve() // yield so state resets happen outside the effect body
    setError(null)
    setPosts(null)
    try {
      const params = new URLSearchParams({
        q: f.q,
        recipient: f.recipient === 'ALL' ? '' : f.recipient,
        mediaType: f.mediaType,
        year: f.year,
        sort: f.sort,
        page: String(p),
      })
      const data = await api<{ posts: SerializedPost[]; totalPages: number; total: number }>(
        `/api/posts?${params.toString()}`,
      )
      setPosts(data.posts)
      setTotalPages(data.totalPages)
      setTotal(data.total)
      setPage(p)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The archive could not be reached.')
      setPosts([])
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => void load(filters, 1), 0)
    return () => clearTimeout(t)
  }, [filters.recipient, filters.mediaType, filters.year, filters.sort])

  function onSearch(value: string) {
    setFilters((f) => ({ ...f, q: value }))
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(() => void load({ ...filters, q: value }, 1), 350)
  }

  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }))
  const hasFilters = filters.q || filters.recipient !== 'ALL' || filters.mediaType !== 'ALL' || filters.year

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <header className="mb-8">
        <h1 className="font-display text-3xl font-bold sm:text-4xl">The Future Archive</h1>
        <p className="mt-2 text-muted-foreground">
          {total} message{total === 1 ? '' : 's'} addressed to tomorrow — searchable by year, recipient and medium.
        </p>
      </header>

      {/* filters */}
      <div className="mb-8 rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <SlidersHorizontal className="h-4 w-4" aria-hidden /> Filter the vault
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="relative sm:col-span-2 lg:col-span-2">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={filters.q}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Search titles, letters, recipients…"
              className="pl-9"
              aria-label="Search capsules"
            />
          </div>
          <Select value={filters.recipient} onValueChange={(v) => set({ recipient: v })}>
            <SelectTrigger aria-label="Filter by recipient">
              <SelectValue placeholder="Recipient" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All recipients</SelectItem>
              {Object.entries(RECIPIENT_LABELS)
                .filter(([k]) => k !== 'NONE')
                .map(([k, label]) => (
                  <SelectItem key={k} value={k}>{label}</SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Select value={filters.mediaType} onValueChange={(v) => set({ mediaType: v })}>
            <SelectTrigger aria-label="Filter by media type">
              <SelectValue placeholder="Media" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All media</SelectItem>
              <SelectItem value="video">Video messages</SelectItem>
              <SelectItem value="image">Photographs</SelectItem>
              <SelectItem value="text">Written letters</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Input
              value={filters.year}
              onChange={(e) => {
                const y = e.target.value.replace(/\D/g, '').slice(0, 4)
                set({ year: y })
                if (y.length === 4 || y === '') void load({ ...filters, year: y }, 1)
              }}
              placeholder="Year"
              inputMode="numeric"
              aria-label="Filter by year"
            />
            <Select value={filters.sort} onValueChange={(v) => set({ sort: v })}>
              <SelectTrigger className="w-[130px]" aria-label="Sort order">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest</SelectItem>
                <SelectItem value="oldest">Oldest</SelectItem>
                <SelectItem value="soonest">Soonest to open</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {hasFilters && (
          <Button variant="ghost" size="sm" className="mt-3" onClick={() => { setFilters(INITIAL); void load(INITIAL, 1) }}>
            Clear all filters
          </Button>
        )}
      </div>

      {/* results */}
      {error && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-center text-destructive" role="alert">
          {error}
        </div>
      )}

      {!error && posts === null && (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Loading capsules">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-3 rounded-xl border p-4">
              <Skeleton className="h-36 w-full" />
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ))}
        </div>
      )}

      {!error && posts !== null && posts.length === 0 && (
        <div className="rounded-xl border border-dashed p-14 text-center">
          <ArchiveX className="mx-auto mb-3 h-10 w-10 text-muted-foreground" aria-hidden />
          <p className="font-display text-lg font-semibold">No capsules match that search</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Try widening the years — the best messages may still be sealed.
          </p>
        </div>
      )}

      {!error && posts !== null && posts.length > 0 && (
        <>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((p, i) => (
              <PostCard key={p.id} post={p} index={i} />
            ))}
          </div>
          {totalPages > 1 && (
            <nav className="mt-10 flex items-center justify-center gap-2" aria-label="Pagination">
              <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => void load(filters, page - 1)} aria-label="Previous page">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="px-3 text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button variant="outline" size="icon" disabled={page >= totalPages} onClick={() => void load(filters, page + 1)} aria-label="Next page">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </nav>
          )}
        </>
      )}
    </div>
  )
}
