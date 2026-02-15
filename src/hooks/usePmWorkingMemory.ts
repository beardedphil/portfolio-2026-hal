import { useState, useCallback } from 'react'
import type { WorkingMemory } from '../components/diagnostics/types'

type PmWorkingMemoryState = {
  summary: string
  goals: string[]
  requirements: string[]
  constraints: string[]
  decisions: string[]
  assumptions: string[]
  open_questions: string[]
  glossary: Record<string, string>
  stakeholders: string[]
  updated_at: string
  through_sequence: number
}

export function usePmWorkingMemory() {
  const [pmWorkingMemory, setPmWorkingMemory] = useState<PmWorkingMemoryState | null>(null)
  const [pmWorkingMemoryOpen, setPmWorkingMemoryOpen] = useState(false)
  const [pmWorkingMemoryLoading, setPmWorkingMemoryLoading] = useState(false)
  const [pmWorkingMemoryError, setPmWorkingMemoryError] = useState<string | null>(null)

  // Alias workingMemory to pmWorkingMemory for UI compatibility
  const workingMemory: WorkingMemory | null = pmWorkingMemory ? {
    summary: pmWorkingMemory.summary,
    goals: pmWorkingMemory.goals,
    requirements: pmWorkingMemory.requirements,
    constraints: pmWorkingMemory.constraints,
    decisions: pmWorkingMemory.decisions,
    assumptions: pmWorkingMemory.assumptions,
    openQuestions: pmWorkingMemory.open_questions,
    glossary: pmWorkingMemory.glossary,
    stakeholders: pmWorkingMemory.stakeholders,
    lastUpdatedAt: pmWorkingMemory.updated_at,
  } : null

  const workingMemoryOpen = pmWorkingMemoryOpen
  const workingMemoryLoading = pmWorkingMemoryLoading
  const workingMemoryError = pmWorkingMemoryError
  const setWorkingMemoryOpen = setPmWorkingMemoryOpen

  const fetchWorkingMemory = useCallback(async (
    connectedProject: string | null,
    supabaseUrl: string | null,
    supabaseAnonKey: string | null,
    selectedChatTarget: string,
    selectedConversationId: string | null,
    getConversationId: (agentRole: string, instanceNumber: number) => string
  ) => {
    if (!connectedProject || !supabaseUrl || !supabaseAnonKey) {
      setPmWorkingMemory(null)
      return
    }
    if (selectedChatTarget !== 'project-manager') {
      setPmWorkingMemory(null)
      return
    }
    const convId = selectedConversationId || getConversationId('project-manager', 1)
    setPmWorkingMemoryLoading(true)
    setPmWorkingMemoryError(null)
    try {
      const res = await fetch('/api/conversations/working-memory/get', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: connectedProject,
          agent: convId,
          supabaseUrl,
          supabaseAnonKey,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        setPmWorkingMemory(null)
        if (data.error) setPmWorkingMemoryError(data.error)
        return
      }
      const wm = data.workingMemory
      if (wm) {
        const arr = (x: unknown) => (Array.isArray(x) ? x : typeof x === 'string' ? (x ? [x] : []) : [])
        setPmWorkingMemory({
          summary: wm.summary || '',
          goals: arr(wm.goals),
          requirements: arr(wm.requirements),
          constraints: arr(wm.constraints),
          decisions: arr(wm.decisions),
          assumptions: arr(wm.assumptions),
          open_questions: arr(wm.openQuestions ?? wm.open_questions),
          glossary: typeof wm.glossary === 'object' && wm.glossary !== null ? (wm.glossary as Record<string, string>) : {},
          stakeholders: arr(wm.stakeholders),
          updated_at: wm.lastUpdatedAt || wm.last_updated_at || new Date().toISOString(),
          through_sequence: typeof wm.throughSequence === 'number' ? wm.throughSequence : 0,
        })
      } else {
        setPmWorkingMemory(null)
      }
    } catch (err) {
      console.error('[HAL] Failed to fetch working memory:', err)
      setPmWorkingMemoryError(err instanceof Error ? err.message : String(err))
      setPmWorkingMemory(null)
    } finally {
      setPmWorkingMemoryLoading(false)
    }
  }, [])

  const refreshWorkingMemory = useCallback(async (
    connectedProject: string | null,
    supabaseUrl: string | null,
    supabaseAnonKey: string | null
  ) => {
    if (!connectedProject || !supabaseUrl || !supabaseAnonKey) {
      return
    }
    try {
      setPmWorkingMemoryLoading(true)
      const url = supabaseUrl.trim()
      const key = supabaseAnonKey.trim()
      const res = await fetch('/api/pm/working-memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: connectedProject,
          supabaseUrl: url,
          supabaseAnonKey: key,
          force: true,
        }),
      })
      const data = await res.json() as { success: boolean; workingMemory?: any; error?: string }
      if (!data.success) {
        throw new Error(data.error || 'Failed to refresh working memory')
      }
      if (data.workingMemory) {
        setPmWorkingMemory({
          summary: data.workingMemory.summary || '',
          goals: Array.isArray(data.workingMemory.goals) ? data.workingMemory.goals : [],
          requirements: Array.isArray(data.workingMemory.requirements) ? data.workingMemory.requirements : [],
          constraints: Array.isArray(data.workingMemory.constraints) ? data.workingMemory.constraints : [],
          decisions: Array.isArray(data.workingMemory.decisions) ? data.workingMemory.decisions : [],
          assumptions: Array.isArray(data.workingMemory.assumptions) ? data.workingMemory.assumptions : [],
          open_questions: Array.isArray(data.workingMemory.openQuestions) ? data.workingMemory.openQuestions : (Array.isArray(data.workingMemory.open_questions) ? data.workingMemory.open_questions : []),
          glossary: data.workingMemory.glossary && typeof data.workingMemory.glossary === 'object' ? data.workingMemory.glossary as Record<string, string> : {},
          stakeholders: Array.isArray(data.workingMemory.stakeholders) ? data.workingMemory.stakeholders : [],
          updated_at: data.workingMemory.updated_at || new Date().toISOString(),
          through_sequence: data.workingMemory.through_sequence || 0,
        })
      } else {
        setPmWorkingMemory(null)
      }
    } catch (err) {
      console.error('[PM] Failed to refresh working memory:', err)
    } finally {
      setPmWorkingMemoryLoading(false)
    }
  }, [])

  return {
    workingMemory,
    workingMemoryOpen,
    workingMemoryLoading,
    workingMemoryError,
    setWorkingMemoryOpen,
    fetchWorkingMemory,
    refreshWorkingMemory,
  }
}
