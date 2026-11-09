// Pure rate-limit rules for Academy writes. No server-only imports.

const MUTATIONS_PER_WINDOW = 120
const VIDEO_REPORTS_PER_WINDOW = 400
const PREVIEWS_PER_WINDOW = 120

/**
 * Video reports arrive every few seconds while playing, so they get their own bucket and never starve
 * other writes. HR's previews change nothing, so trying facts never uses up their saves either.
 */
export type MutationBucket = 'default' | 'video' | 'preview'

export function mutationLimitFor(userId: string, bucket: MutationBucket): { key: string; max: number } {
  switch (bucket) {
    case 'video':
      return { key: `academy-video:${userId}`, max: VIDEO_REPORTS_PER_WINDOW }
    case 'preview':
      return { key: `academy-preview:${userId}`, max: PREVIEWS_PER_WINDOW }
    case 'default':
      return { key: `academy:${userId}`, max: MUTATIONS_PER_WINDOW }
  }
}

const CHANGES_MESSAGE = 'Too many changes in a short time. Wait a few minutes and try again.'
const PREVIEWS_MESSAGE = 'Too many previews in a short time. Wait a moment and try again.'

/** What the person is told when a bucket is full. */
export function rateLimitMessage(bucket: MutationBucket): string {
  return bucket === 'preview' ? PREVIEWS_MESSAGE : CHANGES_MESSAGE
}

/**
 * Which bucket an events body counts against, read before validation so a bad body is still counted.
 * Only something shaped like a video report goes to the video bucket.
 */
export function eventBucket(body: unknown): MutationBucket {
  const type = typeof body === 'object' && body !== null && !Array.isArray(body) ? (body as { type?: unknown }).type : undefined
  return type === 'VIDEO_PROGRESS' ? 'video' : 'default'
}
