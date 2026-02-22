import { useState, useEffect } from 'react'
import { getMetricColor } from '../lib/metricColor'

export interface QAMetrics {
  coverage: number | null // 0-100 or null for N/A
  codeQuality: number | null // 0-100 or null for N/A
  unroundedCodeQuality?: number | null // Unrounded code quality value (0-100) with 1 decimal place
  // Legacy fields for backward compatibility
  maintainability?: number | null // Deprecated: use codeQuality
  unroundedMaintainability?: number | null // Deprecated: use unroundedCodeQuality
  simplicity?: number | null // Deprecated: use codeQuality
  unroundedSimplicity?: number | null // Deprecated: use unroundedCodeQuality
}

function formatPercentTenths(value: number) {
  return `${value.toFixed(1)}%`
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

function fetchMetrics(cacheBust = false): Promise<QAMetrics | null> {
  const url = cacheBust ? `/metrics.json?t=${Date.now()}` : '/metrics.json'
  return fetch(url)
    .then((res) => (res.ok ? res.json() : null))
    .then(parseMetrics)
    .catch(() => null)
}

interface QAMetricsCardProps {
  onCoverageClick?: () => void
  onCodeQualityClick?: () => void
}

/**
 * Hook to fetch and poll QA metrics from /metrics.json.
 * Returns metrics state that updates automatically when metrics.json changes.
 */
export function useQAMetrics() {
  const [qaMetrics, setQaMetrics] = useState<QAMetrics | null>(null)

  // Load metrics on mount and poll so UI updates when metrics.json changes (CI or local report:code-quality)
  useEffect(() => {
    let cancelled = false
    const apply = (m: QAMetrics | null) => {
      if (!cancelled) setQaMetrics(m)
    }

    fetchMetrics(false).then(apply)

    const isTest = import.meta.env.MODE === 'test'
    const intervalMs = isTest ? 0 : import.meta.env.DEV ? 5_000 : 60_000 // dev: 5s so local report:code-quality shows quickly
    const id = intervalMs > 0 ? setInterval(() => fetchMetrics(true).then(apply), intervalMs) : 0
    return () => {
      cancelled = true
      if (id) clearInterval(id)
    }
  }, [])

  return qaMetrics
}

/**
 * Individual metric badge component for Coverage or Code Quality.
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
 * Code Quality metric badge component.
 * Fetches and displays Code Quality from /metrics.json. Handles missing metrics gracefully by showing "N/A".
 */
export function CodeQualityBadge() {
  const qaMetrics = useQAMetrics()
  const codeQuality = qaMetrics?.codeQuality ?? null
  const unroundedCodeQuality = qaMetrics?.unroundedCodeQuality ?? null
  const displayValue = unroundedCodeQuality ?? codeQuality

  const getTooltip = () => {
    if (displayValue === null) return 'Code Quality: N/A'
    if (codeQuality !== null && unroundedCodeQuality !== null && unroundedCodeQuality !== codeQuality) {
      return `Code Quality: ${formatPercentTenths(unroundedCodeQuality)} (rounded: ${codeQuality.toFixed(0)}%)`
    }
    return `Code Quality: ${formatPercentTenths(displayValue)}`
  }

  return (
    <div
      className="qa-metric-box"
      style={{ backgroundColor: getMetricColor(displayValue) }}
      title={getTooltip()}
    >
      <span className="qa-metric-label">Code Quality</span>
      <span className="qa-metric-value">
        {displayValue !== null ? formatPercentTenths(displayValue) : 'N/A'}
      </span>
    </div>
  )
}

/**
 * Component that fetches and displays QA metrics (Coverage and Code Quality)
 * from /metrics.json. Handles missing metrics gracefully by showing "N/A".
 * Polls periodically so updates (e.g. from report:code-quality or CI) appear automatically.
 * 
 * @deprecated Use CoverageBadge and CodeQualityBadge separately instead.
 */
export function QAMetricsCard({ onCoverageClick, onCodeQualityClick }: QAMetricsCardProps = {}) {
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
        className={`qa-metric-box ${onCodeQualityClick ? 'qa-metric-box-clickable' : ''}`}
        style={{ backgroundColor: getMetricColor(qaMetrics?.unroundedCodeQuality ?? qaMetrics?.codeQuality ?? null) }}
        title={(() => {
          const codeQuality = qaMetrics?.codeQuality ?? null
          const unrounded = qaMetrics?.unroundedCodeQuality ?? null
          const displayValue = unrounded ?? codeQuality
          if (displayValue === null) return 'Code Quality: N/A'
          if (codeQuality !== null && unrounded !== null && unrounded !== codeQuality) {
            return `Code Quality: ${formatPercentTenths(unrounded)} (rounded: ${codeQuality.toFixed(0)}%)`
          }
          return `Code Quality: ${formatPercentTenths(displayValue)}`
        })()}
        onClick={onCodeQualityClick}
        role={onCodeQualityClick ? 'button' : undefined}
        tabIndex={onCodeQualityClick ? 0 : undefined}
        onKeyDown={onCodeQualityClick ? (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onCodeQualityClick()
          }
        } : undefined}
      >
        <span className="qa-metric-label">Code Quality</span>
        <span className="qa-metric-value">
          {qaMetrics !== null && (qaMetrics.unroundedCodeQuality ?? qaMetrics.codeQuality) !== null
            ? formatPercentTenths((qaMetrics.unroundedCodeQuality ?? qaMetrics.codeQuality) as number)
            : 'N/A'}
        </span>
      </div>
      {qaMetrics === null && (
        <span className="qa-metrics-hint">Run test:coverage and report:code-quality to update</span>
      )}
    </div>
  )
}
