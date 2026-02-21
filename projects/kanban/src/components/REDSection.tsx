import { useState, useEffect, useCallback } from 'react'

interface REDDocument {
  red_id: string
  version: number
  red_json: unknown
  validation_status: 'valid' | 'invalid' | 'pending'
  effective_validation_status?: 'valid' | 'invalid' | 'pending'
  created_at: string
  created_by: string | null
  artifact_id: string | null
}

interface REDVersion {
  red_id: string
  version: number
  content_checksum: string
  validation_status: 'valid' | 'invalid' | 'pending'
  effective_validation_status?: 'valid' | 'invalid' | 'pending'
  created_at: string
  created_by: string | null
  artifact_id: string | null
}

export function REDSection({
  ticketId,
  ticketPk,
  supabaseUrl,
  supabaseAnonKey,
  repoFullName,
  onRefreshArtifacts,
}: {
  ticketId: string
  ticketPk: string
  supabaseUrl?: string
  supabaseAnonKey?: string
  repoFullName?: string | null
  onRefreshArtifacts?: () => void
}) {
  const [latestRED, setLatestRED] = useState<REDDocument | null>(null)
  const [redVersions, setRedVersions] = useState<REDVersion[]>([])
  const [latestEffectiveStatus, setLatestEffectiveStatus] = useState<'valid' | 'invalid' | 'pending' | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editingJson, setEditingJson] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null)

  // Fetch latest RED and version history
  const fetchRED = useCallback(async () => {
    if (!supabaseUrl || !supabaseAnonKey) {
      setError('Supabase not configured')
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Fetch latest valid RED
      const latestResponse = await fetch('/api/red/get', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ticketPk,
          ticketId,
          repoFullName: repoFullName || undefined,
          version: 'latest-valid',
          supabaseUrl,
          supabaseAnonKey,
        }),
      })

      const latestData = await latestResponse.json()
      if (latestData.success && latestData.red_document) {
        setLatestRED(latestData.red_document)
        setLatestEffectiveStatus(latestData.red_document.effective_validation_status ?? null)
      } else {
        // No RED found is not an error - just means no RED exists yet
        setLatestRED(null)
        setLatestEffectiveStatus(null)
      }

      // Fetch version history
      const listResponse = await fetch('/api/red/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ticketPk,
          ticketId,
          repoFullName: repoFullName || undefined,
          supabaseUrl,
          supabaseAnonKey,
        }),
      })

      const listData = await listResponse.json()
      if (listData.success && Array.isArray(listData.red_versions)) {
        const versions = listData.red_versions as REDVersion[]
        setRedVersions(versions)
        const newest = versions[0]
        if (newest?.effective_validation_status) {
          setLatestEffectiveStatus(newest.effective_validation_status)
        }

        // Fallback: If no latest-valid RED exists but versions exist, load the latest version
        // so the section doesn't incorrectly show "No RED exists yet".
        if (!latestData.success && newest?.version != null) {
          const latestAnyResponse = await fetch('/api/red/get', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              ticketPk,
              ticketId,
              repoFullName: repoFullName || undefined,
              version: newest.version,
              supabaseUrl,
              supabaseAnonKey,
            }),
          })
          const latestAnyData = await latestAnyResponse.json()
          if (latestAnyData.success && latestAnyData.red_document) {
            setLatestRED(latestAnyData.red_document)
          }
        }
      } else {
        setRedVersions([])
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      setError(`Failed to load RED: ${errorMessage}`)
      console.error('Failed to fetch RED:', err)
    } finally {
      setLoading(false)
    }
  }, [ticketPk, ticketId, repoFullName, supabaseUrl, supabaseAnonKey])

  useEffect(() => {
    fetchRED()
  }, [fetchRED])

  const handleStartEdit = () => {
    if (latestRED) {
      setEditingJson(JSON.stringify(latestRED.red_json, null, 2))
    } else {
      // Start with empty RED structure
      setEditingJson(JSON.stringify({}, null, 2))
    }
    setIsEditing(true)
    setSaveError(null)
    setSaveSuccess(null)
  }

  const handleCancelEdit = () => {
    setIsEditing(false)
    setEditingJson('')
    setSaveError(null)
    setSaveSuccess(null)
  }

  const handleSave = async () => {
    if (!supabaseUrl || !supabaseAnonKey) {
      setSaveError('Supabase not configured')
      return
    }

    // Parse JSON to validate
    let redJson: unknown
    try {
      redJson = JSON.parse(editingJson)
    } catch (err) {
      setSaveError(`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`)
      return
    }

    setSaving(true)
    setSaveError(null)
    setSaveSuccess(null)

    try {
      // First, save the RED document
      // Note: insert endpoint uses server-side service role credentials, so we don't pass supabaseAnonKey
      const insertResponse = await fetch('/api/red/insert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ticketPk,
          ticketId,
          repoFullName: repoFullName || undefined,
          redJson,
          validationStatus: 'pending', // Default to pending, can be validated later
          supabaseUrl,
          // Note: supabaseAnonKey not needed - endpoint uses server-side service role key
        }),
      })

      const insertData = await insertResponse.json()
      if (!insertData.success || !insertData.red_document) {
        throw new Error(insertData.error || 'Failed to save RED document')
      }

      const savedRED = insertData.red_document

      // If RED save succeeded, create the mirrored artifact
      // Format: readable markdown with embedded JSON code block
      const artifactTitle = `RED v${savedRED.version} — ${new Date(savedRED.created_at).toISOString().split('T')[0]}`
      const artifactBody = `# RED Document Version ${savedRED.version}

Created: ${new Date(savedRED.created_at).toISOString()}
Validation Status: ${savedRED.validation_status}

## Canonical RED JSON

\`\`\`json
${JSON.stringify(redJson, null, 2)}
\`\`\`
`

      // Create artifact via HAL API
      const artifactResponse = await fetch('/api/artifacts/insert-implementation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ticketId,
          artifactType: 'red',
          title: artifactTitle,
          body_md: artifactBody,
          supabaseUrl,
          supabaseAnonKey,
        }),
      })

      const artifactData = await artifactResponse.json()
      if (!artifactData.success) {
        // Log warning but don't fail - RED was saved successfully
        console.warn('Failed to create mirrored artifact:', artifactData.error)
      }

      // Refresh RED data and artifacts
      await fetchRED()
      if (onRefreshArtifacts) {
        onRefreshArtifacts()
      }

      setIsEditing(false)
      setEditingJson('')
      setSaveSuccess(`RED v${savedRED.version} saved successfully`)
      
      // Clear success message after 3 seconds
      setTimeout(() => setSaveSuccess(null), 3000)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      setSaveError(`Failed to save RED: ${errorMessage}`)
      console.error('Failed to save RED:', err)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="red-section">
        <h3 className="red-section-title">RED</h3>
        <p className="red-loading">Loading RED document…</p>
      </div>
    )
  }

  return (
    <div className="red-section">
      <h3 className="red-section-title">RED</h3>
      
      {error && (
        <div className="red-error" role="alert">
          <p>{error}</p>
        </div>
      )}

      {saveError && (
        <div className="red-error" role="alert">
          <p>{saveError}</p>
        </div>
      )}

      {saveSuccess && (
        <div className="red-success" role="status">
          <p>{saveSuccess}</p>
        </div>
      )}

      {!isEditing && (
        <>
          {latestRED ? (
            <>
              <div className="red-latest">
                <div className="red-latest-header">
                  <h4>Latest Version (v{latestRED.version})</h4>
                  <span className={`red-validation-status red-validation-${latestEffectiveStatus ?? latestRED.validation_status}`}>
                    {latestEffectiveStatus ?? latestRED.validation_status}
                  </span>
                </div>
                <div className="red-content">
                  <pre className="red-json-preview">
                    {JSON.stringify(latestRED.red_json, null, 2)}
                  </pre>
                </div>
                <button
                  type="button"
                  className="red-edit-button"
                  onClick={handleStartEdit}
                >
                  Create New Version
                </button>
              </div>

              {redVersions.length > 1 && (
                <div className="red-history">
                  <h4>Version History</h4>
                  <ul className="red-versions-list">
                    {redVersions.map((version) => (
                      <li key={version.red_id} className="red-version-item">
                        <span className="red-version-number">v{version.version}</span>
                        <span className={`red-validation-status red-validation-${version.effective_validation_status ?? version.validation_status}`}>
                          {version.effective_validation_status ?? version.validation_status}
                        </span>
                        <span className="red-version-date">
                          {new Date(version.created_at).toLocaleString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <div className="red-empty">
              <p>No RED document exists yet.</p>
              <button
                type="button"
                className="red-edit-button"
                onClick={handleStartEdit}
              >
                Create First RED Version
              </button>
            </div>
          )}
        </>
      )}

      {isEditing && (
        <div className="red-editor">
          <h4>Create New RED Version</h4>
          <textarea
            className="red-json-editor"
            value={editingJson}
            onChange={(e) => setEditingJson(e.target.value)}
            placeholder="Enter RED JSON here..."
            rows={20}
          />
          <div className="red-editor-actions">
            <button
              type="button"
              className="red-save-button"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              className="red-cancel-button"
              onClick={handleCancelEdit}
              disabled={saving}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
