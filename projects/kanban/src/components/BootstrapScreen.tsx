import { useState, useEffect, useCallback } from 'react'
import { STEP_DEFINITIONS, type BootstrapRun, type BootstrapStepRecord } from '../lib/bootstrapTypes.js'

interface BootstrapScreenProps {
  projectId: string
  supabaseUrl: string
  supabaseAnonKey: string
  apiBaseUrl: string
  onClose?: () => void
}

export function BootstrapScreen({
  projectId,
  supabaseUrl,
  supabaseAnonKey,
  apiBaseUrl,
  onClose,
}: BootstrapScreenProps) {
  const [run, setRun] = useState<BootstrapRun | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedErrorStep, setExpandedErrorStep] = useState<string | null>(null)
  const [polling, setPolling] = useState(false)

  // Load bootstrap run on mount and when projectId changes
  useEffect(() => {
    loadBootstrapRun()
  }, [projectId])

  // Poll for status updates when run is active
  useEffect(() => {
    if (!run || (run.status !== 'pending' && run.status !== 'running')) {
      setPolling(false)
      return
    }

    setPolling(true)
    const interval = setInterval(() => {
      loadBootstrapRun()
    }, 2000) // Poll every 2 seconds

    return () => {
      clearInterval(interval)
      setPolling(false)
    }
  }, [run?.id, run?.status])

  const loadBootstrapRun = useCallback(async () => {
    try {
      setError(null)
      const response = await fetch(`${apiBaseUrl}/api/bootstrap/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          supabaseUrl,
          supabaseAnonKey,
        }),
      })

      const result = await response.json()

      if (!result.success) {
        if (result.error?.includes('not found')) {
          // No run exists yet, that's okay
          setRun(null)
          return
        }
        setError(result.error || 'Failed to load bootstrap status')
        return
      }

      setRun(result.run)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load bootstrap status')
    }
  }, [projectId, supabaseUrl, supabaseAnonKey, apiBaseUrl])

  const startBootstrap = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`${apiBaseUrl}/api/bootstrap/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          supabaseUrl,
          supabaseAnonKey,
        }),
      })

      const result = await response.json()

      if (!result.success) {
        setError(result.error || 'Failed to start bootstrap')
        setLoading(false)
        return
      }

      setRun(result.run)
      setLoading(false)

      // Start executing steps automatically
      executeNextStep(result.run.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start bootstrap')
      setLoading(false)
    }
  }, [projectId, supabaseUrl, supabaseAnonKey, apiBaseUrl])

  const executeNextStep = useCallback(
    async (runId: string) => {
      try {
        const response = await fetch(`${apiBaseUrl}/api/bootstrap/step`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            runId,
            supabaseUrl,
            supabaseAnonKey,
          }),
        })

        const result = await response.json()

        if (!result.success) {
          setError(result.error || 'Failed to execute step')
          await loadBootstrapRun()
          return
        }

        setRun(result.run)

        // If step succeeded and there are more steps, continue
        if (result.stepResult.success && result.run.status === 'running') {
          // Wait a bit before executing next step
          setTimeout(() => {
            executeNextStep(runId)
          }, 500)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to execute step')
        await loadBootstrapRun()
      }
    },
    [supabaseUrl, supabaseAnonKey, apiBaseUrl, loadBootstrapRun]
  )

  const retryStep = useCallback(
    async (stepId: string) => {
      if (!run) return

      setLoading(true)
      setError(null)

      try {
        // First, mark step for retry
        const retryResponse = await fetch(`${apiBaseUrl}/api/bootstrap/retry`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            runId: run.id,
            stepId,
            supabaseUrl,
            supabaseAnonKey,
          }),
        })

        const retryResult = await retryResponse.json()

        if (!retryResult.success) {
          setError(retryResult.error || 'Failed to retry step')
          setLoading(false)
          return
        }

        setRun(retryResult.run)
        setLoading(false)

        // Execute the retried step
        executeNextStep(run.id)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to retry step')
        setLoading(false)
      }
    },
    [run, supabaseUrl, supabaseAnonKey, apiBaseUrl, executeNextStep]
  )

  const getStepStatus = (stepId: string): BootstrapStepRecord['status'] => {
    if (!run) return 'pending'
    const stepRecord = run.step_history?.find((s) => s.step === stepId)
    return stepRecord?.status || 'pending'
  }

  const getStepRecord = (stepId: string): BootstrapStepRecord | null => {
    if (!run) return null
    return run.step_history?.find((s) => s.step === stepId) || null
  }

  const isCurrentStep = (stepId: string): boolean => {
    return run?.current_step === stepId
  }

  const allSteps = Object.values(STEP_DEFINITIONS)

  return (
    <div className="modal-backdrop" role="dialog" aria-label="Bootstrap screen">
      <div className="modal" style={{ maxWidth: '800px' }}>
        <div className="modal-header">
          <h2 className="modal-title">Roadmap T1 Bootstrap</h2>
          {onClose && (
            <button type="button" className="modal-close btn-destructive" onClick={onClose}>
              Close
            </button>
          )}
        </div>

        <p className="modal-subtitle">
          Persist the Roadmap T1 bootstrap workflow as a resumable, idempotent state machine with durable logs.
        </p>

        {error && (
          <div className="wizard-error" role="alert" style={{ marginBottom: '1rem' }}>
            {error}
          </div>
        )}

        {!run && (
          <div className="modal-actions" style={{ marginBottom: '1rem' }}>
            <button
              type="button"
              className="primary btn-standard"
              onClick={startBootstrap}
              disabled={loading}
            >
              {loading ? 'Starting...' : 'Start bootstrap'}
            </button>
          </div>
        )}

        {run && (
          <div>
            <div style={{ marginBottom: '1rem', padding: '0.75rem', background: '#f5f5f5', borderRadius: '4px' }}>
              <strong>Status:</strong> {run.status}
              {run.current_step && (
                <>
                  {' '}
                  | <strong>Current step:</strong> {STEP_DEFINITIONS[run.current_step as keyof typeof STEP_DEFINITIONS]?.name || run.current_step}
                </>
              )}
              {polling && <span style={{ marginLeft: '0.5rem', color: '#666' }}>(polling...)</span>}
            </div>

            <div className="bootstrap-steps">
              <h3 style={{ marginBottom: '1rem' }}>Steps</h3>
              {allSteps.map((stepDef) => {
                const status = getStepStatus(stepDef.id)
                const stepRecord = getStepRecord(stepDef.id)
                const isCurrent = isCurrentStep(stepDef.id)
                const hasError = stepRecord?.status === 'failed'

                return (
                  <div
                    key={stepDef.id}
                    className="bootstrap-step"
                    style={{
                      padding: '1rem',
                      marginBottom: '0.75rem',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      background: isCurrent ? '#e3f2fd' : hasError ? '#ffebee' : '#fff',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <strong>{stepDef.name}</strong>
                          {isCurrent && (
                            <span style={{ padding: '0.25rem 0.5rem', background: '#2196f3', color: 'white', borderRadius: '4px', fontSize: '0.75rem' }}>
                              Current
                            </span>
                          )}
                          <span
                            style={{
                              padding: '0.25rem 0.5rem',
                              background:
                                status === 'succeeded'
                                  ? '#4caf50'
                                  : status === 'failed'
                                  ? '#f44336'
                                  : status === 'running'
                                  ? '#ff9800'
                                  : '#9e9e9e',
                              color: 'white',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                            }}
                          >
                            {status}
                          </span>
                        </div>
                        <p style={{ margin: '0.5rem 0 0 0', color: '#666', fontSize: '0.9rem' }}>{stepDef.description}</p>

                        {hasError && stepRecord && (
                          <div style={{ marginTop: '0.75rem' }}>
                            <div style={{ padding: '0.75rem', background: '#fff3cd', borderRadius: '4px', marginBottom: '0.5rem' }}>
                              <strong>Error:</strong> {stepRecord.error_summary || 'Step failed'}
                            </div>
                            <button
                              type="button"
                              className="btn-standard"
                              onClick={() => setExpandedErrorStep(expandedErrorStep === stepDef.id ? null : stepDef.id)}
                              style={{ marginBottom: '0.5rem' }}
                            >
                              {expandedErrorStep === stepDef.id ? 'Hide' : 'Show'} details
                            </button>
                            {expandedErrorStep === stepDef.id && stepRecord.error_details && (
                              <pre
                                style={{
                                  padding: '0.75rem',
                                  background: '#f5f5f5',
                                  borderRadius: '4px',
                                  fontSize: '0.85rem',
                                  overflow: 'auto',
                                  maxHeight: '200px',
                                }}
                              >
                                {stepRecord.error_details}
                              </pre>
                            )}
                            <button
                              type="button"
                              className="primary btn-standard"
                              onClick={() => retryStep(stepDef.id)}
                              disabled={loading}
                              style={{ marginTop: '0.5rem' }}
                            >
                              Retry failed step
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {run.logs && run.logs.length > 0 && (
              <div style={{ marginTop: '1.5rem' }}>
                <h3 style={{ marginBottom: '0.5rem' }}>Logs</h3>
                <div
                  style={{
                    maxHeight: '200px',
                    overflow: 'auto',
                    padding: '0.75rem',
                    background: '#f5f5f5',
                    borderRadius: '4px',
                    fontSize: '0.85rem',
                  }}
                >
                  {run.logs.map((log, idx) => (
                    <div key={idx} style={{ marginBottom: '0.25rem', color: log.level === 'error' ? '#f44336' : log.level === 'warning' ? '#ff9800' : '#333' }}>
                      <span style={{ color: '#666' }}>{new Date(log.timestamp).toLocaleTimeString()}</span> [{log.level}] {log.message}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
