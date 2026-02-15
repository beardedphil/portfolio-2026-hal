import { useState } from 'react'
import { useAgentInstructions } from './hooks/useAgentInstructions'
import { useInstructionEdit } from './hooks/useInstructionEdit'
import { AgentList } from './components/agent-instructions/AgentList'
import { InstructionList } from './components/agent-instructions/InstructionList'
import { InstructionDetail } from './components/agent-instructions/InstructionDetail'
import { Breadcrumbs } from './components/agent-instructions/Breadcrumbs'
import { getAgentLabel, getInstructionsForAgent } from './components/agent-instructions/utils'
import type { AgentType, ViewState, InstructionFile } from './components/agent-instructions/types'

interface AgentInstructionsViewerProps {
  isOpen: boolean
  onClose: () => void
  supabaseUrl?: string | null
  supabaseAnonKey?: string | null
  repoFullName?: string
}

export function AgentInstructionsViewer({ 
  isOpen, 
  onClose, 
  supabaseUrl, 
  supabaseAnonKey,
  repoFullName = 'beardedphil/portfolio-2026-hal'
}: AgentInstructionsViewerProps) {
  const [viewState, setViewState] = useState<ViewState>('agents')
  const [selectedAgent, setSelectedAgent] = useState<AgentType | null>(null)
  const [selectedInstruction, setSelectedInstruction] = useState<InstructionFile | null>(null)
  const [breadcrumbs, setBreadcrumbs] = useState<string[]>([])

  const {
    instructions,
    basicInstructions,
    situationalInstructions,
    instructionIndex,
    loading,
    error,
  } = useAgentInstructions({
    isOpen,
    supabaseUrl,
    supabaseAnonKey,
    repoFullName,
  })

  const {
    isEditing,
    editedContent,
    setEditedContent,
    saveStatus,
    saveError,
    handleEditClick,
    handleCancelEdit,
    handleSaveEdit,
  } = useInstructionEdit({
    selectedInstruction,
    instructionIndex,
    supabaseUrl,
    supabaseAnonKey,
    repoFullName,
    onInstructionUpdated: (updated) => {
      setSelectedInstruction(updated)
    },
  })

  function handleAgentClick(agent: AgentType) {
    setSelectedAgent(agent)
    setViewState('agent-instructions')
    setBreadcrumbs(['All Agents', getAgentLabel(agent)])
  }

  function handleInstructionClick(instruction: InstructionFile) {
    setSelectedInstruction(instruction)
    setViewState('instruction-detail')
    setBreadcrumbs(['All Agents', getAgentLabel(selectedAgent!), instruction.name])
  }

  function handleBreadcrumbNavigate(_viewState: ViewState, breadcrumbIndex: number) {
    if (breadcrumbIndex === 0) {
      setViewState('agents')
      setSelectedAgent(null)
      setSelectedInstruction(null)
      setBreadcrumbs([])
    } else if (breadcrumbIndex === 1) {
      setViewState('agent-instructions')
      setSelectedInstruction(null)
      setBreadcrumbs(['All Agents', breadcrumbs[1]])
    }
  }

  function handleEditClickWrapper() {
    handleEditClick()
  }

  if (!isOpen) return null

  return (
    <div className="conversation-modal-overlay" onClick={onClose}>
      <div className="conversation-modal agent-instructions-modal" onClick={(e) => e.stopPropagation()}>
        <div className="conversation-modal-header">
          <h3>Agent Instructions</h3>
          <button
            type="button"
            className="conversation-modal-close"
            onClick={onClose}
            aria-label="Close instructions viewer"
          >
            ×
          </button>
        </div>
        <div className="conversation-modal-content agent-instructions-content">
          {loading && <div className="agent-instructions-loading">Loading instructions...</div>}
          
          {error && (
            <div className="agent-instructions-error" role="alert">
              {error}
            </div>
          )}

          {!loading && !error && (
            <>
              {breadcrumbs.length > 0 && (
                <Breadcrumbs
                  breadcrumbs={breadcrumbs}
                  onNavigate={handleBreadcrumbNavigate}
                />
              )}

              {viewState === 'agents' && (
                <AgentList
                  instructions={instructions}
                  onAgentClick={handleAgentClick}
                />
              )}

              {viewState === 'agent-instructions' && selectedAgent && (
                <InstructionList
                  selectedAgent={selectedAgent}
                  basicInstructions={basicInstructions}
                  situationalInstructions={situationalInstructions}
                  instructionIndex={instructionIndex}
                  onInstructionClick={handleInstructionClick}
                  getAgentLabel={getAgentLabel}
                  getInstructionsForAgent={(agent) => getInstructionsForAgent(agent, instructions)}
                />
              )}

              {viewState === 'instruction-detail' && selectedInstruction && (
                <InstructionDetail
                  instruction={selectedInstruction}
                  isEditing={isEditing}
                  editedContent={editedContent}
                  saveStatus={saveStatus}
                  saveError={saveError}
                  onEditClick={handleEditClickWrapper}
                  onCancelEdit={handleCancelEdit}
                  onSaveEdit={handleSaveEdit}
                  onEditedContentChange={setEditedContent}
                  getAgentLabel={getAgentLabel}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
