import { useState, useEffect } from 'react'
import { getMetricColor } from '../lib/metricColor'

interface QAMetrics {
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
 * Component that fetches and displays QA metrics (Coverage and Simplicity)
 * from /metrics.json. Handles missing metrics gracefully by showing "N/A".
 * Polls periodically so updates (e.g. from report:simplicity or CI) appear automatically.
 * 
 * @param metric - Optional prop to show only 'coverage' or 'simplicity'. If undefined, shows both.
 */
export function QAMetricsCard({ metric }: { metric?: 'coverage' | 'simplicity' } = {}) {
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

  // If metric prop is specified, show only that metric
  if (metric === 'coverage') {
    return (
      <div
        className="qa-metric-box"
        style={{ backgroundColor: getMetricColor(qaMetrics?.coverage ?? null) }}
        title={qaMetrics?.coverage !== null && qaMetrics !== null ? `Coverage: ${qaMetrics.coverage.toFixed(0)}%` : 'Coverage: N/A'}
      >
        <span className="qa-metric-label">Coverage</span>
        <span className="qa-metric-value">
          {qaMetrics?.coverage !== null && qaMetrics !== null ? `${qaMetrics.coverage.toFixed(0)}%` : 'N/A'}
        </span>
      </div>
    )
  }

  if (metric === 'simplicity') {
    return (
      <div
        className="qa-metric-box"
        style={{ backgroundColor: getMetricColor(qaMetrics?.simplicity ?? null) }}
        title={qaMetrics?.simplicity !== null && qaMetrics !== null ? `Simplicity: ${qaMetrics.simplicity.toFixed(0)}%` : 'Simplicity: N/A'}
      >
        <span className="qa-metric-label">Simplicity</span>
        <span className="qa-metric-value">
          {qaMetrics?.simplicity !== null && qaMetrics !== null ? `${qaMetrics.simplicity.toFixed(0)}%` : 'N/A'}
        </span>
      </div>
    )
  }

  // Default: show both metrics (backward compatibility)
  return (
    <div className="qa-metrics">
      <div
        className="qa-metric-box"
        style={{ backgroundColor: getMetricColor(qaMetrics?.coverage ?? null) }}
        title={qaMetrics?.coverage !== null && qaMetrics !== null ? `Coverage: ${qaMetrics.coverage.toFixed(0)}%` : 'Coverage: N/A'}
      >
        <span className="qa-metric-label">Coverage</span>
        <span className="qa-metric-value">
          {qaMetrics?.coverage !== null && qaMetrics !== null ? `${qaMetrics.coverage.toFixed(0)}%` : 'N/A'}
        </span>
      </div>
      <div
        className="qa-metric-box"
        style={{ backgroundColor: getMetricColor(qaMetrics?.simplicity ?? null) }}
        title={qaMetrics?.simplicity !== null && qaMetrics !== null ? `Simplicity: ${qaMetrics.simplicity.toFixed(0)}%` : 'Simplicity: N/A'}
      >
        <span className="qa-metric-label">Simplicity</span>
        <span className="qa-metric-value">
          {qaMetrics?.simplicity !== null && qaMetrics !== null ? `${qaMetrics.simplicity.toFixed(0)}%` : 'N/A'}
        </span>
      </div>
      {qaMetrics === null && (
        <span className="qa-metrics-hint">Run test:coverage and report:simplicity to update</span>
      )}
    </div>
  )
}
