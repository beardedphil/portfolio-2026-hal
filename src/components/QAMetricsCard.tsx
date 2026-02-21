import { useState, useEffect } from 'react'
import { getMetricColor } from '../lib/metricColor'

export interface QAMetrics {
  coverage: number | null // 0-100 or null for N/A
  maintainability: number | null // 0-100 or null for N/A
  unroundedMaintainability?: number | null // Unrounded maintainability value (0-100) with 1 decimal place
}

function formatPercentTenths(value: number) {
  return `${value.toFixed(1)}%`
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

interface QAMetricsCardProps {
  onCoverageClick?: () => void
  onMaintainabilityClick?: () => void
}

/**
 * Hook to fetch and poll QA metrics from /metrics.json.
 * Returns metrics state that updates automatically when metrics.json changes.
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

/**
 * Individual metric badge component for Coverage or Maintainability.
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
      title={value !== null ? `${label}: ${formatPercentTenths(value)}` : `${label}: N/A`}
    >
      <span className="qa-metric-label">{label}</span>
      <span className="qa-metric-value">
        {value !== null ? formatPercentTenths(value) : 'N/A'}
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
 * Maintainability metric badge component.
 * Fetches and displays Maintainability from /metrics.json. Handles missing metrics gracefully by showing "N/A".
 */
export function MaintainabilityBadge() {
  const qaMetrics = useQAMetrics()
  const maintainability = qaMetrics?.maintainability ?? null
  const unroundedMaintainability = qaMetrics?.unroundedMaintainability ?? null
  const displayValue = unroundedMaintainability ?? maintainability

  const getTooltip = () => {
    if (displayValue === null) return 'Maintainability: N/A'
    if (maintainability !== null && unroundedMaintainability !== null && unroundedMaintainability !== maintainability) {
      return `Maintainability: ${formatPercentTenths(unroundedMaintainability)} (rounded: ${maintainability.toFixed(0)}%)`
    }
    return `Maintainability: ${formatPercentTenths(displayValue)}`
  }

  return (
    <div
      className="qa-metric-box"
      style={{ backgroundColor: getMetricColor(displayValue) }}
      title={getTooltip()}
    >
      <span className="qa-metric-label">Maintainability</span>
      <span className="qa-metric-value">
        {displayValue !== null ? formatPercentTenths(displayValue) : 'N/A'}
      </span>
    </div>
  )
}

/**
 * Component that fetches and displays QA metrics (Coverage and Maintainability)
 * from /metrics.json. Handles missing metrics gracefully by showing "N/A".
 * Polls periodically so updates (e.g. from report:maintainability or CI) appear automatically.
 * 
 * @deprecated Use CoverageBadge and MaintainabilityBadge separately instead.
 */
export function QAMetricsCard({ onCoverageClick, onMaintainabilityClick }: QAMetricsCardProps = {}) {
  const qaMetrics = useQAMetrics()

  return (
    <div className="qa-metrics">
      <div
        className={`qa-metric-box ${onCoverageClick ? 'qa-metric-box-clickable' : ''}`}
        style={{ backgroundColor: getMetricColor(qaMetrics?.coverage ?? null) }}
        title={qaMetrics?.coverage !== null && qaMetrics !== null ? `Test Coverage: ${formatPercentTenths(qaMetrics.coverage)}` : 'Test Coverage: N/A'}
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
          {qaMetrics?.coverage !== null && qaMetrics !== null ? formatPercentTenths(qaMetrics.coverage) : 'N/A'}
        </span>
      </div>
      <div
        className={`qa-metric-box ${onMaintainabilityClick ? 'qa-metric-box-clickable' : ''}`}
        style={{ backgroundColor: getMetricColor(qaMetrics?.unroundedMaintainability ?? qaMetrics?.maintainability ?? null) }}
        title={(() => {
          const maintainability = qaMetrics?.maintainability ?? null
          const unrounded = qaMetrics?.unroundedMaintainability ?? null
          const displayValue = unrounded ?? maintainability
          if (displayValue === null) return 'Maintainability: N/A'
          if (maintainability !== null && unrounded !== null && unrounded !== maintainability) {
            return `Maintainability: ${formatPercentTenths(unrounded)} (rounded: ${maintainability.toFixed(0)}%)`
          }
          return `Maintainability: ${formatPercentTenths(displayValue)}`
        })()}
        onClick={onMaintainabilityClick}
        role={onMaintainabilityClick ? 'button' : undefined}
        tabIndex={onMaintainabilityClick ? 0 : undefined}
        onKeyDown={onMaintainabilityClick ? (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onMaintainabilityClick()
          }
        } : undefined}
      >
        <span className="qa-metric-label">Maintainability</span>
        <span className="qa-metric-value">
          {qaMetrics !== null && (qaMetrics.unroundedMaintainability ?? qaMetrics.maintainability) !== null
            ? formatPercentTenths((qaMetrics.unroundedMaintainability ?? qaMetrics.maintainability) as number)
            : 'N/A'}
        </span>
      </div>
      {qaMetrics === null && (
        <span className="qa-metrics-hint">Run test:coverage and report:maintainability to update</span>
      )}
    </div>
  )
}
