/**
 * Fetches with automatic retry logic for transient errors.
 * 
 * Retries on:
 * - 5xx server errors
 * - Network errors (status 0)
 * 
 * Does NOT retry on:
 * - 4xx client errors
 * 
 * Uses exponential backoff: initialDelayMs * 2^attempt
 */
export async function fetchWithRetry(
  fetchFn: () => Promise<Response>,
  maxRetries: number = 3,
  initialDelayMs: number = 1000
): Promise<Response> {
  let lastError: Error | null = null
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchFn()
      // Retry on 5xx errors and network errors (but not 4xx client errors)
      if (response.status >= 500 || response.status === 0) {
        if (attempt < maxRetries) {
          const delay = initialDelayMs * Math.pow(2, attempt)
          await new Promise(resolve => setTimeout(resolve, delay))
          continue
        } else {
          // All retries exhausted, throw error
          throw new Error(`Fetch failed after ${maxRetries + 1} attempts: ${response.status}`)
        }
      }
      return response
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      if (attempt < maxRetries) {
        const delay = initialDelayMs * Math.pow(2, attempt)
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }
      throw lastError
    }
  }
  throw lastError || new Error('Fetch failed after retries')
}
