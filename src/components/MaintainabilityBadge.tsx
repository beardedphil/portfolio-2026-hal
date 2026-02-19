import { useQAMetrics } from '../hooks/useQAMetrics'
import { getMetricColor } from '../lib/metricColor'

interface MaintainabilityBadgeProps {
  onClick?: () => void
}

/**
 * Badge component that displays the Maintainability metric.
 * Handles missing metrics gracefully by showing "N/A".
 * Clickable if onClick handler is provided.
 */
export function MaintainabilityBadge(props: MaintainabilityBadgeProps = {}) {
  const { onClick } = props
  const qaMetrics = useQAMetrics()
  const maintainability = qaMetrics?.maintainability ?? null
  const unroundedMaintainability = qaMetrics?.unroundedMaintainability ?? null
  const displayValue = unroundedMaintainability ?? maintainability

  const getTooltip = () => {
    if (displayValue === null) return 'Maintainability: N/A'
    if (maintainability !== null && unroundedMaintainability !== null && unroundedMaintainability !== maintainability) {
      return `Maintainability: ${unroundedMaintainability.toFixed(1)}% (rounded: ${maintainability.toFixed(0)}%)`
    }
    return `Maintainability: ${displayValue.toFixed(1)}%`
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
      <span className="qa-metric-label">Maintainability</span>
      <span className="qa-metric-value">
        {displayValue !== null ? `${displayValue.toFixed(1)}%` : 'N/A'}
      </span>
    </div>
  )
}
