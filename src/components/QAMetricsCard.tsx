import { useState, useEffect } from 'react'
import { getMetricColor } from '../lib/metricColor'

interface QAMetrics {
  coverage: number | null // 0-100 or null for N/A
  simplicity: number | null // 0-100 or null for N/A
}

/**
 * Component that fetches and displays QA metrics (Coverage and Simplicity)
 * from /metrics.json. Handles missing metrics gracefully by showing "N/A".
 */
export function QAMetricsCard() {
  const [qaMetrics, setQaMetrics] = useState<QAMetrics | null>(null)

  // Load Coverage and Simplicity from repo metrics file (updated by test:coverage and report:simplicity)
  useEffect(() => {
    fetch('/metrics.json')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && typeof data === 'object') {
          const coverage = data.coverage != null ? Math.min(100, Math.max(0, Number(data.coverage))) : null
          const simplicity = data.simplicity != null ? Math.min(100, Math.max(0, Number(data.simplicity))) : null
          setQaMetrics({ coverage: coverage ?? null, simplicity: simplicity ?? null })
        } else {
          setQaMetrics(null)
        }
      })
      .catch(() => setQaMetrics(null))
  }, [])

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
