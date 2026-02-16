import { useQAMetrics } from '../hooks/useQAMetrics'
import { getMetricColor } from '../lib/metricColor'

/**
 * Component that displays QA metrics (Coverage and Simplicity)
 * from /metrics.json. Handles missing metrics gracefully by showing "N/A".
 * Polls periodically so updates (e.g. from report:simplicity or CI) appear automatically.
 */
export function QAMetricsCard() {
  const qaMetrics = useQAMetrics()

  return (
    <div className="qa-metrics">
      <div
        className="qa-metric-box"
        style={{ backgroundColor: getMetricColor(qaMetrics?.coverage ?? null) }}
        title={qaMetrics?.coverage !== null && qaMetrics !== null ? `Coverage: ${qaMetrics.coverage.toFixed(0)}%` : 'Coverage: N/A'}
      >
        <span className="qa-metric-label">Coverage</span>
        <span className="qa-metric-value">
          {qaMetrics?.coverage !== null && qaMetrics !== null ? `${qaMetrics.coverage.toFixed(0)}%` : 'N/A'}
        </span>
      </div>
      <div
        className="qa-metric-box"
        style={{ backgroundColor: getMetricColor(qaMetrics?.simplicity ?? null) }}
        title={qaMetrics?.simplicity !== null && qaMetrics !== null ? `Simplicity: ${qaMetrics.simplicity.toFixed(0)}%` : 'Simplicity: N/A'}
      >
        <span className="qa-metric-label">Simplicity</span>
        <span className="qa-metric-value">
          {qaMetrics?.simplicity !== null && qaMetrics !== null ? `${qaMetrics.simplicity.toFixed(0)}%` : 'N/A'}
        </span>
      </div>
      {qaMetrics === null && (
        <span className="qa-metrics-hint">Run test:coverage and report:simplicity to update</span>
      )}
    </div>
  )
}
