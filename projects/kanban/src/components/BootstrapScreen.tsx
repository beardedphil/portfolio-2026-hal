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
  project_ref: string
  project_url: string
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
  const [supabaseProject, setSupabaseProject] = useState<SupabaseProjectInfo | null>(null)
  const [supabaseManagementApiToken, setSupabaseManagementApiToken] = useState('')
  const [organizationId, setOrganizationId] = useState('')
  const [projectName, setProjectName] = useState('')
  const [region, setRegion] = useState('us-east-1')
  const [previewUrl, setPreviewUrl] = useState('')

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

  const loadSupabaseProject = useCallback(async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/bootstrap/supabase-project`, {
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
        setSupabaseProject(result.project)
      } else {
        setSupabaseProject(null)
      }
    } catch (err) {
      // Silently fail - project may not exist yet
      setSupabaseProject(null)
    }
  }, [projectId, supabaseUrl, supabaseAnonKey, apiBaseUrl])

  // Load bootstrap run on mount and when projectId changes
  useEffect(() => {
    loadBootstrapRun()
    loadSupabaseProject()
  }, [projectId, loadBootstrapRun, loadSupabaseProject])

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
        const stepBody: any = {
          runId,
          supabaseUrl,
          supabaseAnonKey,
        }

        // Add Supabase Management API parameters for create_supabase_project step
        if (run?.current_step === 'create_supabase_project') {
          if (supabaseManagementApiToken) {
            stepBody.supabaseManagementApiToken = supabaseManagementApiToken
          }
          if (organizationId) {
            stepBody.organizationId = organizationId
          }
          if (projectName) {
            stepBody.projectName = projectName
          }
          if (region) {
            stepBody.region = region
          }
        }

        // Add preview URL for verify_preview step
        if (run?.current_step === 'verify_preview') {
          if (previewUrl) {
            stepBody.previewUrl = previewUrl
          }
        }

        const response = await fetch(`${apiBaseUrl}/api/bootstrap/step`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(stepBody),
        })

        const result = await response.json()

        if (!result.success) {
          setError(result.error || 'Failed to execute step')
          await loadBootstrapRun()
          return
        }

        setRun(result.run)

        // Reload Supabase project info if create_supabase_project step succeeded
        if (result.stepResult?.stepId === 'create_supabase_project' && result.stepResult.success) {
          await loadSupabaseProject()
        }

        // If step succeeded and there are more steps, continue
        // Skip auto-execution for steps that require manual input
        if (result.stepResult.success && result.run.status === 'running') {
          const nextStep = result.run.current_step
          // Don't auto-execute steps that require user input
          if (nextStep !== 'create_supabase_project' && nextStep !== 'verify_preview') {
            // Wait a bit before executing next step
            setTimeout(() => {
              executeNextStep(runId)
            }, 500)
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to execute step')
        await loadBootstrapRun()
        await loadSupabaseProject()
      }
    },
    [supabaseUrl, supabaseAnonKey, apiBaseUrl, loadBootstrapRun, loadSupabaseProject, run, supabaseManagementApiToken, organizationId, projectName, region, previewUrl]
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
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                Supabase Management API Token
              </label>
              <input
                type="password"
                value={supabaseManagementApiToken}
                onChange={(e) => setSupabaseManagementApiToken(e.target.value)}
                placeholder="sbp_..."
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '0.9rem',
                }}
              />
              <p style={{ marginTop: '0.25rem', fontSize: '0.85rem', color: '#666' }}>
                Generate a Personal Access Token from your Supabase account settings
              </p>
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                Organization ID
              </label>
              <input
                type="text"
                value={organizationId}
                onChange={(e) => setOrganizationId(e.target.value)}
                placeholder="org_..."
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '0.9rem',
                }}
              />
              <p style={{ marginTop: '0.25rem', fontSize: '0.85rem', color: '#666' }}>
                Find your organization ID in your Supabase organization settings
              </p>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="primary btn-standard"
                onClick={startBootstrap}
                disabled={loading || !supabaseManagementApiToken || !organizationId}
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

                        {/* Show input fields for create_supabase_project step when pending */}
                        {stepDef.id === 'create_supabase_project' && status === 'pending' && (
                          <div style={{ marginTop: '1rem', padding: '1rem', background: '#f9f9f9', borderRadius: '4px' }}>
                            <h4 style={{ marginBottom: '0.75rem', fontSize: '0.9rem' }}>Supabase Project Configuration</h4>
                            <p style={{ marginBottom: '0.75rem', fontSize: '0.85rem', color: '#666' }}>
                              Fill in the required fields below and click "Create Supabase Project" to proceed.
                            </p>
                            <div style={{ marginBottom: '0.75rem' }}>
                              <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem', fontWeight: 'bold' }}>
                                Supabase Management API Token *
                              </label>
                              <input
                                type="password"
                                value={supabaseManagementApiToken}
                                onChange={(e) => setSupabaseManagementApiToken(e.target.value)}
                                placeholder="Enter your Supabase Management API token"
                                style={{
                                  width: '100%',
                                  padding: '0.5rem',
                                  border: '1px solid #ddd',
                                  borderRadius: '4px',
                                  fontSize: '0.9rem',
                                }}
                              />
                              <p style={{ marginTop: '0.25rem', fontSize: '0.75rem', color: '#666' }}>
                                Get your token from{' '}
                                <a href="https://supabase.com/dashboard/account/tokens" target="_blank" rel="noopener noreferrer">
                                  Supabase Account Settings
                                </a>
                              </p>
                            </div>
                            <div style={{ marginBottom: '0.75rem' }}>
                              <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem', fontWeight: 'bold' }}>
                                Organization ID *
                              </label>
                              <input
                                type="text"
                                value={organizationId}
                                onChange={(e) => setOrganizationId(e.target.value)}
                                placeholder="Enter your Supabase organization ID"
                                style={{
                                  width: '100%',
                                  padding: '0.5rem',
                                  border: '1px solid #ddd',
                                  borderRadius: '4px',
                                  fontSize: '0.9rem',
                                }}
                              />
                            </div>
                            <div style={{ marginBottom: '0.75rem' }}>
                              <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem', fontWeight: 'bold' }}>
                                Project Name (optional)
                              </label>
                              <input
                                type="text"
                                value=""
                                onChange={() => {}}
                                placeholder={`Default: hal-${projectId.replace(/[^a-z0-9-]/gi, '-').toLowerCase()}`}
                                style={{
                                  width: '100%',
                                  padding: '0.5rem',
                                  border: '1px solid #ddd',
                                  borderRadius: '4px',
                                  fontSize: '0.9rem',
                                }}
                              />
                            </div>
                            <div>
                              <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem', fontWeight: 'bold' }}>
                                Region (optional)
                              </label>
                              <select
                                value="us-east-1"
                                onChange={() => {}}
                                style={{
                                  width: '100%',
                                  padding: '0.5rem',
                                  border: '1px solid #ddd',
                                  borderRadius: '4px',
                                  fontSize: '0.9rem',
                                }}
                              >
                                <option value="us-east-1">US East (N. Virginia)</option>
                                <option value="us-east-2">US East (Ohio)</option>
                                <option value="us-west-1">US West (N. California)</option>
                                <option value="us-west-2">US West (Oregon)</option>
                                <option value="eu-west-1">EU West (Ireland)</option>
                                <option value="eu-west-2">EU West (London)</option>
                                <option value="eu-central-1">EU Central (Frankfurt)</option>
                                <option value="ap-southeast-1">Asia Pacific (Singapore)</option>
                                <option value="ap-northeast-1">Asia Pacific (Tokyo)</option>
                              </select>
                            </div>
                            <button
                              type="button"
                              className="primary btn-standard"
                              onClick={() => {
                                if (!supabaseManagementApiToken || !organizationId) {
                                  setError('Please provide both Supabase Management API token and Organization ID')
                                  return
                                }
                                if (run) {
                                  executeNextStep(run.id)
                                }
                              }}
                              disabled={loading || !supabaseManagementApiToken || !organizationId}
                              style={{ marginTop: '0.75rem', width: '100%' }}
                            >
                              {loading ? 'Creating...' : 'Create Supabase Project'}
                            </button>
                          </div>
                        )}

                        {/* Show input field for verify_preview step when pending */}
                        {stepDef.id === 'verify_preview' && status === 'pending' && (
                          <div style={{ marginTop: '1rem', padding: '1rem', background: '#f9f9f9', borderRadius: '4px' }}>
                            <h4 style={{ marginBottom: '0.75rem', fontSize: '0.9rem' }}>Preview URL Configuration</h4>
                            <p style={{ marginBottom: '0.75rem', fontSize: '0.85rem', color: '#666' }}>
                              Enter the Vercel preview deployment URL to verify. The verification will poll /version.json until the preview is live.
                            </p>
                            <div style={{ marginBottom: '0.75rem' }}>
                              <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem', fontWeight: 'bold' }}>
                                Preview URL *
                              </label>
                              <input
                                type="url"
                                value={previewUrl}
                                onChange={(e) => setPreviewUrl(e.target.value)}
                                placeholder="https://your-project-abc123.vercel.app"
                                style={{
                                  width: '100%',
                                  padding: '0.5rem',
                                  border: '1px solid #ddd',
                                  borderRadius: '4px',
                                  fontSize: '0.9rem',
                                }}
                              />
                              <p style={{ marginTop: '0.25rem', fontSize: '0.75rem', color: '#666' }}>
                                This should be the Vercel preview deployment URL (e.g., from the Vercel dashboard or GitHub PR checks).
                              </p>
                            </div>
                            <button
                              type="button"
                              className="primary btn-standard"
                              onClick={() => {
                                if (!previewUrl) {
                                  setError('Please provide a preview URL')
                                  return
                                }
                                if (run) {
                                  executeNextStep(run.id)
                                }
                              }}
                              disabled={loading || !previewUrl}
                              style={{ marginTop: '0.75rem', width: '100%' }}
                            >
                              {loading ? 'Verifying...' : 'Start Verification'}
                            </button>
                          </div>
                        )}

                        {/* Show in-progress state for verify_preview step */}
                        {stepDef.id === 'verify_preview' && status === 'running' && (
                          <div style={{ marginTop: '1rem', padding: '1rem', background: '#fff3cd', borderRadius: '4px', border: '1px solid #ff9800' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                              <span style={{ fontSize: '1.2rem' }}>⏳</span>
                              <strong style={{ fontSize: '0.9rem' }}>Verifying preview…</strong>
                            </div>
                            <p style={{ margin: 0, fontSize: '0.85rem', color: '#666' }}>
                              Polling /version.json on {previewUrl || 'the preview URL'}... This may take a minute while the preview deployment finishes.
                            </p>
                          </div>
                        )}

                        {/* Show success state for verify_preview step */}
                        {stepDef.id === 'verify_preview' && status === 'succeeded' && (
                          <div style={{ marginTop: '1rem', padding: '1rem', background: '#e8f5e9', borderRadius: '4px', border: '1px solid #4caf50' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                              <span style={{ fontSize: '1.2rem' }}>✓</span>
                              <strong style={{ fontSize: '0.9rem', color: '#2e7d32' }}>Preview verified</strong>
                            </div>
                            <p style={{ margin: 0, fontSize: '0.85rem', color: '#2e7d32' }}>
                              Successfully fetched /version.json from {previewUrl || 'the preview URL'}. The preview deployment is live and ready.
                            </p>
                          </div>
                        )}

                        {/* Show success state for create_supabase_project step */}
                        {stepDef.id === 'create_supabase_project' && status === 'succeeded' && supabaseProject && (
                          <div style={{ marginTop: '1rem', padding: '1rem', background: '#e8f5e9', borderRadius: '4px', border: '1px solid #4caf50' }}>
                            <h4 style={{ marginBottom: '0.75rem', fontSize: '0.9rem', color: '#2e7d32' }}>
                              ✓ Supabase Project Created Successfully
                            </h4>
                            <div style={{ fontSize: '0.85rem' }}>
                              <div style={{ marginBottom: '0.5rem' }}>
                                <strong>Project Ref:</strong> {supabaseProject.project_ref}
                              </div>
                              <div style={{ marginBottom: '0.5rem' }}>
                                <strong>Project URL:</strong>{' '}
                                <a href={supabaseProject.project_url} target="_blank" rel="noopener noreferrer">
                                  {supabaseProject.project_url}
                                </a>
                              </div>
                              <div style={{ marginBottom: '0.5rem' }}>
                                <strong>Status:</strong> {supabaseProject.status}
                                {supabaseProject.created_at && (
                                  <span style={{ marginLeft: '0.5rem', color: '#666' }}>
                                    (Created: {new Date(supabaseProject.created_at).toLocaleString()})
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Show input field for verify_preview step when pending */}
                        {stepDef.id === 'verify_preview' && status === 'pending' && (
                          <div style={{ marginTop: '1rem', padding: '1rem', background: '#f9f9f9', borderRadius: '4px' }}>
                            <h4 style={{ marginBottom: '0.75rem', fontSize: '0.9rem' }}>Preview URL Configuration</h4>
                            <p style={{ marginBottom: '0.75rem', fontSize: '0.85rem', color: '#666' }}>
                              Enter the preview deployment URL to verify. The URL should be the full preview URL (e.g., https://your-app-abc123.vercel.app).
                            </p>
                            <div style={{ marginBottom: '0.75rem' }}>
                              <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem', fontWeight: 'bold' }}>
                                Preview URL *
                              </label>
                              <input
                                type="text"
                                value={previewUrl}
                                onChange={(e) => setPreviewUrl(e.target.value)}
                                placeholder="https://your-app-abc123.vercel.app"
                                style={{
                                  width: '100%',
                                  padding: '0.5rem',
                                  border: '1px solid #ddd',
                                  borderRadius: '4px',
                                  fontSize: '0.9rem',
                                }}
                              />
                            </div>
                            <button
                              type="button"
                              className="primary btn-standard"
                              onClick={() => {
                                if (!previewUrl) {
                                  setError('Please provide a preview URL')
                                  return
                                }
                                if (run) {
                                  executeNextStep(run.id)
                                }
                              }}
                              disabled={loading || !previewUrl}
                              style={{ marginTop: '0.75rem', width: '100%' }}
                            >
                              {loading ? 'Verifying...' : 'Start Verification'}
                            </button>
                          </div>
                        )}

                        {/* Show running state for verify_preview step */}
                        {stepDef.id === 'verify_preview' && status === 'running' && (
                          <div style={{ marginTop: '1rem', padding: '1rem', background: '#fff3cd', borderRadius: '4px', border: '1px solid #ff9800' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                              <div
                                className="bootstrap-spinner"
                                style={{
                                  width: '20px',
                                  height: '20px',
                                  border: '3px solid #ff9800',
                                  borderTopColor: 'transparent',
                                  borderRadius: '50%',
                                  animation: 'spin 1s linear infinite',
                                }}
                              />
                              <div>
                                <strong style={{ color: '#f57c00' }}>Verifying preview…</strong>
                                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: '#666' }}>
                                  Polling /version.json to confirm the preview deployment is live...
                                </p>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Show success state for verify_preview step */}
                        {stepDef.id === 'verify_preview' && status === 'succeeded' && (
                          <div style={{ marginTop: '1rem', padding: '1rem', background: '#e8f5e9', borderRadius: '4px', border: '1px solid #4caf50' }}>
                            <h4 style={{ marginBottom: '0.5rem', fontSize: '0.9rem', color: '#2e7d32', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span>✓</span>
                              <span>Preview verified</span>
                            </h4>
                            <p style={{ margin: 0, fontSize: '0.85rem', color: '#2e7d32' }}>
                              Successfully fetched /version.json from the preview deployment.
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
                              {stepDef.id === 'verify_preview' ? 'Retry' : 'Retry failed step'}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {supabaseProject && (
              <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#e8f5e9', borderRadius: '4px', border: '1px solid #4caf50' }}>
                <h3 style={{ marginTop: 0, marginBottom: '0.75rem' }}>Supabase Project</h3>
                <div style={{ marginBottom: '0.5rem' }}>
                  <strong>Status:</strong> {supabaseProject.status === 'created' ? 'Created' : supabaseProject.status === 'failed' ? 'Failed' : 'Not configured'}
                </div>
                <div style={{ marginBottom: '0.5rem' }}>
                  <strong>Project Ref:</strong> {supabaseProject.project_ref}
                </div>
                <div style={{ marginBottom: '0.5rem' }}>
                  <strong>Project URL:</strong>{' '}
                  <a href={supabaseProject.project_url} target="_blank" rel="noopener noreferrer" style={{ color: '#1976d2' }}>
                    {supabaseProject.project_url}
                  </a>
                </div>
                <div style={{ marginBottom: '0.5rem' }}>
                  <strong>Created:</strong> {new Date(supabaseProject.created_at).toLocaleString()}
                </div>
                <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: '#fff', borderRadius: '4px', border: '1px solid #ddd' }}>
                  <div style={{ marginBottom: '0.5rem' }}>
                    <strong>Anon Key:</strong> <span style={{ fontFamily: 'monospace', color: '#666' }}>••••••••••••••••</span>{' '}
                    <span style={{ color: '#4caf50', fontSize: '0.85rem' }}>✓ Stored securely</span>
                  </div>
                  <div>
                    <strong>Service Role Key:</strong> <span style={{ fontFamily: 'monospace', color: '#666' }}>••••••••••••••••</span>{' '}
                    <span style={{ color: '#4caf50', fontSize: '0.85rem' }}>✓ Stored securely</span>
                  </div>
                </div>
              </div>
            )}

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
