import type { AgentType, InstructionFile } from './types'

interface AgentListProps {
  instructions: InstructionFile[]
  onAgentClick: (agent: AgentType) => void
}

function getAgentLabel(agent: AgentType): string {
  const labels: Record<AgentType, string> = {
    'all': 'All Agents',
    'project-manager': 'Project Manager',
    'implementation-agent': 'Implementation Agent',
    'qa-agent': 'QA Agent',
    'process-review-agent': 'Process Review Agent',
  }
  return labels[agent] || agent
}

function getInstructionsForAgent(agent: AgentType, instructions: InstructionFile[]): InstructionFile[] {
  if (agent === 'all') {
    return instructions.filter(inst => inst.alwaysApply || inst.agentTypes.includes('all'))
  }
  return instructions.filter(inst => 
    inst.alwaysApply || 
    inst.agentTypes.includes('all') || 
    inst.agentTypes.includes(agent)
  )
}

export function AgentList({ instructions, onAgentClick }: AgentListProps) {
  const agentTypes: AgentType[] = ['all', 'project-manager', 'implementation-agent', 'qa-agent', 'process-review-agent']

  return (
    <div className="agent-instructions-agents">
      <h4>Select an agent to view instructions:</h4>
      <div className="agent-scoping-info" style={{ 
        padding: '8px 12px', 
        marginBottom: '16px', 
        backgroundColor: '#f5f5f5', 
        border: '1px solid #ddd', 
        borderRadius: '4px',
        fontSize: '14px'
      }}>
        <strong>Agent Type Scoping:</strong> Each agent type receives only the instructions relevant to them. 
        Instructions marked as "shared/global" (applies to all) are included for every agent type.
      </div>
      <div className="agent-list">
        {agentTypes.map((agent) => {
          const agentInstructions = getInstructionsForAgent(agent, instructions)
          const allInstructions = getInstructionsForAgent('all', instructions)
          const allCount = allInstructions.length
          const isScoped = agent !== 'all'
          const showScoping = isScoped && agentInstructions.length !== allCount
          
          return (
            <button
              key={agent}
              type="button"
              className="agent-item"
              onClick={() => onAgentClick(agent)}
              title={showScoping ? `Scoped: ${agentInstructions.length} of ${allCount} total instructions` : undefined}
            >
              <div className="agent-item-name">
                {getAgentLabel(agent)}
                {showScoping && (
                  <span style={{ 
                    fontSize: '0.75rem', 
                    color: '#666', 
                    marginLeft: '0.5rem',
                    fontWeight: 'normal'
                  }}>
                    (scoped)
                  </span>
                )}
              </div>
              <div className="agent-item-count">
                {agentInstructions.length} instruction{agentInstructions.length !== 1 ? 's' : ''}
                {showScoping && (
                  <span style={{ 
                    fontSize: '0.75rem', 
                    color: '#999', 
                    display: 'block',
                    marginTop: '0.25rem'
                  }}>
                    of {allCount} total
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
