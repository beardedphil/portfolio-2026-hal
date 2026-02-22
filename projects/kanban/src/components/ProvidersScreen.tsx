import { useState, useEffect, useCallback } from 'react'

interface Provider {
  id: string
  project_id: string
  provider_type: string
  provider_name: string
  connected_at: string
  disconnected_at: string | null
  status: 'connected' | 'disconnected'
  credentials: unknown
  metadata: unknown
  created_at: string
  updated_at: string
}

interface ProvidersScreenProps {
  projectId: string
  supabaseUrl: string
  supabaseAnonKey: string
  apiBaseUrl: string
  onClose?: () => void
}

export function ProvidersScreen({
  projectId,
  supabaseUrl,
  supabaseAnonKey,
  apiBaseUrl,
  onClose,
}: ProvidersScreenProps) {
  const [providers, setProviders] = useState<Provider[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null)
  const [confirmDisconnectId, setConfirmDisconnectId] = useState<string | null>(null)

  const loadProviders = useCallback(async () => {
    try {
      setError(null)
      const response = await fetch(`${apiBaseUrl}/api/providers/list`, {
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
        setError(result.error || 'Failed to load providers')
        return
      }

      setProviders(result.providers || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load providers')
    }
  }, [projectId, supabaseUrl, supabaseAnonKey, apiBaseUrl])

  useEffect(() => {
    loadProviders()
  }, [loadProviders])

  const handleDisconnectClick = useCallback((providerId: string) => {
    setConfirmDisconnectId(providerId)
  }, [])

  const handleDisconnectCancel = useCallback(() => {
    setConfirmDisconnectId(null)
  }, [])

  const handleDisconnectConfirm = useCallback(
    async (providerId: string) => {
      setDisconnectingId(providerId)
      setError(null)

      try {
        const response = await fetch(`${apiBaseUrl}/api/providers/disconnect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId,
            providerId,
            supabaseUrl,
            supabaseAnonKey,
          }),
        })

        const result = await response.json()

        if (!result.success) {
          setError(result.error || 'Failed to disconnect provider')
          setDisconnectingId(null)
          return
        }

        // Reload providers to show updated status
        await loadProviders()
        setConfirmDisconnectId(null)
        setDisconnectingId(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to disconnect provider')
        setDisconnectingId(null)
      }
    },
    [projectId, supabaseUrl, supabaseAnonKey, apiBaseUrl, loadProviders]
  )

  const connectedProviders = providers.filter((p) => p.status === 'connected')
  const disconnectedProviders = providers.filter((p) => p.status === 'disconnected')

  return (
    <div className="modal-backdrop" role="dialog" aria-label="Integrations and Providers">
      <div className="modal" style={{ maxWidth: '800px' }}>
        <div className="modal-header">
          <h2 className="modal-title">Integrations / Providers</h2>
          {onClose && (
            <button type="button" className="modal-close btn-destructive" onClick={onClose}>
              Close
            </button>
          )}
        </div>

        <p className="modal-subtitle">Manage connected providers and integrations for this project.</p>

        {error && (
          <div className="wizard-error" role="alert" style={{ marginBottom: '1rem' }}>
            {error}
          </div>
        )}

        {loading && !providers.length && <div style={{ padding: '1rem' }}>Loading providers...</div>}

        {connectedProviders.length > 0 && (
          <div style={{ marginBottom: '2rem' }}>
            <h3 style={{ marginBottom: '1rem' }}>Connected Providers</h3>
            {connectedProviders.map((provider) => (
              <div
                key={provider.id}
                style={{
                  padding: '1rem',
                  marginBottom: '0.75rem',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  background: '#fff',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <strong>{provider.provider_name}</strong>
                      <span
                        style={{
                          padding: '0.25rem 0.5rem',
                          background: '#4caf50',
                          color: 'white',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                        }}
                      >
                        Connected
                      </span>
                    </div>
                    <div style={{ color: '#666', fontSize: '0.9rem' }}>
                      Type: {provider.provider_type} | Connected: {new Date(provider.connected_at).toLocaleString()}
                    </div>
                  </div>
                  {confirmDisconnectId === provider.id ? (
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <span style={{ marginRight: '0.5rem', fontSize: '0.9rem' }}>Confirm disconnect?</span>
                      <button
                        type="button"
                        className="btn-standard"
                        onClick={handleDisconnectCancel}
                        disabled={disconnectingId === provider.id}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="btn-destructive"
                        onClick={() => handleDisconnectConfirm(provider.id)}
                        disabled={disconnectingId === provider.id}
                      >
                        {disconnectingId === provider.id ? 'Disconnecting...' : 'Yes, disconnect'}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="btn-destructive"
                      onClick={() => handleDisconnectClick(provider.id)}
                      disabled={disconnectingId === provider.id || confirmDisconnectId !== null}
                    >
                      Disconnect
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {disconnectedProviders.length > 0 && (
          <div>
            <h3 style={{ marginBottom: '1rem' }}>Disconnected Providers</h3>
            {disconnectedProviders.map((provider) => (
              <div
                key={provider.id}
                style={{
                  padding: '1rem',
                  marginBottom: '0.75rem',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  background: '#f5f5f5',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <strong>{provider.provider_name}</strong>
                  <span
                    style={{
                      padding: '0.25rem 0.5rem',
                      background: '#9e9e9e',
                      color: 'white',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                    }}
                  >
                    Disconnected
                  </span>
                </div>
                <div style={{ color: '#666', fontSize: '0.9rem', marginTop: '0.5rem' }}>
                  Disconnected: {provider.disconnected_at ? new Date(provider.disconnected_at).toLocaleString() : 'Unknown'}
                </div>
              </div>
            ))}
          </div>
        )}

        {providers.length === 0 && !loading && (
          <div style={{ padding: '1rem', textAlign: 'center', color: '#666' }}>No providers connected yet.</div>
        )}
      </div>
    </div>
  )
}
