/**
 * Type definitions for bootstrap workflow
 */

export type BootstrapStepStatus = 'pending' | 'running' | 'succeeded' | 'failed'

export type BootstrapRunStatus = 'pending' | 'running' | 'succeeded' | 'failed'

export interface BootstrapStepRecord {
  step: string
  status: BootstrapStepStatus
  started_at: string | null
  completed_at: string | null
  error_summary: string | null
  error_details: string | null
}

export interface BootstrapLogEntry {
  timestamp: string
  level: 'info' | 'error' | 'warning'
  message: string
}

export interface BootstrapRun {
  id: string
  project_id: string
  status: BootstrapRunStatus
  current_step: string | null
  step_history: BootstrapStepRecord[]
  logs: BootstrapLogEntry[]
  created_at: string
  updated_at: string
  completed_at: string | null
}

export const BOOTSTRAP_STEPS = [
  'ensure_repo_initialized',
  'create_supabase_project',
  'create_vercel_project',
  'verify_preview',
] as const

export type BootstrapStepId = typeof BOOTSTRAP_STEPS[number]

export interface BootstrapStepDefinition {
  id: BootstrapStepId
  name: string
  description: string
}

export const STEP_DEFINITIONS: Record<BootstrapStepId, BootstrapStepDefinition> = {
  ensure_repo_initialized: {
    id: 'ensure_repo_initialized',
    name: 'Initialize Repository',
    description: 'Ensure repository has a real main branch and first commit',
  },
  create_supabase_project: {
    id: 'create_supabase_project',
    name: 'Create Supabase Project',
    description: 'Create Supabase project via API and store credentials',
  },
  create_vercel_project: {
    id: 'create_vercel_project',
    name: 'Create Vercel Project',
    description: 'Create Vercel project, link GitHub repo, and trigger first deploy',
  },
  verify_preview: {
    id: 'verify_preview',
    name: 'Verify Preview',
    description: 'Poll /version.json until available and mark bootstrap complete',
  },
}
