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

export const PREVIEW_REFUSAL = "This is a preview. Nothing is saved."

export type AcademyRequest = typeof academyRequest

/**
 * The request a block uses. In HR's preview every write is refused before it reaches fetch, so nothing
 * rendered there can save as HR, whatever a disabled fieldset does or doesn't cover. Reads still go.
 */
export function blockRequest(preview: boolean): AcademyRequest {
  return preview ? previewRequest : academyRequest
}

/** One function, so a hook that depends on the request stays stable across renders. */
const previewRequest: AcademyRequest = <T = void>(url: string, method: 'GET' | 'POST' | 'PUT', body?: unknown): Promise<T> =>
  method === 'GET' ? academyRequest<T>(url, method, body) : Promise.reject(new AcademyRequestError(PREVIEW_REFUSAL, 403))

/** A form's submit handler that, in a preview, only stops the browser's own submit. */
export function previewSafeSubmit<E extends { preventDefault: () => void }>(
  preview: boolean, submit: (event: E) => unknown,
): (event: E) => void {
  return (event) => {
    if (preview) {
      event.preventDefault()
      return
    }
    void submit(event)
  }
}
