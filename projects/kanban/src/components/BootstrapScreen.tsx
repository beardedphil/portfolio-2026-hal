import { useState, useEffect, useCallback } from 'react'
import { STEP_DEFINITIONS, type BootstrapRun, type BootstrapStepRecord } from '../lib/bootstrapTypes.js'

interface BootstrapScreenProps {
  projectId: string
  supabaseUrl: string
  supabaseAnonKey: string
  apiBaseUrl: string
  onClose?: () => void
}

interface SupabaseProjectInfo {
  id: string
  project_id: string
  supabase_project_ref: string
  supabase_project_name: string
  supabase_api_url: string
  status: string
  created_at: string
  updated_at: string
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
  const [supabaseManagementToken, setSupabaseManagementToken] = useState<string>('')
  const [projectInfo, setProjectInfo] = useState<SupabaseProjectInfo | null>(null)
  const [showTokenInput, setShowTokenInput] = useState(false)

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

  // Load bootstrap run on mount and when projectId changes
  useEffect(() => {
    loadBootstrapRun()
    loadProjectInfo()
  }, [projectId, loadBootstrapRun])

  // Load Supabase project info
  const loadProjectInfo = useCallback(async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/bootstrap/project-info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          supabaseUrl,
          supabaseAnonKey,
        }),
      })

      const result = await response.json()

      if (result.success && result.project) {
        setProjectInfo(result.project)
      } else {
        setProjectInfo(null)
      }
    } catch (err) {
      // Silently fail - project might not exist yet
      setProjectInfo(null)
    }
  }, [projectId, supabaseUrl, supabaseAnonKey, apiBaseUrl])

  // Reload project info when create_supabase_project step succeeds
  useEffect(() => {
    const supabaseStep = run?.step_history?.find((s) => s.step === 'create_supabase_project')
    if (supabaseStep?.status === 'succeeded') {
      // Wait a moment for the database to be updated, then reload
      setTimeout(() => {
        loadProjectInfo()
      }, 1000)
    }
  }, [run?.step_history, loadProjectInfo])

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
  }, [run?.id, run?.status, loadBootstrapRun])

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
        // Fetch current run state to determine which step to execute
        const statusResponse = await fetch(`${apiBaseUrl}/api/bootstrap/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId,
            supabaseUrl,
            supabaseAnonKey,
          }),
        })
        const statusResult = await statusResponse.json()
        const currentRun = statusResult.success ? statusResult.run : null
        const stepToExecute = currentRun?.current_step

        // Include management token only for create_supabase_project step
        const requestBody: {
          runId: string
          supabaseUrl: string
          supabaseAnonKey: string
          supabaseManagementToken?: string
        } = {
          runId,
          supabaseUrl,
          supabaseAnonKey,
        }

        if (stepToExecute === 'create_supabase_project') {
          if (!supabaseManagementToken) {
            setError('Supabase Management API token is required to create a project. Please enter your token above.')
            await loadBootstrapRun()
            return
          }
          requestBody.supabaseManagementToken = supabaseManagementToken
        }

        const response = await fetch(`${apiBaseUrl}/api/bootstrap/step`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
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
    [run, supabaseUrl, supabaseAnonKey, apiBaseUrl, loadBootstrapRun, supabaseManagementToken]
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
          <div style={{ marginBottom: '1rem' }}>
            {!projectInfo && (
              <div style={{ marginBottom: '1rem', padding: '1rem', background: '#f0f7ff', borderRadius: '4px', border: '1px solid #b3d9ff' }}>
                <h3 style={{ marginTop: 0, marginBottom: '0.5rem' }}>Supabase Project Setup</h3>
                <p style={{ marginBottom: '1rem', color: '#666', fontSize: '0.9rem' }}>
                  To create a Supabase project automatically, you'll need a Supabase Management API token (Personal Access Token).
                  You can create one in your{' '}
                  <a href="https://supabase.com/dashboard/account/tokens" target="_blank" rel="noopener noreferrer">
                    Supabase account settings
                  </a>
                  .
                </p>
                {!showTokenInput ? (
                  <button
                    type="button"
                    className="btn-standard"
                    onClick={() => setShowTokenInput(true)}
                    style={{ marginBottom: '0.5rem' }}
                  >
                    I have a Supabase Management API token
                  </button>
                ) : (
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                      Supabase Management API Token:
                    </label>
                    <input
                      type="password"
                      value={supabaseManagementToken}
                      onChange={(e) => setSupabaseManagementToken(e.target.value)}
                      placeholder="Enter your Supabase Management API token"
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        marginBottom: '0.5rem',
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                        fontFamily: 'monospace',
                      }}
                    />
                    <button
                      type="button"
                      className="btn-standard"
                      onClick={() => {
                        setShowTokenInput(false)
                        setSupabaseManagementToken('')
                      }}
                      style={{ marginRight: '0.5rem' }}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            )}
            {projectInfo && (
              <div style={{ marginBottom: '1rem', padding: '1rem', background: '#e8f5e9', borderRadius: '4px', border: '1px solid #81c784' }}>
                <h3 style={{ marginTop: 0, marginBottom: '0.5rem', color: '#2e7d32' }}>✓ Supabase Project Configured</h3>
                <div style={{ marginBottom: '0.5rem' }}>
                  <strong>Project Name:</strong> {projectInfo.supabase_project_name}
                </div>
                <div style={{ marginBottom: '0.5rem' }}>
                  <strong>Project Ref:</strong> {projectInfo.supabase_project_ref}
                </div>
                <div style={{ marginBottom: '0.5rem' }}>
                  <strong>API URL:</strong>{' '}
                  <a href={projectInfo.supabase_api_url} target="_blank" rel="noopener noreferrer">
                    {projectInfo.supabase_api_url}
                  </a>
                </div>
                <div style={{ marginBottom: '0.5rem', padding: '0.5rem', background: '#fff', borderRadius: '4px' }}>
                  <strong>Status:</strong> {projectInfo.status === 'created' ? 'Created' : projectInfo.status}
                  {projectInfo.created_at && (
                    <span style={{ marginLeft: '0.5rem', color: '#666', fontSize: '0.9rem' }}>
                      (Created: {new Date(projectInfo.created_at).toLocaleString()})
                    </span>
                  )}
                </div>
                <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: '#fff3cd', borderRadius: '4px', fontSize: '0.9rem' }}>
                  <strong>🔒 Credentials:</strong> Stored securely (encrypted at rest). Keys are never displayed after initial capture.
                </div>
              </div>
            )}
            <div className="modal-actions" style={{ marginTop: '1rem' }}>
              <button
                type="button"
                className="primary btn-standard"
                onClick={startBootstrap}
                disabled={loading}
              >
                {loading ? 'Starting...' : 'Start bootstrap'}
              </button>
            </div>
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

                        {/* Show project info after create_supabase_project succeeds */}
                        {stepDef.id === 'create_supabase_project' && status === 'succeeded' && projectInfo && (
                          <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: '#e8f5e9', borderRadius: '4px', border: '1px solid #81c784' }}>
                            <div style={{ marginBottom: '0.5rem' }}>
                              <strong>✓ Project Created Successfully</strong>
                            </div>
                            <div style={{ marginBottom: '0.25rem', fontSize: '0.9rem' }}>
                              <strong>Name:</strong> {projectInfo.supabase_project_name}
                            </div>
                            <div style={{ marginBottom: '0.25rem', fontSize: '0.9rem' }}>
                              <strong>Ref:</strong> {projectInfo.supabase_project_ref}
                            </div>
                            <div style={{ marginBottom: '0.25rem', fontSize: '0.9rem' }}>
                              <strong>URL:</strong>{' '}
                              <a href={projectInfo.supabase_api_url} target="_blank" rel="noopener noreferrer">
                                {projectInfo.supabase_api_url}
                              </a>
                            </div>
                            <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: '#fff3cd', borderRadius: '4px', fontSize: '0.85rem' }}>
                              <strong>🔒 Credentials:</strong> Stored securely (encrypted at rest)
                            </div>
                          </div>
                        )}

                        {/* Show token input when create_supabase_project is pending or running */}
                        {stepDef.id === 'create_supabase_project' && (status === 'pending' || status === 'running') && !supabaseManagementToken && (
                          <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: '#fff3cd', borderRadius: '4px' }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                              Supabase Management API Token (required):
                            </label>
                            <input
                              type="password"
                              value={supabaseManagementToken}
                              onChange={(e) => setSupabaseManagementToken(e.target.value)}
                              placeholder="Enter your Supabase Management API token"
                              style={{
                                width: '100%',
                                padding: '0.5rem',
                                marginBottom: '0.5rem',
                                border: '1px solid #ddd',
                                borderRadius: '4px',
                                fontFamily: 'monospace',
                              }}
                            />
                            <p style={{ margin: 0, fontSize: '0.85rem', color: '#666' }}>
                              Get your token from{' '}
                              <a href="https://supabase.com/dashboard/account/tokens" target="_blank" rel="noopener noreferrer">
                                Supabase account settings
                              </a>
                              .
                            </p>
                          </div>
                        )}

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
