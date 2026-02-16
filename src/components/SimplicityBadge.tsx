import { useQAMetrics } from '../hooks/useQAMetrics'
import { getMetricColor } from '../lib/metricColor'

/**
 * Badge component that displays the Simplicity metric.
 * Handles missing metrics gracefully by showing "N/A".
 */
export function SimplicityBadge() {
  const qaMetrics = useQAMetrics()
  const simplicity = qaMetrics?.simplicity ?? null

  return (
    <div
      className="qa-metric-box"
      style={{ backgroundColor: getMetricColor(simplicity) }}
      title={simplicity !== null ? `Simplicity: ${simplicity.toFixed(0)}%` : 'Simplicity: N/A'}
    >
      <span className="qa-metric-label">Simplicity</span>
      <span className="qa-metric-value">
        {simplicity !== null ? `${simplicity.toFixed(0)}%` : 'N/A'}
      </span>
    </div>
  )
}
