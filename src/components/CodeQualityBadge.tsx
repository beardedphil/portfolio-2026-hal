import { useQAMetrics } from '../hooks/useQAMetrics'
import { getMetricColor } from '../lib/metricColor'

interface CodeQualityBadgeProps {
  onClick?: () => void
}

/**
 * Badge component that displays the Code Quality metric.
 * Handles missing metrics gracefully by showing "N/A".
 * Clickable if onClick handler is provided.
 */
export function CodeQualityBadge(props: CodeQualityBadgeProps = {}) {
  const { onClick } = props
  const qaMetrics = useQAMetrics()
  const codeQuality = qaMetrics?.codeQuality ?? null
  const unroundedCodeQuality = qaMetrics?.unroundedCodeQuality ?? null
  const displayValue = unroundedCodeQuality ?? codeQuality

  const getTooltip = () => {
    if (displayValue === null) return 'Code Quality: N/A'
    if (codeQuality !== null && unroundedCodeQuality !== null && unroundedCodeQuality !== codeQuality) {
      return `Code Quality: ${unroundedCodeQuality.toFixed(1)}% (rounded: ${codeQuality.toFixed(0)}%)`
    }
    return `Code Quality: ${displayValue.toFixed(1)}%`
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
      <span className="qa-metric-label">Code Quality</span>
      <span className="qa-metric-value">
        {displayValue !== null ? `${displayValue.toFixed(1)}%` : 'N/A'}
      </span>
    </div>
  )
}
