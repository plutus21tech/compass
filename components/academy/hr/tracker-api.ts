/** Calls an onboarding admin route and returns its data, or throws the server's own message. */
export async function trackerFetch<T>(url: string, init?: { method: string; body?: unknown }): Promise<T> {
  const res = await fetch(url, {
    method: init?.method ?? 'GET',
    headers: init?.body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    cache: 'no-store',
  })
  const json = (await res.json().catch(() => null)) as { success?: boolean; data?: T; error?: string } | null
  if (!res.ok || !json?.success) throw new Error(json?.error || 'Something went wrong. Reload and try again.')
  return json.data as T
}

export const trackerErrorText = (error: unknown): string =>
  error instanceof Error ? error.message : 'Something went wrong. Reload and try again.'

/** Joining dates are stored at UTC midnight, so they are always shown in UTC. */
export const DATE_ZONE = 'UTC'
