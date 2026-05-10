const DEFAULT_TIMEOUT_MS = 12_000

export function createAbortError(message = 'Request aborted') {
  const error = new Error(message)
  error.name = 'AbortError'
  return error
}

export function throwIfAborted(signal) {
  if (signal?.aborted) throw createAbortError()
}

export function raceWithAbort(promise, signal) {
  if (!signal) return promise
  throwIfAborted(signal)

  let removeAbortListener = () => {}
  const abortPromise = new Promise((_, reject) => {
    const onAbort = () => reject(createAbortError())
    removeAbortListener = () => signal.removeEventListener('abort', onAbort)
    signal.addEventListener('abort', onAbort, { once: true })
  })

  return Promise.race([promise, abortPromise]).finally(removeAbortListener)
}

export async function fetchWithTimeout(url, options = {}) {
  const {
    signal,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    timeoutMessage = '查詢逾時，請稍後再試',
    ...fetchOptions
  } = options
  throwIfAborted(signal)

  const controller = new AbortController()
  let didTimeout = false
  let timeoutId = null

  const abortFetch = () => controller.abort()
  signal?.addEventListener('abort', abortFetch, { once: true })

  if (timeoutMs > 0) {
    timeoutId = window.setTimeout(() => {
      didTimeout = true
      controller.abort()
    }, timeoutMs)
  }

  try {
    return await fetch(url, { ...fetchOptions, signal: controller.signal })
  } catch (error) {
    if (didTimeout) throw new Error(timeoutMessage, { cause: error })
    if (signal?.aborted) throw createAbortError()
    throw error
  } finally {
    if (timeoutId) window.clearTimeout(timeoutId)
    signal?.removeEventListener('abort', abortFetch)
  }
}