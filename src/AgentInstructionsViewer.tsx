import React, { useState, useEffect } from 'react'

type InstructionFile = {
  path: string
  name: string
  description: string
  alwaysApply: boolean
  content: string
  agentTypes: string[] // Derived from content analysis
  topicId?: string
  isBasic?: boolean
  isSituational?: boolean
  topicMetadata?: {
    title: string
    description: string
    agentTypes: string[]
    keywords?: string[]
  }
}

type AgentType = 'all' | 'project-manager' | 'implementation-agent' | 'qa-agent' | 'process-review-agent'

type ViewState = 'agents' | 'agent-instructions' | 'instruction-detail'

interface AgentInstructionsViewerProps {
  isOpen: boolean
  onClose: () => void
}

export function AgentInstructionsViewer({ isOpen, onClose }: AgentInstructionsViewerProps) {
  const [instructions, setInstructions] = useState<InstructionFile[]>([])
  const [basicInstructions, setBasicInstructions] = useState<InstructionFile[]>([])
  const [situationalInstructions, setSituationalInstructions] = useState<InstructionFile[]>([])
  const [instructionIndex, setInstructionIndex] = useState<{
    basic?: string[]
    situational?: Record<string, string[]>
    topics?: Record<string, { title: string; description: string; agentTypes: string[]; keywords?: string[] }>
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewState, setViewState] = useState<ViewState>('agents')
  const [selectedAgent, setSelectedAgent] = useState<AgentType | null>(null)
  const [selectedInstruction, setSelectedInstruction] = useState<InstructionFile | null>(null)
  const [breadcrumbs, setBreadcrumbs] = useState<string[]>([])
  const [isEditing, setIsEditing] = useState(false)
  const [editedContent, setEditedContent] = useState<string>('')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [rulesDirectoryHandle, setRulesDirectoryHandle] = useState<FileSystemDirectoryHandle | null>(null)

  // Request access to .cursor/rules directory for editing
  useEffect(() => {
    if (!isOpen) return

    async function requestDirectoryAccess() {
      try {
        // Check if File System Access API is available
        if (typeof window.showDirectoryPicker === 'function') {
          // Try to get existing permission or request it
          // For now, we'll request it when user clicks edit
          // Store this in state so we can use it later
        }
      } catch (err) {
        console.warn('File System Access API not available:', err)
      }
    }

    requestDirectoryAccess()
  }, [isOpen])

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
          // Store index and categorized instructions for UI
          if (data.index) {
            setInstructionIndex(data.index)
          }
          if (data.basic) {
            setBasicInstructions(data.basic)
          }
          if (data.situational) {
            setSituationalInstructions(data.situational)
          }
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

  // Reset edit state when instruction changes
  useEffect(() => {
    if (selectedInstruction) {
      setIsEditing(false)
      setEditedContent('')
      setSaveStatus('idle')
      setSaveError(null)
    }
  }, [selectedInstruction])

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
      setIsEditing(false)
      setEditedContent('')
      setBreadcrumbs(['All Agents', getAgentLabel(selectedAgent!)])
    } else if (viewState === 'agent-instructions') {
      setViewState('agents')
      setSelectedAgent(null)
      setBreadcrumbs([])
    }
  }

  async function handleEditClick() {
    if (!selectedInstruction) return

    setSaveStatus('idle')
    setSaveError(null)

    // Try to read the original file to get exact content with frontmatter
    let fullContent = ''
    
    try {
      // Request directory access if we don't have it
      let handle = rulesDirectoryHandle
      if (!handle && typeof window.showDirectoryPicker === 'function') {
        const selectedHandle = await window.showDirectoryPicker({ mode: 'readwrite' })
        
        // Check if this is .cursor/rules by trying to find a .mdc file
        let isRulesDir = false
        try {
          for await (const entry of selectedHandle.values()) {
            if (entry.kind === 'file' && entry.name.endsWith('.mdc')) {
              isRulesDir = true
              break
            }
          }
        } catch {
          // Can't check, assume it's not
        }
        
        if (isRulesDir) {
          handle = selectedHandle
        } else {
          try {
            const cursorHandle = await selectedHandle.getDirectoryHandle('.cursor', { create: false })
            handle = await cursorHandle.getDirectoryHandle('rules', { create: false })
          } catch (err) {
            throw new Error('Could not find .cursor/rules directory. Please select the .cursor/rules directory or the workspace root directory.')
          }
        }
        
        setRulesDirectoryHandle(handle)
      }

      if (handle) {
        // Read the original file
        const filename = selectedInstruction.path
        const fileHandle = await handle.getFileHandle(filename, { create: false })
        const file = await fileHandle.getFile()
        fullContent = await file.text()
      } else {
        throw new Error('File System Access API not available')
      }
    } catch (err) {
      // Fallback: reconstruct from instruction data
      const topicId = selectedInstruction.topicId || selectedInstruction.path.replace('.mdc', '')
      const topicMeta = instructionIndex?.topics?.[topicId]
      const description = topicMeta?.description || selectedInstruction.description
      const alwaysApply = selectedInstruction.alwaysApply
      
      const frontmatter = `---
description: ${description}
${alwaysApply ? 'alwaysApply: true' : ''}
---

`
      fullContent = frontmatter + selectedInstruction.content
      
      // Show a warning that we're using reconstructed content
      if (err instanceof Error && !err.message.includes('not available')) {
        setSaveError(`Could not read original file. Using reconstructed content. Original error: ${err.message}`)
      }
    }
    
    setEditedContent(fullContent)
    setIsEditing(true)
  }

  function handleCancelEdit() {
    setIsEditing(false)
    setEditedContent('')
    setSaveStatus('idle')
    setSaveError(null)
  }

  async function handleSaveEdit() {
    if (!selectedInstruction || !editedContent.trim()) {
      setSaveError('Content cannot be empty')
      setSaveStatus('error')
      return
    }

    setSaveStatus('saving')
    setSaveError(null)

    try {
      // Request directory access if we don't have it
      let handle = rulesDirectoryHandle
      if (!handle && typeof window.showDirectoryPicker === 'function') {
        // Request access to the directory
        // User should select either the workspace root or .cursor/rules directory
        const selectedHandle = await window.showDirectoryPicker({ mode: 'readwrite' })
        
        // Check if this is .cursor/rules by trying to find a .mdc file
        let isRulesDir = false
        try {
          for await (const entry of selectedHandle.values()) {
            if (entry.kind === 'file' && entry.name.endsWith('.mdc')) {
              isRulesDir = true
              break
            }
          }
        } catch {
          // Can't check, assume it's not
        }
        
        if (isRulesDir) {
          // User selected .cursor/rules directly
          handle = selectedHandle
        } else {
          // User selected workspace root, navigate to .cursor/rules
          try {
            const cursorHandle = await selectedHandle.getDirectoryHandle('.cursor', { create: false })
            handle = await cursorHandle.getDirectoryHandle('rules', { create: false })
          } catch (err) {
            throw new Error('Could not find .cursor/rules directory. Please select the .cursor/rules directory or the workspace root directory that contains .cursor/rules.')
          }
        }
        
        setRulesDirectoryHandle(handle)
      } else if (!handle) {
        throw new Error('File System Access API is not available in this browser. Please use a modern browser that supports it (Chrome, Edge, or Opera).')
      }

      // Write the file
      const filename = selectedInstruction.path
      const fileHandle = await handle.getFileHandle(filename, { create: false })
      const writable = await fileHandle.createWritable()
      await writable.write(editedContent)
      await writable.close()

      setSaveStatus('success')
      
      // Reload instructions after a short delay
      setTimeout(async () => {
        // Reload the bundled instructions
        try {
          const response = await fetch('/agent-instructions.json?t=' + Date.now())
          if (response.ok) {
            const data = await response.json()
            if (data.instructions && Array.isArray(data.instructions)) {
              setInstructions(data.instructions)
              if (data.index) setInstructionIndex(data.index)
              if (data.basic) setBasicInstructions(data.basic)
              if (data.situational) setSituationalInstructions(data.situational)
              
              // Update the selected instruction
              const updated = data.instructions.find((inst: InstructionFile) => inst.path === selectedInstruction.path)
              if (updated) {
                setSelectedInstruction(updated)
              }
            }
          }
        } catch (err) {
          console.warn('Could not reload instructions:', err)
        }
        
        setIsEditing(false)
        setSaveStatus('idle')
      }, 1500)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save file')
      setSaveStatus('error')
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
                  
                  {/* Basic Instructions */}
                  {(() => {
                    const basic = getInstructionsForAgent(selectedAgent).filter(inst => {
                      if (basicInstructions.length > 0) {
                        return basicInstructions.some(b => b.path === inst.path)
                      }
                      const topicId = inst.topicId || inst.path.replace('.mdc', '')
                      return instructionIndex?.basic?.includes(topicId) || inst.isBasic
                    })
                    if (basic.length > 0) {
                      return (
                        <div className="instruction-section">
                          <h5 className="instruction-section-title">Basic Instructions (Always Active)</h5>
                          <p className="instruction-section-description">These instructions are always included in the agent's context.</p>
                          <div className="instruction-list">
                            {basic.map((instruction) => (
                              <button
                                key={instruction.path}
                                type="button"
                                className="instruction-item instruction-item-basic"
                                onClick={() => handleInstructionClick(instruction)}
                              >
                                <div className="instruction-item-name">{instruction.name}</div>
                                <div className="instruction-item-description">{instruction.description}</div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )
                    }
                    return null
                  })()}

                  {/* Situational Instructions */}
                  {(() => {
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
                    if (situational.length > 0) {
                      return (
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
                                  onClick={() => handleInstructionClick(instruction)}
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
                      )
                    }
                    return null
                  })()}
                </div>
              )}

              {viewState === 'instruction-detail' && selectedInstruction && (
                <div className="agent-instruction-detail">
                  <div className="instruction-detail-header">
                    <h4>{selectedInstruction.name}</h4>
                    {!isEditing ? (
                      <button
                        type="button"
                        className="instruction-edit-btn"
                        onClick={handleEditClick}
                        title="Edit this instruction"
                      >
                        Edit
                      </button>
                    ) : (
                      <div className="instruction-edit-actions">
                        <button
                          type="button"
                          className="instruction-save-btn"
                          onClick={handleSaveEdit}
                          disabled={saveStatus === 'saving'}
                        >
                          {saveStatus === 'saving' ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          type="button"
                          className="instruction-cancel-btn"
                          onClick={handleCancelEdit}
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
                    </>
                  ) : (
                    <div className="instruction-edit-content">
                      <label htmlFor="instruction-editor" className="instruction-editor-label">
                        Editing: {selectedInstruction.path}
                      </label>
                      <textarea
                        id="instruction-editor"
                        className="instruction-editor"
                        value={editedContent}
                        onChange={(e) => setEditedContent(e.target.value)}
                        spellCheck={false}
                        rows={30}
                      />
                      <div className="instruction-editor-hint">
                        <strong>Note:</strong> After saving, you may need to run <code>npm run bundle-instructions</code> to update the bundled instructions file, or restart the dev server.
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
