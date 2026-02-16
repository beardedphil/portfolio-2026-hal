export type AgentTypeLabel =
  | 'Implementation'
  | 'QA'
  | 'Process Review'
  | 'Project Manager'

/**
 * Convert a persisted hal_agent_runs.agent_type into the human label
 * that we display on Active Work cards.
 */
export function agentTypeToLabel(agentType: string | null | undefined): AgentTypeLabel | null {
  const t = String(agentType ?? '').trim().toLowerCase()
  if (!t) return null
  if (t === 'implementation') return 'Implementation'
  if (t === 'qa') return 'QA'
  if (t === 'process-review' || t === 'process_review' || t === 'process review') return 'Process Review'
  if (t === 'project-manager' || t === 'project_manager' || t === 'project manager') return 'Project Manager'
  return null
}

