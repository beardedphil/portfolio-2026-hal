import { useState, useEffect, useCallback } from 'react'

export interface RedValidationResult {
  pass: boolean
  failures: Array<{
    type: 'count' | 'presence' | 'placeholder' | 'vagueness'
    field: string
    message: string
    expected?: number | string
    found?: number | string
    itemIndex?: number
    itemValue?: string
  }>
  validatedAt: string
  redVersion?: string
}

interface RedValidationSectionProps {
  ticketPk: string
  ticketId: string
  supabaseUrl: string
  supabaseKey: string
  redDocument?: unknown // RED JSON document
  redVersion?: string
}

/** RED Validation Section: displays validation status and allows triggering validation */
export function RedValidationSection({
  ticketPk,
  ticketId,
  supabaseUrl,
  supabaseKey,
  redDocument,
  redVersion = 'v0',
}: RedValidationSectionProps) {
  const [validationResult, setValidationResult] = useState<RedValidationResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [validating, setValidating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch latest validation result on mount
  useEffect(() => {
    if (!ticketPk) return
    
    setLoading(true)
    setError(null)
    
    const baseUrl = window.location.origin
    fetch(`${baseUrl}/api/red/get-latest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        ticketPk,
        ticketId,
        redVersion,
        supabaseUrl,
        supabaseAnonKey: supabaseKey,
      }),
    })
      .then(res => res.json())
      .then(data => {
        if (data.success && data.validation) {
          setValidationResult(data.validation)
        } else {
          setValidationResult(null)
        }
      })
      .catch(err => {
        console.error('Failed to fetch validation result:', err)
        setError(err.message)
      })
      .finally(() => {
        setLoading(false)
      })
  }, [ticketPk, ticketId, redVersion, supabaseUrl, supabaseKey])

  const handleValidate = useCallback(async () => {
    if (!redDocument) {
      setError('RED document is required for validation')
      return
    }

    setValidating(true)
    setError(null)

    try {
      const baseUrl = window.location.origin
      const response = await fetch(`${baseUrl}/api/red/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ticketPk,
          ticketId,
          redDocument,
          redVersion,
          supabaseUrl,
          supabaseAnonKey: supabaseKey,
        }),
      })

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || 'Validation failed')
      }

      setValidationResult(data.validation)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      setError(`Validation failed: ${errorMessage}`)
      console.error('Validation error:', err)
    } finally {
      setValidating(false)
    }
  }, [ticketPk, ticketId, redDocument, redVersion, supabaseUrl, supabaseKey])

  if (loading) {
    return (
      <div className="red-validation-section">
        <h3 className="red-validation-title">RED Validation</h3>
        <p className="red-validation-loading">Loading validation status...</p>
      </div>
    )
  }

  return (
    <div className="red-validation-section">
      <h3 className="red-validation-title">RED Validation</h3>
      
      {error && (
        <div className="red-validation-error" role="alert">
          <p>{error}</p>
        </div>
      )}

      {validationResult && (
        <div className="red-validation-status">
          <div
            className={`red-validation-badge ${validationResult.pass ? 'red-validation-pass' : 'red-validation-fail'}`}
            role="status"
            aria-label={validationResult.pass ? 'Validation passed' : 'Validation failed'}
          >
            {validationResult.pass ? 'PASS' : 'FAIL'}
          </div>
          <div className="red-validation-meta">
            <span className="red-validation-timestamp">
              Last validated: {new Date(validationResult.validatedAt).toLocaleString()}
            </span>
            {validationResult.redVersion && (
              <span className="red-validation-version">Version: {validationResult.redVersion}</span>
            )}
          </div>
        </div>
      )}

      {validationResult && !validationResult.pass && validationResult.failures.length > 0 && (
        <div className="red-validation-failures">
          <h4 className="red-validation-failures-title">Validation Failures:</h4>
          <ol className="red-validation-failures-list">
            {validationResult.failures.map((failure, index) => (
              <li key={index} className="red-validation-failure-item">
                <div className="red-validation-failure-message">{failure.message}</div>
                {failure.itemIndex !== undefined && failure.itemValue && (
                  <div className="red-validation-failure-detail">
                    Item {failure.itemIndex + 1}: "{failure.itemValue}"
                  </div>
                )}
                {failure.expected !== undefined && failure.found !== undefined && (
                  <div className="red-validation-failure-detail">
                    Expected: {failure.expected}, Found: {failure.found}
                  </div>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="red-validation-actions">
        <button
          type="button"
          className="btn-standard red-validation-button"
          onClick={handleValidate}
          disabled={validating || !redDocument}
          aria-label="Validate RED document"
        >
          {validating ? 'Validating...' : 'Validate'}
        </button>
        {!redDocument && (
          <p className="red-validation-hint">
            RED document is required to run validation. Please attach or provide a RED JSON document.
          </p>
        )}
      </div>
    </div>
  )
}
