import { useState, useEffect } from 'react'

interface ContextBundleViewProps {
  repoFullName: string | null
  supabaseUrl: string | null
  supabaseAnonKey: string | null
  onUseBundle?: (bundleId: string, role: string) => void
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
  error?: string
}

interface BundleContent {
  meta: {
    project_id: string
    ticket_id: string
    role: string
    bundle_id?: string
    created_at: string
    content_checksum?: string
    bundle_checksum?: string
  }
  project_manifest: {
    goal: string
    stack: Record<string, string[]>
    constraints: Record<string, string>
    conventions: Record<string, string>
  }
  ticket: {
    title: string
    description: string
    acceptance_criteria: string[]
    out_of_scope: string[]
    definition_of_done: string[]
  }
  state_snapshot: {
    statuses: Record<string, unknown>
    open_findings: string[]
    failing_tests: string[]
    last_known_good_commit: string | null
  }
  recent_deltas: {
    summary: string
    files_touched: string[]
  }
  repo_context: {
    file_pointers: Array<{
      path: string
      snippet?: string
    }>
  }
  relevant_artifacts: Array<{
    artifact_id: string
    artifact_title: string
    summary: string
    hard_facts: string[]
    keywords: string[]
  }>
  instructions: {
    role_specific: string
    output_schema: string
  }
}

// Role mapping for display
const ROLE_DISPLAY_NAMES: Record<string, string> = {
  'project-manager': 'PM',
  'implementation-agent': 'Dev',
  'qa-agent': 'QA',
  'process-review': 'Process Review',
}

const ROLE_VALUES: Record<string, string> = {
  'PM': 'project-manager',
  'Dev': 'implementation-agent',
  'QA': 'qa-agent',
  'Process Review': 'process-review',
}

