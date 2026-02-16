import { useQAMetrics } from '../hooks/useQAMetrics'
import { getMetricColor } from '../lib/metricColor'

interface CoverageBadgeProps {
  onClick?: () => void
}

/**
 * Badge component that displays the Test Coverage metric.
 * Handles missing metrics gracefully by showing "N/A".
 * Clickable if onClick handler is provided.
 */
export function CoverageBadge(props: CoverageBadgeProps = {}) {
  const { onClick } = props
  const qaMetrics = useQAMetrics()
  const coverage = qaMetrics?.coverage ?? null

  return (
    <div
      className={`qa-metric-box ${onClick ? 'qa-metric-box-clickable' : ''}`}
      style={{ backgroundColor: getMetricColor(coverage) }}
      title={coverage !== null ? `Test Coverage: ${coverage.toFixed(1)}%` : 'Test Coverage: N/A'}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      } : undefined}
    >
      <span className="qa-metric-label">Test Coverage</span>
      <span className="qa-metric-value">
        {coverage !== null ? `${coverage.toFixed(1)}%` : 'N/A'}
      </span>
    </div>
  )
}
