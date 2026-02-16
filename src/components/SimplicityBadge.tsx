import { useQAMetrics } from '../hooks/useQAMetrics'
import { getMetricColor } from '../lib/metricColor'

/**
 * Badge component that displays the Simplicity metric.
 * Handles missing metrics gracefully by showing "N/A".
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
