import { useState, useEffect } from 'react'

export interface QAMetrics {
  coverage: number | null // 0-100 or null for N/A
  codeQuality: number | null // 0-100 or null for N/A
  unroundedCodeQuality?: number | null // Unrounded code quality value (0-100) with 1 decimal place
  // Legacy fields for backward compatibility during migration
  maintainability?: number | null // Deprecated: use codeQuality
  unroundedMaintainability?: number | null // Deprecated: use unroundedCodeQuality
  simplicity?: number | null // Deprecated: use codeQuality
  unroundedSimplicity?: number | null // Deprecated: use unroundedCodeQuality
}

function parseMetrics(data: unknown): QAMetrics | null {
  if (!data || typeof data !== 'object') return null
  const o = data as Record<string, unknown>
  const coverage = o.coverage != null ? Math.min(100, Math.max(0, Number(o.coverage))) : null
  // Support new (codeQuality) and legacy (maintainability, simplicity) field names for migration
  const codeQuality = o.codeQuality != null ? Math.min(100, Math.max(0, Number(o.codeQuality))) : 
                      (o.maintainability != null ? Math.min(100, Math.max(0, Number(o.maintainability))) : 
                       (o.simplicity != null ? Math.min(100, Math.max(0, Number(o.simplicity))) : null))
  const unroundedCodeQuality = o.unroundedCodeQuality != null ? Math.min(100, Math.max(0, Number(o.unroundedCodeQuality))) :
                               (o.unroundedMaintainability != null ? Math.min(100, Math.max(0, Number(o.unroundedMaintainability))) :
                                (o.unroundedSimplicity != null ? Math.min(100, Math.max(0, Number(o.unroundedSimplicity))) : null))
  return { 
    coverage: coverage ?? null, 
    codeQuality: codeQuality ?? null, 
    unroundedCodeQuality: unroundedCodeQuality ?? null,
    // Include legacy fields for backward compatibility
    maintainability: codeQuality,
    unroundedMaintainability: unroundedCodeQuality,
    simplicity: codeQuality,
    unroundedSimplicity: unroundedCodeQuality
  }
}

function fetchMetrics(baseUrl: string | null, cacheBust = false): Promise<QAMetrics | null> {
  // If baseUrl is provided (user project), fetch from project's metrics.json
  // Otherwise, fetch from HAL's metrics.json (current origin)
  const metricsUrl = baseUrl 
    ? `${baseUrl}/metrics.json${cacheBust ? `?t=${Date.now()}` : ''}`
    : cacheBust ? `/metrics.json?t=${Date.now()}` : '/metrics.json'
  return fetch(metricsUrl)
    .then((res) => (res.ok ? res.json() : null))
    .then(parseMetrics)
    .catch(() => null)
}

/**
 * Hook that fetches QA metrics (Coverage and Code Quality) from /metrics.json.
 * When a projectBaseUrl is provided, fetches from the project's metrics.json instead of HAL's.
 * Handles missing metrics gracefully by returning null values.
 * Polls periodically so updates (e.g. from report:code-quality or CI) appear automatically.
 * 
 * @param projectBaseUrl - Optional base URL of the connected project (e.g., 'https://user-project.vercel.app')
 *                         When provided, metrics are fetched from the project instead of HAL.
 */
export function useQAMetrics(projectBaseUrl?: string | null) {
  const [qaMetrics, setQaMetrics] = useState<QAMetrics | null>(null)

    // Load metrics on mount and poll so UI updates when metrics.json changes (CI or local report:code-quality)
  useEffect(() => {
    let cancelled = false
    const apply = (m: QAMetrics | null) => {
      if (!cancelled) setQaMetrics(m)
    }

    fetchMetrics(projectBaseUrl || null, false).then(apply)

    const isTest = import.meta.env.MODE === 'test'
    const intervalMs = isTest ? 0 : import.meta.env.DEV ? 5_000 : 60_000 // dev: 5s so local report:code-quality shows quickly
    const id = intervalMs > 0 ? setInterval(() => fetchMetrics(projectBaseUrl || null, true).then(apply), intervalMs) : 0
    return () => {
      cancelled = true
      if (id) clearInterval(id)
    }
  }, [projectBaseUrl])

  return qaMetrics
}
