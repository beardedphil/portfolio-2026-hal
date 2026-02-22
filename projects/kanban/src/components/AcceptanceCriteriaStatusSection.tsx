import { useState, useEffect, useCallback } from 'react'

interface ACAcceptanceCriteriaStatus {
  index: number
  text: string
  status: 'met' | 'unmet'
  actor_type: 'human' | 'agent' | null
  agent_type: string | null
  justification: string
  updated_at: string | null
  created_at: string | null
}

interface AcceptanceCriteriaStatusSectionProps {
  ticketId: string
  ticketPk: string
  supabaseUrl: string
  supabaseKey: string
  onUpdate?: () => void
}

export function AcceptanceCriteriaStatusSection({
  ticketPk,
  supabaseUrl,
  supabaseKey,
  onUpdate,
}: AcceptanceCriteriaStatusSectionProps) {
  const [acStatus, setAcStatus] = useState<ACAcceptanceCriteriaStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updatingIndex, setUpdatingIndex] = useState<number | null>(null)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editJustification, setEditJustification] = useState<string>('')

  const fetchAcStatus = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/acceptance-criteria-status/get', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketPk,
          supabaseUrl,
          supabaseAnonKey: supabaseKey,
        }),
      })
      const result = await res.json()
      if (result.success) {
        setAcStatus(result.ac_status || [])
      } else {
        setError(result.error || 'Failed to fetch AC status')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [ticketPk, supabaseUrl, supabaseKey])

  useEffect(() => {
    fetchAcStatus()
  }, [fetchAcStatus])

  const handleStatusChange = useCallback(
    async (index: number, newStatus: 'met' | 'unmet') => {
      setUpdatingIndex(index)
      try {
        const currentItem = acStatus[index]
        const res = await fetch('/api/acceptance-criteria-status/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ticketPk,
            acIndex: index,
            status: newStatus,
            actorType: 'human',
            justification: currentItem?.justification || '',
            supabaseUrl,
            supabaseAnonKey: supabaseKey,
          }),
        })
        const result = await res.json()
        if (result.success) {
          await fetchAcStatus()
          if (onUpdate) onUpdate()
        } else {
          setError(result.error || 'Failed to update AC status')
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setUpdatingIndex(null)
      }
    },
    [acStatus, ticketPk, supabaseUrl, supabaseKey, fetchAcStatus, onUpdate]
  )

  const handleJustificationSave = useCallback(
    async (index: number) => {
      setUpdatingIndex(index)
      try {
        const currentItem = acStatus[index]
        const res = await fetch('/api/acceptance-criteria-status/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ticketPk,
            acIndex: index,
            status: currentItem?.status || 'unmet',
            actorType: 'human',
            justification: editJustification,
            supabaseUrl,
            supabaseAnonKey: supabaseKey,
          }),
        })
        const result = await res.json()
        if (result.success) {
          setEditingIndex(null)
          setEditJustification('')
          await fetchAcStatus()
          if (onUpdate) onUpdate()
        } else {
          setError(result.error || 'Failed to update justification')
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setUpdatingIndex(null)
      }
    },
    [acStatus, editJustification, ticketPk, supabaseUrl, supabaseKey, fetchAcStatus, onUpdate]
  )

  const handleEditClick = useCallback((index: number) => {
    const item = acStatus[index]
    setEditJustification(item?.justification || '')
    setEditingIndex(index)
  }, [acStatus])

  const handleCancelEdit = useCallback(() => {
    setEditingIndex(null)
    setEditJustification('')
  }, [])

  if (loading) {
    return (
      <div className="ac-status-section">
        <h3 className="ac-status-title">Acceptance criteria status</h3>
        <p className="ac-status-loading">Loading…</p>
      </div>
    )
  }

  if (error && acStatus.length === 0) {
    return (
      <div className="ac-status-section">
        <h3 className="ac-status-title">Acceptance criteria status</h3>
        <p className="ac-status-error" role="alert">{error}</p>
      </div>
    )
  }

  if (acStatus.length === 0) {
    return (
      <div className="ac-status-section">
        <h3 className="ac-status-title">Acceptance criteria status</h3>
        <p className="ac-status-empty">No acceptance criteria found for this ticket.</p>
      </div>
    )
  }

  return (
    <div className="ac-status-section">
      <h3 className="ac-status-title">Acceptance criteria status</h3>
      {error && (
        <div className="ac-status-error" role="alert" style={{ marginBottom: '1rem' }}>
          {error}
        </div>
      )}
      <div className="ac-status-list">
        {acStatus.map((item) => {
          const isUpdating = updatingIndex === item.index
          const isEditing = editingIndex === item.index
          const actorDisplay = item.actor_type === 'agent' 
            ? (item.agent_type || 'Agent')
            : item.actor_type === 'human'
            ? 'Human'
            : null
          const updatedAt = item.updated_at ? new Date(item.updated_at) : null

          return (
            <div key={item.index} className="ac-status-item">
              <div className="ac-status-item-header">
                <div className="ac-status-item-text">{item.text}</div>
                <div className="ac-status-item-actions">
                  <label className="ac-status-toggle">
                    <input
                      type="checkbox"
                      checked={item.status === 'met'}
                      onChange={(e) => handleStatusChange(item.index, e.target.checked ? 'met' : 'unmet')}
                      disabled={isUpdating}
                    />
                    <span className="ac-status-toggle-label">
                      {item.status === 'met' ? 'Met' : 'Unmet'}
                    </span>
                  </label>
                </div>
              </div>
              {isEditing ? (
                <div className="ac-status-item-edit">
                  <textarea
                    className="ac-status-justification-input"
                    value={editJustification}
                    onChange={(e) => setEditJustification(e.target.value)}
                    placeholder="Enter justification note..."
                    rows={2}
                    disabled={isUpdating}
                  />
                  <div className="ac-status-item-edit-actions">
                    <button
                      type="button"
                      className="ac-status-save-btn btn-standard"
                      onClick={() => handleJustificationSave(item.index)}
                      disabled={isUpdating}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="ac-status-cancel-btn"
                      onClick={handleCancelEdit}
                      disabled={isUpdating}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="ac-status-item-footer">
                  {item.justification && (
                    <div className="ac-status-justification">
                      <strong>Justification:</strong> {item.justification}
                    </div>
                  )}
                  <div className="ac-status-meta">
                    {actorDisplay && updatedAt && (
                      <span className="ac-status-meta-item">
                        Last updated by {actorDisplay} on {updatedAt.toLocaleString()}
                      </span>
                    )}
                    {!item.justification && (
                      <button
                        type="button"
                        className="ac-status-add-justification-btn"
                        onClick={() => handleEditClick(item.index)}
                        disabled={isUpdating}
                      >
                        Add justification
                      </button>
                    )}
                    {item.justification && (
                      <button
                        type="button"
                        className="ac-status-edit-justification-btn"
                        onClick={() => handleEditClick(item.index)}
                        disabled={isUpdating}
                      >
                        Edit justification
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
