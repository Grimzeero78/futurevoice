'use client'

import { memo } from 'react'
import { motion } from 'framer-motion'
import { Lock, Eye, Heart, ImageOff, Video, Mail, Clock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { recipientLabel, excerpt, formatDate } from '@/lib/fv-client'
import { useFV } from '@/lib/fv-store'
import type { SerializedPost } from '@/lib/fv-core'

export const PostCard = memo(function PostCard({ post, index = 0 }: { post: SerializedPost; index?: number }) {
  const navigate = useFV((s) => s.navigate)
  const sealed = post.status === 'SEALED'
  const firstImage = post.media.find((m) => m.kind === 'IMAGE')
  const firstVideo = post.media.find((m) => m.kind === 'VIDEO')

  return (
    <motion.article
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: Math.min(index * 0.05, 0.4) }}
    >
      <button
        onClick={() => navigate({ name: 'post', id: post.id })}
        aria-label={`Open capsule: ${sealed ? 'a sealed message' : post.title}`}
        className={`group relative flex h-full w-full flex-col overflow-hidden rounded-xl border text-left shadow-sm transition-all hover:shadow-lg hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-ring ${
          sealed ? 'border-primary/40 sealed-stripes' : 'border-border bg-card'
        }`}
      >
        {/* media preview */}
        <div className="relative h-40 w-full overflow-hidden bg-secondary">
          {sealed ? (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-primary/5">
              <span className="relative flex items-center justify-center">
                <span className="absolute h-12 w-12 rounded-full bg-primary/30 ring-pulse" aria-hidden />
                <span className="wax-seal flex h-11 w-11 items-center justify-center rounded-full">
                  <Lock className="h-5 w-5 text-primary-foreground" aria-hidden />
                </span>
              </span>
              <span className="text-xs font-medium uppercase tracking-widest text-primary">
                Sealed · opens {formatDate(post.releaseAt)}
              </span>
            </div>
          ) : firstImage ? (
            <>
              <img
                src={firstImage.url}
                alt=""
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                loading="lazy"
              />
              {post.media.length > 1 && (
                <span className="absolute right-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-xs text-white">
                  +{post.media.length - 1}
                </span>
              )}
            </>
          ) : firstVideo ? (
            <div className="flex h-full w-full items-center justify-center bg-secondary/70">
              <Video className="h-10 w-10 text-muted-foreground" aria-hidden />
              <span className="absolute bottom-2 left-2 rounded-full bg-black/55 px-2 py-0.5 text-xs text-white">
                Video message
              </span>
            </div>
          ) : (
            <div className="paper-grain flex h-full w-full flex-col items-center justify-center gap-2">
              <Mail className="h-8 w-8 text-primary/60" aria-hidden />
              <span className="text-xs uppercase tracking-widest text-muted-foreground">Letter</span>
            </div>
          )}
        </div>

        {/* body */}
        <div className="flex flex-1 flex-col gap-2 p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 font-medium text-accent-foreground">
              <Clock className="h-3 w-3" aria-hidden />
              {recipientLabel(post.recipientTag, post.customRecipient)}
            </span>
            {post.privacy === 'PUBLIC' && post.hidden && (
              <Badge variant="destructive" className="text-[10px]">Hidden</Badge>
            )}
          </div>
          <h3 className="font-display text-lg font-semibold leading-snug group-hover:text-primary transition-colors line-clamp-2">
            {post.title}
          </h3>
          <p className="text-sm text-muted-foreground line-clamp-3">
            {sealed
              ? 'No peeking — not even for you — until the day it opens.'
              : excerpt(post.content, 120) || (post.media.length ? 'A message in pictures & sound.' : '')}
          </p>
          <div className="mt-auto flex items-center justify-between pt-2 text-xs text-muted-foreground">
            <span>by {post.author?.displayName ?? 'Unknown'}</span>
            <span className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1">
                <Heart className="h-3.5 w-3.5" aria-hidden /> {post.reactionTotal}
              </span>
              <span className="inline-flex items-center gap-1">
                <Eye className="h-3.5 w-3.5" aria-hidden /> {post.views}
              </span>
            </span>
          </div>
        </div>
      </button>
    </motion.article>
  )
})

export function SealedTeaserCard({ mediaCount }: { mediaCount: number }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <ImageOff className="h-4 w-4" aria-hidden />
      {mediaCount > 0 ? `${mediaCount} file${mediaCount === 1 ? '' : 's'} sleeping inside` : 'No peeking until it opens'}
    </div>
  )
}
