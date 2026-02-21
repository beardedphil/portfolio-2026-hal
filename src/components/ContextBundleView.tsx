import { useState, useEffect } from 'react'

interface ContextBundleViewProps {
  ticketPk: string | null
  ticketId: string | null
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

interface BundleJson {
  meta?: {
    role: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

// Role mapping: UI labels to API role identifiers
const ROLE_MAP: Record<string, string> = {
  'PM': 'project-manager',
  'Dev': 'implementation-agent',
  'QA': 'qa-agent',
  'Process Review': 'process-review',
}

const ROLE_DISPLAY_NAMES: Record<string, string> = {
  'project-manager': 'Project Manager',
  'implementation-agent': 'Implementation Agent',
  'qa-agent': 'QA Agent',
  'process-review': 'Process Review',
}

export function ContextBundleView({
  ticketPk,
  ticketId,
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
  const [bundleJson, setBundleJson] = useState<BundleJson | null>(null)
  const [showReceipt, setShowReceipt] = useState(false)
  const [artifacts, setArtifacts] = useState<Array<{ artifact_id: string }>>([])

  // Load bundles and artifacts when component mounts or ticket changes
  useEffect(() => {
    if (ticketPk && supabaseUrl && supabaseAnonKey) {
      loadBundles()
      loadArtifacts()
    }
  }, [ticketPk, supabaseUrl, supabaseAnonKey])

  // Load most recent bundle by default
  useEffect(() => {
    if (bundles.length > 0 && !selectedBundle) {
      setSelectedBundle(bundles[0])
      loadReceipt(bundles[0].bundle_id)
    }
  }, [bundles])

  // Load preview when role or bundle changes
  useEffect(() => {
    if (selectedBundle && ticketPk && repoFullName && supabaseUrl && supabaseAnonKey && (artifacts.length > 0 || bundleJson)) {
      loadPreview()
    } else {
      setPreviewBudget(null)
      setPreviewSectionMetrics(null)
    }
  }, [selectedBundle, selectedRole, ticketPk, repoFullName, supabaseUrl, supabaseAnonKey, artifacts, bundleJson])

  // Persist selected bundle and role in localStorage
  useEffect(() => {
    if (selectedBundle && ticketId) {
      const key = `context-bundle-view-${ticketId}`
      localStorage.setItem(key, JSON.stringify({
        bundleId: selectedBundle.bundle_id,
        role: selectedRole,
      }))
    }
  }, [selectedBundle, selectedRole, ticketId])

  // Restore from localStorage on mount
  useEffect(() => {
    if (ticketId && bundles.length > 0) {
      const key = `context-bundle-view-${ticketId}`
      const saved = localStorage.getItem(key)
      if (saved) {
        try {
          const { bundleId, role } = JSON.parse(saved)
          const bundle = bundles.find(b => b.bundle_id === bundleId)
          if (bundle) {
            setSelectedBundle(bundle)
            setSelectedRole(role || 'PM')
            loadReceipt(bundle.bundle_id)
          }
        } catch {
          // Ignore parse errors
        }
      }
    }
  }, [ticketId, bundles])

  const loadBundles = async () => {
    if (!ticketPk || !supabaseUrl || !supabaseAnonKey) return

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`${apiBaseUrl}/api/context-bundles/list`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          ticketPk,
          ticketId,
          repoFullName,
          supabaseUrl,
          supabaseAnonKey,
        }),
      })

      const data = (await response.json()) as BundleListResponse

      if (!response.ok || !data.success) {
        setError(data.error || 'Failed to load bundles')
        return
      }

      setBundles(data.bundles || [])
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

      // Also fetch the bundle JSON to display content
      const { createClient } = await import('@supabase/supabase-js')
      const supabase = createClient(supabaseUrl, supabaseAnonKey)
      const { data: bundleData, error: bundleError } = await supabase
        .from('context_bundles')
        .select('bundle_json')
        .eq('bundle_id', bundleId)
        .maybeSingle()

      if (!bundleError && bundleData) {
        setBundleJson(bundleData.bundle_json as BundleJson)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setReceiptLoading(false)
    }
  }

