import type { AgentType, InstructionFile } from './types'

interface InstructionDetailProps {
  instruction: InstructionFile
  isEditing: boolean
  editedContent: string
  saveStatus: 'idle' | 'saving' | 'success' | 'error'
  saveError: string | null
  onEditClick: () => void
  onCancelEdit: () => void
  onSaveEdit: () => void
  onEditedContentChange: (content: string) => void
  getAgentLabel: (agent: AgentType) => string
}

export function InstructionDetail({
  instruction,
  isEditing,
  editedContent,
  saveStatus,
  saveError,
  onEditClick,
  onCancelEdit,
  onSaveEdit,
  onEditedContentChange,
  getAgentLabel,
}: InstructionDetailProps) {
  return (
    <div className="agent-instruction-detail">
      <div className="instruction-detail-header">
        <h4>{instruction.name}</h4>
        {!isEditing ? (
          <button
            type="button"
            className="instruction-edit-btn btn-standard"
            onClick={onEditClick}
            title="Edit this instruction"
          >
            Edit
          </button>
        ) : (
          <div className="instruction-edit-actions">
            <button
              type="button"
              className="instruction-save-btn btn-standard"
              onClick={onSaveEdit}
              disabled={saveStatus === 'saving'}
            >
              {saveStatus === 'saving' ? 'Saving...' : 'Save'}
            </button>
            <button
              type="button"
              className="instruction-cancel-btn btn-destructive"
              onClick={onCancelEdit}
              disabled={saveStatus === 'saving'}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
      
      {saveStatus === 'success' && (
        <div className="instruction-save-success" role="alert">
          ✓ Instruction saved successfully. Reloading...
        </div>
      )}
      
      {saveStatus === 'error' && saveError && (
        <div className="instruction-save-error" role="alert">
          ✗ Error saving: {saveError}
        </div>
      )}

      {!isEditing ? (
        <>
          <div className="instruction-meta">
            <span className="instruction-meta-item">
              <strong>Path:</strong> {instruction.path}
            </span>
            {instruction.alwaysApply && (
              <span className="instruction-meta-item">
                <strong>Applies to:</strong> All agents
              </span>
            )}
            {!instruction.alwaysApply && instruction.agentTypes.length > 0 && (
              <span className="instruction-meta-item">
                <strong>Applies to:</strong> {instruction.agentTypes.map((agentType) => getAgentLabel(agentType as AgentType)).join(', ')}
              </span>
            )}
          </div>
          <div className="instruction-content">
            <pre className="instruction-markdown">{instruction.content}</pre>
          </div>
        </>
      ) : (
        <div className="instruction-edit-content">
          <label htmlFor="instruction-editor" className="instruction-editor-label">
            Editing: {instruction.path}
          </label>
          <textarea
            id="instruction-editor"
            className="instruction-editor"
            value={editedContent}
            onChange={(e) => onEditedContentChange(e.target.value)}
            spellCheck={false}
            rows={30}
          />
          <div className="instruction-editor-hint">
            <strong>Note:</strong> After saving, you may need to run <code>npm run bundle-instructions</code> to update the bundled instructions file, or restart the dev server.
          </div>
        </div>
      )}
    </div>
  )
}
