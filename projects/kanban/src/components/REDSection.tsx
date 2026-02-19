import React, { useState, useEffect, useCallback } from 'react'

export interface REDDocument {
  red_id: string
  version: number
  red_json: unknown
  content_checksum: string
  validation_status: 'valid' | 'invalid' | 'pending'
  created_at: string
  created_by: string | null
  artifact_id: string | null
}

export interface REDVersion {
  red_id: string
  version: number
  content_checksum: string
  validation_status: 'valid' | 'invalid' | 'pending'
  created_at: string
  created_by: string | null
  artifact_id: string | null
}

export function REDSection({
  ticketPk,
  ticketId,
  repoFullName,
  supabaseUrl,
  supabaseAnonKey,
  onRefresh,
}: {
  ticketPk: string
  ticketId: string
  repoFullName: string | null
  supabaseUrl: string
  supabaseAnonKey: string
  onRefresh?: () => void
}) {
  const [latestRED, setLatestRED] = useState<REDDocument | null>(null)
  const [redVersions, setRedVersions] = useState<REDVersion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editingJson, setEditingJson] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null)

  const loadREDData = useCallback(async () => {
    if (!repoFullName || !ticketPk) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Load version history first (needed for both latest and history)
      const versionsRes = await fetch('/api/red/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketPk,
          repoFullName,
          supabaseUrl,
          supabaseAnonKey,
        }),
      })

      const versionsResult = await versionsRes.json()

      if (versionsResult.success) {
        setRedVersions(versionsResult.red_versions || [])
      } else {
        setError(versionsResult.error || 'Failed to load RED versions')
        setLoading(false)
        return
      }

      // Load latest valid RED
      const latestRes = await fetch('/api/red/get', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketPk,
          repoFullName,
          version: 'latest-valid',
          supabaseUrl,
          supabaseAnonKey,
        }),
      })

      const latestResult = await latestRes.json()

      if (latestResult.success && latestResult.red_document) {
        setLatestRED(latestResult.red_document)
      } else if (versionsResult.red_versions && versionsResult.red_versions.length > 0) {
        // If no valid RED, get the latest version (even if invalid)
        const latestVersion = versionsResult.red_versions[0]
        const docRes = await fetch('/api/red/get', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ticketPk,
            repoFullName,
            version: latestVersion.version,
            supabaseUrl,
            supabaseAnonKey,
          }),
        })

        const docResult = await docRes.json()
        if (docResult.success && docResult.red_document) {
          setLatestRED(docResult.red_document)
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load RED data')
    } finally {
      setLoading(false)
    }
  }, [ticketPk, repoFullName, supabaseUrl, supabaseAnonKey])

  useEffect(() => {
    loadREDData()
  }, [loadREDData])

  const handleStartEdit = () => {
    if (latestRED) {
      setEditingJson(JSON.stringify(latestRED.red_json, null, 2))
    } else {
      setEditingJson('{\n  \n}')
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
    if (!repoFullName || !ticketPk) {
      setSaveError('Missing required information')
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
    setSaveSuccess(null)

    try {
      // Insert new RED version
      const insertRes = await fetch('/api/red/insert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketPk,
          repoFullName,
          redJson: parsedJson,
          validationStatus: 'pending', // Could be enhanced to validate JSON schema
          supabaseUrl,
          supabaseAnonKey,
        }),
      })

      const insertResult = await insertRes.json()

      if (!insertResult.success) {
        setSaveError(insertResult.error || 'Failed to save RED version')
        return
      }

      const newRED = insertResult.red_document

      // Mirror to artifacts: create markdown artifact with embedded JSON
      const artifactBody = `# RED v${newRED.version} — ${new Date(newRED.created_at).toLocaleDateString()}

This artifact contains the RED (Requirements, Engineering, Design) document for ticket ${ticketId}.

## Validation Status

**Status:** ${newRED.validation_status}

## RED Document

The canonical RED JSON is embedded below:

\`\`\`json
${JSON.stringify(newRED.red_json, null, 2)}
\`\`\`
`

      const artifactRes = await fetch('/api/artifacts/insert-implementation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketId,
          artifactType: 'red',
          title: `RED v${newRED.version} — ${new Date(newRED.created_at).toLocaleDateString()}`,
          body_md: artifactBody,
          supabaseUrl,
          supabaseAnonKey,
        }),
      })

      const artifactResult = await artifactRes.json()

      if (!artifactResult.success) {
        console.warn('Failed to create artifact mirror:', artifactResult.error)
        // Don't fail the whole operation if artifact creation fails
      }

      // Reload RED data
      await loadREDData()
      setIsEditing(false)
      setEditingJson('')
      setSaveSuccess(`RED v${newRED.version} saved successfully`)

      // Refresh artifacts if callback provided
      if (onRefresh) {
        onRefresh()
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save RED version')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="red-section">
        <h3 className="red-section-title">RED</h3>
        <p className="red-loading">Loading RED data…</p>
      </div>
    )
  }

  if (error && !latestRED) {
    return (
      <div className="red-section">
        <h3 className="red-section-title">RED</h3>
        <div className="red-error" role="alert">
          <p>{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="red-section">
      <h3 className="red-section-title">RED</h3>

      {saveError && (
        <div className="red-error" role="alert" style={{ marginBottom: '1rem' }}>
          <p>{saveError}</p>
        </div>
      )}

      {saveSuccess && (
        <div className="red-success" role="status" style={{ marginBottom: '1rem' }}>
          <p>{saveSuccess}</p>
        </div>
      )}

      {!isEditing ? (
        <>
          {latestRED ? (
            <>
              <div className="red-latest">
                <div className="red-latest-header">
                  <h4 className="red-latest-title">Latest Version (v{latestRED.version})</h4>
                  <span
                    className={`red-validation-status red-validation-status-${latestRED.validation_status}`}
                  >
                    {latestRED.validation_status === 'valid' ? '✓ Valid' : latestRED.validation_status === 'invalid' ? '✗ Invalid' : '⏳ Pending'}
                  </span>
                </div>
                <div className="red-latest-content">
                  <pre className="red-json-display">
                    {JSON.stringify(latestRED.red_json, null, 2)}
                  </pre>
                </div>
                <div className="red-latest-meta">
                  <span>Created: {new Date(latestRED.created_at).toLocaleString()}</span>
                  {latestRED.created_by && <span>By: {latestRED.created_by}</span>}
                </div>
              </div>
            </>
          ) : (
            <div className="red-empty">
              <p>No RED document exists yet. Create the first version below.</p>
            </div>
          )}

          {redVersions.length > 0 && (
            <div className="red-version-history">
              <h4 className="red-version-history-title">Version History</h4>
              <ul className="red-version-list">
                {redVersions.map((version) => (
                  <li key={version.red_id} className="red-version-item">
                    <span className="red-version-number">v{version.version}</span>
                    <span
                      className={`red-validation-status red-validation-status-${version.validation_status}`}
                    >
                      {version.validation_status}
                    </span>
                    <span className="red-version-date">
                      {new Date(version.created_at).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="red-actions">
            <button
              type="button"
              className="red-button red-button-edit btn-standard"
              onClick={handleStartEdit}
            >
              {latestRED ? 'Edit & Create New Version' : 'Create RED Document'}
            </button>
          </div>
        </>
      ) : (
        <div className="red-editor">
          <h4 className="red-editor-title">
            {latestRED ? 'Create New RED Version' : 'Create RED Document'}
          </h4>
          <textarea
            className="red-editor-textarea"
            value={editingJson}
            onChange={(e) => setEditingJson(e.target.value)}
            placeholder="Enter RED JSON document..."
            rows={20}
            disabled={saving}
          />
          <div className="red-editor-actions">
            <button
              type="button"
              className="red-button red-button-save btn-standard"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button
              type="button"
              className="red-button red-button-cancel btn-secondary"
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
