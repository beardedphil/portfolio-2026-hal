import { useState, useEffect } from 'react'

type InstructionFile = {
  path: string
  name: string
  description: string
  alwaysApply: boolean
  content: string
  agentTypes: string[] // Derived from content analysis
}

type AgentType = 'all' | 'project-manager' | 'implementation-agent' | 'qa-agent' | 'process-review-agent'

type ViewState = 'agents' | 'agent-instructions' | 'instruction-detail'

interface AgentInstructionsViewerProps {
  isOpen: boolean
  onClose: () => void
}

export function AgentInstructionsViewer({ isOpen, onClose }: AgentInstructionsViewerProps) {
  const [instructions, setInstructions] = useState<InstructionFile[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewState, setViewState] = useState<ViewState>('agents')
  const [selectedAgent, setSelectedAgent] = useState<AgentType | null>(null)
  const [selectedInstruction, setSelectedInstruction] = useState<InstructionFile | null>(null)
  const [breadcrumbs, setBreadcrumbs] = useState<string[]>([])

  // Load instruction files from bundled JSON
  useEffect(() => {
    if (!isOpen) return

    async function loadInstructions() {
      setLoading(true)
      setError(null)

      try {
        // Load from bundled JSON file created at build time
        const response = await fetch('/agent-instructions.json')
        
        if (!response.ok) {
          throw new Error(`Failed to load instructions: ${response.status} ${response.statusText}`)
        }

        const data = await response.json()
        if (data.instructions && Array.isArray(data.instructions)) {
          setInstructions(data.instructions)
        } else {
          throw new Error('Invalid instructions data format')
        }
      } catch (err) {
        console.error('Error loading instructions:', err)
        setError(err instanceof Error ? err.message : 'Failed to load instruction files. Please ensure the build script has run to bundle instructions.')
      } finally {
        setLoading(false)
      }
    }

    loadInstructions()
  }, [isOpen])

  function parseInstructionFile(path: string, content: string): InstructionFile | null {
    // Parse frontmatter
    const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/
    const match = content.match(frontmatterRegex)
    
    let frontmatter: Record<string, string> = {}
    let body = content

    if (match) {
      const frontmatterText = match[1]
      body = match[2]
      
      // Simple frontmatter parser
      for (const line of frontmatterText.split('\n')) {
        const colonIndex = line.indexOf(':')
        if (colonIndex > 0) {
          const key = line.slice(0, colonIndex).trim()
          let value = line.slice(colonIndex + 1).trim()
          // Remove quotes if present
          if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1)
          }
          frontmatter[key] = value
        }
      }
    }

    // Determine agent types from content
    const agentTypes: string[] = []
    const contentLower = content.toLowerCase()
    
    if (frontmatter.alwaysApply === 'true') {
      agentTypes.push('all')
    }
    
    // Heuristic: check content for agent mentions
    if (contentLower.includes('qa agent') || contentLower.includes('qa-agent') || path.includes('qa')) {
      agentTypes.push('qa-agent')
    }
    if (contentLower.includes('implementation agent') || contentLower.includes('implementation-agent')) {
      agentTypes.push('implementation-agent')
    }
    if (contentLower.includes('project manager') || contentLower.includes('project-manager') || contentLower.includes('pm agent')) {
      agentTypes.push('project-manager')
    }
    if (contentLower.includes('process review') || contentLower.includes('process-review')) {
      agentTypes.push('process-review-agent')
    }

    // If no specific agent types found but alwaysApply is true, it applies to all
    if (agentTypes.length === 0 && frontmatter.alwaysApply === 'true') {
      agentTypes.push('all')
    }

    return {
      path,
      name: path.replace('.mdc', '').replace(/-/g, ' '),
      description: frontmatter.description || 'No description',
      alwaysApply: frontmatter.alwaysApply === 'true',
      content: body,
      agentTypes: agentTypes.length > 0 ? agentTypes : ['all'],
    }
  }

  function getInstructionsForAgent(agent: AgentType): InstructionFile[] {
    if (agent === 'all') {
      return instructions.filter(inst => inst.alwaysApply || inst.agentTypes.includes('all'))
    }
    return instructions.filter(inst => 
      inst.alwaysApply || 
      inst.agentTypes.includes('all') || 
      inst.agentTypes.includes(agent)
    )
  }

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

  function handleBack() {
    if (viewState === 'instruction-detail') {
      setViewState('agent-instructions')
      setSelectedInstruction(null)
      setBreadcrumbs(['All Agents', getAgentLabel(selectedAgent!)])
    } else if (viewState === 'agent-instructions') {
      setViewState('agents')
      setSelectedAgent(null)
      setBreadcrumbs([])
    }
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
                <nav className="agent-instructions-breadcrumbs" aria-label="Breadcrumb">
                  {breadcrumbs.map((crumb, idx) => (
                    <React.Fragment key={idx}>
                      {idx > 0 && <span className="breadcrumb-separator"> / </span>}
                      <button
                        type="button"
                        className="breadcrumb-link"
                        onClick={() => {
                          if (idx === 0) {
                            setViewState('agents')
                            setSelectedAgent(null)
                            setSelectedInstruction(null)
                            setBreadcrumbs([])
                          } else if (idx === 1) {
                            setViewState('agent-instructions')
                            setSelectedInstruction(null)
                            setBreadcrumbs(['All Agents', breadcrumbs[1]])
                          }
                        }}
                      >
                        {crumb}
                      </button>
                    </React.Fragment>
                  ))}
                </nav>
              )}

              {viewState === 'agents' && (
                <div className="agent-instructions-agents">
                  <h4>Select an agent to view instructions:</h4>
                  <div className="agent-list">
                    {(['all', 'project-manager', 'implementation-agent', 'qa-agent', 'process-review-agent'] as AgentType[]).map((agent) => {
                      const agentInstructions = getInstructionsForAgent(agent)
                      return (
                        <button
                          key={agent}
                          type="button"
                          className="agent-item"
                          onClick={() => handleAgentClick(agent)}
                        >
                          <div className="agent-item-name">{getAgentLabel(agent)}</div>
                          <div className="agent-item-count">{agentInstructions.length} instruction{agentInstructions.length !== 1 ? 's' : ''}</div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {viewState === 'agent-instructions' && selectedAgent && (
                <div className="agent-instructions-list">
                  <h4>{getAgentLabel(selectedAgent)} Instructions</h4>
                  <div className="instruction-list">
                    {getInstructionsForAgent(selectedAgent).map((instruction) => (
                      <button
                        key={instruction.path}
                        type="button"
                        className="instruction-item"
                        onClick={() => handleInstructionClick(instruction)}
                      >
                        <div className="instruction-item-name">{instruction.name}</div>
                        <div className="instruction-item-description">{instruction.description}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {viewState === 'instruction-detail' && selectedInstruction && (
                <div className="agent-instruction-detail">
                  <h4>{selectedInstruction.name}</h4>
                  <div className="instruction-meta">
                    <span className="instruction-meta-item">
                      <strong>Path:</strong> {selectedInstruction.path}
                    </span>
                    {selectedInstruction.alwaysApply && (
                      <span className="instruction-meta-item">
                        <strong>Applies to:</strong> All agents
                      </span>
                    )}
                    {!selectedInstruction.alwaysApply && selectedInstruction.agentTypes.length > 0 && (
                      <span className="instruction-meta-item">
                        <strong>Applies to:</strong> {selectedInstruction.agentTypes.map(getAgentLabel).join(', ')}
                      </span>
                    )}
                  </div>
                  <div className="instruction-content">
                    <pre className="instruction-markdown">{selectedInstruction.content}</pre>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
