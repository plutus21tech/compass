import { resolveLeaveRequestDeepLinkTarget } from '@/lib/leave-deep-links'

export interface TimeOffParams {
  openRequest: boolean
  requestId: string
}

export const DEEP_LINK_UNAVAILABLE =
  'This leave request is no longer waiting for your action, or you do not have access to it.'

export function parseTimeOffParams(params: Pick<URLSearchParams, 'get'>): TimeOffParams {
  const request = params.get('request')
  return {
    openRequest: request === '1' || request === 'true',
    requestId: (params.get('requestId') ?? '').trim(),
  }
}

export function deepLinkTarget(
  requestId: string,
  approvals: Array<{ id: string }>,
  own: Array<{ id: string }>,
): 'approval' | 'own' | 'unavailable' {
  return resolveLeaveRequestDeepLinkTarget(
    requestId,
    approvals.map((r) => r.id),
    own.map((r) => r.id),
  )
}
