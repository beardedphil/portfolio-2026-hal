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
 * Database has: 'created' | 'launching' | 'polling' | 'finished' | 'failed'
 */
export function mapStatusToStepId(status: string, agentType: AgentType): string {
  // Map database statuses to workflow steps
  // Database has: 'created' | 'launching' | 'polling' | 'finished' | 'failed'
  if (status === 'failed') return 'failed'
  if (status === 'finished') return 'completed'
  
  if (agentType === 'qa') {
    // For QA, map database status to workflow step
    // Note: 'polling' in database could mean Reviewing, Generating report, Merging, or Moving ticket
    // We'll show it as 'polling' (Reviewing) since that's the first polling step
    if (status === 'created') return 'fetching_ticket'
    if (status === 'launching') return 'launching'
    if (status === 'polling') return 'polling'
    return 'preparing'
  } else if (agentType === 'implementation') {
    if (status === 'created') return 'fetching_ticket'
    if (status === 'launching') return 'launching'
    if (status === 'polling') return 'polling'
    return 'preparing'
  }
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