  const loadArtifacts = async () => {
    if (!ticketPk || !supabaseUrl || !supabaseAnonKey) return

    try {
      const response = await fetch(`${apiBaseUrl}/api/artifacts/get`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          ticketPk,
          ticketId,
          supabaseUrl,
          supabaseAnonKey,
        }),
      })

      const data = (await response.json()) as {
        success: boolean
        artifacts?: Array<{ artifact_id: string }>
        error?: string
      }

      if (response.ok && data.success && data.artifacts) {
        setArtifacts(data.artifacts)
      }
    } catch (err) {
      // Ignore errors - artifacts are optional for preview
    }
  }

  const loadPreview = async () => {
    if (!selectedBundle || !ticketPk || !repoFullName || !supabaseUrl || !supabaseAnonKey) return

    setPreviewLoading(true)
    setError(null)

    try {
      const roleApiId = ROLE_MAP[selectedRole] || 'project-manager'
      
      // Use artifact IDs from the loaded artifacts, or from bundle JSON if available
      const artifactIds = artifacts.length > 0
        ? artifacts.map(a => a.artifact_id)
        : bundleJson?.relevant_artifacts
          ? (bundleJson.relevant_artifacts as Array<{ artifact_id: string }>).map(a => a.artifact_id)
          : []
      
      const response = await fetch(`${apiBaseUrl}/api/context-bundles/preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          ticketPk,
          ticketId,
          repoFullName,
          role: roleApiId,
          supabaseUrl,
          supabaseAnonKey,
          selectedArtifactIds: artifactIds,
        }),
      })

      const data = (await response.json()) as PreviewResponse

      if (!response.ok || !data.success) {
        // Don't set error for preview failures - just clear preview
        setPreviewBudget(null)
        setPreviewSectionMetrics(null)
        return
      }

      setPreviewBudget(data.budget || null)
      setPreviewSectionMetrics(data.sectionMetrics || null)
    } catch (err) {
      // Don't set error for preview failures - just clear preview
      setPreviewBudget(null)
      setPreviewSectionMetrics(null)
    } finally {
      setPreviewLoading(false)
    }
  }

  const handleUseBundle = () => {
    if (selectedBundle && onUseBundle) {
      const roleApiId = ROLE_MAP[selectedRole] || 'project-manager'
      onUseBundle(selectedBundle.bundle_id, roleApiId)
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
      <div style={{ padding: '16px', border: '1px solid var(--hal-border)', borderRadius: '8px' }}>
        <p>Supabase connection required to view context bundles.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{ padding: '16px', border: '1px solid var(--hal-border)', borderRadius: '8px' }}>
        <p>Loading bundles...</p>
      </div>
    )
  }

  if (error && bundles.length === 0) {
    return (
      <div style={{ padding: '16px', border: '1px solid var(--hal-border)', borderRadius: '8px' }}>
        <div style={{ padding: '12px', background: 'var(--hal-status-error-bg, #ffebee)', color: 'var(--hal-status-error, #c62828)', borderRadius: '4px' }}>
          {error}
        </div>
      </div>
    )
  }

  if (bundles.length === 0) {
    return (
      <div style={{ padding: '16px', border: '1px solid var(--hal-border)', borderRadius: '8px' }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '18px' }}>Context Bundle</h3>
        <p style={{ color: 'var(--hal-text-muted)' }}>No bundles generated yet for this ticket.</p>
      </div>
    )
  }

  const currentBudget = previewBudget || (receipt ? {
    characterCount: receipt.total_characters,
    hardLimit: 0, // Will be set from role budget
    role: receipt.role,
    displayName: formatRole(receipt.role),
    exceeds: false,
    overage: 0,
  } : null)

  // Get budget limit for the selected role
  const roleApiId = ROLE_MAP[selectedRole] || 'project-manager'
  const budgetLimits: Record<string, number> = {
    'project-manager': 150_000,
    'implementation-agent': 200_000,
    'qa-agent': 200_000,
    'process-review': 100_000,
  }
  const hardLimit = currentBudget?.hardLimit || budgetLimits[roleApiId] || 0
  const exceeds = currentBudget ? (currentBudget.characterCount > hardLimit) : false
  const overage = exceeds ? (currentBudget.characterCount - hardLimit) : 0

  const sectionMetrics = previewSectionMetrics || receipt?.section_metrics || {}

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px', border: '1px solid var(--hal-border)', borderRadius: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: '18px' }}>Context Bundle</h3>
        {selectedBundle && (
          <div style={{ fontSize: '14px', color: 'var(--hal-text-muted)' }}>
            {formatRole(selectedBundle.role)} - Version {selectedBundle.version}
          </div>
        )}
      </div>

      {error && (
        <div style={{ padding: '12px', background: 'var(--hal-status-error-bg, #ffebee)', color: 'var(--hal-status-error, #c62828)', borderRadius: '4px', fontSize: '14px' }}>
          {error}
        </div>
      )}

      {/* Bundle Selection */}
      {bundles.length > 1 && (
        <div>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600' }}>
            Select Bundle:
          </label>
          <select
            value={selectedBundle?.bundle_id || ''}
            onChange={(e) => {
              const bundle = bundles.find(b => b.bundle_id === e.target.value)
              if (bundle) {
                setSelectedBundle(bundle)
                loadReceipt(bundle.bundle_id)
              }
            }}
            style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--hal-border)' }}
          >
            {bundles.map((bundle) => (
              <option key={bundle.bundle_id} value={bundle.bundle_id}>
                {formatRole(bundle.role)} - Version {bundle.version} ({formatTimestamp(bundle.created_at)})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Role Selector */}
      <div>
        <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600' }}>
          Preview for Role:
        </label>
        <select
          value={selectedRole}
          onChange={(e) => setSelectedRole(e.target.value)}
          style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--hal-border)' }}
        >
          <option value="PM">PM</option>
          <option value="Dev">Dev</option>
          <option value="QA">QA</option>
          <option value="Process Review">Process Review</option>
        </select>
        {previewLoading && (
          <p style={{ marginTop: '8px', fontSize: '12px', color: 'var(--hal-text-muted)' }}>Loading preview...</p>
        )}
      </div>

      {/* Budget Status */}
      {currentBudget && (
        <div style={{
          border: `2px solid ${exceeds ? 'var(--hal-status-error, #c62828)' : 'var(--hal-border)'}`,
          borderRadius: '8px',
          padding: '16px',
          background: exceeds ? 'var(--hal-status-error-bg, #ffebee)' : 'var(--hal-surface-alt)',
        }}>
          <h4 style={{ margin: '0 0 12px 0', fontSize: '16px', color: exceeds ? 'var(--hal-status-error, #c62828)' : 'inherit' }}>
            Budget Status: {exceeds ? 'Over Budget' : 'Within Budget'}
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Total Characters:</span>
              <span style={{ fontFamily: 'monospace', fontWeight: '600' }}>
                {currentBudget.characterCount.toLocaleString()} / {hardLimit.toLocaleString()}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Character Limit:</span>
              <span style={{ fontFamily: 'monospace' }}>{hardLimit.toLocaleString()}</span>
            </div>
            {exceeds && (
              <div style={{
                padding: '8px',
                background: 'var(--hal-surface)',
                borderRadius: '4px',
                color: 'var(--hal-status-error, #c62828)',
                fontWeight: '600',
              }}>
                ⚠️ Exceeds limit by {overage.toLocaleString()} characters
              </div>
            )}
          </div>
        </div>
      )}

      {/* Per-Section Breakdown */}
      {Object.keys(sectionMetrics).length > 0 && (
        <div style={{ border: '1px solid var(--hal-border)', borderRadius: '8px', padding: '16px' }}>
          <h4 style={{ margin: '0 0 12px 0', fontSize: '16px' }}>Per-Section Breakdown</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--hal-border)' }}>
                  <th style={{ textAlign: 'left', padding: '8px', fontWeight: '600' }}>Section</th>
                  <th style={{ textAlign: 'right', padding: '8px', fontWeight: '600' }}>Characters</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(sectionMetrics).map(([section, count]) => (
                  <tr key={section} style={{ borderBottom: '1px solid var(--hal-border)' }}>
                    <td style={{ padding: '8px' }}>{section}</td>
                    <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'monospace' }}>
                      {typeof count === 'number' ? count.toLocaleString() : String(count)}
                    </td>
                  </tr>
                ))}
                <tr style={{ borderTop: '2px solid var(--hal-border)', fontWeight: '600' }}>
                  <td style={{ padding: '8px' }}>Total</td>
                  <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'monospace' }}>
                    {Object.values(sectionMetrics).reduce((sum, count) => sum + (typeof count === 'number' ? count : 0), 0).toLocaleString()}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Bundle Content Preview */}
      {bundleJson && (
        <div style={{ border: '1px solid var(--hal-border)', borderRadius: '8px', padding: '16px', maxHeight: '400px', overflow: 'auto' }}>
          <h4 style={{ margin: '0 0 12px 0', fontSize: '16px' }}>Bundle Preview (for {selectedRole})</h4>
          <pre style={{
            padding: '12px',
            background: 'var(--hal-surface-alt)',
            borderRadius: '4px',
            fontSize: '12px',
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}>
            {JSON.stringify(bundleJson, null, 2)}
          </pre>
        </div>
      )}

      {/* Checksums */}
      {receipt && (
        <div style={{ border: '1px solid var(--hal-border)', borderRadius: '8px', padding: '16px' }}>
          <h4 style={{ margin: '0 0 12px 0', fontSize: '16px' }}>Checksums</h4>
          <div style={{ fontFamily: 'monospace', fontSize: '12px', background: 'var(--hal-surface-alt)', padding: '8px', borderRadius: '4px' }}>
            <div style={{ marginBottom: '4px' }}>
              <strong>Content Checksum (stable):</strong> {receipt.content_checksum}
            </div>
            <div>
              <strong>Bundle Checksum:</strong> {receipt.bundle_checksum}
            </div>
          </div>
        </div>
      )}

      {/* Receipt Panel */}
      {receipt && (
        <div style={{ border: '1px solid var(--hal-border)', borderRadius: '8px', padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h4 style={{ margin: 0, fontSize: '16px' }}>Receipt</h4>
            <button
              type="button"
              className="btn-standard"
              onClick={() => setShowReceipt(!showReceipt)}
              style={{ fontSize: '12px', padding: '4px 8px' }}
            >
              {showReceipt ? 'Hide' : 'Show'} Details
            </button>
          </div>
          {showReceipt && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '14px' }}>
              {/* Provenance */}
              <div>
                <strong>Provenance:</strong>
                <div style={{ marginTop: '4px', padding: '8px', background: 'var(--hal-surface-alt)', borderRadius: '4px' }}>
                  <div>Bundle ID: {receipt.bundle_id}</div>
                  <div>Ticket ID: {receipt.ticket_id}</div>
                  <div>Role: {formatRole(receipt.role)}</div>
                  <div>Created: {formatTimestamp(receipt.created_at)}</div>
                </div>
              </div>

              {/* References */}
              <div>
                <strong>References:</strong>
                <div style={{ marginTop: '4px', padding: '8px', background: 'var(--hal-surface-alt)', borderRadius: '4px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
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
            </div>
          )}
        </div>
      )}

      {/* Use This Bundle Button */}
      <div>
        <button
          type="button"
          className="btn-standard"
          onClick={handleUseBundle}
          disabled={exceeds || !selectedBundle}
          style={{
            width: '100%',
            padding: '12px',
            fontSize: '16px',
            fontWeight: '600',
            opacity: exceeds ? 0.5 : 1,
            cursor: exceeds ? 'not-allowed' : 'pointer',
          }}
          title={exceeds ? 'Bundle exceeds character budget. Cannot proceed.' : 'Use this bundle to run the selected agent'}
        >
          {exceeds ? 'Bundle Over Budget - Cannot Use' : 'Use This Bundle'}
        </button>
        {exceeds && (
          <p style={{ marginTop: '8px', fontSize: '12px', color: 'var(--hal-status-error, #c62828)' }}>
            This bundle exceeds the character limit for {selectedRole}. Please reduce the bundle size or select a different role.
          </p>
        )}
      </div>
    </div>
  )
}
