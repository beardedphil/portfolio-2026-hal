import { useState, useEffect } from 'react'

interface ContextBundleViewProps {
  isOpen: boolean
  onClose: () => void
  repoFullName: string | null
  supabaseUrl: string | null
  supabaseAnonKey: string | null
}

interface Bundle {
  bundle_id: string
  ticket_id: string
  role: string
  version: number
  created_at: string
  created_by: string | null
}

interface BundleListResponse {
  success: boolean
  bundles?: Bundle[]
  error?: string
}

interface BundleReceipt {
  receipt_id: string
  bundle_id: string
  ticket_id: string
  role: string
  content_checksum: string
  bundle_checksum: string
  section_metrics: Record<string, number>
  total_characters: number
  budget?: {
    characterCount: number
    hardLimit: number
    role: string
    displayName: string
  } | null
  red_reference: { red_id: string; version: number } | null
  integration_manifest_reference: {
    manifest_id: string
    version: number
    schema_version: string
  } | null
  git_ref: {
    pr_url?: string
    pr_number?: number
    base_sha?: string
    head_sha?: string
  } | null
  created_at: string
  bundle: {
    bundle_id: string
    ticket_id: string
    role: string
    version: number
    created_at: string
  } | null
}

interface ReceiptResponse {
  success: boolean
  receipt?: BundleReceipt
  error?: string
}

interface PreviewResponse {
  success: boolean
  budget?: {
    characterCount: number
    hardLimit: number
    role: string
    displayName: string
    exceeds: boolean
    overage: number
  }
  sectionMetrics?: Record<string, number>
  bundle?: BundleJson
  error?: string
}

interface BundleJson {
  meta?: {
    project_id?: string
    ticket_id?: string
    role?: string
    bundle_id?: string
    created_at?: string
    content_checksum?: string
    bundle_checksum?: string
  }
  project_manifest?: unknown
  ticket?: unknown
  state_snapshot?: unknown
  recent_deltas?: unknown
  repo_context?: unknown
  relevant_artifacts?: unknown
  instructions?: unknown
  [key: string]: unknown
}

type RoleOption = 'project-manager' | 'implementation-agent' | 'qa-agent' | 'process-review'

const ROLE_OPTIONS: { value: RoleOption; label: string }[] = [
  { value: 'project-manager', label: 'PM' },
  { value: 'implementation-agent', label: 'Dev' },
  { value: 'qa-agent', label: 'QA' },
  { value: 'process-review', label: 'Process Review' },
]

