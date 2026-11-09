// Pure rate-limit rules for Academy writes. No server-only imports.

const MUTATIONS_PER_WINDOW = 120
const VIDEO_REPORTS_PER_WINDOW = 400

/** Video reports arrive every few seconds while playing, so they get their own bucket and never starve other writes. */
export type MutationBucket = 'default' | 'video'

export function mutationLimitFor(userId: string, bucket: MutationBucket): { key: string; max: number } {
  return bucket === 'video'
    ? { key: `academy-video:${userId}`, max: VIDEO_REPORTS_PER_WINDOW }
    : { key: `academy:${userId}`, max: MUTATIONS_PER_WINDOW }
}
