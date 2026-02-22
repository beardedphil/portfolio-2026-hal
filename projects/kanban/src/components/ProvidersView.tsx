import { useState, useEffect, useCallback } from 'react'

interface ProvidersViewProps {
  isOpen: boolean
  onClose: () => void
  projectId: string
  supabaseUrl: string
  supabaseAnonKey: string
  apiBaseUrl: string
}

interface ProviderStatus {
  name: string
  connected: boolean
  canRevoke: boolean
}

export function ProvidersView({
  isOpen,
  onClose,
  projectId,
  supabaseUrl,
  supabaseAnonKey,
  apiBaseUrl,
}: ProvidersViewProps) {
  const [providers, setProviders] = useState<ProviderStatus[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [disconnectingProvider, setDisconnectingProvider] = useState<string | null>(null)
  const [confirmDisconnect, setConfirmDisconnect] = useState<string | null>(null)
  const [revocationStatus, setRevocationStatus] = useState<Record<string, { succeeded: boolean; error?: string }>>({})

  const checkProviderStatus = useCallback(async () => {
    try {
      setError(null)
      const response = await fetch(`${apiBaseUrl}/api/auth/me`, {
        credentials: 'include',
      })

      if (!response.ok) {
        setProviders([])
        return
      }

      const auth = await response.json()
      const githubConnected = auth.authenticated === true

      setProviders([
        {
          name: 'github',
          connected: githubConnected,
          canRevoke: githubConnected, // GitHub OAuth supports revocation
        },
      ])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check provider status')
      setProviders([])
    }
  }, [apiBaseUrl])

  useEffect(() => {
    if (isOpen) {
      checkProviderStatus()
    }
  }, [isOpen, checkProviderStatus])

  const handleDisconnect = useCallback(
    async (providerName: string) => {
      if (confirmDisconnect !== providerName) {
        setConfirmDisconnect(providerName)
        return
      }

      setDisconnectingProvider(providerName)
      setError(null)

      try {
        const response = await fetch(`${apiBaseUrl}/api/providers/disconnect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            provider: providerName,
            projectId,
            supabaseUrl,
            supabaseAnonKey,
          }),
        })

        const result = await response.json()

        if (!result.success) {
          setError(result.error || 'Failed to disconnect provider')
          setDisconnectingProvider(null)
          setConfirmDisconnect(null)
          return
        }

        // Store revocation status
        if (result.revoked !== undefined) {
          setRevocationStatus((prev) => ({
            ...prev,
            [providerName]: {
              succeeded: result.revoked === true,
              error: result.revocationError || undefined,
            },
          }))
        }

        // Refresh provider status
        await checkProviderStatus()
        setConfirmDisconnect(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to disconnect provider')
      } finally {
        setDisconnectingProvider(null)
      }
    },
    [apiBaseUrl, projectId, supabaseUrl, supabaseAnonKey, confirmDisconnect, checkProviderStatus]
  )

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Integrations / Providers</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-body">
          {error && (
            <div className="error-message" style={{ marginBottom: '1rem' }}>
              <strong>Error:</strong> {error}
            </div>
          )}

          <div className="providers-list">
            {providers.length === 0 ? (
              <p>No providers configured.</p>
            ) : (
              providers.map((provider) => (
                <div key={provider.name} className="provider-item" style={{ marginBottom: '1rem', padding: '1rem', border: '1px solid #ccc', borderRadius: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h3 style={{ margin: '0 0 0.5rem 0', textTransform: 'capitalize' }}>{provider.name}</h3>
                      <p style={{ margin: 0, color: provider.connected ? 'green' : 'gray' }}>
                        {provider.connected ? 'Connected' : 'Disconnected'}
                      </p>
                      {revocationStatus[provider.name] && (
                        <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.9em', color: revocationStatus[provider.name].succeeded ? 'green' : 'orange' }}>
                          Revocation: {revocationStatus[provider.name].succeeded ? 'Succeeded' : `Failed${revocationStatus[provider.name].error ? `: ${revocationStatus[provider.name].error}` : ''}`}
                        </p>
                      )}
                    </div>
                    {provider.connected && (
                      <div>
                        {confirmDisconnect === provider.name ? (
                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <button
                              type="button"
                              className="btn-destructive"
                              onClick={() => handleDisconnect(provider.name)}
                              disabled={disconnectingProvider === provider.name}
                            >
                              {disconnectingProvider === provider.name ? 'Disconnecting...' : 'Confirm Disconnect'}
                            </button>
                            <button
                              type="button"
                              className="btn-standard"
                              onClick={() => setConfirmDisconnect(null)}
                              disabled={disconnectingProvider === provider.name}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="btn-destructive"
                            onClick={() => setConfirmDisconnect(provider.name)}
                            disabled={disconnectingProvider === provider.name}
                          >
                            Disconnect
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="modal-actions" style={{ marginTop: '1.5rem' }}>
            <button type="button" className="btn-standard" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
