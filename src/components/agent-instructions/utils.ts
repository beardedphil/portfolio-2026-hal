import type { AgentType, InstructionFile } from './types'

export function getAgentLabel(agent: AgentType): string {
  const labels: Record<AgentType, string> = {
    'all': 'All Agents',
    'project-manager': 'Project Manager',
    'implementation-agent': 'Implementation Agent',
    'qa-agent': 'QA Agent',
    'process-review-agent': 'Process Review Agent',
  }
  return labels[agent] || agent
}

export function getInstructionsForAgent(agent: AgentType, instructions: InstructionFile[]): InstructionFile[] {
  if (agent === 'all') {
    return instructions.filter(inst => inst.alwaysApply || inst.agentTypes.includes('all'))
  }
  return instructions.filter(inst => 
    inst.alwaysApply || 
    inst.agentTypes.includes('all') || 
    inst.agentTypes.includes(agent)
  )
}
