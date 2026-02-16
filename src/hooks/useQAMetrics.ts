import { useState, useEffect } from 'react'

export interface QAMetrics {
  coverage: number | null // 0-100 or null for N/A
  simplicity: number | null // 0-100 or null for N/A
}

function parseMetrics(data: unknown): QAMetrics | null {
  if (!data || typeof data !== 'object') return null
  const o = data as Record<string, unknown>
  const coverage = o.coverage != null ? Math.min(100, Math.max(0, Number(o.coverage))) : null
  const simplicity = o.simplicity != null ? Math.min(100, Math.max(0, Number(o.simplicity))) : null
  return { coverage: coverage ?? null, simplicity: simplicity ?? null }
}

function fetchMetrics(cacheBust = false): Promise<QAMetrics | null> {
  const url = cacheBust ? `/metrics.json?t=${Date.now()}` : '/metrics.json'
  return fetch(url)
    .then((res) => (res.ok ? res.json() : null))
    .then(parseMetrics)
    .catch(() => null)
}

/**
 * Hook that fetches QA metrics (Coverage and Simplicity) from /metrics.json.
 * Handles missing metrics gracefully by returning null values.
 * Polls periodically so updates (e.g. from report:simplicity or CI) appear automatically.
 */
export function useQAMetrics() {
  const [qaMetrics, setQaMetrics] = useState<QAMetrics | null>(null)

  // Load metrics on mount and poll so UI updates when metrics.json changes (CI or local report:simplicity)
  useEffect(() => {
    let cancelled = false
    const apply = (m: QAMetrics | null) => {
      if (!cancelled) setQaMetrics(m)
    }

    fetchMetrics(false).then(apply)

    const isTest = import.meta.env.MODE === 'test'
    const intervalMs = isTest ? 0 : import.meta.env.DEV ? 5_000 : 60_000 // dev: 5s so local report:simplicity shows quickly
    const id = intervalMs > 0 ? setInterval(() => fetchMetrics(true).then(apply), intervalMs) : 0
    return () => {
      cancelled = true
      if (id) clearInterval(id)
    }
  }, [])

  return qaMetrics
}
