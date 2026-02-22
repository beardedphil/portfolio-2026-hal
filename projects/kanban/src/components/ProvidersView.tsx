import { useState, useEffect, useCallback } from 'react'

interface ProviderConnection {
  id: string
  project_id: string
  provider_name: string
  provider_type: string
  connected_at: string
  disconnected_at: string | null
  revocation_supported: boolean
  revocation_status: string | null
  revocation_error: string | null
  created_at: string
  updated_at: string
}

interface ProvidersViewProps {
  projectId: string
  supabaseUrl: string
  supabaseAnonKey: string
  apiBaseUrl: string
  onClose?: () => void
}

export function ProvidersView({
  projectId,
  supabaseUrl,
  supabaseAnonKey,
  apiBaseUrl,
  onClose,
}: ProvidersViewProps) {
  const [connections, setConnections] = useState<ProviderConnection[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null)
  const [confirmDisconnectId, setConfirmDisconnectId] = useState<string | null>(null)

  const loadConnections = useCallback(async () => {
    try {
      setError(null)
      setLoading(true)
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
        setLoading(false)
        return
      }

      setConnections(result.connections || [])
      setLoading(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load providers')
      setLoading(false)
    }
  }, [projectId, supabaseUrl, supabaseAnonKey, apiBaseUrl])

  useEffect(() => {
    loadConnections()
  }, [loadConnections])

  const handleDisconnect = useCallback(
    async (connectionId: string) => {
      if (confirmDisconnectId !== connectionId) {
        // Show confirmation
        setConfirmDisconnectId(connectionId)
        return
      }

      setDisconnectingId(connectionId)
      setError(null)

      try {
        const response = await fetch(`${apiBaseUrl}/api/providers/disconnect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId,
            providerConnectionId: connectionId,
            supabaseUrl,
            supabaseAnonKey,
          }),
        })

        const result = await response.json()

        if (!result.success) {
          setError(result.error || 'Failed to disconnect provider')
          setDisconnectingId(null)
          setConfirmDisconnectId(null)
          return
        }

        // Reload connections to show updated state
        await loadConnections()
        setDisconnectingId(null)
        setConfirmDisconnectId(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to disconnect provider')
        setDisconnectingId(null)
        setConfirmDisconnectId(null)
      }
    },
    [projectId, supabaseUrl, supabaseAnonKey, apiBaseUrl, loadConnections, confirmDisconnectId]
  )

  const cancelDisconnect = useCallback(() => {
    setConfirmDisconnectId(null)
  }, [])

  const activeConnections = connections.filter((c) => !c.disconnected_at)
  const disconnectedConnections = connections.filter((c) => c.disconnected_at)

  const formatProviderName = (name: string): string => {
    return name
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  const getRevocationStatusDisplay = (connection: ProviderConnection): string | null => {
    if (!connection.revocation_supported) return null
    if (connection.revocation_status === 'succeeded') return 'Revoked'
    if (connection.revocation_status === 'failed') return `Revocation failed: ${connection.revocation_error || 'Unknown error'}`
    return null
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-label="Providers view">
      <div className="modal" style={{ maxWidth: '800px' }}>
        <div className="modal-header">
          <h2 className="modal-title">Integrations / Providers</h2>
          {onClose && (
            <button type="button" className="modal-close btn-destructive" onClick={onClose}>
              Close
            </button>
          )}
        </div>

        <p className="modal-subtitle">Manage connected providers for this project</p>

        {error && (
          <div className="wizard-error" role="alert" style={{ marginBottom: '1rem' }}>
            {error}
          </div>
        )}

        {loading && !connections.length && (
          <div style={{ padding: '2rem', textAlign: 'center' }}>Loading providers...</div>
        )}

        {!loading && activeConnections.length === 0 && disconnectedConnections.length === 0 && (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>
            No providers connected to this project.
          </div>
        )}

        {activeConnections.length > 0 && (
          <div style={{ marginBottom: '2rem' }}>
            <h3 style={{ marginBottom: '1rem' }}>Connected Providers</h3>
            {activeConnections.map((connection) => (
              <div
                key={connection.id}
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
                      <strong>{formatProviderName(connection.provider_name)}</strong>
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
                    <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '0.5rem' }}>
                      Type: {connection.provider_type} | Connected: {new Date(connection.connected_at).toLocaleString()}
                    </div>
                    {connection.revocation_supported && (
                      <div style={{ fontSize: '0.85rem', color: '#666', fontStyle: 'italic' }}>
                        Revocation supported
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {confirmDisconnectId === connection.id ? (
                      <>
                        <button
                          type="button"
                          className="btn-destructive btn-standard"
                          onClick={() => handleDisconnect(connection.id)}
                          disabled={disconnectingId === connection.id}
                        >
                          {disconnectingId === connection.id ? 'Disconnecting...' : 'Confirm Disconnect'}
                        </button>
                        <button
                          type="button"
                          className="btn-standard"
                          onClick={cancelDisconnect}
                          disabled={disconnectingId === connection.id}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="btn-destructive btn-standard"
                        onClick={() => handleDisconnect(connection.id)}
                        disabled={disconnectingId === connection.id}
                      >
                        Disconnect
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {disconnectedConnections.length > 0 && (
          <div>
            <h3 style={{ marginBottom: '1rem' }}>Disconnected Providers</h3>
            {disconnectedConnections.map((connection) => {
              const revocationStatus = getRevocationStatusDisplay(connection)
              return (
                <div
                  key={connection.id}
                  style={{
                    padding: '1rem',
                    marginBottom: '0.75rem',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    background: '#f5f5f5',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <strong>{formatProviderName(connection.provider_name)}</strong>
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
                      <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '0.5rem' }}>
                        Disconnected: {connection.disconnected_at ? new Date(connection.disconnected_at).toLocaleString() : 'Unknown'}
                      </div>
                      {revocationStatus && (
                        <div
                          style={{
                            fontSize: '0.85rem',
                            color: connection.revocation_status === 'succeeded' ? '#4caf50' : '#f44336',
                            fontWeight: 'bold',
                          }}
                        >
                          {revocationStatus}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
