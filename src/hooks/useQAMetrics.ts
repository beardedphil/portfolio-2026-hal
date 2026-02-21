import { useState, useEffect } from 'react'

export interface QAMetrics {
  coverage: number | null // 0-100 or null for N/A
  maintainability: number | null // 0-100 or null for N/A
  unroundedMaintainability?: number | null // Unrounded maintainability value (0-100) with 1 decimal place
}

function parseMetrics(data: unknown): QAMetrics | null {
  if (!data || typeof data !== 'object') return null
  const o = data as Record<string, unknown>
  const coverage = o.coverage != null ? Math.min(100, Math.max(0, Number(o.coverage))) : null
  const maintainability = o.maintainability != null ? Math.min(100, Math.max(0, Number(o.maintainability))) : null
  const unroundedMaintainability = o.unroundedMaintainability != null ? Math.min(100, Math.max(0, Number(o.unroundedMaintainability))) : null
  return { 
    coverage: coverage ?? null, 
    maintainability: maintainability ?? null, 
    unroundedMaintainability: unroundedMaintainability ?? null
  }
}

function fetchMetrics(cacheBust = false): Promise<QAMetrics | null> {
  const url = cacheBust ? `/metrics.json?t=${Date.now()}` : '/metrics.json'
  return fetch(url)
    .then((res) => (res.ok ? res.json() : null))
    .then(parseMetrics)
    .catch(() => null)
}

/**
 * Hook that fetches QA metrics (Coverage and Maintainability) from /metrics.json.
 * Handles missing metrics gracefully by returning null values.
 * Polls periodically so updates (e.g. from report:maintainability or CI) appear automatically.
 */
export function useQAMetrics() {
  const [qaMetrics, setQaMetrics] = useState<QAMetrics | null>(null)

  // Load metrics on mount and poll so UI updates when metrics.json changes (CI or local report:maintainability)
  useEffect(() => {
    let cancelled = false
    const apply = (m: QAMetrics | null) => {
      if (!cancelled) setQaMetrics(m)
    }

    fetchMetrics(false).then(apply)

    const isTest = import.meta.env.MODE === 'test'
    const intervalMs = isTest ? 0 : import.meta.env.DEV ? 5_000 : 60_000 // dev: 5s so local report:maintainability shows quickly
    const id = intervalMs > 0 ? setInterval(() => fetchMetrics(true).then(apply), intervalMs) : 0
    return () => {
      cancelled = true
      if (id) clearInterval(id)
    }
  }, [])

  return qaMetrics
}
