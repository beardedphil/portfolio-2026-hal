import React, { useState, useEffect, useCallback } from 'react'

interface REDDocument {
  red_id: string
  version: number
  red_json: unknown
  content_checksum: string
  validation_status: 'valid' | 'invalid' | 'pending'
  created_at: string
  created_by: string | null
  artifact_id: string | null
}

interface REDVersion {
  red_id: string
  version: number
  content_checksum: string
  validation_status: 'valid' | 'invalid' | 'pending'
  created_at: string
  created_by: string | null
  artifact_id: string | null
}

interface REDSectionProps {
  ticketId: string
  ticketPk: string
  repoFullName: string | null
  supabaseUrl: string
  supabaseKey: string
  onRefreshArtifacts?: () => void
}

export function REDSection({
  ticketId,
  ticketPk,
  repoFullName,
  supabaseUrl,
  supabaseKey,
  onRefreshArtifacts,
}: REDSectionProps) {
  const [latestRED, setLatestRED] = useState<REDDocument | null>(null)
  const [versions, setVersions] = useState<REDVersion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editingJson, setEditingJson] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const apiBaseUrl = 'https://portfolio-2026-hal.vercel.app'

  const loadREDData = useCallback(async () => {
    if (!repoFullName) {
      setError('Repository name is required')
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Load latest RED version
      const latestRes = await fetch(`${apiBaseUrl}/api/red/get`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketPk,
          ticketId,
          repoFullName,
          version: 'latest-valid',
          supabaseUrl,
          supabaseAnonKey: supabaseKey,
        }),
      })

      const latestData = await latestRes.json()

      if (latestData.success && latestData.red_document) {
        setLatestRED(latestData.red_document)
        // Initialize editing JSON with current latest
        setEditingJson(JSON.stringify(latestData.red_document.red_json, null, 2))
      } else {
        // No RED found yet - that's okay, user can create one
        setLatestRED(null)
        setEditingJson('{\n  \n}')
      }

      // Load version history
      const versionsRes = await fetch(`${apiBaseUrl}/api/red/list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketPk,
          ticketId,
          repoFullName,
          supabaseUrl,
          supabaseAnonKey: supabaseKey,
        }),
      })

      const versionsData = await versionsRes.json()

      if (versionsData.success) {
        setVersions(versionsData.red_versions || [])
      } else {
        setVersions([])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load RED data')
      console.error('Failed to load RED data:', err)
    } finally {
      setLoading(false)
    }
  }, [ticketPk, ticketId, repoFullName, supabaseUrl, supabaseKey, apiBaseUrl])

  useEffect(() => {
    if (repoFullName) {
      loadREDData()
    }
  }, [loadREDData, repoFullName])

  const handleSave = useCallback(async () => {
    if (!repoFullName) {
      setSaveError('Repository name is required')
      return
    }

    let parsedJson: unknown
    try {
      parsedJson = JSON.parse(editingJson)
    } catch (err) {
      setSaveError(`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`)
      return
    }

    setSaving(true)
    setSaveError(null)

    try {
      // Insert new RED version
      const insertRes = await fetch(`${apiBaseUrl}/api/red/insert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketPk,
          ticketId,
          repoFullName,
          redJson: parsedJson,
          validationStatus: 'pending', // Default to pending, can be validated later
          supabaseUrl,
          supabaseAnonKey: supabaseKey,
        }),
      })

      const insertData = await insertRes.json()

      if (!insertData.success) {
        throw new Error(insertData.error || 'Failed to save RED version')
      }

      const newRED = insertData.red_document

      // Create artifact mirror
      const artifactTitle = `RED v${newRED.version} — ${new Date(newRED.created_at).toISOString().split('T')[0]}`
      const artifactBody = `# RED Document Version ${newRED.version}

This artifact contains the RED (Requirements Engineering Document) for this ticket.

**Version:** ${newRED.version}
**Created:** ${new Date(newRED.created_at).toISOString()}
**Validation Status:** ${newRED.validation_status}
**Checksum:** \`${newRED.content_checksum}\`

## RED JSON

\`\`\`json
${JSON.stringify(newRED.red_json, null, 2)}
\`\`\`
`

      const artifactRes = await fetch(`${apiBaseUrl}/api/artifacts/insert-implementation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketId,
          artifactType: 'red',
          title: artifactTitle,
          body_md: artifactBody,
          supabaseUrl,
          supabaseAnonKey: supabaseKey,
        }),
      })

      const artifactData = await artifactRes.json()

      if (!artifactData.success) {
        console.warn('Failed to create artifact mirror:', artifactData.error)
        // Don't fail the whole operation if artifact creation fails
      }

      // Reload RED data
      await loadREDData()

      // Refresh artifacts list if callback provided
      if (onRefreshArtifacts) {
        onRefreshArtifacts()
      }

      setIsEditing(false)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save RED version')
      console.error('Failed to save RED:', err)
    } finally {
      setSaving(false)
    }
  }, [editingJson, ticketPk, ticketId, repoFullName, supabaseUrl, supabaseKey, apiBaseUrl, loadREDData, onRefreshArtifacts])

  const handleCancel = useCallback(() => {
    if (latestRED) {
      setEditingJson(JSON.stringify(latestRED.red_json, null, 2))
    } else {
      setEditingJson('{\n  \n}')
    }
    setIsEditing(false)
    setSaveError(null)
  }, [latestRED])

  const handleStartEdit = useCallback(() => {
    if (latestRED) {
      setEditingJson(JSON.stringify(latestRED.red_json, null, 2))
    } else {
      setEditingJson('{\n  \n}')
    }
    setIsEditing(true)
    setSaveError(null)
  }, [latestRED])

  if (!repoFullName) {
    return null
  }

  if (loading) {
    return (
      <div className="red-section">
        <h3 className="red-section-title">RED</h3>
        <p className="red-loading">Loading RED data…</p>
      </div>
    )
  }

  return (
    <div className="red-section">
      <h3 className="red-section-title">RED</h3>

      {error && (
        <div className="red-error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={loadREDData} className="red-retry-button">
            Retry
          </button>
        </div>
      )}

      {saveError && (
        <div className="red-error" role="alert">
          <p>{saveError}</p>
        </div>
      )}

      {!error && (
        <>
          {/* Latest version display */}
          <div className="red-latest">
            <div className="red-latest-header">
              <h4 className="red-latest-title">
                {latestRED ? `Version ${latestRED.version}` : 'No RED version yet'}
              </h4>
              {latestRED && (
                <span
                  className={`red-validation-status red-validation-status-${latestRED.validation_status}`}
                >
                  {latestRED.validation_status}
                </span>
              )}
            </div>

            {latestRED && !isEditing && (
              <div className="red-content">
                <pre className="red-json-display">
                  {JSON.stringify(latestRED.red_json, null, 2)}
                </pre>
              </div>
            )}

            {isEditing && (
              <div className="red-edit">
                <textarea
                  className="red-json-editor"
                  value={editingJson}
                  onChange={(e) => setEditingJson(e.target.value)}
                  placeholder="Enter RED JSON..."
                  rows={15}
                />
                <div className="red-edit-actions">
                  <button
                    type="button"
                    className="red-save-button"
                    onClick={handleSave}
                    disabled={saving}
                  >
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    type="button"
                    className="red-cancel-button"
                    onClick={handleCancel}
                    disabled={saving}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {!isEditing && (
              <div className="red-actions">
                <button
                  type="button"
                  className="red-edit-button"
                  onClick={handleStartEdit}
                >
                  {latestRED ? 'Edit & Create New Version' : 'Create RED Version'}
                </button>
              </div>
            )}
          </div>

          {/* Version history */}
          {versions.length > 0 && (
            <div className="red-history">
              <h4 className="red-history-title">Version History</h4>
              <ul className="red-history-list">
                {versions.map((version) => (
                  <li key={`${version.red_id}-${version.version}`} className="red-history-item">
                    <span className="red-history-version">v{version.version}</span>
                    <span
                      className={`red-history-status red-history-status-${version.validation_status}`}
                    >
                      {version.validation_status}
                    </span>
                    <span className="red-history-date">
                      {new Date(version.created_at).toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  )
}