export function ContextBundleView({
  isOpen,
  onClose,
  repoFullName,
  supabaseUrl,
  supabaseAnonKey,
}: ContextBundleViewProps) {
  const apiBaseUrl = import.meta.env.VITE_HAL_API_BASE_URL || window.location.origin
  const [mostRecentBundle, setMostRecentBundle] = useState<Bundle | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Persist selected role in localStorage
  const [selectedRole, setSelectedRole] = useState<RoleOption>(() => {
    try {
      const stored = localStorage.getItem('hal-context-bundle-selected-role')
      if (stored && ROLE_OPTIONS.some((opt) => opt.value === stored)) {
        return stored as RoleOption
      }
    } catch {
      // Ignore localStorage errors
    }
    return 'project-manager'
  })
  const [previewBudget, setPreviewBudget] = useState<PreviewResponse['budget'] | null>(null)
  const [previewSectionMetrics, setPreviewSectionMetrics] = useState<Record<string, number> | null>(null)
  const [previewContent, setPreviewContent] = useState<BundleJson | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [receipt, setReceipt] = useState<BundleReceipt | null>(null)
  const [receiptLoading, setReceiptLoading] = useState(false)
  const [receiptExpanded, setReceiptExpanded] = useState(false)
  const [bundleJson, setBundleJson] = useState<BundleJson | null>(null)

  // Load most recent bundle when modal opens
  useEffect(() => {
    if (isOpen && repoFullName && supabaseUrl && supabaseAnonKey) {
      loadMostRecentBundle()
    }
  }, [isOpen, repoFullName, supabaseUrl, supabaseAnonKey])

  // Persist selected role to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('hal-context-bundle-selected-role', selectedRole)
    } catch {
      // Ignore localStorage errors
    }
  }, [selectedRole])

  // Load preview when role changes or bundle changes
  useEffect(() => {
    if (isOpen && mostRecentBundle && supabaseUrl && supabaseAnonKey) {
      loadPreview()
    } else {
      setPreviewBudget(null)
      setPreviewSectionMetrics(null)
      setPreviewContent(null)
    }
  }, [isOpen, mostRecentBundle, selectedRole, supabaseUrl, supabaseAnonKey])

  // Load receipt when bundle is selected
  useEffect(() => {
    if (mostRecentBundle && supabaseUrl && supabaseAnonKey) {
      loadReceipt(mostRecentBundle.bundle_id)
    }
  }, [mostRecentBundle, supabaseUrl, supabaseAnonKey])

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setMostRecentBundle(null)
      setError(null)
      setSelectedRole('project-manager')
      setPreviewBudget(null)
      setPreviewSectionMetrics(null)
      setPreviewContent(null)
      setReceipt(null)
      setReceiptExpanded(false)
      setBundleJson(null)
    }
  }, [isOpen])

  const loadMostRecentBundle = async () => {
    if (!repoFullName || !supabaseUrl || !supabaseAnonKey) return

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`${apiBaseUrl}/api/context-bundles/list-by-repo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          repoFullName,
          limit: 1,
          supabaseUrl,
          supabaseAnonKey,
        }),
      })

      const data = (await response.json()) as BundleListResponse

      if (!response.ok || !data.success) {
        setError(data.error || 'Failed to load bundles')
        return
      }

      const bundles = data.bundles || []
      if (bundles.length > 0) {
        setMostRecentBundle(bundles[0])
      } else {
        setMostRecentBundle(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const loadPreview = async () => {
    if (!mostRecentBundle || !repoFullName || !supabaseUrl || !supabaseAnonKey) return

    setPreviewLoading(true)
    setError(null)

    try {
      // Get ticket info first
      const { createClient } = await import('@supabase/supabase-js')
      const supabase = createClient(supabaseUrl, supabaseAnonKey)
      const { data: ticket, error: ticketError } = await supabase
        .from('tickets')
        .select('pk, id, repo_full_name')
        .eq('id', mostRecentBundle.ticket_id)
        .maybeSingle()

      if (ticketError || !ticket) {
        setError('Failed to load ticket information')
        return
      }

      // Get artifacts for the ticket to use in preview
      const { data: artifacts } = await supabase
        .from('agent_artifacts')
        .select('artifact_id')
        .eq('ticket_pk', ticket.pk)

      const artifactIds = artifacts?.map((a) => a.artifact_id) || []

      // Use preview endpoint to get budget and section metrics for selected role
      const previewResponse = await fetch(`${apiBaseUrl}/api/context-bundles/preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          ticketPk: ticket.pk,
          ticketId: ticket.id,
          repoFullName: ticket.repo_full_name,
          role: selectedRole,
          selectedArtifactIds: artifactIds,
          supabaseUrl,
          supabaseAnonKey,
        }),
      })

      const previewData = (await previewResponse.json()) as PreviewResponse

      if (previewResponse.ok && previewData.success) {
        setPreviewBudget(previewData.budget || null)
        setPreviewSectionMetrics(previewData.sectionMetrics || null)
        // Use the bundle from preview (role-specific)
        if (previewData.bundle) {
          setPreviewContent(previewData.bundle)
        }
      }

      // Also get the actual stored bundle JSON for reference
      const { data: bundleData, error: bundleError } = await supabase
        .from('context_bundles')
        .select('bundle_json')
        .eq('bundle_id', mostRecentBundle.bundle_id)
        .maybeSingle()

      if (!bundleError && bundleData) {
        setBundleJson(bundleData.bundle_json as BundleJson)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setPreviewLoading(false)
    }
  }

  const loadReceipt = async (bundleId: string) => {
    if (!supabaseUrl || !supabaseAnonKey) return

    setReceiptLoading(true)
    setError(null)

    try {
      const response = await fetch(`${apiBaseUrl}/api/context-bundles/get-receipt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          bundleId,
          supabaseUrl,
          supabaseAnonKey,
        }),
      })

      const data = (await response.json()) as ReceiptResponse

      if (!response.ok || !data.success) {
        setError(data.error || 'Failed to load receipt')
        return
      }

      setReceipt(data.receipt || null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setReceiptLoading(false)
    }
  }

  const handleUseBundle = () => {
    if (!mostRecentBundle || !previewBudget) return
    if (previewBudget.exceeds) {
      setError('Cannot use bundle: it exceeds the character budget for the selected role.')
      return
    }
    // TODO: Implement "Use this bundle" action - this would trigger the agent run with the bundle
    // For now, just show a message
    alert(`Would use bundle ${mostRecentBundle.bundle_id} for role ${selectedRole}`)
  }

  const formatTimestamp = (timestamp: string): string => {
    return new Date(timestamp).toLocaleString()
  }

  const formatRole = (role: string): string => {
    const option = ROLE_OPTIONS.find((opt) => opt.value === role)
    return option ? option.label : role
  }

  if (!isOpen) return null

  if (!supabaseUrl || !supabaseAnonKey) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>Context Bundle</h2>
            <button type="button" className="modal-close" onClick={onClose}>
              ×
            </button>
          </div>
          <div className="modal-body">
            <p>Supabase connection required to view context bundles.</p>
          </div>
        </div>
      </div>
    )
  }

  if (!repoFullName) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>Context Bundle</h2>
            <button type="button" className="modal-close" onClick={onClose}>
              ×
            </button>
          </div>
          <div className="modal-body">
            <p>No repository connected. Please connect a repository to view context bundles.</p>
          </div>
        </div>
      </div>
    )
  }

  const isWithinBudget = previewBudget ? !previewBudget.exceeds : false

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '1200px', maxHeight: '90vh' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Context Bundle</h2>
          <button type="button" className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px', overflow: 'auto' }}>
          {error && (
            <div style={{ padding: '12px', background: 'var(--hal-status-error, #c62828)', color: 'white', borderRadius: '4px' }}>
              {error}
            </div>
          )}

          {loading ? (
            <p>Loading most recent bundle...</p>
          ) : !mostRecentBundle ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--hal-text-muted)' }}>
              <p>No bundles have been generated for this repository yet.</p>
              <p style={{ fontSize: '14px', marginTop: '8px' }}>
                Generate a bundle from the Context Bundle modal to view it here.
              </p>
            </div>
          ) : (
            <>
              {/* Bundle Info */}
              <div style={{ border: '1px solid var(--hal-border)', borderRadius: '8px', padding: '16px' }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '18px' }}>Most Recent Bundle</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Ticket:</span>
                    <span style={{ fontWeight: '600' }}>{mostRecentBundle.ticket_id}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Role:</span>
                    <span style={{ fontWeight: '600' }}>{formatRole(mostRecentBundle.role)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Version:</span>
                    <span style={{ fontWeight: '600' }}>{mostRecentBundle.version}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Created:</span>
                    <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{formatTimestamp(mostRecentBundle.created_at)}</span>
                  </div>
                </div>
              </div>

              {/* Role Selector */}
              <div style={{ border: '1px solid var(--hal-border)', borderRadius: '8px', padding: '16px' }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '18px' }}>Preview for Role</h3>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <label>
                    Role:
                    <select
                      value={selectedRole}
                      onChange={(e) => setSelectedRole(e.target.value as RoleOption)}
                      style={{ marginLeft: '8px', padding: '4px 8px' }}
                    >
                      {ROLE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              {/* Budget Status */}
              {previewLoading ? (
                <div style={{ padding: '16px', textAlign: 'center' }}>Loading preview...</div>
              ) : previewBudget ? (
                <div
                  style={{
                    border: `2px solid ${previewBudget.exceeds ? 'var(--hal-status-error, #c62828)' : 'var(--hal-border)'}`,
                    borderRadius: '8px',
                    padding: '16px',
                    background: previewBudget.exceeds ? 'var(--hal-status-error-bg, #ffebee)' : 'var(--hal-surface-alt)',
                  }}
                >
                  <h3 style={{ margin: '0 0 12px 0', fontSize: '18px', color: previewBudget.exceeds ? 'var(--hal-status-error, #c62828)' : 'inherit' }}>
                    Budget Status: {previewBudget.exceeds ? 'Over Budget' : 'Within Budget'}
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>Total Characters:</span>
                      <span style={{ fontFamily: 'monospace', fontWeight: '600' }}>
                        {previewBudget.characterCount.toLocaleString()} / {previewBudget.hardLimit.toLocaleString()}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>Role:</span>
                      <span style={{ fontWeight: '600' }}>{previewBudget.displayName}</span>
                    </div>
                    {previewBudget.exceeds && (
                      <div
                        style={{
                          padding: '8px',
                          background: 'var(--hal-surface)',
                          borderRadius: '4px',
                          color: 'var(--hal-status-error, #c62828)',
                          fontWeight: '600',
                        }}
                      >
                        ⚠️ Exceeds limit by {previewBudget.overage.toLocaleString()} characters
                      </div>
                    )}
                  </div>
                </div>
              ) : null}

              {/* Section Breakdown */}
              {previewSectionMetrics && (
                <div style={{ border: '1px solid var(--hal-border)', borderRadius: '8px', padding: '16px' }}>
                  <h3 style={{ margin: '0 0 12px 0', fontSize: '18px' }}>Section Breakdown</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {Object.entries(previewSectionMetrics).map(([section, count]) => (
                      <div key={section} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', padding: '4px 0' }}>
                        <span>{section}:</span>
                        <span style={{ fontFamily: 'monospace' }}>{count.toLocaleString()} chars</span>
                      </div>
                    ))}
                    {previewBudget && (
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          marginTop: '8px',
                          paddingTop: '8px',
                          borderTop: '1px solid var(--hal-border)',
                          fontWeight: '600',
                        }}
                      >
                        <span>Total:</span>
                        <span style={{ fontFamily: 'monospace' }}>{previewBudget.characterCount.toLocaleString()} chars</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Bundle Preview Content */}
              {previewContent && (
                <div style={{ border: '1px solid var(--hal-border)', borderRadius: '8px', padding: '16px' }}>
                  <h3 style={{ margin: '0 0 12px 0', fontSize: '18px' }}>Bundle Preview</h3>
                  <div
                    style={{
                      background: 'var(--hal-surface-alt)',
                      padding: '12px',
                      borderRadius: '4px',
                      maxHeight: '400px',
                      overflow: 'auto',
                      fontFamily: 'monospace',
                      fontSize: '12px',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {JSON.stringify(previewContent, null, 2)}
                  </div>
                </div>
              )}

              {/* Use This Bundle Button */}
              <div style={{ border: '1px solid var(--hal-border)', borderRadius: '8px', padding: '16px' }}>
                <button
                  type="button"
                  className="btn-standard"
                  onClick={handleUseBundle}
                  disabled={!isWithinBudget || !previewBudget}
                  style={{
                    width: '100%',
                    padding: '12px',
                    fontSize: '16px',
                    fontWeight: '600',
                    opacity: !isWithinBudget || !previewBudget ? 0.5 : 1,
                    cursor: !isWithinBudget || !previewBudget ? 'not-allowed' : 'pointer',
                  }}
                  title={
                    !previewBudget
                      ? 'Loading budget information...'
                      : !isWithinBudget
                        ? `Bundle exceeds character budget by ${previewBudget.overage.toLocaleString()} characters. Please reduce bundle size or select a different role.`
                        : 'Use this bundle to run the selected agent'
                  }
                >
                  {!previewBudget
                    ? 'Loading...'
                    : !isWithinBudget
                      ? `Over Budget - Cannot Use (${previewBudget.overage.toLocaleString()} chars over limit)`
                      : 'Use this bundle'}
                </button>
                {!isWithinBudget && previewBudget && (
                  <p style={{ marginTop: '8px', fontSize: '14px', color: 'var(--hal-status-error, #c62828)' }}>
                    This bundle exceeds the character budget for {previewBudget.displayName} by {previewBudget.overage.toLocaleString()} characters.
                    You cannot proceed until the bundle is within budget.
                  </p>
                )}
              </div>

              {/* Receipt Panel */}
              <div style={{ border: '1px solid var(--hal-border)', borderRadius: '8px', padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h3 style={{ margin: 0, fontSize: '18px' }}>Receipt</h3>
                  <button
                    type="button"
                    className="btn-standard"
                    onClick={() => setReceiptExpanded(!receiptExpanded)}
                    style={{ fontSize: '14px', padding: '4px 8px' }}
                  >
                    {receiptExpanded ? 'Collapse' : 'Expand'}
                  </button>
                </div>
                {receiptLoading ? (
                  <p>Loading receipt...</p>
                ) : receipt ? (
                  receiptExpanded ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {/* Checksums */}
                      <div>
                        <h4 style={{ margin: '0 0 8px 0', fontSize: '16px' }}>Checksums</h4>
                        <div style={{ fontFamily: 'monospace', fontSize: '12px', background: 'var(--hal-surface-alt)', padding: '8px', borderRadius: '4px' }}>
                          <div style={{ marginBottom: '4px' }}>
                            <strong>Content Checksum (stable):</strong> {receipt.content_checksum}
                          </div>
                          <div>
                            <strong>Bundle Checksum:</strong> {receipt.bundle_checksum}
                          </div>
                        </div>
                      </div>

                      {/* Provenance */}
                      <div>
                        <h4 style={{ margin: '0 0 8px 0', fontSize: '16px' }}>Provenance</h4>
                        <div style={{ background: 'var(--hal-surface-alt)', padding: '8px', borderRadius: '4px', fontSize: '14px' }}>
                          <div style={{ marginBottom: '4px' }}>
                            <strong>Bundle ID:</strong> {receipt.bundle_id}
                          </div>
                          <div style={{ marginBottom: '4px' }}>
                            <strong>Ticket ID:</strong> {receipt.ticket_id}
                          </div>
                          <div style={{ marginBottom: '4px' }}>
                            <strong>Role:</strong> {formatRole(receipt.role)}
                          </div>
                          <div>
                            <strong>Created:</strong> {formatTimestamp(receipt.created_at)}
                          </div>
                        </div>
                      </div>

                      {/* References */}
                      <div>
                        <h4 style={{ margin: '0 0 8px 0', fontSize: '16px' }}>References</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '14px' }}>
                          {receipt.red_reference && (
                            <div>
                              <strong>RED:</strong> Version {receipt.red_reference.version} (ID: {receipt.red_reference.red_id.substring(0, 8)}...)
                            </div>
                          )}
                          {receipt.integration_manifest_reference && (
                            <div>
                              <strong>Integration Manifest:</strong> Version {receipt.integration_manifest_reference.version} (Schema:{' '}
                              {receipt.integration_manifest_reference.schema_version}, ID: {receipt.integration_manifest_reference.manifest_id.substring(0, 8)}...)
                            </div>
                          )}
                          {receipt.git_ref && (
                            <div>
                              <strong>Git Ref:</strong>{' '}
                              {receipt.git_ref.pr_url ? (
                                <a href={receipt.git_ref.pr_url} target="_blank" rel="noopener noreferrer">
                                  PR #{receipt.git_ref.pr_number}
                                </a>
                              ) : (
                                'N/A'
                              )}
                              {receipt.git_ref.base_sha && (
                                <span style={{ marginLeft: '8px', fontFamily: 'monospace', fontSize: '12px' }}>
                                  Base: {receipt.git_ref.base_sha.substring(0, 7)}...
                                </span>
                              )}
                              {receipt.git_ref.head_sha && (
                                <span style={{ marginLeft: '8px', fontFamily: 'monospace', fontSize: '12px' }}>
                                  Head: {receipt.git_ref.head_sha.substring(0, 7)}...
                                </span>
                              )}
                            </div>
                          )}
                          {!receipt.red_reference && !receipt.integration_manifest_reference && !receipt.git_ref && (
                            <div style={{ color: 'var(--hal-text-muted)' }}>No references</div>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: '14px', color: 'var(--hal-text-muted)' }}>
                      Click "Expand" to view receipt details including checksums, provenance, and references.
                    </div>
                  )
                ) : (
                  <p style={{ color: 'var(--hal-text-muted)' }}>Receipt not available.</p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
