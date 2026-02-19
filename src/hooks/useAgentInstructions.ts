import { useState, useEffect } from 'react'
import type { InstructionFile, InstructionIndex } from '../components/agent-instructions/types'

interface UseAgentInstructionsOptions {
  isOpen: boolean
  supabaseUrl?: string | null
  supabaseAnonKey?: string | null
  repoFullName?: string
}

export function useAgentInstructions({
  isOpen,
  supabaseUrl,
  supabaseAnonKey,
  repoFullName = 'beardedphil/portfolio-2026-hal',
}: UseAgentInstructionsOptions) {
  const [instructions, setInstructions] = useState<InstructionFile[]>([])
  const [basicInstructions, setBasicInstructions] = useState<InstructionFile[]>([])
  const [situationalInstructions, setSituationalInstructions] = useState<InstructionFile[]>([])
  const [instructionIndex, setInstructionIndex] = useState<InstructionIndex | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return

    async function loadInstructions() {
      setLoading(true)
      setError(null)

      try {
        // If the caller explicitly passes `null`, treat that as "Supabase not configured"
        // even if env vars exist (tests and UI may want to force bundled fallback).
        const forceBundledFallback = supabaseUrl === null || supabaseAnonKey === null
        const url = forceBundledFallback
          ? ''
          : supabaseUrl?.trim() || (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
        const key = forceBundledFallback
          ? ''
          : supabaseAnonKey?.trim() || (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()

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

        // Use HAL API endpoint to load instructions (supports agent type scoping)
        const baseUrl = window.location.origin
        const instructionsResponse = await fetch(`${baseUrl}/api/instructions/get`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            repoFullName,
            includeBasic: true,
            includeSituational: true,
            // Don't filter by agent type here - load all, then filter by selected agent
          }),
        })

        if (!instructionsResponse.ok) {
          throw new Error(`Failed to load instructions: ${instructionsResponse.statusText}`)
        }

        const instructionsResult = await instructionsResponse.json()
        if (!instructionsResult.success) {
          throw new Error(instructionsResult.error || 'Failed to load instructions')
        }

        // Load instruction index (also via API)
        const indexResponse = await fetch(`${baseUrl}/api/instructions/get-index`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            repoFullName,
          }),
        })

        // Convert API response to InstructionFile format
        const loadedInstructions: InstructionFile[] = (instructionsResult.instructions || []).map((row: any) => ({
          path: row.filename,
          name: row.title || row.filename.replace('.mdc', '').replace(/-/g, ' '),
          description: row.description || 'No description',
          alwaysApply: row.alwaysApply || false,
          content: row.contentBody || row.contentMd, // Use body if available, fallback to full content
          agentTypes: row.agentTypes || [],
          topicId: row.topicId,
          isBasic: row.isBasic || false,
          isSituational: row.isSituational || false,
          topicMetadata: row.topicMetadata,
        }))

        setInstructions(loadedInstructions)
        
        // Set basic and situational
        setBasicInstructions(loadedInstructions.filter(inst => inst.isBasic))
        setSituationalInstructions(loadedInstructions.filter(inst => inst.isSituational))

        // Set index from API response
        if (indexResponse.ok) {
          const indexResult = await indexResponse.json()
          if (indexResult.success && indexResult.index) {
            setInstructionIndex(indexResult.index)
          }
        } else {
          // Fallback: derive index from instructions
          const derivedIndex: InstructionIndex = {
            basic: loadedInstructions.filter(inst => inst.isBasic).map(inst => inst.topicId || inst.path.replace('.mdc', '')),
            situational: {},
            topics: {} as Record<string, any>,
          }
          
          for (const inst of loadedInstructions) {
            if (inst.topicMetadata) {
              const topicId = inst.topicId || inst.path.replace('.mdc', '')
              derivedIndex.topics![topicId] = inst.topicMetadata
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

  return {
    instructions,
    basicInstructions,
    situationalInstructions,
    instructionIndex,
    loading,
    error,
  }
}
