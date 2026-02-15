export type InstructionFile = {
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

export type AgentType = 'all' | 'project-manager' | 'implementation-agent' | 'qa-agent' | 'process-review-agent'

export type ViewState = 'agents' | 'agent-instructions' | 'instruction-detail'

export interface InstructionIndex {
  basic?: string[]
  situational?: Record<string, string[]>
  topics?: Record<string, { title: string; description: string; agentTypes: string[]; keywords?: string[] }>
}
