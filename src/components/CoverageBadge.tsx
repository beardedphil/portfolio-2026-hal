import { useQAMetrics } from '../hooks/useQAMetrics'
import { getMetricColor } from '../lib/metricColor'

/**
 * Badge component that displays the Test Coverage metric.
 * Handles missing metrics gracefully by showing "N/A".
 */
export function CoverageBadge() {
  const qaMetrics = useQAMetrics()
  const coverage = qaMetrics?.coverage ?? null

  return (
    <div
      className="qa-metric-box"
      style={{ backgroundColor: getMetricColor(coverage) }}
      title={coverage !== null ? `Test Coverage: ${coverage.toFixed(0)}%` : 'Test Coverage: N/A'}
    >
      <span className="qa-metric-label">Test Coverage</span>
      <span className="qa-metric-value">
        {coverage !== null ? `${coverage.toFixed(0)}%` : 'N/A'}
      </span>
    </div>
  )
}
