/**
 * RED (Requirement Expansion Document) section component.
 * Displays RED versions and allows validation.
 */

import React, { useState, useCallback, useEffect } from 'react'

export interface REDVersion {
  red_id: string
  version: number
  content_checksum: string
  validation_status: 'valid' | 'invalid' | 'pending'
  created_at: string
  created_by: string | null
  artifact_id: string | null
  validation_result?: {
    pass: boolean
    failures: Array<{
      type: 'count' | 'presence' | 'placeholder' | 'vagueness'
      field: string
      message: string
      expected?: number | string
      found?: number | string
      item?: string
    }>
    validatedAt: string
  } | null
  validated_at?: string | null
}

interface REDSectionProps {
  ticketPk: string
  ticketId: string
  repoFullName: string | null
  supabaseUrl: string
  supabaseKey: string
  onRefresh?: () => void
}

export function REDSection({
  ticketPk,
  ticketId,
  repoFullName,
  supabaseUrl,
  supabaseKey,
  onRefresh,
}: REDSectionProps) {
  const [redVersions, setRedVersions] = useState<REDVersion[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null)
  const [redJson, setRedJson] = useState<unknown>(null)
  const [validating, setValidating] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)

  // Fetch RED versions
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
        setRedVersions([])
        return
      }
      
      setRedVersions(result.red_versions || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setRedVersions([])
    } finally {
      setLoading(false)
    }
  }, [ticketPk, ticketId, repoFullName, supabaseUrl, supabaseKey])

  // Fetch specific RED version JSON
  const fetchRedVersion = useCallback(async (version: number) => {
    if (!repoFullName) return
    
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
      
      setRedJson(result.red_document?.red_json || null)
      
      // Update validation result in the versions list if available
      if (result.red_document?.validation_result) {
        setRedVersions(prev => prev.map(v => 
          v.version === version 
            ? { ...v, validation_result: result.red_document.validation_result, validated_at: result.red_document.validated_at }
            : v
        ))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [ticketPk, ticketId, repoFullName, supabaseUrl, supabaseKey])

  // Validate RED version
  const validateRed = useCallback(async (version: number) => {
    if (!repoFullName) return
    
    setValidating(true)
    setValidationError(null)
    
    try {
      const response = await fetch('/api/red/validate', {
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
        setValidationError(result.error || 'Validation failed')
        return
      }
      
      // Refresh RED versions to get updated validation status
      await fetchRedVersions()
      
      // If a version is selected, refresh its data
      if (selectedVersion === version) {
        await fetchRedVersion(version)
      }
      
      if (onRefresh) {
        onRefresh()
      }
    } catch (err) {
      setValidationError(err instanceof Error ? err.message : String(err))
    } finally {
      setValidating(false)
    }
  }, [ticketPk, ticketId, repoFullName, supabaseUrl, supabaseKey, selectedVersion, fetchRedVersions, fetchRedVersion, onRefresh])

  // Load RED versions on mount
  useEffect(() => {
    fetchRedVersions()
  }, [fetchRedVersions])

  // Load RED version when selected
  useEffect(() => {
    if (selectedVersion !== null) {
      fetchRedVersion(selectedVersion)
    }
  }, [selectedVersion, fetchRedVersion])

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short',
      })
    } catch {
      return dateString
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'valid':
        return '#4caf50'
      case 'invalid':
        return '#f44336'
      default:
        return '#ff9800'
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'valid':
        return 'PASS'
      case 'invalid':
        return 'FAIL'
      default:
        return 'PENDING'
    }
  }

  if (loading && redVersions.length === 0) {
    return (
      <div className="red-section">
        <h3>RED Versions</h3>
        <p>Loading…</p>
      </div>
    )
  }

  if (error && redVersions.length === 0) {
    return (
      <div className="red-section">
        <h3>RED Versions</h3>
        <p className="error" style={{ color: '#f44336' }}>{error}</p>
        <button type="button" onClick={fetchRedVersions}>Retry</button>
      </div>
    )
  }

  if (redVersions.length === 0) {
    return (
      <div className="red-section">
        <h3>RED Versions</h3>
        <p>No RED versions found for this ticket.</p>
      </div>
    )
  }

  const selectedRedVersion = redVersions.find(v => v.version === selectedVersion)
  const selectedValidationResult = selectedRedVersion?.validation_result || null

  return (
    <div className="red-section" style={{ marginTop: '2rem', padding: '1rem', borderTop: '1px solid #e0e0e0' }}>
      <h3>RED Versions</h3>
      
      {error && (
        <div className="error" style={{ color: '#f44336', marginBottom: '1rem' }}>
          {error}
        </div>
      )}
      
      {validationError && (
        <div className="error" style={{ color: '#f44336', marginBottom: '1rem' }}>
          Validation error: {validationError}
        </div>
      )}
      
      <div style={{ marginBottom: '1rem' }}>
        <h4>Versions</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {redVersions.map((version) => (
            <div
              key={version.red_id}
              style={{
                padding: '0.75rem',
                border: '1px solid #e0e0e0',
                borderRadius: '4px',
                cursor: 'pointer',
                backgroundColor: selectedVersion === version.version ? '#f5f5f5' : 'white',
              }}
              onClick={() => setSelectedVersion(version.version)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong>Version {version.version}</strong>
                  <span
                    style={{
                      marginLeft: '0.5rem',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '4px',
                      backgroundColor: getStatusColor(version.validation_status),
                      color: 'white',
                      fontSize: '0.875rem',
                      fontWeight: 'bold',
                    }}
                  >
                    {getStatusLabel(version.validation_status)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    validateRed(version.version)
                  }}
                  disabled={validating}
                  style={{
                    padding: '0.5rem 1rem',
                    backgroundColor: '#2196f3',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: validating ? 'not-allowed' : 'pointer',
                  }}
                >
                  {validating ? 'Validating...' : 'Validate'}
                </button>
              </div>
              <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#666' }}>
                Created: {formatDate(version.created_at)}
                {version.validated_at && (
                  <> • Last validated: {formatDate(version.validated_at)}</>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      
      {selectedVersion !== null && selectedRedVersion && (
        <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#f9f9f9', borderRadius: '4px' }}>
          <h4>Version {selectedVersion} Details</h4>
          
          {selectedValidationResult && (
            <div style={{ marginBottom: '1rem' }}>
              <div
                style={{
                  padding: '0.75rem',
                  borderRadius: '4px',
                  backgroundColor: selectedValidationResult.pass ? '#e8f5e9' : '#ffebee',
                  border: `1px solid ${selectedValidationResult.pass ? '#4caf50' : '#f44336'}`,
                  marginBottom: '1rem',
                }}
              >
                <strong style={{ fontSize: '1.1rem', color: selectedValidationResult.pass ? '#2e7d32' : '#c62828' }}>
                  {selectedValidationResult.pass ? 'PASS' : 'FAIL'}
                </strong>
                {selectedValidationResult.validatedAt && (
                  <div style={{ fontSize: '0.875rem', color: '#666', marginTop: '0.25rem' }}>
                    Validated: {formatDate(selectedValidationResult.validatedAt)}
                  </div>
                )}
              </div>
              
              {!selectedValidationResult.pass && selectedValidationResult.failures.length > 0 && (
                <div>
                  <h5 style={{ marginBottom: '0.5rem' }}>Validation Failures:</h5>
                  <ul style={{ margin: 0, paddingLeft: '1.5rem' }}>
                    {selectedValidationResult.failures.map((failure, index) => (
                      <li key={index} style={{ marginBottom: '0.5rem' }}>
                        <strong>{failure.field}:</strong> {failure.message}
                        {failure.expected !== undefined && failure.found !== undefined && (
                          <span style={{ color: '#666' }}>
                            {' '}(expected: {failure.expected}, found: {failure.found})
                          </span>
                        )}
                        {failure.item && (
                          <div style={{ fontSize: '0.875rem', color: '#666', marginTop: '0.25rem', fontStyle: 'italic' }}>
                            Item: "{failure.item}"
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          
          {redJson && (
            <div>
              <h5>RED JSON:</h5>
              <pre
                style={{
                  padding: '1rem',
                  backgroundColor: 'white',
                  border: '1px solid #e0e0e0',
                  borderRadius: '4px',
                  overflow: 'auto',
                  maxHeight: '400px',
                  fontSize: '0.875rem',
                }}
              >
                {JSON.stringify(redJson, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
