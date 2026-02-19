/**
 * RED Viewer component for displaying RED documents and validation results.
 * Shows RED JSON in a readable format and provides a Validate button.
 */

import { useState, useCallback } from 'react'

export interface ValidationFailure {
  category: string
  message: string
  field?: string
  item?: string
  expected?: number | string
  found?: number | string
}

interface ValidationResult {
  success: boolean
  pass: boolean
  failures: ValidationFailure[]
  validatedAt: string
  error?: string
}

interface RedViewerProps {
  ticketPk: string
  ticketId: string
  repoFullName: string
  version: number
  redJson: unknown
  supabaseUrl: string
  supabaseAnonKey: string
  baseUrl: string
  initialValidationResult?: ValidationResult | null
}

export function RedViewer({
  ticketPk,
  ticketId,
  repoFullName,
  version,
  redJson,
  supabaseUrl,
  supabaseAnonKey,
  baseUrl,
  initialValidationResult,
}: RedViewerProps) {
  const [validating, setValidating] = useState(false)
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(initialValidationResult || null)
  const [validationError, setValidationError] = useState<string | null>(null)

  const handleValidate = useCallback(async () => {
    setValidating(true)
    setValidationError(null)
    setValidationResult(null)

    try {
      const response = await fetch(`${baseUrl}/api/red/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ticketPk,
          ticketId,
          repoFullName,
          version,
          redJson,
          supabaseUrl,
          supabaseAnonKey,
        }),
      })

      const result = (await response.json()) as ValidationResult

      if (!result.success) {
        setValidationError(result.error || 'Validation failed')
        return
      }

      setValidationResult(result)
    } catch (err) {
      setValidationError(err instanceof Error ? err.message : String(err))
    } finally {
      setValidating(false)
    }
  }, [ticketPk, ticketId, repoFullName, version, redJson, supabaseUrl, supabaseAnonKey, baseUrl])

  // Format RED JSON for display
  const formatRedJson = (json: unknown): string => {
    try {
      return JSON.stringify(json, null, 2)
    } catch {
      return String(json)
    }
  }

  return (
    <div className="red-viewer" style={{ marginTop: '1rem', padding: '1rem', border: '1px solid #ddd', borderRadius: '4px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ margin: 0 }}>RED Document (v{version})</h3>
        <button
          type="button"
          onClick={handleValidate}
          disabled={validating}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#1976d2',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: validating ? 'not-allowed' : 'pointer',
            opacity: validating ? 0.6 : 1,
          }}
        >
          {validating ? 'Validating...' : 'Validate'}
        </button>
      </div>

      {validationError && (
        <div
          style={{
            padding: '0.75rem',
            marginBottom: '1rem',
            backgroundColor: '#ffebee',
            border: '1px solid #f44336',
            borderRadius: '4px',
            color: '#c62828',
          }}
          role="alert"
        >
          <strong>Validation Error:</strong> {validationError}
        </div>
      )}

      {validationResult && (
        <div
          style={{
            padding: '1rem',
            marginBottom: '1rem',
            backgroundColor: validationResult.pass ? '#e8f5e9' : '#ffebee',
            border: `2px solid ${validationResult.pass ? '#4caf50' : '#f44336'}`,
            borderRadius: '4px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem' }}>
            <strong
              style={{
                fontSize: '1.2rem',
                color: validationResult.pass ? '#2e7d32' : '#c62828',
              }}
            >
              {validationResult.pass ? '✓ PASS' : '✗ FAIL'}
            </strong>
            {validationResult.validatedAt && (
              <span style={{ marginLeft: '1rem', fontSize: '0.9rem', color: '#666' }}>
                Last validated: {new Date(validationResult.validatedAt).toLocaleString('en-US', { timeZone: 'UTC' })} UTC
              </span>
            )}
          </div>

          {!validationResult.pass && validationResult.failures.length > 0 && (
            <div style={{ marginTop: '1rem' }}>
              <strong style={{ display: 'block', marginBottom: '0.5rem' }}>Validation Failures:</strong>
              <ul style={{ margin: 0, paddingLeft: '1.5rem' }}>
                {validationResult.failures.map((failure, index) => (
                  <li key={index} style={{ marginBottom: '0.5rem' }}>
                    <strong>{failure.category}:</strong> {failure.message}
                    {failure.expected !== undefined && failure.found !== undefined && (
                      <span style={{ color: '#666', marginLeft: '0.5rem' }}>
                        (expected: {failure.expected}, found: {failure.found})
                      </span>
                    )}
                    {failure.field && (
                      <span style={{ color: '#666', marginLeft: '0.5rem' }}>
                        [Field: {failure.field}]
                      </span>
                    )}
                    {failure.item && (
                      <div style={{ marginLeft: '1rem', fontStyle: 'italic', color: '#666' }}>
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

      <div style={{ marginTop: '1rem' }}>
        <details>
          <summary style={{ cursor: 'pointer', fontWeight: 'bold', marginBottom: '0.5rem' }}>
            RED JSON Content
          </summary>
          <pre
            style={{
              padding: '1rem',
              backgroundColor: '#f5f5f5',
              border: '1px solid #ddd',
              borderRadius: '4px',
              overflow: 'auto',
              maxHeight: '400px',
              fontSize: '0.9rem',
            }}
          >
            {formatRedJson(redJson)}
          </pre>
        </details>
      </div>
    </div>
  )
}
