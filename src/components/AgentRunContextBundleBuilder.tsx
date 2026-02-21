import { useState } from 'react'

interface AgentRunContextBundleBuilderProps {
  runId: string
  ticketPk: string | null
  ticketId: string | null
  repoFullName: string | null
  supabaseUrl: string | null
  supabaseAnonKey: string | null
  onBundleCreated?: (bundleId: string) => void
}

interface BuildResponse {
  success: boolean
  bundle?: {
    bundle_id: string
    version: number
    role: string
    created_at: string
    bundle_json: unknown
  }
  receipt?: {
    receipt_id: string
    content_checksum: string
    bundle_checksum: string
    section_metrics: Record<string, number>
    total_characters: number
  }
  error?: string
}

export function AgentRunContextBundleBuilder({
  runId,
  ticketPk,
  ticketId: _ticketId, // Not used - API fetches ticket from ticketPk
  repoFullName,
  supabaseUrl,
  supabaseAnonKey,
  onBundleCreated,
}: AgentRunContextBundleBuilderProps) {
  const apiBaseUrl = import.meta.env.VITE_HAL_API_BASE_URL || window.location.origin
  const [building, setBuilding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [bundle, setBundle] = useState<BuildResponse['bundle'] | null>(null)
  const [receipt, setReceipt] = useState<BuildResponse['receipt'] | null>(null)
  const [showPreview, setShowPreview] = useState(false)

  const handleBuild = async () => {
    if (!supabaseUrl || !supabaseAnonKey) {
      setError('Supabase connection required to build context bundles.')
      return
    }

    if (!ticketPk || !repoFullName) {
      setError('Ticket and repository information required to build context bundles.')
      return
    }

    setBuilding(true)
    setError(null)
    setBundle(null)
    setReceipt(null)
    setShowPreview(false)

    try {
      const response = await fetch(`${apiBaseUrl}/api/context-bundles/build-from-run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          runId,
          supabaseUrl,
          supabaseAnonKey,
        }),
      })

      const data = (await response.json()) as BuildResponse

      if (!response.ok || !data.success) {
        setError(data.error || 'Failed to build context bundle')
        return
      }

      setBundle(data.bundle || null)
      setReceipt(data.receipt || null)
      setShowPreview(true)

      if (data.bundle?.bundle_id && onBundleCreated) {
        onBundleCreated(data.bundle.bundle_id)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred while building bundle')
    } finally {
      setBuilding(false)
    }
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    return null
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '12px', border: '1px solid var(--hal-border)', borderRadius: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: '16px' }}>Context Bundle</h3>
        <button
          type="button"
          className="btn-standard"
          onClick={handleBuild}
          disabled={building || !ticketPk || !repoFullName}
          style={{ minWidth: '150px' }}
        >
          {building ? 'Building...' : 'Build Context Bundle'}
        </button>
      </div>

      {error && (
        <div style={{ padding: '12px', background: 'var(--hal-status-error-bg, #ffebee)', color: 'var(--hal-status-error, #c62828)', borderRadius: '4px', fontSize: '14px' }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {bundle && receipt && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>
                Bundle created successfully
              </div>
              <div style={{ fontSize: '12px', color: 'var(--hal-text-muted)' }}>
                Version {bundle.version} • {new Date(bundle.created_at).toLocaleString()}
              </div>
            </div>
            <button
              type="button"
              className="btn-standard"
              onClick={() => setShowPreview(!showPreview)}
              style={{ fontSize: '12px', padding: '4px 8px' }}
            >
              {showPreview ? 'Hide Preview' : 'Show Preview'}
            </button>
          </div>

          {/* Checksum Display */}
          <div style={{ padding: '12px', background: 'var(--hal-surface-alt)', borderRadius: '4px' }}>
            <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>Checksum (SHA-256)</div>
            <div style={{ fontFamily: 'monospace', fontSize: '12px', wordBreak: 'break-all' }}>
              {receipt.content_checksum}
            </div>
          </div>

          {/* JSON Preview */}
          {showPreview && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontSize: '14px', fontWeight: '600' }}>JSON Preview</div>
              <pre
                style={{
                  padding: '12px',
                  background: 'var(--hal-surface-alt)',
                  borderRadius: '4px',
                  fontSize: '12px',
                  overflow: 'auto',
                  maxHeight: '400px',
                  border: '1px solid var(--hal-border)',
                }}
              >
                {JSON.stringify(bundle.bundle_json, null, 2)}
              </pre>
            </div>
          )}

          {/* Section Metrics */}
          <div style={{ padding: '12px', background: 'var(--hal-surface-alt)', borderRadius: '4px' }}>
            <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>Character Breakdown</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }}>
              {Object.entries(receipt.section_metrics).map(([section, count]) => (
                <div key={section} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{section}:</span>
                  <span style={{ fontFamily: 'monospace' }}>{count.toLocaleString()} chars</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--hal-border)', fontWeight: '600' }}>
                <span>Total:</span>
                <span style={{ fontFamily: 'monospace' }}>{receipt.total_characters.toLocaleString()} chars</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
