import type { AgentType, InstructionFile, InstructionIndex } from './types'

interface InstructionListProps {
  selectedAgent: AgentType
  basicInstructions: InstructionFile[]
  situationalInstructions: InstructionFile[]
  instructionIndex: InstructionIndex | null
  onInstructionClick: (instruction: InstructionFile) => void
  getAgentLabel: (agent: AgentType) => string
  getInstructionsForAgent: (agent: AgentType) => InstructionFile[]
}

export function InstructionList({
  selectedAgent,
  basicInstructions,
  situationalInstructions,
  instructionIndex,
  onInstructionClick,
  getAgentLabel,
  getInstructionsForAgent,
}: InstructionListProps) {
  // Calculate basic instructions
  const basic = getInstructionsForAgent(selectedAgent).filter(inst => {
    if (basicInstructions.length > 0) {
      return basicInstructions.some(b => b.path === inst.path)
    }
    const topicId = inst.topicId || inst.path.replace('.mdc', '')
    return instructionIndex?.basic?.includes(topicId) || inst.isBasic
  })
  
  // Calculate situational instructions
  const situational = getInstructionsForAgent(selectedAgent).filter(inst => {
    if (basicInstructions.some(b => b.path === inst.path)) {
      return false
    }
    if (situationalInstructions.length > 0) {
      return situationalInstructions.some(s => s.path === inst.path)
    }
    const topicId = inst.topicId || inst.path.replace('.mdc', '')
    return instructionIndex?.topics?.[topicId] !== undefined || inst.isSituational
  })
  
  // Get scoping metadata for this agent type
  const allAgentInstructions = getInstructionsForAgent('all')
  const currentAgentInstructions = getInstructionsForAgent(selectedAgent)
  const excludedCount = selectedAgent !== 'all' 
    ? (allAgentInstructions.length - currentAgentInstructions.length)
    : 0

  return (
    <div className="agent-instructions-list">
      <h4>{getAgentLabel(selectedAgent)} Instructions</h4>
      <div className="agent-scoping-notice" style={{ 
        padding: '8px 12px', 
        marginBottom: '16px', 
        backgroundColor: '#e3f2fd', 
        border: '1px solid #90caf9', 
        borderRadius: '4px',
        fontSize: '14px'
      }}>
        <strong>Agent Type Scoping Active:</strong> Showing only instructions applicable to <strong>{getAgentLabel(selectedAgent)}</strong>. 
        {selectedAgent !== 'all' && ' Instructions marked as "shared/global" are included for all agent types.'}
      </div>
      
      {/* Show scoping metadata */}
      {selectedAgent !== 'all' && (
        <div className="agent-scoping-info" style={{ 
          marginBottom: '1rem', 
          padding: '0.75rem', 
          backgroundColor: '#f0f0f0', 
          borderRadius: '4px',
          fontSize: '0.9rem'
        }}>
          <strong>Agent Type Scoping:</strong>
          <ul style={{ margin: '0.5rem 0 0 1.5rem', padding: 0 }}>
            <li>This agent type receives <strong>{currentAgentInstructions.length} instructions</strong></li>
            {excludedCount > 0 && (
              <li><strong>{excludedCount} instructions</strong> are excluded (outside this agent's scope)</li>
            )}
            <li>Includes: shared/global instructions (applies to all) + agent-specific instructions</li>
          </ul>
        </div>
      )}
      
      {/* Show empty state if no instructions found */}
      {basic.length === 0 && situational.length === 0 ? (
        <div className="agent-instructions-empty">
          <p className="agent-instructions-empty-message">
            No instructions found for this agent.
          </p>
          <p className="agent-instructions-empty-hint">
            Instructions may not be configured yet, or this agent may not have any specific instructions.
          </p>
        </div>
      ) : (
        <>
          {/* Basic Instructions */}
          {basic.length > 0 && (
            <div className="instruction-section">
              <h5 className="instruction-section-title">Basic Instructions (Always Active)</h5>
              <p className="instruction-section-description">These instructions are always included in the agent's context.</p>
              <div className="instruction-list">
                {basic.map((instruction) => (
                  <button
                    key={instruction.path}
                    type="button"
                    className="instruction-item instruction-item-basic"
                    onClick={() => onInstructionClick(instruction)}
                  >
                    <div className="instruction-item-name">{instruction.name}</div>
                    <div className="instruction-item-description">{instruction.description}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Situational Instructions */}
          {situational.length > 0 && (
            <div className="instruction-section">
              <h5 className="instruction-section-title">Situational Instructions (Request On-Demand)</h5>
              <p className="instruction-section-description">These instructions are available but not loaded by default. Agents can request them using the <code>get_instruction_set</code> tool when needed.</p>
              <div className="instruction-list">
                {situational.map((instruction) => {
                  const topicId = instruction.path.replace('.mdc', '')
                  const topicMeta = instructionIndex?.topics?.[topicId]
                  return (
                    <button
                      key={instruction.path}
                      type="button"
                      className="instruction-item instruction-item-situational"
                      onClick={() => onInstructionClick(instruction)}
                    >
                      <div className="instruction-item-name">
                        {topicMeta?.title || instruction.name}
                        <span className="instruction-item-badge">On-Demand</span>
                      </div>
                      <div className="instruction-item-description">
                        {topicMeta?.description || instruction.description}
                      </div>
                      {topicMeta?.keywords && topicMeta.keywords.length > 0 && (
                        <div className="instruction-item-keywords">
                          Keywords: {topicMeta.keywords.join(', ')}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
