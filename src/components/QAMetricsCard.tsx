import { useState, useEffect } from 'react'
import { getMetricColor } from '../lib/metricColor'

export interface QAMetrics {
  coverage: number | null // 0-100 or null for N/A
  simplicity: number | null // 0-100 or null for N/A
  unroundedSimplicity?: number | null // Unrounded simplicity value (0-100) with 1 decimal place
}

function parseMetrics(data: unknown): QAMetrics | null {
  if (!data || typeof data !== 'object') return null
  const o = data as Record<string, unknown>
  const coverage = o.coverage != null ? Math.min(100, Math.max(0, Number(o.coverage))) : null
  const simplicity = o.simplicity != null ? Math.min(100, Math.max(0, Number(o.simplicity))) : null
  const unroundedSimplicity = o.unroundedSimplicity != null ? Math.min(100, Math.max(0, Number(o.unroundedSimplicity))) : null
  return { coverage: coverage ?? null, simplicity: simplicity ?? null, unroundedSimplicity: unroundedSimplicity ?? null }
}

function fetchMetrics(cacheBust = false): Promise<QAMetrics | null> {
  const url = cacheBust ? `/metrics.json?t=${Date.now()}` : '/metrics.json'
  return fetch(url)
    .then((res) => (res.ok ? res.json() : null))
    .then(parseMetrics)
    .catch(() => null)
}

interface QAMetricsCardProps {
  onCoverageClick?: () => void
  onSimplicityClick?: () => void
}

/**
 * Hook to fetch and poll QA metrics from /metrics.json.
 * Returns metrics state that updates automatically when metrics.json changes.
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

/**
 * Individual metric badge component for Coverage or Simplicity.
 */
function QAMetricBadge({ 
  label, 
  value
}: { 
  label: string
  value: number | null
}) {
  return (
    <div
      className="qa-metric-box"
      style={{ backgroundColor: getMetricColor(value) }}
      title={value !== null ? `${label}: ${value.toFixed(0)}%` : `${label}: N/A`}
    >
      <span className="qa-metric-label">{label}</span>
      <span className="qa-metric-value">
        {value !== null ? `${value.toFixed(0)}%` : 'N/A'}
      </span>
    </div>
  )
}

/**
 * Coverage metric badge component.
 * Fetches and displays Test Coverage from /metrics.json. Handles missing metrics gracefully by showing "N/A".
 */
export function CoverageBadge() {
  const qaMetrics = useQAMetrics()
  return <QAMetricBadge label="Test Coverage" value={qaMetrics?.coverage ?? null} />
}

/**
 * Simplicity metric badge component.
 * Fetches and displays Simplicity from /metrics.json. Handles missing metrics gracefully by showing "N/A".
 */
export function SimplicityBadge() {
  const qaMetrics = useQAMetrics()
  const simplicity = qaMetrics?.simplicity ?? null
  const unroundedSimplicity = qaMetrics?.unroundedSimplicity ?? null

  const getTooltip = () => {
    if (simplicity === null) return 'Simplicity: N/A'
    if (unroundedSimplicity !== null && unroundedSimplicity !== simplicity) {
      return `Simplicity: ${simplicity}% (rounded from ${unroundedSimplicity.toFixed(1)}%)`
    }
    return `Simplicity: ${simplicity}%`
  }

  return (
    <div
      className="qa-metric-box"
      style={{ backgroundColor: getMetricColor(simplicity) }}
      title={getTooltip()}
    >
      <span className="qa-metric-label">Simplicity</span>
      <span className="qa-metric-value">
        {simplicity !== null ? `${simplicity.toFixed(0)}%` : 'N/A'}
      </span>
    </div>
  )
}

/**
 * Component that fetches and displays QA metrics (Coverage and Simplicity)
 * from /metrics.json. Handles missing metrics gracefully by showing "N/A".
 * Polls periodically so updates (e.g. from report:simplicity or CI) appear automatically.
 * 
 * @deprecated Use CoverageBadge and SimplicityBadge separately instead.
 */
export function QAMetricsCard({ onCoverageClick, onSimplicityClick }: QAMetricsCardProps = {}) {
  const qaMetrics = useQAMetrics()

  return (
    <div className="qa-metrics">
      <div
        className={`qa-metric-box ${onCoverageClick ? 'qa-metric-box-clickable' : ''}`}
        style={{ backgroundColor: getMetricColor(qaMetrics?.coverage ?? null) }}
        title={qaMetrics?.coverage !== null && qaMetrics !== null ? `Test Coverage: ${qaMetrics.coverage.toFixed(0)}%` : 'Test Coverage: N/A'}
        onClick={onCoverageClick}
        role={onCoverageClick ? 'button' : undefined}
        tabIndex={onCoverageClick ? 0 : undefined}
        onKeyDown={onCoverageClick ? (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onCoverageClick()
          }
        } : undefined}
      >
        <span className="qa-metric-label">Test Coverage</span>
        <span className="qa-metric-value">
          {qaMetrics?.coverage !== null && qaMetrics !== null ? `${qaMetrics.coverage.toFixed(0)}%` : 'N/A'}
        </span>
      </div>
      <div
        className={`qa-metric-box ${onSimplicityClick ? 'qa-metric-box-clickable' : ''}`}
        style={{ backgroundColor: getMetricColor(qaMetrics?.simplicity ?? null) }}
        title={(() => {
          const simplicity = qaMetrics?.simplicity ?? null
          const unrounded = qaMetrics?.unroundedSimplicity ?? null
          if (simplicity === null) return 'Simplicity: N/A'
          if (unrounded !== null && unrounded !== simplicity) {
            return `Simplicity: ${simplicity}% (rounded from ${unrounded.toFixed(1)}%)`
          }
          return `Simplicity: ${simplicity}%`
        })()}
        onClick={onSimplicityClick}
        role={onSimplicityClick ? 'button' : undefined}
        tabIndex={onSimplicityClick ? 0 : undefined}
        onKeyDown={onSimplicityClick ? (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onSimplicityClick()
          }
        } : undefined}
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
