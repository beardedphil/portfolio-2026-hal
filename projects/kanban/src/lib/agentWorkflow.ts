/**
 * Agent workflow step mapping logic
 * 
 * This module provides functions to map agent runs to workflow steps
 * and determine step status for the multi-dot status indicator.
 */

export type AgentType = 'implementation' | 'qa' | null

export type WorkflowStep = {
  id: string
  label: string
}

export type StepStatus = 'done' | 'active' | 'pending'

/**
 * Get workflow steps for a given agent type
 */
export function getAgentWorkflowSteps(agentType: AgentType): Array<WorkflowStep> {
  if (agentType === 'qa') {
    return [
      { id: 'preparing', label: 'Preparing' },
      { id: 'fetching_ticket', label: 'Fetching ticket' },
      { id: 'fetching_branch', label: 'Finding branch' },
      { id: 'launching', label: 'Launching QA' },
      { id: 'polling', label: 'Reviewing' },
      { id: 'generating_report', label: 'Generating report' },
      { id: 'merging', label: 'Merging' },
      { id: 'moving_ticket', label: 'Moving ticket' },
      { id: 'completed', label: 'Completed' },
    ]
  } else if (agentType === 'implementation') {
    return [
      { id: 'preparing', label: 'Preparing' },
      { id: 'fetching_ticket', label: 'Fetching ticket' },
      { id: 'resolving_repo', label: 'Resolving repo' },
      { id: 'launching', label: 'Launching agent' },
      { id: 'polling', label: 'Running' },
      { id: 'completed', label: 'Completed' },
    ]
  }
  return []
}

/**
 * Map database status to workflow step ID
 * 
 * Database status is now the workflow step ID directly (0690):
 * - 'preparing' | 'fetching_ticket' | 'resolving_repo' | 'fetching_branch' | 'launching' | 'polling' | 'generating_report' | 'merging' | 'moving_ticket' | 'completed' | 'failed'
 * 
 * For backward compatibility, we still handle old status values ('created', 'finished').
 */
export function mapStatusToStepId(status: string, agentType: AgentType): string {
  // Handle terminal states
  if (status === 'failed') return 'failed'
  if (status === 'finished' || status === 'completed') return 'completed'
  
  // If status is already a workflow step ID, return it directly (0690)
  const workflowSteps = getAgentWorkflowSteps(agentType)
  const stepIds = workflowSteps.map(s => s.id)
  if (stepIds.includes(status)) {
    return status
  }
  
  // Backward compatibility: map old status values to workflow steps
  if (status === 'created') {
    return agentType === 'qa' ? 'fetching_ticket' : 'fetching_ticket'
  }
  if (status === 'launching') return 'launching'
  if (status === 'polling') return 'polling'
  
  // Default to 'preparing' for unknown statuses
  return 'preparing'
}

/**
 * Determine step status: 'done' | 'active' | 'pending'
 */
export function getStepStatus(
  stepId: string,
  currentStepId: string,
  workflowSteps: Array<WorkflowStep>
): StepStatus {
  // Handle failed status - all steps before completed are done, completed step shows as active (will be styled as failed in tooltip)
  if (currentStepId === 'failed') {
    const completedIndex = workflowSteps.findIndex(s => s.id === 'completed')
    const stepIndex = workflowSteps.findIndex(s => s.id === stepId)
    if (stepIndex === -1) return 'pending'
    if (stepIndex < completedIndex) return 'done'
    if (stepId === 'completed') return 'active' // Show completed step as active when failed (will be styled red in tooltip)
    return 'pending'
  }
  
  const currentIndex = workflowSteps.findIndex(s => s.id === currentStepId)
  const stepIndex = workflowSteps.findIndex(s => s.id === stepId)
  
  if (currentIndex === -1 || stepIndex === -1) return 'pending'
  if (stepIndex < currentIndex) return 'done'
  if (stepIndex === currentIndex) return 'active'
  return 'pending'
}
