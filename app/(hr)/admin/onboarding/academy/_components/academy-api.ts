export interface HandbookOption {
  slug: string
  title: string
}

/** Calls an Academy API route and returns its data, or throws the server's error message. */
export async function academyFetch<T>(url: string, init?: { method: string; body: unknown }): Promise<T> {
  const res = await fetch(url, {
    method: init?.method ?? 'GET',
    headers: init ? { 'Content-Type': 'application/json' } : undefined,
    body: init ? JSON.stringify(init.body) : undefined,
  })
  const json = (await res.json().catch(() => null)) as { success?: boolean; data?: T; error?: string } | null
  if (!res.ok || !json?.success) throw new Error(json?.error || 'Something went wrong. Reload and try again.')
  return json.data as T
}

export async function loadHandbookOptions(): Promise<HandbookOption[]> {
  const res = await fetch('/api/admin/handbook')
  if (!res.ok) return []
  const json = (await res.json()) as { pages?: Array<{ slug: string; title: string }> }
  return (json.pages ?? []).map((p) => ({ slug: p.slug, title: p.title }))
}