export function ContextBundleView({
  repoFullName,
  supabaseUrl,
  supabaseAnonKey,
  onUseBundle,
}: ContextBundleViewProps) {
  const apiBaseUrl = import.meta.env.VITE_HAL_API_BASE_URL || window.location.origin
  const [bundles, setBundles] = useState<Bundle[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedBundle, setSelectedBundle] = useState<Bundle | null>(null)
  const [receipt, setReceipt] = useState<BundleReceipt | null>(null)
  const [receiptLoading, setReceiptLoading] = useState(false)
  const [selectedRole, setSelectedRole] = useState<string>('PM')
  const [previewBudget, setPreviewBudget] = useState<PreviewResponse['budget'] | null>(null)
  const [previewSectionMetrics, setPreviewSectionMetrics] = useState<Record<string, number> | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [bundleContent, setBundleContent] = useState<BundleContent | null>(null)
  const [contentLoading, setContentLoading] = useState(false)
  const [receiptExpanded, setReceiptExpanded] = useState(false)
  const [breakdownExpanded, setBreakdownExpanded] = useState(false)

  // Load most recent bundle when repo changes
  useEffect(() => {
    if (repoFullName && supabaseUrl && supabaseAnonKey) {
      loadMostRecentBundle()
    } else {
      setBundles([])
      setSelectedBundle(null)
      setReceipt(null)
      setBundleContent(null)
    }
  }, [repoFullName, supabaseUrl, supabaseAnonKey])

  // Load receipt when bundle is selected
  useEffect(() => {
    if (selectedBundle && supabaseUrl && supabaseAnonKey) {
      loadReceipt(selectedBundle.bundle_id)
      loadBundleContent(selectedBundle.bundle_id)
    } else {
      setReceipt(null)
      setBundleContent(null)
    }
  }, [selectedBundle, supabaseUrl, supabaseAnonKey])

  // Preview bundle for selected role when bundle or role changes
  useEffect(() => {
    if (selectedBundle && selectedRole && supabaseUrl && supabaseAnonKey && repoFullName) {
      previewBundleForRole()
    } else {
      setPreviewBudget(null)
      setPreviewSectionMetrics(null)
    }
  }, [selectedBundle, selectedRole, supabaseUrl, supabaseAnonKey, repoFullName])

  const loadMostRecentBundle = async () => {
    if (!repoFullName || !supabaseUrl || !supabaseAnonKey) return

    setLoading(true)
    setError(null)

    try {
      // First, we need to get tickets for this repo to find bundles
      // For now, let's try to get bundles by querying with a ticket
      // We'll need to modify the API or use a different approach
      // For this implementation, let's assume we can get bundles by repo
      // Since the list API requires a ticket, we'll need to find the most recent bundle differently
      // Let's use Supabase directly to get the most recent bundle for the repo
      const { createClient } = await import('@supabase/supabase-js')
      const supabase = createClient(supabaseUrl, supabaseAnonKey)

      const { data: bundlesData, error: bundlesError } = await supabase
        .from('context_bundles')
        .select('bundle_id, ticket_id, role, version, created_at, created_by')
        .eq('repo_full_name', repoFullName)
        .order('created_at', { ascending: false })
        .limit(1)

      if (bundlesError) {
        setError(`Failed to load bundles: ${bundlesError.message}`)
        return
      }

      if (bundlesData && bundlesData.length > 0) {
        const bundle = bundlesData[0] as Bundle
        setBundles([bundle])
        setSelectedBundle(bundle)
      } else {
        setBundles([])
        setSelectedBundle(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
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

  const loadBundleContent = async (bundleId: string) => {
    if (!supabaseUrl || !supabaseAnonKey) return

    setContentLoading(true)
    setError(null)

    try {
      const { createClient } = await import('@supabase/supabase-js')
      const supabase = createClient(supabaseUrl, supabaseAnonKey)

      const { data: bundleData, error: bundleError } = await supabase
        .from('context_bundles')
        .select('bundle_json')
        .eq('bundle_id', bundleId)
        .maybeSingle()

      if (bundleError) {
        setError(`Failed to load bundle content: ${bundleError.message}`)
        return
      }

      if (bundleData && bundleData.bundle_json) {
        setBundleContent(bundleData.bundle_json as BundleContent)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setContentLoading(false)
    }
  }

  const previewBundleForRole = async () => {
    if (!selectedBundle || !selectedRole || !supabaseUrl || !supabaseAnonKey || !repoFullName) return

    setPreviewLoading(true)
    setError(null)

    try {
      // We need ticket info to preview - get it from the bundle
      const { createClient } = await import('@supabase/supabase-js')
      const supabase = createClient(supabaseUrl, supabaseAnonKey)

      const { data: ticketData, error: ticketError } = await supabase
        .from('tickets')
        .select('pk, id, repo_full_name')
        .eq('id', selectedBundle.ticket_id)
        .maybeSingle()

      if (ticketError || !ticketData) {
        setError('Failed to load ticket information for preview')
        return
      }

      const roleValue = ROLE_VALUES[selectedRole]
      if (!roleValue) {
        setError(`Invalid role: ${selectedRole}`)
        return
      }

      // Get artifact IDs from the existing bundle if available
      let selectedArtifactIds: string[] = []
      if (bundleContent?.relevant_artifacts) {
        selectedArtifactIds = bundleContent.relevant_artifacts.map(a => a.artifact_id)
      }

      const response = await fetch(`${apiBaseUrl}/api/context-bundles/preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          ticketPk: ticketData.pk,
          ticketId: ticketData.id,
          repoFullName: ticketData.repo_full_name,
          role: roleValue,
          selectedArtifactIds: selectedArtifactIds.length > 0 ? selectedArtifactIds : undefined,
          supabaseUrl,
          supabaseAnonKey,
        }),
      })

      const data = (await response.json()) as PreviewResponse

      if (!response.ok || !data.success) {
        setError(data.error || 'Failed to preview bundle')
        setPreviewBudget(null)
        setPreviewSectionMetrics(null)
        return
      }

      setPreviewBudget(data.budget || null)
      setPreviewSectionMetrics(data.sectionMetrics || null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setPreviewBudget(null)
      setPreviewSectionMetrics(null)
    } finally {
      setPreviewLoading(false)
    }
  }

  const handleUseBundle = () => {
    if (!selectedBundle || !previewBudget || previewBudget.exceeds) return

    const roleValue = ROLE_VALUES[selectedRole]
    if (roleValue && onUseBundle) {
      onUseBundle(selectedBundle.bundle_id, roleValue)
    }
  }

  const formatTimestamp = (timestamp: string): string => {
    return new Date(timestamp).toLocaleString()
  }

  const formatRole = (role: string): string => {
    return ROLE_DISPLAY_NAMES[role] || role
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: 'var(--hal-text-muted)' }}>
        <p>Supabase connection required to view context bundles.</p>
      </div>
    )
  }

  if (!repoFullName) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: 'var(--hal-text-muted)' }}>
        <p>Please connect a GitHub repository to view context bundles.</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <h2 style={{ margin: '0 0 24px 0', fontSize: '24px' }}>Context Bundle</h2>

      {error && (
        <div style={{ 
          padding: '12px', 
          background: 'var(--hal-status-error, #c62828)', 
          color: 'white', 
          borderRadius: '4px',
          marginBottom: '16px',
        }}>
          {error}
        </div>
      )}

      {loading ? (
        <p>Loading bundles...</p>
      ) : !selectedBundle ? (
        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--hal-text-muted)' }}>
          <p>No bundles generated yet for this repository.</p>
          <p style={{ fontSize: '14px', marginTop: '8px' }}>
            Generate a bundle from the Context Bundle modal to view it here.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Bundle Info */}
          <div style={{ border: '1px solid var(--hal-border)', borderRadius: '8px', padding: '16px' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '18px' }}>Most Recent Bundle</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--hal-text-muted)' }}>Ticket:</span>
                <span style={{ fontWeight: '600' }}>{selectedBundle.ticket_id}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--hal-text-muted)' }}>Original Role:</span>
                <span style={{ fontWeight: '600' }}>{formatRole(selectedBundle.role)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--hal-text-muted)' }}>Version:</span>
                <span style={{ fontWeight: '600' }}>{selectedBundle.version}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--hal-text-muted)' }}>Created:</span>
                <span style={{ fontWeight: '600' }}>{formatTimestamp(selectedBundle.created_at)}</span>
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
                  style={{ marginLeft: '8px', padding: '6px 12px', fontSize: '14px' }}
                >
                  <option value="PM">PM</option>
                  <option value="Dev">Dev</option>
                  <option value="QA">QA</option>
                  <option value="Process Review">Process Review</option>
                </select>
              </label>
              {previewLoading && <span style={{ color: 'var(--hal-text-muted)', fontSize: '14px' }}>Loading preview...</span>}
            </div>
          </div>

          {/* Budget Status */}
          {previewBudget && (
            <div style={{ 
              border: `2px solid ${previewBudget.exceeds ? 'var(--hal-status-error, #c62828)' : 'var(--hal-status-success, #2e7d32)'}`, 
              borderRadius: '8px', 
              padding: '16px',
              background: previewBudget.exceeds ? 'var(--hal-status-error-bg, #ffebee)' : 'var(--hal-surface-alt)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ margin: 0, fontSize: '18px', color: previewBudget.exceeds ? 'var(--hal-status-error, #c62828)' : 'var(--hal-status-success, #2e7d32)' }}>
                  {previewBudget.exceeds ? '⚠️ Over Budget' : '✅ Within Budget'}
                </h3>
                <span style={{ 
                  fontSize: '16px', 
                  fontWeight: '600',
                  fontFamily: 'monospace',
                  color: previewBudget.exceeds ? 'var(--hal-status-error, #c62828)' : 'inherit',
                }}>
                  {previewBudget.characterCount.toLocaleString()} / {previewBudget.hardLimit.toLocaleString()} chars
                </span>
              </div>
              {previewBudget.exceeds && (
                <div style={{ 
                  padding: '12px', 
                  background: 'var(--hal-surface)', 
                  borderRadius: '4px',
                  color: 'var(--hal-status-error, #c62828)',
                  fontWeight: '600',
                  marginTop: '8px',
                }}>
                  Exceeds limit by {previewBudget.overage.toLocaleString()} characters
                </div>
              )}
            </div>
          )}

          {/* Per-Section Breakdown */}
          {previewSectionMetrics && (
            <div style={{ border: '1px solid var(--hal-border)', borderRadius: '8px', padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ margin: 0, fontSize: '18px' }}>Per-Section Breakdown</h3>
                <button
                  type="button"
                  className="btn-standard"
                  onClick={() => setBreakdownExpanded(!breakdownExpanded)}
                  style={{ fontSize: '14px', padding: '4px 12px' }}
                >
                  {breakdownExpanded ? 'Collapse' : 'Expand'}
                </button>
              </div>
              {breakdownExpanded && (
                <div style={{ background: 'var(--hal-surface-alt)', padding: '12px', borderRadius: '4px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--hal-border)' }}>
                        <th style={{ textAlign: 'left', padding: '8px', fontSize: '14px', fontWeight: '600' }}>Section</th>
                        <th style={{ textAlign: 'right', padding: '8px', fontSize: '14px', fontWeight: '600' }}>Character Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(previewSectionMetrics).map(([section, count]) => (
                        <tr key={section} style={{ borderBottom: '1px solid var(--hal-border)' }}>
                          <td style={{ padding: '8px', fontSize: '14px' }}>{section}</td>
                          <td style={{ padding: '8px', fontSize: '14px', textAlign: 'right', fontFamily: 'monospace' }}>
                            {count.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                      {previewBudget && (
                        <tr style={{ borderTop: '2px solid var(--hal-border)', fontWeight: '600' }}>
                          <td style={{ padding: '8px', fontSize: '14px' }}>Total</td>
                          <td style={{ padding: '8px', fontSize: '14px', textAlign: 'right', fontFamily: 'monospace' }}>
                            {previewBudget.characterCount.toLocaleString()}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Bundle Preview Content */}
          {bundleContent && (
            <div style={{ border: '1px solid var(--hal-border)', borderRadius: '8px', padding: '16px' }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: '18px' }}>Bundle Preview for {selectedRole}</h3>
              <div style={{ 
                background: 'var(--hal-surface-alt)', 
                padding: '12px', 
                borderRadius: '4px',
                maxHeight: '400px',
                overflow: 'auto',
                fontSize: '13px',
                fontFamily: 'monospace',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                {(() => {
                  // Show role-specific preview - the instructions section will differ by role
                  const previewContent = {
                    ...bundleContent,
                    meta: {
                      ...bundleContent.meta,
                      role: ROLE_VALUES[selectedRole] || bundleContent.meta.role,
                    },
                    instructions: {
                      role_specific: `[Preview for ${selectedRole} - instructions would be role-specific]`,
                      output_schema: bundleContent.instructions.output_schema,
                    },
                  }
                  return JSON.stringify(previewContent, null, 2)
                })()}
              </div>
            </div>
          )}

          {/* Receipt Panel */}
          {receipt && (
            <div style={{ border: '1px solid var(--hal-border)', borderRadius: '8px', padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ margin: 0, fontSize: '18px' }}>Receipt</h3>
                <button
                  type="button"
                  className="btn-standard"
                  onClick={() => setReceiptExpanded(!receiptExpanded)}
                  style={{ fontSize: '14px', padding: '4px 12px' }}
                >
                  {receiptExpanded ? 'Collapse' : 'Expand'}
                </button>
              </div>
              {receiptExpanded && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
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
                    <div style={{ background: 'var(--hal-surface-alt)', padding: '12px', borderRadius: '4px', fontSize: '14px' }}>
                      <div style={{ marginBottom: '4px' }}>
                        <strong>Bundle ID:</strong> {receipt.bundle_id}
                      </div>
                      <div style={{ marginBottom: '4px' }}>
                        <strong>Ticket ID:</strong> {receipt.ticket_id}
                      </div>
                      <div style={{ marginBottom: '4px' }}>
                        <strong>Role:</strong> {formatRole(receipt.role)}
                      </div>
                      <div style={{ marginBottom: '4px' }}>
                        <strong>Created:</strong> {formatTimestamp(receipt.created_at)}
                      </div>
                    </div>
                  </div>

                  {/* References */}
                  <div>
                    <h4 style={{ margin: '0 0 8px 0', fontSize: '16px' }}>References</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '14px' }}>
                      {receipt.red_reference && (
                        <div style={{ background: 'var(--hal-surface-alt)', padding: '8px', borderRadius: '4px' }}>
                          <strong>RED:</strong> Version {receipt.red_reference.version} (ID: {receipt.red_reference.red_id.substring(0, 8)}...)
                        </div>
                      )}
                      {receipt.integration_manifest_reference && (
                        <div style={{ background: 'var(--hal-surface-alt)', padding: '8px', borderRadius: '4px' }}>
                          <strong>Integration Manifest:</strong> Version {receipt.integration_manifest_reference.version} 
                          (Schema: {receipt.integration_manifest_reference.schema_version}, ID: {receipt.integration_manifest_reference.manifest_id.substring(0, 8)}...)
                        </div>
                      )}
                      {receipt.git_ref && (
                        <div style={{ background: 'var(--hal-surface-alt)', padding: '8px', borderRadius: '4px' }}>
                          <strong>Git Ref:</strong>{' '}
                          {receipt.git_ref.pr_url ? (
                            <a href={receipt.git_ref.pr_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--hal-link-color)' }}>
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
                        <div style={{ color: 'var(--hal-text-muted)', fontSize: '14px' }}>No references</div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Use This Bundle Button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button
              type="button"
              className="btn-standard"
              onClick={handleUseBundle}
              disabled={!previewBudget || previewBudget.exceeds}
              style={{
                padding: '12px 24px',
                fontSize: '16px',
                fontWeight: '600',
                opacity: (!previewBudget || previewBudget.exceeds) ? 0.5 : 1,
                cursor: (!previewBudget || previewBudget.exceeds) ? 'not-allowed' : 'pointer',
              }}
              title={previewBudget?.exceeds ? 'Bundle exceeds character budget. Cannot use this bundle.' : 'Use this bundle to run the selected agent'}
            >
              Use this bundle
            </button>
          </div>
          {previewBudget?.exceeds && (
            <div style={{ 
              padding: '12px', 
              background: 'var(--hal-status-error-bg, #ffebee)', 
              borderRadius: '4px',
              color: 'var(--hal-status-error, #c62828)',
              fontSize: '14px',
            }}>
              <strong>Cannot use this bundle:</strong> The bundle exceeds the character budget for {previewBudget.displayName} by {previewBudget.overage.toLocaleString()} characters. 
              Please reduce the bundle size or select a different role with a higher limit.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
