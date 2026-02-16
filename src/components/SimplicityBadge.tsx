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
  const displayValue = unroundedSimplicity ?? simplicity

  const getTooltip = () => {
    if (displayValue === null) return 'Simplicity: N/A'
    if (simplicity !== null && unroundedSimplicity !== null && unroundedSimplicity !== simplicity) {
      return `Simplicity: ${unroundedSimplicity.toFixed(1)}% (rounded: ${simplicity.toFixed(0)}%)`
    }
    return `Simplicity: ${displayValue.toFixed(1)}%`
  }

  return (
    <div
      className={`qa-metric-box ${onClick ? 'qa-metric-box-clickable' : ''}`}
      style={{ backgroundColor: getMetricColor(displayValue) }}
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
        {displayValue !== null ? `${displayValue.toFixed(1)}%` : 'N/A'}
      </span>
    </div>
  )
}
