/**
 * Shared utilities for bootstrap endpoints.
 */

import type { IncomingMessage, ServerResponse } from 'http'
import { parseSupabaseCredentialsWithServiceRole } from '../tickets/_shared.js'
import { createClient } from '@supabase/supabase-js'

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
    name: 'Verifying preview…',
    description: 'Poll /version.json until available and mark bootstrap complete',
  },
}

/**
 * Reads and parses JSON body from an HTTP request.
 */
export async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Uint8Array[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (!raw) return {}
  return JSON.parse(raw) as unknown
}

/**
 * Sends a JSON response with the specified status code.
 */
export function json(res: ServerResponse, statusCode: number, body: unknown): void {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

/**
 * Adds a log entry to the bootstrap run.
 */
export function addLogEntry(
  logs: BootstrapLogEntry[],
  level: BootstrapLogEntry['level'],
  message: string
): BootstrapLogEntry[] {
  return [
    ...logs,
    {
      timestamp: new Date().toISOString(),
      level,
      message,
    },
  ]
}

/**
 * Gets the step record for a given step ID, or creates a new one.
 */
export function getOrCreateStepRecord(
  stepHistory: BootstrapStepRecord[],
  stepId: string
): BootstrapStepRecord {
  const existing = stepHistory.find((s) => s.step === stepId)
  if (existing) return existing

  return {
    step: stepId,
    status: 'pending',
    started_at: null,
    completed_at: null,
    error_summary: null,
    error_details: null,
  }
}

/**
 * Updates a step record in the step history.
 */
export function updateStepRecord(
  stepHistory: BootstrapStepRecord[],
  stepId: string,
  updates: Partial<BootstrapStepRecord>
): BootstrapStepRecord[] {
  const index = stepHistory.findIndex((s) => s.step === stepId)
  const updated: BootstrapStepRecord = {
    ...(index >= 0 ? stepHistory[index] : getOrCreateStepRecord(stepHistory, stepId)),
    ...updates,
  }

  if (index >= 0) {
    const newHistory = [...stepHistory]
    newHistory[index] = updated
    return newHistory
  } else {
    return [...stepHistory, updated]
  }
}

/**
 * Gets the next step to execute (first pending or failed step).
 */
export function getNextStep(stepHistory: BootstrapStepRecord[]): BootstrapStepId | null {
  // Find first pending step
  for (const stepId of BOOTSTRAP_STEPS) {
    const record = stepHistory.find((s) => s.step === stepId)
    if (!record || record.status === 'pending') {
      return stepId
    }
    if (record.status === 'failed') {
      return stepId // Retry failed step
    }
  }
  return null
}

/**
 * Checks if all steps are completed successfully.
 */
export function allStepsCompleted(stepHistory: BootstrapStepRecord[]): boolean {
  return BOOTSTRAP_STEPS.every((stepId) => {
    const record = stepHistory.find((s) => s.step === stepId)
    return record?.status === 'succeeded'
  })
}

/**
 * Parses Supabase credentials for bootstrap endpoints.
 */
export function parseBootstrapCredentials(body: {
  supabaseUrl?: string
  supabaseAnonKey?: string
}): { supabaseUrl?: string; supabaseKey?: string } {
  return parseSupabaseCredentialsWithServiceRole(body)
}

/**
 * Logs an audit event for bootstrap/infra actions.
 */
export async function logAuditEvent(
  supabase: ReturnType<typeof createClient>,
  projectId: string,
  actionType: string,
  status: 'succeeded' | 'failed' | 'pending',
  summary: string,
  metadata: Record<string, unknown> = {},
  actor?: string
): Promise<void> {
  try {
    await supabase.from('audit_logs').insert({
      project_id: projectId,
      action_type: actionType,
      status,
      summary,
      metadata,
      actor,
    })
  } catch (err) {
    console.error('[bootstrap/_shared] Failed to log audit event:', err)
    // Don't fail the request if audit logging fails
  }
}
