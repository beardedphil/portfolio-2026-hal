import React, { useState, useEffect } from 'react'
import { getSupabaseClient } from './lib/supabase'

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


  // Load instruction files from Supabase
  useEffect(() => {
    if (!isOpen) return

    async function loadInstructions() {
      setLoading(true)
      setError(null)

      try {
        const url = supabaseUrl?.trim() || (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
        const key = supabaseAnonKey?.trim() || (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()

        if (!url || !key) {
          // Fallback to bundled JSON if Supabase not configured
          try {
            const response = await fetch('/agent-instructions.json')
            if (response.ok) {
              const data = await response.json()
              if (data.instructions && Array.isArray(data.instructions)) {
                setInstructions(data.instructions)
                if (data.index) setInstructionIndex(data.index)
                if (data.basic) setBasicInstructions(data.basic)
                if (data.situational) setSituationalInstructions(data.situational)
                setLoading(false)
                return
              }
            }
          } catch {
            // Continue to error
          }
          throw new Error('Supabase not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env')
        }

        const supabase = getSupabaseClient(url, key)

        // Load instructions
        const { data: instructionsData, error: instructionsError } = await supabase
          .from('agent_instructions')
          .select('*')
          .eq('repo_full_name', repoFullName)
          .order('filename')

        if (instructionsError) {
          throw new Error(`Failed to load instructions: ${instructionsError.message}`)
        }

        // Load instruction index
        const { data: indexData, error: indexError } = await supabase
          .from('agent_instruction_index')
          .select('index_data')
          .eq('repo_full_name', repoFullName)
          .single()

        // Convert Supabase rows to InstructionFile format
        const loadedInstructions: InstructionFile[] = (instructionsData || []).map((row: any) => ({
          path: row.filename,
          name: row.title || row.filename.replace('.mdc', '').replace(/-/g, ' '),
          description: row.description || 'No description',
          alwaysApply: row.always_apply || false,
          content: row.content_body || row.content_md, // Use body if available, fallback to full content
          agentTypes: row.agent_types || [],
          topicId: row.topic_id,
          isBasic: row.is_basic || false,
          isSituational: row.is_situational || false,
          topicMetadata: row.topic_metadata,
        }))

        setInstructions(loadedInstructions)
        
        // Set basic and situational
        setBasicInstructions(loadedInstructions.filter(inst => inst.isBasic))
        setSituationalInstructions(loadedInstructions.filter(inst => inst.isSituational))

        // Set index
        if (indexData && !indexError) {
          setInstructionIndex(indexData.index_data)
        } else if (!indexError) {
          // Index doesn't exist yet, derive from instructions
          const derivedIndex = {
            basic: loadedInstructions.filter(inst => inst.isBasic).map(inst => inst.topicId || inst.path.replace('.mdc', '')),
            situational: {},
            topics: {} as Record<string, any>,
          }
          
          for (const inst of loadedInstructions) {
            if (inst.topicMetadata) {
              const topicId = inst.topicId || inst.path.replace('.mdc', '')
              derivedIndex.topics[topicId] = inst.topicMetadata
            }
          }
          
          setInstructionIndex(derivedIndex)
        }
      } catch (err) {
        console.error('Error loading instructions:', err)
        setError(err instanceof Error ? err.message : 'Failed to load instruction files from Supabase.')
      } finally {
        setLoading(false)
      }
    }

    loadInstructions()
  }, [isOpen, supabaseUrl, supabaseAnonKey, repoFullName])

  // Reset edit state when instruction changes
  useEffect(() => {
    if (selectedInstruction) {
      setIsEditing(false)
      setEditedContent('')
      setSaveStatus('idle')
      setSaveError(null)
    }
  }, [selectedInstruction])


  function getInstructionsForAgent(agent: AgentType): InstructionFile[] {
    // Use pre-loaded scoped instructions if available
    if (instructionsByAgent[agent]) {
      return instructionsByAgent[agent]
    }
    
    // Fallback to filtering all instructions
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


  async function handleEditClick() {
    if (!selectedInstruction) return

    setSaveStatus('idle')
    setSaveError(null)

    // Load full content from Supabase (content_md includes frontmatter)
    try {
      const url = supabaseUrl?.trim() || (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
      const key = supabaseAnonKey?.trim() || (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()

      if (!url || !key) {
        throw new Error('Supabase not configured')
      }

      const supabase = getSupabaseClient(url, key)
      const topicId = selectedInstruction.topicId || selectedInstruction.path.replace('.mdc', '')

      const { data, error } = await supabase
        .from('agent_instructions')
        .select('content_md')
        .eq('repo_full_name', repoFullName)
        .eq('topic_id', topicId)
        .single()

      if (error) {
        throw error
      }

      if (data && data.content_md) {
        setEditedContent(data.content_md)
      } else {
        // Fallback: reconstruct from instruction data
        const topicMeta = instructionIndex?.topics?.[topicId]
        const description = topicMeta?.description || selectedInstruction.description
        const alwaysApply = selectedInstruction.alwaysApply
        
        const frontmatter = `---
description: ${description}
${alwaysApply ? 'alwaysApply: true' : ''}
---

`
        setEditedContent(frontmatter + selectedInstruction.content)
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
      setEditedContent(frontmatter + selectedInstruction.content)
      
      if (err instanceof Error) {
        console.warn('Could not load full content from Supabase, using reconstructed:', err.message)
      }
    }
    
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
      const url = supabaseUrl?.trim() || (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
      const key = supabaseAnonKey?.trim() || (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()

      if (!url || !key) {
        throw new Error('Supabase not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env')
      }

      const supabase = getSupabaseClient(url, key)
      const topicId = selectedInstruction.topicId || selectedInstruction.path.replace('.mdc', '')

      // Parse content to extract body (without frontmatter) for content_body field
      const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/
      const match = editedContent.match(frontmatterRegex)
      const contentBody = match ? match[2] : editedContent

      // Update instruction in Supabase
      const { error } = await supabase
        .from('agent_instructions')
        .update({
          content_md: editedContent,
          content_body: contentBody,
          updated_at: new Date().toISOString(),
        })
        .eq('repo_full_name', repoFullName)
        .eq('topic_id', topicId)

      if (error) {
        throw error
      }

      setSaveStatus('success')
      
      // Reload instructions after a short delay
      setTimeout(async () => {
        try {
          const url = supabaseUrl?.trim() || (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
          const key = supabaseAnonKey?.trim() || (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()

          if (url && key) {
            const supabase = getSupabaseClient(url, key)

            // Reload instructions
            const { data: instructionsData, error: instructionsError } = await supabase
              .from('agent_instructions')
              .select('*')
              .eq('repo_full_name', repoFullName)
              .order('filename')

            if (!instructionsError && instructionsData) {
              const loadedInstructions: InstructionFile[] = instructionsData.map((row: any) => ({
                path: row.filename,
                name: row.title || row.filename.replace('.mdc', '').replace(/-/g, ' '),
                description: row.description || 'No description',
                alwaysApply: row.always_apply || false,
                content: row.content_body || row.content_md,
                agentTypes: row.agent_types || [],
                topicId: row.topic_id,
                isBasic: row.is_basic || false,
                isSituational: row.is_situational || false,
                topicMetadata: row.topic_metadata,
              }))

              setInstructions(loadedInstructions)
              setBasicInstructions(loadedInstructions.filter(inst => inst.isBasic))
              setSituationalInstructions(loadedInstructions.filter(inst => inst.isSituational))
              
              // Update the selected instruction
              const updated = loadedInstructions.find(inst => inst.path === selectedInstruction.path)
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
      setSaveError(err instanceof Error ? err.message : 'Failed to save instruction to Supabase')
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
                      const allCount = instructionsByAgent['all']?.length || instructions.length
                      const isScoped = agent !== 'all' && instructionsByAgent[agent]
                      const showScoping = isScoped && agentInstructions.length !== allCount
                      
                      return (
                        <button
                          key={agent}
                          type="button"
                          className="agent-item"
                          onClick={() => handleAgentClick(agent)}
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
              )}

              {viewState === 'agent-instructions' && selectedAgent && (() => {
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
                const metadata = scopingMetadata[selectedAgent] || {}
                const allAgentInstructions = instructionsByAgent['all'] || []
                const currentAgentInstructions = getInstructionsForAgent(selectedAgent)
                const excludedCount = selectedAgent !== 'all' 
                  ? (allAgentInstructions.length - currentAgentInstructions.length)
                  : 0

                return (
                  <div className="agent-instructions-list">
                    <h4>{getAgentLabel(selectedAgent)} Instructions</h4>
                    
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
                        {metadata.excludedTopics && metadata.excludedTopics.length > 0 && (
                          <details style={{ marginTop: '0.5rem' }}>
                            <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>
                              Excluded topics ({metadata.excludedTopics.length})
                            </summary>
                            <ul style={{ margin: '0.5rem 0 0 1.5rem', fontSize: '0.85rem' }}>
                              {metadata.excludedTopics.slice(0, 10).map((topicId: string) => (
                                <li key={topicId}><code>{topicId}</code></li>
                              ))}
                              {metadata.excludedTopics.length > 10 && (
                                <li>... and {metadata.excludedTopics.length - 10} more</li>
                              )}
                            </ul>
                          </details>
                        )}
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
                                  onClick={() => handleInstructionClick(instruction)}
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
                        )}
                      </>
                    )}
                  </div>
                )
              })()}

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
                            <strong>Applies to:</strong> {selectedInstruction.agentTypes.map((agentType) => getAgentLabel(agentType as AgentType)).join(', ')}
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
