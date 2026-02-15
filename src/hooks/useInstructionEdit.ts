import { useState, useEffect } from 'react'
import { getSupabaseClient } from '../lib/supabase'
import type { InstructionFile, InstructionIndex } from '../components/agent-instructions/types'

interface UseInstructionEditOptions {
  selectedInstruction: InstructionFile | null
  instructionIndex: InstructionIndex | null
  supabaseUrl?: string | null
  supabaseAnonKey?: string | null
  repoFullName?: string
  onInstructionUpdated?: (updated: InstructionFile) => void
}

export function useInstructionEdit({
  selectedInstruction,
  instructionIndex,
  supabaseUrl,
  supabaseAnonKey,
  repoFullName = 'beardedphil/portfolio-2026-hal',
  onInstructionUpdated,
}: UseInstructionEditOptions) {
  const [isEditing, setIsEditing] = useState(false)
  const [editedContent, setEditedContent] = useState<string>('')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)

  // Reset edit state when instruction changes
  useEffect(() => {
    if (selectedInstruction) {
      setIsEditing(false)
      setEditedContent('')
      setSaveStatus('idle')
      setSaveError(null)
    }
  }, [selectedInstruction])

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

              // Update the selected instruction
              const updated = loadedInstructions.find(inst => inst.path === selectedInstruction.path)
              if (updated && onInstructionUpdated) {
                onInstructionUpdated(updated)
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

  return {
    isEditing,
    editedContent,
    setEditedContent,
    saveStatus,
    saveError,
    handleEditClick,
    handleCancelEdit,
    handleSaveEdit,
  }
}
