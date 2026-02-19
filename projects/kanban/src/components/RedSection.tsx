/**
 * RED (Requirement Expansion Document) section component.
 * Displays RED versions and allows validation.
 */

import React, { useState, useEffect, useCallback } from 'react'

interface ValidationFailure {
  type: 'count' | 'presence' | 'placeholder' | 'vagueness'
  field: string
  message: string
  expected?: number | string
  found?: number | string
  item?: string
}

interface ValidationResult {
  pass: boolean
  failures: ValidationFailure[]
  validatedAt: string
}

interface RedVersion {
  red_id: string
  version: number
  content_checksum: string
  validation_status: 'valid' | 'invalid' | 'pending'
  created_at: string
  created_by: string | null
  artifact_id: string | null
}

interface RedDocument {
  red_id: string
  version: number
  red_json: unknown
  validation_status: 'valid' | 'invalid' | 'pending'
  created_at: string
  created_by: string | null
}

interface RedSectionProps {
  ticketPk: string
  ticketId: string
  repoFullName: string | null
  supabaseUrl: string
  supabaseKey: string
}

export function RedSection({ ticketPk, ticketId, repoFullName, supabaseUrl, supabaseKey }: RedSectionProps) {
  const [redVersions, setRedVersions] = useState<RedVersion[]>([])
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null)
  const [redDocument, setRedDocument] = useState<RedDocument | null>(null)
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [validating, setValidating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch RED versions list
  const fetchRedVersions = useCallback(async () => {
    if (!repoFullName) return

    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/red/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ticketPk,
          ticketId,
          repoFullName,
          supabaseUrl,
          supabaseAnonKey: supabaseKey,
        }),
      })

      const result = await response.json()

      if (!result.success) {
        setError(result.error || 'Failed to fetch RED versions')
        return
      }

      setRedVersions(result.red_versions || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch RED versions')
    } finally {
      setLoading(false)
    }
  }, [ticketPk, ticketId, repoFullName, supabaseUrl, supabaseKey])

  // Fetch specific RED version
  const fetchRedVersion = useCallback(
    async (version: number) => {
      if (!repoFullName) return

      setLoading(true)
      setError(null)

      try {
        const response = await fetch('/api/red/get', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            ticketPk,
            ticketId,
            repoFullName,
            version,
            supabaseUrl,
            supabaseAnonKey: supabaseKey,
          }),
        })

        const result = await response.json()

        if (!result.success) {
          setError(result.error || 'Failed to fetch RED version')
          return
        }

        setRedDocument(result.red_document)
        setSelectedVersion(version)

        // If validation_status is not pending, we can show the last validation
        // (Note: we don't have the validation result stored, so we'll need to re-validate or store it)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch RED version')
      } finally {
        setLoading(false)
      }
    },
    [ticketPk, ticketId, repoFullName, supabaseUrl, supabaseKey]
  )

  // Validate RED
  const validateRed = useCallback(async () => {
    if (!redDocument || !repoFullName) return

    setValidating(true)
    setError(null)

    try {
      const response = await fetch('/api/red/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          redId: redDocument.red_id,
          supabaseUrl,
          supabaseAnonKey: supabaseKey,
        }),
      })

      const result = await response.json()

      if (!result.success) {
        setError(result.error || 'Validation failed')
        return
      }

      setValidationResult(result.validation)
      
      // Refresh RED versions to get updated validation_status
      await fetchRedVersions()
      
      // Refresh the current RED document
      if (selectedVersion !== null) {
        await fetchRedVersion(selectedVersion)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Validation failed')
    } finally {
      setValidating(false)
    }
  }, [redDocument, repoFullName, supabaseUrl, supabaseKey, fetchRedVersions, fetchRedVersion, selectedVersion])

  // Load RED versions on mount
  useEffect(() => {
    if (repoFullName) {
      fetchRedVersions()
    }
  }, [repoFullName, fetchRedVersions])

  // Auto-select v0 if available
  useEffect(() => {
    if (redVersions.length > 0 && selectedVersion === null) {
      const v0 = redVersions.find((v) => v.version === 0)
      if (v0) {
        fetchRedVersion(0)
      }
    }
  }, [redVersions, selectedVersion, fetchRedVersion])

  if (!repoFullName) {
    return null
  }

  const selectedRedVersion = redVersions.find((v: RedVersion) => v.version === selectedVersion)

  return (
    <div className="red-section" style={{ marginTop: '2rem', padding: '1rem', border: '1px solid #ddd', borderRadius: '4px' }}>
      <h3 style={{ marginTop: 0 }}>RED (Requirement Expansion Document)</h3>

      {loading && !redDocument && <p>Loading RED versions...</p>}
      {error && (
        <div style={{ color: 'red', marginBottom: '1rem' }} role="alert">
          {error}
        </div>
      )}

      {redVersions.length > 0 && (
        <div style={{ marginBottom: '1rem' }}>
          <label>
            Version:{' '}
            <select
              value={selectedVersion ?? ''}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                const version = parseInt(e.target.value, 10)
                if (!isNaN(version)) {
                  fetchRedVersion(version)
                }
              }}
              disabled={loading}
            >
              <option value="">Select version...</option>
              {redVersions.map((v: RedVersion) => (
                <option key={v.red_id} value={v.version}>
                  v{v.version} ({v.validation_status}) {v.created_at ? new Date(v.created_at).toLocaleDateString() : ''}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {redDocument && selectedVersion === 0 && (
        <div>
          <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button
              type="button"
              onClick={validateRed}
              disabled={validating}
              className="primary btn-standard"
              style={{ minWidth: '120px' }}
            >
              {validating ? 'Validating...' : 'Validate'}
            </button>
            {validationResult && (
              <span style={{ fontSize: '0.9em', color: '#666' }}>
                Last validated: {new Date(validationResult.validatedAt).toLocaleString()}
              </span>
            )}
          </div>

          {validationResult && (
            <div
              style={{
                marginTop: '1rem',
                padding: '1rem',
                backgroundColor: validationResult.pass ? '#e8f5e9' : '#ffebee',
                border: `2px solid ${validationResult.pass ? '#4caf50' : '#f44336'}`,
                borderRadius: '4px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                <strong style={{ fontSize: '1.2em' }}>Status: {validationResult.pass ? 'PASS' : 'FAIL'}</strong>
                <span style={{ fontSize: '0.9em', color: '#666' }}>
                  Validated: {new Date(validationResult.validatedAt).toLocaleString()}
                </span>
              </div>

              {!validationResult.pass && validationResult.failures.length > 0 && (
                <div>
                  <strong>Validation Failures:</strong>
                  <ol style={{ marginTop: '0.5rem', paddingLeft: '1.5rem' }}>
                    {validationResult.failures.map((failure, index) => (
                      <li key={index} style={{ marginBottom: '0.5rem' }}>
                        <strong>{failure.field}:</strong> {failure.message}
                        {failure.expected !== undefined && failure.found !== undefined && (
                          <span style={{ color: '#666', marginLeft: '0.5rem' }}>
                            (expected: {failure.expected}, found: {failure.found})
                          </span>
                        )}
                        {failure.item && (
                          <div style={{ marginLeft: '1rem', fontSize: '0.9em', color: '#666', fontStyle: 'italic' }}>
                            Item: "{failure.item}"
                          </div>
                        )}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          )}

          {selectedRedVersion && selectedRedVersion.validation_status !== 'pending' && !validationResult && (
            <div style={{ marginTop: '1rem', padding: '0.5rem', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
              <strong>Status:</strong> {selectedRedVersion.validation_status.toUpperCase()}
              {selectedRedVersion.created_at && (
                <span style={{ marginLeft: '1rem', fontSize: '0.9em', color: '#666' }}>
                  Created: {new Date(selectedRedVersion.created_at).toLocaleString()}
                </span>
              )}
            </div>
          )}

          <div style={{ marginTop: '1rem' }}>
            <details>
              <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>RED JSON (click to expand)</summary>
              <pre
                style={{
                  marginTop: '0.5rem',
                  padding: '1rem',
                  backgroundColor: '#f5f5f5',
                  borderRadius: '4px',
                  overflow: 'auto',
                  maxHeight: '400px',
                }}
              >
                {JSON.stringify(redDocument.red_json, null, 2)}
              </pre>
            </details>
          </div>
        </div>
      )}

      {redVersions.length === 0 && !loading && (
        <p style={{ color: '#666' }}>No RED versions found for this ticket.</p>
      )}
    </div>
  )
}
