import { useState, useEffect } from 'react'

interface ContextBundleViewProps {
  repoFullName: string
  supabaseUrl: string | null
  supabaseAnonKey: string | null
  onClose: () => void
  onUseBundle?: (bundleId: string, role: string) => void
}

interface Bundle {
  bundle_id: string
  ticket_id: string
  ticket_pk: string
  role: string
  version: number
  created_at: string
  created_by: string | null
}

interface LatestBundleResponse {
  success: boolean
  bundle?: Bundle | null
  repo_full_name?: string
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
  bundle?: BundleContent
  error?: string
}

interface BundleContent {
  meta: unknown
  project_manifest: unknown
  ticket: unknown
  state_snapshot: unknown
  recent_deltas: unknown
  repo_context: unknown
  relevant_artifacts: unknown
  instructions: unknown
}

interface BundleContentResponse {
  success: boolean
  bundle?: BundleContent
  error?: string
}

const ROLE_OPTIONS = [
  { value: 'project-manager', label: 'PM' },
  { value: 'implementation-agent', label: 'Dev' },
  { value: 'qa-agent', label: 'QA' },
  { value: 'process-review', label: 'Process Review' },
]

export function ContextBundleView({
  repoFullName,
  supabaseUrl,
  supabaseAnonKey,
  onClose,
  onUseBundle,
}: ContextBundleViewProps) {
  const handleClose = () => {
    onClose()
  }
  const apiBaseUrl = import.meta.env.VITE_HAL_API_BASE_URL || window.location.origin
  const [latestBundle, setLatestBundle] = useState<Bundle | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedRole, setSelectedRole] = useState<string>('project-manager')
  const [previewBudget, setPreviewBudget] = useState<PreviewResponse['budget'] | null>(null)
  const [previewSectionMetrics, setPreviewSectionMetrics] = useState<Record<string, number> | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [receipt, setReceipt] = useState<BundleReceipt | null>(null)
  const [receiptLoading, setReceiptLoading] = useState(false)
  const [receiptExpanded, setReceiptExpanded] = useState(false)
  const [bundleContent, setBundleContent] = useState<BundleContent | null>(null)
  const [breakdownExpanded, setBreakdownExpanded] = useState(false)

  // Load latest bundle on mount
  useEffect(() => {
    if (supabaseUrl && supabaseAnonKey) {
      loadLatestBundle()
    }
  }, [repoFullName, supabaseUrl, supabaseAnonKey])

  // Load preview when role changes and we have a bundle
  useEffect(() => {
    if (latestBundle && supabaseUrl && supabaseAnonKey) {
      loadPreview()
    } else {
      setPreviewBudget(null)
      setPreviewSectionMetrics(null)
    }
  }, [selectedRole, latestBundle, supabaseUrl, supabaseAnonKey])

  // Load receipt when bundle is selected
  useEffect(() => {
    if (latestBundle?.bundle_id && supabaseUrl && supabaseAnonKey) {
      loadReceipt()
    }
  }, [latestBundle?.bundle_id, supabaseUrl, supabaseAnonKey])

  const loadLatestBundle = async () => {
    if (!supabaseUrl || !supabaseAnonKey) return

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`${apiBaseUrl}/api/context-bundles/get-latest-for-repo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          repoFullName,
          supabaseUrl,
          supabaseAnonKey,
        }),
      })

      const data = (await response.json()) as LatestBundleResponse

      if (!response.ok || !data.success) {
        setError(data.error || 'Failed to load bundle')
        setLatestBundle(null)
        return
      }

      setLatestBundle(data.bundle || null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setLatestBundle(null)
    } finally {
      setLoading(false)
    }
  }

  const loadPreview = async () => {
    if (!latestBundle || !supabaseUrl || !supabaseAnonKey) return

    setPreviewLoading(true)
    setError(null)

    try {
      const response = await fetch(`${apiBaseUrl}/api/context-bundles/preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          ticketPk: latestBundle.ticket_pk,
          ticketId: latestBundle.ticket_id,
          repoFullName,
          role: selectedRole,
          supabaseUrl,
          supabaseAnonKey,
        }),
      })

      const data = (await response.json()) as PreviewResponse

      if (!response.ok || !data.success) {
        setPreviewBudget(null)
        setPreviewSectionMetrics(null)
        return
      }

      setPreviewBudget(data.budget || null)
      setPreviewSectionMetrics(data.sectionMetrics || null)
      if (data.bundle) {
        setBundleContent(data.bundle)
      } else {
        setBundleContent(null)
      }
    } catch (err) {
      setPreviewBudget(null)
      setPreviewSectionMetrics(null)
      setBundleContent(null)
    } finally {
      setPreviewLoading(false)
    }
  }

  const loadReceipt = async () => {
    if (!latestBundle?.bundle_id || !supabaseUrl || !supabaseAnonKey) return

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
          bundleId: latestBundle.bundle_id,
          supabaseUrl,
          supabaseAnonKey,
        }),
      })

      const data = (await response.json()) as ReceiptResponse

      if (!response.ok || !data.success) {
        setError(data.error || 'Failed to load receipt')
        setReceipt(null)
        return
      }

      setReceipt(data.receipt || null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setReceipt(null)
    } finally {
      setReceiptLoading(false)
    }
  }

  // Bundle content is now loaded via preview endpoint when role changes
  // This function is kept for backward compatibility but is no longer needed
  const loadBundleContent = async () => {
    // Bundle content is automatically loaded when preview is fetched
    // This is a no-op now
  }

  const handleUseBundle = () => {
    if (!latestBundle || !previewBudget || previewBudget.exceeds) return
    if (onUseBundle) {
      onUseBundle(latestBundle.bundle_id, selectedRole)
    }
  }

  const formatTimestamp = (timestamp: string): string => {
    return new Date(timestamp).toLocaleString()
  }

  const formatRole = (role: string): string => {
    const option = ROLE_OPTIONS.find((opt) => opt.value === role)
    return option ? option.label : role
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    return (
      <div className="modal-overlay" onClick={handleClose}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>Context Bundle</h2>
            <button type="button" className="modal-close" onClick={handleClose}>
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

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content" style={{ maxWidth: '1000px', maxHeight: '90vh', width: '90vw' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Context Bundle - {repoFullName}</h2>
          <button type="button" className="modal-close" onClick={handleClose}>
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
            <p>Loading bundle...</p>
          ) : !latestBundle ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--hal-text-muted)' }}>
              <p>No bundles have been generated for this repository yet.</p>
              <p style={{ fontSize: '14px', marginTop: '8px' }}>
                Generate a bundle from a ticket to see it here.
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
                    <span style={{ fontWeight: '600' }}>{latestBundle.ticket_id}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Role:</span>
                    <span style={{ fontWeight: '600' }}>{formatRole(latestBundle.role)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Version:</span>
                    <span style={{ fontWeight: '600' }}>{latestBundle.version}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Created:</span>
                    <span style={{ fontWeight: '600' }}>{formatTimestamp(latestBundle.created_at)}</span>
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
                      onChange={(e) => setSelectedRole(e.target.value)}
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
                    border: `2px solid ${previewBudget.exceeds ? 'var(--hal-status-error, #c62828)' : 'var(--hal-status-success, #2e7d32)'}`,
                    borderRadius: '8px',
                    padding: '16px',
                    background: previewBudget.exceeds ? 'var(--hal-status-error-bg, #ffebee)' : 'var(--hal-status-success-bg, #e8f5e9)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h3 style={{ margin: 0, fontSize: '18px', color: previewBudget.exceeds ? 'var(--hal-status-error, #c62828)' : 'var(--hal-status-success, #2e7d32)' }}>
                      {previewBudget.exceeds ? '⚠️ Over Budget' : '✅ Within Budget'}
                    </h3>
                    <div style={{ fontSize: '16px', fontWeight: '600', fontFamily: 'monospace' }}>
                      {previewBudget.characterCount.toLocaleString()} / {previewBudget.hardLimit.toLocaleString()} chars
                    </div>
                  </div>
                  <div style={{ fontSize: '14px', marginBottom: '8px' }}>
                    <strong>Role:</strong> {previewBudget.displayName}
                  </div>
                  {previewBudget.exceeds && (
                    <div
                      style={{
                        padding: '8px',
                        background: 'var(--hal-surface)',
                        borderRadius: '4px',
                        color: 'var(--hal-status-error, #c62828)',
                        fontWeight: '600',
                        marginTop: '8px',
                      }}
                    >
                      Exceeds limit by {previewBudget.overage.toLocaleString()} characters
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ padding: '16px', textAlign: 'center', color: 'var(--hal-text-muted)' }}>
                  Preview not available
                </div>
              )}

              {/* Breakdown */}
              {previewSectionMetrics && (
                <div style={{ border: '1px solid var(--hal-border)', borderRadius: '8px', padding: '16px' }}>
                  <button
                    type="button"
                    onClick={() => setBreakdownExpanded(!breakdownExpanded)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer',
                      fontSize: '16px',
                      fontWeight: '600',
                    }}
                  >
                    <span>Section Breakdown</span>
                    <span>{breakdownExpanded ? '−' : '+'}</span>
                  </button>
                  {breakdownExpanded && (
                    <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {Object.entries(previewSectionMetrics).map(([section, count]) => (
                        <div key={section} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                          <span>{section}:</span>
                          <span style={{ fontFamily: 'monospace', fontWeight: '600' }}>{count.toLocaleString()} chars</span>
                        </div>
                      ))}
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          marginTop: '8px',
                          paddingTop: '8px',
                          borderTop: '1px solid var(--hal-border)',
                          fontWeight: '600',
                          fontSize: '16px',
                        }}
                      >
                        <span>Total:</span>
                        <span style={{ fontFamily: 'monospace' }}>
                          {Object.values(previewSectionMetrics).reduce((sum, count) => sum + count, 0).toLocaleString()} chars
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Bundle Preview */}
              <div style={{ border: '1px solid var(--hal-border)', borderRadius: '8px', padding: '16px' }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '18px' }}>Bundle Preview</h3>
                {previewLoading ? (
                  <p>Loading bundle content...</p>
                ) : bundleContent ? (
                  <div style={{ background: 'var(--hal-surface-alt)', padding: '12px', borderRadius: '4px', maxHeight: '400px', overflow: 'auto' }}>
                    <pre style={{ margin: 0, fontSize: '12px', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {JSON.stringify(bundleContent, null, 2)}
                    </pre>
                  </div>
                ) : (
                  <p style={{ fontSize: '14px', color: 'var(--hal-text-muted)' }}>
                    Select a role to preview the bundle content that would be sent to that role.
                  </p>
                )}
              </div>

              {/* Receipt Panel */}
              <div style={{ border: '1px solid var(--hal-border)', borderRadius: '8px', padding: '16px' }}>
                <button
                  type="button"
                  onClick={() => setReceiptExpanded(!receiptExpanded)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    fontSize: '16px',
                    fontWeight: '600',
                  }}
                >
                  <span>Receipt</span>
                  <span>{receiptExpanded ? '−' : '+'}</span>
                </button>
                {receiptExpanded && (
                  <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {receiptLoading ? (
                      <p>Loading receipt...</p>
                    ) : receipt ? (
                      <>
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
                          <div style={{ fontSize: '14px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <div>
                              <strong>Bundle ID:</strong> {receipt.bundle_id}
                            </div>
                            <div>
                              <strong>Ticket ID:</strong> {receipt.ticket_id}
                            </div>
                            <div>
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
                                <strong>Integration Manifest:</strong> Version {receipt.integration_manifest_reference.version} (Schema: {receipt.integration_manifest_reference.schema_version}, ID: {receipt.integration_manifest_reference.manifest_id.substring(0, 8)}...)
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
                      </>
                    ) : (
                      <p style={{ color: 'var(--hal-text-muted)' }}>Receipt not available</p>
                    )}
                  </div>
                )}
              </div>

              {/* Use Bundle Button */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', paddingTop: '16px', borderTop: '1px solid var(--hal-border)' }}>
                {previewBudget?.exceeds ? (
                  <div style={{ flex: 1, padding: '12px', background: 'var(--hal-status-error-bg, #ffebee)', borderRadius: '4px', color: 'var(--hal-status-error, #c62828)' }}>
                    <strong>Cannot use bundle:</strong> Bundle exceeds character budget for {previewBudget.displayName} by {previewBudget.overage.toLocaleString()} characters.
                  </div>
                ) : (
                  <button
                    type="button"
                    className="btn-standard"
                    onClick={handleUseBundle}
                    disabled={!previewBudget || previewBudget.exceeds}
                    style={{ minWidth: '150px' }}
                  >
                    Use this bundle
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
