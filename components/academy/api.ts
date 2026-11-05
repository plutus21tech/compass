const OFFLINE_MESSAGE = "We couldn't reach Compass. Check your connection and try again."
const FAILED_MESSAGE = 'Something went wrong. Reload and try again.'

interface Envelope<T> { success?: boolean; data?: T; error?: string }

async function readEnvelope<T>(response: Response): Promise<Envelope<T>> {
  try {
    return (await response.json()) as Envelope<T>
  } catch {
    return {}
  }
}

/** The server's refusal: `message` is ready to show, `status` says what kind of refusal it was. */
export class AcademyRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

/** Throws an Error carrying the server's own message, ready to show. */
export async function academyRequest<T = void>(url: string, method: 'GET' | 'POST' | 'PUT', body?: unknown): Promise<T> {
  const init: RequestInit = {
    method,
    cache: 'no-store',
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  }
  const response = await fetch(url, init).catch(() => {
    throw new Error(OFFLINE_MESSAGE)
  })
  const payload = await readEnvelope<T>(response)
  if (!response.ok || !payload.success) throw new AcademyRequestError(payload.error ?? FAILED_MESSAGE, response.status)
  return payload.data as T
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : FAILED_MESSAGE
}
