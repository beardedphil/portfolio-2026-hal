import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const clientCache = new Map<string, SupabaseClient>()

/**
 * Returns a single Supabase client per (url, key) pair to avoid multiple
 * GoTrueClient instances and "Multiple GoTrueClient instances detected" warnings.
 */
export function getSupabaseClient(url: string, key: string): SupabaseClient {
  const cacheKey = `${url}|${key}`
  let client = clientCache.get(cacheKey)
  if (!client) {
    client = createClient(url, key)
    clientCache.set(cacheKey, client)
  }
  return client
}
