import { useQAMetrics } from '../hooks/useQAMetrics'
import { getMetricColor } from '../lib/metricColor'

interface SimplicityBadgeProps {
  onClick?: () => void
}

/**
 * Badge component that displays the Simplicity metric.
 * Handles missing metrics gracefully by showing "N/A".
 * Clickable if onClick handler is provided.
 */
export function SimplicityBadge(props: SimplicityBadgeProps = {}) {
  const { onClick } = props
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
      className={`qa-metric-box ${onClick ? 'qa-metric-box-clickable' : ''}`}
      style={{ backgroundColor: getMetricColor(simplicity) }}
      title={getTooltip()}
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
      <span className="qa-metric-label">Simplicity</span>
      <span className="qa-metric-value">
        {simplicity !== null ? `${simplicity.toFixed(0)}%` : 'N/A'}
      </span>
    </div>
  )
}
